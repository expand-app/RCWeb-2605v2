// Aliyun OSS v4 signed PUT URL — returned to the browser so video upload
// goes direct-to-OSS, bypassing the Worker's body size limit.
//
// Spec: https://help.aliyun.com/zh/oss/developer-reference/include-signatures-in-the-url

async function hmacSha256Bytes(keyBytes, msg) {
  const key = await crypto.subtle.importKey(
    "raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg)),
  );
}

function hex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return hex(new Uint8Array(buf));
}

function uriEncode(s, encodeSlash = true) {
  // RFC 3986 unreserved chars only; OSS v4 follows AWS sigv4 conventions.
  let out = "";
  for (const ch of s) {
    if (/[A-Za-z0-9\-._~]/.test(ch) || (!encodeSlash && ch === "/")) {
      out += ch;
    } else {
      const bytes = new TextEncoder().encode(ch);
      for (const b of bytes) {
        out += "%" + b.toString(16).toUpperCase().padStart(2, "0");
      }
    }
  }
  return out;
}

function isoStamp(date) {
  // YYYYMMDDTHHmmssZ (basic format)
  const pad = (n) => String(n).padStart(2, "0");
  return (
    date.getUTCFullYear() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    "T" +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    "Z"
  );
}

/**
 * Build a signed URL the browser can PUT directly to OSS.
 *
 * @param env  Worker env with OSS_REGION, OSS_BUCKET, OSS_ENDPOINT,
 *             OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET
 * @param key  Object key (e.g. "videos/mentors/2026-05-31-jane.mp4")
 * @param contentType  MIME, e.g. "video/mp4"
 * @param ttl  URL validity in seconds (default 900 = 15min)
 */
export async function presignPutObject(env, key, contentType, ttl = 900) {
  const ak = env.OSS_ACCESS_KEY_ID;
  const sk = env.OSS_ACCESS_KEY_SECRET;
  const region = env.OSS_REGION;
  const bucket = env.OSS_BUCKET;
  // Virtual-hosted style: https://<bucket>.<endpoint-host>
  const endpointUrl = new URL(env.OSS_ENDPOINT);
  const host = `${bucket}.${endpointUrl.host}`;

  const now = new Date();
  const amzDate = isoStamp(now);
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${region}/oss/aliyun_v4_request`;

  const queryParams = {
    "x-oss-signature-version": "OSS4-HMAC-SHA256",
    "x-oss-credential": `${ak}/${credentialScope}`,
    "x-oss-date": amzDate,
    "x-oss-expires": String(ttl),
    "x-oss-signed-headers": "host",
  };

  // Canonical query string (sorted, URI-encoded keys+values)
  const sortedKeys = Object.keys(queryParams).sort();
  const canonicalQuery = sortedKeys
    .map((k) => `${uriEncode(k)}=${uriEncode(queryParams[k])}`)
    .join("&");

  const canonicalUri = "/" + uriEncode(key, false);
  const canonicalHeaders = `host:${host}\n`;
  const signedHeaders = "host";
  const payloadHash = "UNSIGNED-PAYLOAD";

  const canonicalRequest = [
    "PUT",
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const stringToSign = [
    "OSS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  // Derive signing key: HMAC chain
  const enc = new TextEncoder();
  const k1 = await hmacSha256Bytes(enc.encode("aliyun_v4" + sk), dateStamp);
  const k2 = await hmacSha256Bytes(k1, region);
  const k3 = await hmacSha256Bytes(k2, "oss");
  const signingKey = await hmacSha256Bytes(k3, "aliyun_v4_request");
  const signature = hex(await hmacSha256Bytes(signingKey, stringToSign));

  const signedQuery = canonicalQuery + `&x-oss-signature=${uriEncode(signature)}`;
  const url = `https://${host}${canonicalUri}?${signedQuery}`;
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
