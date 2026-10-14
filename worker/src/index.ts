interface Env {
  MEDIA_BUCKET: R2Bucket;
  SPOTLIGHT_BUCKET?: R2Bucket;
  IMAGES: ImagesBinding;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  ALLOWED_ORIGINS: string;
}

type Scope = 'article' | 'spotlight' | 'profile';
type User = { id: string; email?: string };
type MediaAsset = {
  id: string;
  owner_id: string;
  original_key: string;
  derivative_key: string | null;
  mime_type: string;
  original_bytes: number;
  derivative_bytes: number | null;
  created_at?: string;
};

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 12 * 1024 * 1024;
const MAX_VIDEO_BYTES = 40 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
  'application/pdf', 'audio/mpeg', 'audio/ogg', 'audio/mp4', 'video/mp4', 'video/webm',
]);
// Every accepted image is re-encoded, whatever its source format.
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
const COMPRESSED_MIME = 'image/webp';
/**
 * Where each kind of media lives. A scope owns its own prefix, its own table and the gate the Worker
 * resolves it through, so an id from one scope can never be resolved as another's.
 *
 * A member's face and banner are stored in the forum's bucket under a prefix of their own rather than
 * in a third bucket: they are public content of the same kind, and shipping profile images must not
 * require an operator to provision storage first. Their gate is open to any visitor, because a
 * profile picture is public identity — and the key still never leaves the server.
 */
const SCOPES: Record<Scope, { table: string; prefix: string; base: string; readRpc: string }> = {
  article: { table: 'media_assets', prefix: 'originals', base: '/media', readRpc: 'get_media_asset' },
  spotlight: { table: 'spotlight_media_assets', prefix: 'spotlight', base: '/spotlight/media', readRpc: 'get_spotlight_media' },
  profile: { table: 'profile_media_assets', prefix: 'profiles', base: '/profile/media', readRpc: 'get_profile_media' },
};
/** News keeps its own private bucket; everything public shares the forum's. */
function bucketFor(env: Env, scope: Scope): R2Bucket | undefined {
  return scope === 'article' ? env.MEDIA_BUCKET : env.SPOTLIGHT_BUCKET;
}
// Every stored image is at most 200 KB, whatever its source size or format. Re-encoding walks this
// ladder from the sharpest step down and keeps the first WebP that fits under the cap.
const MAX_STORED_IMAGE_BYTES = 200 * 1024;
const COMPRESSION_LADDER = [
  { width: 1600, quality: 80 },
  { width: 1600, quality: 65 },
  { width: 1280, quality: 60 },
  { width: 1024, quality: 55 },
  { width: 800, quality: 50 },
];
const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'image/avif': 'avif', 'application/pdf': 'pdf', 'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'video/mp4': 'mp4', 'video/webm': 'webm',
};

function allowedOrigins(env: Env) {
  return new Set(env.ALLOWED_ORIGINS.split(',').map((value) => value.trim()).filter(Boolean));
}
/**
 * Whether a browser Origin may post to the media Worker. Production stays an
 * exact allowlist — but a member editing their profile on localhost or on a
 * pull-request preview posts to the same Worker, and an exact list can never
 * name those hosts, so every upload outside production was answered 403 and the
 * profile pictures could never be set there. Loopback and the platform's own
 * preview suffix carry no ambient authority (the Bearer token is minted per
 * caller and unreadable cross-origin), so matching them by shape is safe while
 * an arbitrary `https://attacker.example` stays rejected.
 */
function isAllowedOrigin(origin: string, allowed: Set<string>): boolean {
  if (allowed.has(origin)) return true;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.workers\.dev$/.test(origin)) return true;
  return false;
}
function response(body: BodyInit | null, status: number, allowedOrigin: string, headers?: HeadersInit) {
  const output = new Headers(headers);
  output.set('Access-Control-Allow-Origin', allowedOrigin);
  output.set('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
  output.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Content-Length, X-Upload-Filename');
  output.set('Access-Control-Max-Age', '86400');
  output.set('Vary', 'Origin');
  return new Response(body, { status, headers: output });
}
function json(payload: unknown, status: number, allowedOrigin: string, additional?: HeadersInit) {
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  new Headers(additional).forEach((value, key) => headers.set(key, value));
  return response(JSON.stringify(payload), status, allowedOrigin, headers);
}
function cleanMime(value: string) { return value.split(';', 1)[0]!.trim().toLowerCase(); }
function isUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function safeKey(value: string) { return /^[a-zA-Z0-9_/-]+(?:\.[a-zA-Z0-9_-]+)?$/.test(value) && !value.includes('..') && !value.startsWith('/') && value.length <= 512; }
function jsonFromResponse<T>(response: Response): Promise<T> { return response.json() as Promise<T>; }
function isWebp(bytes: Uint8Array) {
  return bytes.length >= 12
    && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP';
}

async function currentUser(request: Request, env: Env): Promise<User | null> {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return null;
  const userResponse = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: authorization },
  });
  // Every rejection used to collapse into the same 401, so an expired token, a rotated
  // signing key and a mis-set Worker credential were indistinguishable from outside. The
  // detail goes to the log only: the caller still gets one fixed reader-facing message.
  if (!userResponse.ok) {
    const detail = await userResponse.text().catch(() => '');
    console.error('Supabase rejected the access token', userResponse.status, detail);
    return null;
  }
  return jsonFromResponse<User>(userResponse);
}

async function currentRole(request: Request, env: Env, userId: string) {
  const authorization = request.headers.get('Authorization')!;
  const url = new URL(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/user_roles`);
  url.searchParams.set('select', 'role,reporter_tier');
  url.searchParams.set('user_id', `eq.${userId}`);
  url.searchParams.set('limit', '1');
  const result = await fetch(url, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: authorization } });
  if (!result.ok) return null;
  return (await jsonFromResponse<Array<{ role: string; reporter_tier: string | null }>>(result))[0] ?? null;
}

function limitBody(body: ReadableStream<Uint8Array>, maximum: number) {
  let total = 0;
  const stream = body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      total += chunk.byteLength;
      if (total > maximum) throw new Error('UPLOAD_TOO_LARGE');
      controller.enqueue(chunk);
    },
  }));
  return { stream, bytes: () => total };
}

/**
 * Re-encode an accepted image to WebP no larger than MAX_STORED_IMAGE_BYTES. Each ladder step is
 * a fresh transform of the source (the stream can only be read once), and the first result that is
 * a real WebP under the cap wins. Returns null when no step produces one, so the caller decides
 * what to do with the original instead of silently storing an oversized file.
 */
async function compressImage(env: Env, source: Uint8Array, mime: string): Promise<{ bytes: Uint8Array; compression: string } | null> {
  if (!IMAGE_TYPES.has(mime)) return null;
  for (const step of COMPRESSION_LADDER) {
    try {
      const input = new Blob([source]).stream();
      const result = await env.IMAGES.input(input)
        .transform({ width: step.width, fit: 'scale-down' })
        .output({ format: COMPRESSED_MIME, quality: step.quality, anim: true });
      const optimized = await result.response();
      if (!optimized.ok) continue;
      const bytes = new Uint8Array(await optimized.arrayBuffer());
      if (bytes.byteLength > 0 && bytes.byteLength <= MAX_STORED_IMAGE_BYTES && isWebp(bytes)) {
        return { bytes, compression: `webp-${step.width}w-q${step.quality}` };
      }
    } catch (error) {
      // Images is unavailable or rejected this input: report it and let the caller decide.
      console.error('Image transform failed', step, error);
      return null;
    }
  }
  return null;
}

async function upload(request: Request, env: Env, allowedOrigin: string, scope: Scope) {
  if (!request.body) return json({ error: 'ফাইলের তথ্য পাওয়া যায়নি।' }, 400, allowedOrigin);
  const user = await currentUser(request, env);
  if (!user) return json({ error: 'ফাইল পাঠাতে আগে গুগল দিয়ে প্রবেশ করুন।' }, 401, allowedOrigin);
  const role = await currentRole(request, env, user.id);
  // News media stays editorial. Spotlight is open to every signed-in member by design.
  if (scope === 'article' && (!role || !['reporter', 'moderator', 'admin'].includes(role.role))) {
    return json({ error: 'ফাইল পাঠাতে সম্পাদকীয় অনুমতি প্রয়োজন।' }, 403, allowedOrigin);
  }
  const bucket = bucketFor(env, scope);
  const { table, prefix, base } = SCOPES[scope];
  const mime = cleanMime(request.headers.get('Content-Type') ?? '');
  if (!ALLOWED_TYPES.has(mime)) return json({ error: 'এই ফাইলের ধরন অনুমোদিত নয়। HEIC ফাইল সমর্থিত নয়; JPEG, PNG, WebP, GIF বা AVIF ব্যবহার করুন।' }, 415, allowedOrigin);
  const maximum = mime.startsWith('image/') ? MAX_IMAGE_BYTES : mime.startsWith('video/') || mime.startsWith('audio/') ? MAX_VIDEO_BYTES : MAX_DOCUMENT_BYTES;
  const declaredSize = Number(request.headers.get('Content-Length') ?? 0);
  if (declaredSize > maximum) return json({ error: `এই ফাইলের আকার সর্বোচ্চ ${Math.round(maximum / (1024 * 1024))} মেগাবাইট হতে পারে।` }, 413, allowedOrigin);
  // The bucket is only needed once the request is otherwise valid; a missing
  // binding is a deployment fault, not something the caller did wrong.
  if (!bucket) return json({ error: 'ছবির সংরক্ষণ এখনো প্রস্তুত নয়।' }, 503, allowedOrigin);

  const id = crypto.randomUUID();
  let storedMime = mime;
  let body: ReadableStream | Uint8Array;
  let optimized = false;
  let compression = 'original-retained';

  if (mime.startsWith('image/')) {
    // An image has to be fully read to be transcoded, so the size cap is enforced while reading.
    const limited = limitBody(request.body, maximum);
    let originalBytes: Uint8Array;
    try {
      originalBytes = new Uint8Array(await new Response(limited.stream).arrayBuffer());
    } catch (error) {
      if (error instanceof Error && error.message === 'UPLOAD_TOO_LARGE') {
        return json({ error: `ফাইলের আকার সর্বোচ্চ ${Math.round(maximum / (1024 * 1024))} মেগাবাইট হতে পারে।` }, 413, allowedOrigin);
      }
      console.error('R2 upload read failed', error);
      return json({ error: 'ফাইলটি নিরাপদে সংরক্ষণ করা যায়নি।' }, 502, allowedOrigin);
    }
    const compressed = await compressImage(env, originalBytes, mime);
    if (compressed) {
      body = compressed.bytes;
      storedMime = COMPRESSED_MIME;
      optimized = true;
      compression = compressed.compression;
    } else if (originalBytes.byteLength <= MAX_STORED_IMAGE_BYTES) {
      body = originalBytes;
    } else {
      // Never store an oversized image under a name that promises it was compressed.
      return json({ error: 'ছবিটি ২০০ কিলোবাইটের মধ্যে আনা যায়নি। ছবিটি ছোট করে আবার চেষ্টা করুন।' }, 413, allowedOrigin);
    }
  } else {
    body = limitBody(request.body, maximum).stream;
  }

  const extension = MIME_EXTENSIONS[storedMime] ?? 'bin';
  const originalKey = `${prefix}/${user.id}/${id}.${extension}`;
  try {
    await bucket.put(originalKey, body, {
      httpMetadata: { contentType: storedMime, cacheControl: 'private, max-age=0, must-revalidate' },
      customMetadata: { ownerId: user.id, mediaAssetId: id, compression },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UPLOAD_TOO_LARGE') {
      return json({ error: `ফাইলের আকার সর্বোচ্চ ${Math.round(maximum / (1024 * 1024))} মেগাবাইট হতে পারে।` }, 413, allowedOrigin);
    }
    console.error('R2 upload failed', error);
    return json({ error: 'ফাইলটি নিরাপদে সংরক্ষণ করা যায়নি।' }, 502, allowedOrigin);
  }
  const original = await bucket.head(originalKey);
  if (!original?.size) return json({ error: 'ফাইল সংরক্ষণের যাচাই সম্পন্ন হয়নি।' }, 502, allowedOrigin);
  const metadata: Omit<MediaAsset, 'created_at'> = {
    id,
    owner_id: user.id,
    original_key: originalKey,
    derivative_key: null,
    mime_type: storedMime,
    original_bytes: original.size,
    derivative_bytes: null,
  };
  const supabaseResponse = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: request.headers.get('Authorization')!,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(metadata),
  });
  if (!supabaseResponse.ok) {
    await bucket.delete(originalKey);
    const detail = await supabaseResponse.text();
    console.error('Media record rejected', detail);
    return json({ error: 'মিডিয়ার নিরাপদ তথ্য নথিভুক্ত করা যায়নি।' }, 502, allowedOrigin);
  }
  return json({
    id,
    url: `${new URL(request.url).origin}${base}/${id}`,
    originalBytes: original.size,
    derivativeBytes: null,
    optimized,
    compression,
  }, 201, allowedOrigin);
}

async function serveMedia(request: Request, env: Env, allowedOrigin: string, scope: Scope, mediaId: string, headOnly: boolean) {
  if (!isUuid(mediaId)) return json({ error: 'ফাইল পাওয়া যায়নি।' }, 404, allowedOrigin);
  const bucket = bucketFor(env, scope);
  if (!bucket) return json({ error: 'ফাইল পাওয়া যায়নি।' }, 404, allowedOrigin);
  const rpc = SCOPES[scope].readRpc;
  const user = await currentUser(request, env);
  const token = request.headers.get('Authorization') ?? `Bearer ${env.SUPABASE_ANON_KEY}`;
  // Resolve the object through a SECURITY DEFINER RPC so the raw R2 key is never read from a
  // publicly-selectable table.
  const result = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/${rpc}`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_media_id: mediaId }),
  });
  if (!result.ok) return json({ error: 'ফাইল পাওয়া যায়নি।' }, 404, allowedOrigin);
  const asset = (await jsonFromResponse<MediaAsset[]>(result))[0];
  if (!asset) return json({ error: 'এই ফাইলটি দেখার অনুমতি নেই।' }, 404, allowedOrigin);
  const preferred = asset.derivative_key && asset.derivative_bytes && asset.derivative_bytes < asset.original_bytes ? asset.derivative_key : asset.original_key;
  if (!safeKey(preferred)) return json({ error: 'ফাইল পাওয়া যায়নি।' }, 404, allowedOrigin);
  const object = await bucket.get(preferred, { range: request.headers });
  if (!object) return json({ error: 'ফাইল পাওয়া যায়নি।' }, 404, allowedOrigin);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('ETag', object.httpEtag);
  headers.set('Cache-Control', user?.id === asset.owner_id ? 'private, max-age=0, must-revalidate' : 'public, max-age=86400, stale-while-revalidate=604800');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Content-Security-Policy', "default-src 'none'; sandbox");
  headers.set('Access-Control-Allow-Origin', allowedOrigin);
  headers.set('Vary', 'Origin');
  return response(headOnly ? null : object.body, object.httpEtag === request.headers.get('If-None-Match') ? 304 : 200, allowedOrigin, headers);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');
    const allowed = allowedOrigins(env);
    const allowedOrigin = origin && isAllowedOrigin(origin, allowed) ? origin : null;
    if (origin && !allowedOrigin) return new Response('Forbidden', { status: 403, headers: { 'Vary': 'Origin' } });
    const corsOrigin = allowedOrigin ?? [...allowed][0] ?? '';
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') {
      if (!allowedOrigin) return new Response(null, { status: 403, headers: { 'Vary': 'Origin' } });
      return response(null, 204, allowedOrigin);
    }
    if (url.pathname === '/health') return json({ ok: true, service: 'dutimz-media' }, 200, corsOrigin);
    if ((url.pathname === '/upload' || url.pathname === '/media/upload') && request.method === 'POST') {
      return upload(request, env, corsOrigin, 'article');
    }
    if (url.pathname === '/spotlight/upload' && request.method === 'POST') {
      return upload(request, env, corsOrigin, 'spotlight');
    }
    // A member's own picture or banner: any signed-in reader, their own object only.
    if (url.pathname === '/profile/upload' && request.method === 'POST') {
      return upload(request, env, corsOrigin, 'profile');
    }
    if (url.pathname.startsWith('/profile/media/') && (request.method === 'GET' || request.method === 'HEAD')) {
      return serveMedia(request, env, corsOrigin, 'profile', decodeURIComponent(url.pathname.slice('/profile/media/'.length)), request.method === 'HEAD');
    }
    if (url.pathname.startsWith('/spotlight/media/') && (request.method === 'GET' || request.method === 'HEAD')) {
      return serveMedia(request, env, corsOrigin, 'spotlight', decodeURIComponent(url.pathname.slice('/spotlight/media/'.length)), request.method === 'HEAD');
    }
    if (url.pathname.startsWith('/media/') && (request.method === 'GET' || request.method === 'HEAD')) {
      return serveMedia(request, env, corsOrigin, 'article', decodeURIComponent(url.pathname.slice('/media/'.length)), request.method === 'HEAD');
    }
    return json({ error: 'এই মিডিয়া অনুরোধ সমর্থিত নয়।' }, 404, corsOrigin);
  },
};
