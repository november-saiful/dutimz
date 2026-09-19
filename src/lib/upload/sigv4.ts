/**
 * AWS Signature Version 4 (a.k.a. AWS4-HMAC-SHA256) signer.
 *
 * Needed by the direct-to-R2 upload path in `src/app/api/images/upload`:
 * Cloudflare R2 speaks the S3 API, which rejects requests whose
 * `Authorization` header is not a real SigV4 signature. The previous
 * implementation here was not SigV4 at all (an RFC-1123 date in the canonical
 * request, no derived signing key, no `x-amz-content-sha256`), so every upload
 * failed with `SignatureDoesNotMatch`.
 *
 * Everything is implemented with WebCrypto so it runs in the Next.js edge
 * runtime *and* in Node's test environment.
 */

/** Minimal surface of WebCrypto's SubtleCrypto that we depend on. */
export interface SubtleCryptoLike {
  importKey(
    format: string,
    keyData: BufferSource,
    algorithm: { name: string; hash: string },
    extractable: boolean,
    keyUsages: string[],
  ): Promise<unknown>;
  sign(algorithm: { name: string }, key: unknown, data: BufferSource): Promise<ArrayBuffer>;
  digest(algorithm: { name: string }, data: BufferSource): Promise<ArrayBuffer>;
}

export interface SigV4Input {
  method: string;
  /** Request host, without scheme — e.g. `abc.r2.cloudflarestorage.com`. */
  host: string;
  /** Absolute path with a leading slash — e.g. `/bucket/key.webp`. */
  path: string;
  /** Query string without `?`. Values are encoded by the signer. */
  query?: Record<string, string> | string;
  /** Additional headers to sign. Names are lowercased automatically. */
  headers?: Record<string, string>;
  /** Hex SHA-256 of the request body; empty body is the well-known constant. */
  payloadHash: string;
  /** UTC timestamp in basic ISO-8601, e.g. `20150830T123600Z`. */
  amzDate: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service: string;
  subtle?: SubtleCryptoLike;
}

export const EMPTY_PAYLOAD_SHA256 =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

const ALGORITHM = "AWS4-HMAC-SHA256";

/** `20150830T123600Z` for the given instant (UTC). */
export function amzDateString(date: Date = new Date()): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

/** RFC 3986 encoding except that `/` is preserved in paths. */
function encodeRfc3986(value: string, keepSlash: boolean): string {
  const encoded = encodeURIComponent(value).replace(/[!'()*]/g, (c) =>
    `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return keepSlash ? encoded.replace(/%2F/gi, "/") : encoded;
}

function resolveSubtle(explicit?: SubtleCryptoLike): SubtleCryptoLike {
  const available = explicit ?? (globalThis.crypto?.subtle as unknown as SubtleCryptoLike);
  if (!available) {
    throw new Error("WebCrypto SubtleCrypto is unavailable in this runtime");
  }
  return available;
}

export async function sha256Hex(
  data: BufferSource,
  subtle?: SubtleCryptoLike,
): Promise<string> {
  const digest = await resolveSubtle(subtle).digest({ name: "SHA-256" }, data);
  return toHex(new Uint8Array(digest));
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmac(
  key: BufferSource,
  data: string,
  subtle: SubtleCryptoLike,
): Promise<ArrayBuffer> {
  const cryptoKey = await subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return subtle.sign({ name: "HMAC" }, cryptoKey, new TextEncoder().encode(data));
}

/** `{ method, canonicalRequest, signedHeaders }` — the SigV4 canonical request. */
export function buildCanonicalRequest(input: SigV4Input): {
  canonicalRequest: string;
  signedHeaders: string;
} {
  const headers: Record<string, string> = {
    ...input.headers,
    host: input.host,
    "x-amz-date": input.amzDate,
  };

  const canonicalHeaders = Object.keys(headers)
    .map((name) => name.toLowerCase())
    .sort()
    .map((name) => `${name}:${String(headers[name]).trim().replace(/\s+/g, " ")}\n`)
    .join("");
  const signedHeaders = Object.keys(headers)
    .map((name) => name.toLowerCase())
    .sort()
    .join(";");

  const canonicalUri = encodeRfc3986(input.path || "/", true);

  const queryEntries =
    typeof input.query === "string"
      ? parseQuery(input.query)
      : Object.entries(input.query ?? {});
  const canonicalQuery = queryEntries
    .map(([k, v]) => [encodeRfc3986(k, false), encodeRfc3986(v, false)] as const)
    .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const canonicalRequest = [
    input.method.toUpperCase(),
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    input.payloadHash,
  ].join("\n");

  return { canonicalRequest, signedHeaders };
}

function parseQuery(query: string): [string, string][] {
  const stripped = query.startsWith("?") ? query.slice(1) : query;
  if (!stripped) return [];
  return stripped.split("&").map((pair) => {
    const [k = "", v = ""] = pair.split("=");
    return [decodeURIComponent(k), decodeURIComponent(v)] as [string, string];
  });
}

export interface SigV4Result {
  /** Value for the `Authorization` request header. */
  authorization: string;
  /** Headers the caller must also send (`x-amz-date`, and a host match). */
  headers: Record<string, string>;
  signature: string;
  credentialScope: string;
  signedHeaders: string;
}

/**
 * Sign a request and return the `Authorization` header plus the timestamp
 * headers the caller must send verbatim.
 */
export async function signRequestV4(input: SigV4Input): Promise<SigV4Result> {
  const subtle = resolveSubtle(input.subtle);
  const { canonicalRequest, signedHeaders } = buildCanonicalRequest(input);

  const dateStamp = input.amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = [
    ALGORITHM,
    input.amzDate,
    credentialScope,
    await sha256Hex(new TextEncoder().encode(canonicalRequest), subtle),
  ].join("\n");

  // kSigning = HMAC(HMAC(HMAC(HMAC("AWS4"+secret, date), region), service), "aws4_request")
  const encoder = new TextEncoder();
  let key: BufferSource = encoder.encode(`AWS4${input.secretAccessKey}`);
  for (const step of [dateStamp, input.region, input.service, "aws4_request"]) {
    key = await hmac(key, step, subtle);
  }
  const signature = toHex(new Uint8Array(await hmac(key, stringToSign, subtle)));

  return {
    authorization:
      `${ALGORITHM} Credential=${input.accessKeyId}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
    headers: { "x-amz-date": input.amzDate },
    signature,
    credentialScope,
    signedHeaders,
  };
}
