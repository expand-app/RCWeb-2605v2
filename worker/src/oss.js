// Aliyun OSS V1 signed PUT URL — returned to the browser so video/avatar
// upload goes direct to OSS, bypassing the Worker's body size limit.
//
// V1 spec: https://help.aliyun.com/zh/oss/developer-reference/include-signatures-in-the-url-2
// Chose V1 over V4 because the StringToSign is a 5-line plain-text format
// (well-tested in countless SDKs) vs V4's nested canonical request that's
// easy to misalign with the spec.

async function hmacSha1Bytes(secret, msg) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg)),
  );
}

function bytesToB64(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function encodeKeyForPath(key) {
  // encode each path segment but keep "/" separators.
  return key.split("/").map(encodeURIComponent).join("/");
}

/**
 * Build a signed URL the browser can PUT directly to OSS.
 *
 * @param env  Worker env with OSS_BUCKET, OSS_ENDPOINT, OSS_PUBLIC_BASE,
 *             OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET
 * @param key  Object key (e.g. "avatars/2026-05-31-headshot.png")
 * @param contentType  MIME, e.g. "image/png" or "video/mp4". MUST match what
 *                     the browser later PUTs — V1 includes Content-Type in
 *                     the signed string.
 * @param ttl  URL validity in seconds (default 900 = 15min)
 */
export async function presignPutObject(env, key, contentType, ttl = 900) {
  const ak = env.OSS_ACCESS_KEY_ID;
  const sk = env.OSS_ACCESS_KEY_SECRET;
  const bucket = env.OSS_BUCKET;
  const endpointUrl = new URL(env.OSS_ENDPOINT);
  // Virtual-hosted style: https://<bucket>.<endpoint-host>/<key>
  const host = `${bucket}.${endpointUrl.host}`;
  const expires = Math.floor(Date.now() / 1000) + ttl;

  // V1 StringToSign — fixed 5-line format:
  //   HTTP-Verb \n Content-MD5 \n Content-Type \n Expires \n
  //   CanonicalizedOSSHeaders + CanonicalizedResource
  // We sign no extra OSS headers, so that part is empty.
  // CanonicalizedResource is /<bucket>/<key> in raw form (NOT URL-encoded).
  const stringToSign = [
    "PUT",
    "",                  // Content-MD5 (not used)
    contentType,         // Content-Type — browser PUT MUST send the same
    String(expires),     // Expires (Unix epoch seconds)
    `/${bucket}/${key}`, // CanonicalizedResource
  ].join("\n");

  const sigBytes = await hmacSha1Bytes(sk, stringToSign);
  const sigB64 = bytesToB64(sigBytes);

  const url =
    `https://${host}/${encodeKeyForPath(key)}` +
    `?OSSAccessKeyId=${encodeURIComponent(ak)}` +
    `&Expires=${expires}` +
    `&Signature=${encodeURIComponent(sigB64)}`;

  const publicUrl = `${env.OSS_PUBLIC_BASE}/${key}`;
  return { url, publicUrl, key, expiresIn: ttl };
}

const VIDEO_EXTS = new Set(["mp4", "mov", "webm", "m4v"]);
const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp"]);

/** Sanitize + namespace an upload filename. Routes by prefix to image vs video allowlist. */
export function makeUploadKey(prefix, filename) {
  const safe = filename
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const ext = (safe.split(".").pop() || "").toLowerCase();
  const isImage = prefix === "avatars";
  const allowed = isImage ? IMAGE_EXTS : VIDEO_EXTS;
  if (!allowed.has(ext)) {
    throw new Error(
      `unsupported ${isImage ? "image" : "video"} extension: .${ext}`,
    );
  }
  const stamp = new Date().toISOString().slice(0, 10);
  return `${prefix}/${stamp}-${safe}`;
}
