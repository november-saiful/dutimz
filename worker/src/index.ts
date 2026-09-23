interface Env {
  MEDIA_BUCKET: R2Bucket;
  IMAGES: ImagesBinding;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  ALLOWED_ORIGIN: string;
  OPTIMIZE_IMAGES?: string;
}

type User = { id: string; email?: string };
type MediaAsset = {
  id: string;
  owner_id: string;
  original_key: string;
  derivative_key: string | null;
  mime_type: string;
  original_bytes: number;
  derivative_bytes: number | null;
  created_at: string;
};

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 12 * 1024 * 1024;
const MAX_VIDEO_BYTES = 40 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
  'application/pdf', 'audio/mpeg', 'audio/ogg', 'audio/mp4', 'video/mp4', 'video/webm',
]);
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png']);
const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'image/avif': 'avif', 'application/pdf': 'pdf', 'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'video/mp4': 'mp4', 'video/webm': 'webm',
};

function response(body: BodyInit | null, status: number, origin: string, allowedOrigin: string, headers?: HeadersInit) {
  const output = new Headers(headers);
  output.set('Access-Control-Allow-Origin', allowedOrigin);
  output.set('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
  output.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Content-Length, X-Upload-Filename');
  output.set('Access-Control-Max-Age', '86400');
  output.set('Vary', 'Origin');
  return new Response(body, { status, headers: output });
}
function json(payload: unknown, status: number, origin: string, env: Env, additional?: HeadersInit) {
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  new Headers(additional).forEach((value, key) => headers.set(key, value));
  return response(JSON.stringify(payload), status, origin, env.ALLOWED_ORIGIN, headers);
}
function cleanMime(value: string) { return value.split(';', 1)[0]!.trim().toLowerCase(); }
function isUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function safeKey(value: string) { return /^[a-zA-Z0-9_/-]+(?:\.[a-zA-Z0-9_-]+)?$/.test(value) && !value.includes('..') && !value.startsWith('/') && value.length <= 512; }
function jsonFromResponse<T>(response: Response): Promise<T> { return response.json() as Promise<T>; }

async function currentUser(request: Request, env: Env): Promise<User | null> {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return null;
  const userResponse = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: authorization },
  });
  if (!userResponse.ok) return null;
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

async function createDerivative(env: Env, originalKey: string, originalMime: string, originalSize: number) {
  // Cloudflare Images exposes no verifiable lossless mode, so optimization is
  // opt-in and the original object in R2 is always kept as the source of truth.
  if (env.OPTIMIZE_IMAGES !== 'true') return null;
  if (!IMAGE_TYPES.has(originalMime) || originalSize > MAX_IMAGE_BYTES) return null;
  const source = await env.MEDIA_BUCKET.get(originalKey);
  if (!source?.body) return null;
  try {
    const optimized = await (await env.IMAGES.input(source.body).output({ format: 'image/webp', quality: 100, anim: true })).response();
    if (!optimized.ok || cleanMime(optimized.headers.get('Content-Type') ?? '') !== 'image/webp') return null;
    const bytes = await optimized.arrayBuffer();
    if (bytes.byteLength <= 0 || bytes.byteLength >= originalSize) return null;
    const view = new Uint8Array(bytes);
    const isWebp = view.length >= 12
      && String.fromCharCode(...view.subarray(0, 4)) === 'RIFF'
      && String.fromCharCode(...view.subarray(8, 12)) === 'WEBP';
    if (!isWebp) return null;
    const derivativeKey = `${originalKey}.optimized.webp`;
    await env.MEDIA_BUCKET.put(derivativeKey, bytes, {
      httpMetadata: { contentType: 'image/webp', cacheControl: 'public, max-age=31536000, immutable' },
      customMetadata: { originalKey, compression: 'webp-optimized-quality-100', verifiedSmaller: 'true' },
    });
    return { key: derivativeKey, bytes: bytes.byteLength };
  } catch {
    // Original has already been safely persisted. Compression failure never
    // blocks upload and never changes the source object.
    return null;
  }
}

async function upload(request: Request, env: Env, origin: string) {
  if (!request.body) return json({ error: 'ফাইলের তথ্য পাওয়া যায়নি।' }, 400, origin, env);
  const user = await currentUser(request, env);
  if (!user) return json({ error: 'ফাইল পাঠাতে আগে গুগল দিয়ে প্রবেশ করুন।' }, 401, origin, env);
  const role = await currentRole(request, env, user.id);
  if (!role || !['reporter', 'moderator', 'admin'].includes(role.role)) return json({ error: 'ফাইল পাঠাতে সম্পাদকীয় অনুমতি প্রয়োজন।' }, 403, origin, env);
  const mime = cleanMime(request.headers.get('Content-Type') ?? '');
  if (!ALLOWED_TYPES.has(mime)) return json({ error: 'এই ফাইলের ধরন অনুমোদিত নয়।' }, 415, origin, env);
  const maximum = mime.startsWith('image/') ? MAX_IMAGE_BYTES : mime.startsWith('video/') || mime.startsWith('audio/') ? MAX_VIDEO_BYTES : MAX_DOCUMENT_BYTES;
  const declaredSize = Number(request.headers.get('Content-Length') ?? 0);
  if (declaredSize > maximum) return json({ error: `এই ফাইলের আকার সর্বোচ্চ ${Math.round(maximum / (1024 * 1024))} মেগাবাইট হতে পারে।` }, 413, origin, env);
  const limited = limitBody(request.body, maximum);
  const extension = MIME_EXTENSIONS[mime];
  const id = crypto.randomUUID();
  const originalKey = `originals/${user.id}/${id}.${extension}`;
  try {
    await env.MEDIA_BUCKET.put(originalKey, limited.stream, {
      httpMetadata: { contentType: mime, cacheControl: 'private, max-age=0, must-revalidate' },
      customMetadata: { ownerId: user.id, mediaAssetId: id },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UPLOAD_TOO_LARGE') return json({ error: `ফাইলের আকার সর্বোচ্চ ${Math.round(maximum / (1024 * 1024))} মেগাবাইট হতে পারে।` }, 413, origin, env);
    console.error('R2 upload failed', error);
    return json({ error: 'ফাইলটি নিরাপদে সংরক্ষণ করা যায়নি।' }, 502, origin, env);
  }
  const original = await env.MEDIA_BUCKET.head(originalKey);
  if (!original?.size) return json({ error: 'ফাইল সংরক্ষণের যাচাই সম্পন্ন হয়নি।' }, 502, origin, env);
  const derivative = await createDerivative(env, originalKey, mime, original.size);
  const metadata: Omit<MediaAsset, 'created_at'> = {
    id,
    owner_id: user.id,
    original_key: originalKey,
    derivative_key: derivative?.key ?? null,
    mime_type: mime,
    original_bytes: original.size,
    derivative_bytes: derivative?.bytes ?? null,
  };
  const supabaseResponse = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/media_assets`, {
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
    await env.MEDIA_BUCKET.delete([originalKey, ...(derivative ? [derivative.key] : [])]);
    const detail = await supabaseResponse.text();
    console.error('Media record rejected', detail);
    return json({ error: 'মিডিয়ার নিরাপদ তথ্য নথিভুক্ত করা যায়নি।' }, 502, origin, env);
  }
  return json({
    id,
    url: `${new URL(request.url).origin}/media/${id}`,
    originalBytes: original.size,
    derivativeBytes: derivative?.bytes ?? null,
    optimized: Boolean(derivative),
    compression: derivative ? 'webp-optimized-smaller' : 'original-retained',
  }, 201, origin, env);
}

async function serveMedia(request: Request, env: Env, origin: string, mediaId: string, headOnly: boolean) {
  if (!isUuid(mediaId)) return json({ error: 'ফাইল পাওয়া যায়নি।' }, 404, origin, env);
  const user = await currentUser(request, env);
  const token = request.headers.get('Authorization') ?? `Bearer ${env.SUPABASE_ANON_KEY}`;
  // Resolve the object through the SECURITY DEFINER RPC so anonymous readers can
  // only ever reach media that belongs to a published article.
  const result = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/get_media_asset`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_media_id: mediaId }),
  });
  if (!result.ok) return json({ error: 'ফাইল পাওয়া যায়নি।' }, 404, origin, env);
  const asset = (await jsonFromResponse<MediaAsset[]>(result))[0];
  if (!asset) return json({ error: 'এই ফাইলটি দেখার অনুমতি নেই।' }, 404, origin, env);
  const preferred = asset.derivative_key && asset.derivative_bytes && asset.derivative_bytes < asset.original_bytes ? asset.derivative_key : asset.original_key;
  if (!safeKey(preferred)) return json({ error: 'ফাইল পাওয়া যায়নি।' }, 404, origin, env);
  const object = await env.MEDIA_BUCKET.get(preferred, { range: request.headers });
  if (!object) return json({ error: 'ফাইল পাওয়া যায়নি।' }, 404, origin, env);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('ETag', object.httpEtag);
  headers.set('Cache-Control', user?.id === asset.owner_id ? 'private, max-age=0, must-revalidate' : 'public, max-age=86400, stale-while-revalidate=604800');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Content-Security-Policy', "default-src 'none'; sandbox");
  headers.set('Access-Control-Allow-Origin', env.ALLOWED_ORIGIN);
  headers.set('Vary', 'Origin');
  return response(headOnly ? null : object.body, object.httpEtag === request.headers.get('If-None-Match') ? 304 : 200, origin, env.ALLOWED_ORIGIN, headers);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin') ?? env.ALLOWED_ORIGIN;
    if (origin !== env.ALLOWED_ORIGIN) return new Response('Forbidden', { status: 403, headers: { 'Vary': 'Origin' } });
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return response(null, 204, origin, env.ALLOWED_ORIGIN);
    if (url.pathname === '/health') return json({ ok: true, service: 'dutimz-media' }, 200, origin, env);
    if ((url.pathname === '/upload' || url.pathname === '/media/upload') && request.method === 'POST') return upload(request, env, origin);
    if (url.pathname.startsWith('/media/') && (request.method === 'GET' || request.method === 'HEAD')) {
      return serveMedia(request, env, origin, decodeURIComponent(url.pathname.slice('/media/'.length)), request.method === 'HEAD');
    }
    return json({ error: 'এই মিডিয়া অনুরোধ সমর্থিত নয়।' }, 404, origin, env);
  },
};
