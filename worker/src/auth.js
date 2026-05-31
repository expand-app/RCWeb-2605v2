// PBKDF2 password hashing + HS256 JWT — all via Web Crypto, zero deps.

const PBKDF2_ITERATIONS = 100_000;
const HASH_ALGO = "SHA-256";
const HASH_FORMAT = "pbkdf2_sha256";
const JWT_TTL_SECONDS = 8 * 3600;

function b64UrlEncode(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64UrlDecode(s) {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pbkdf2(password, saltBytes, iterations) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBytes, iterations, hash: HASH_ALGO },
    key,
    256,
  );
}

/** Hash a plaintext password (use offline, e.g. via scripts/hash_password.py). */
export async function hashPassword(plain) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(plain, salt, PBKDF2_ITERATIONS);
  return `${HASH_FORMAT}$${PBKDF2_ITERATIONS}$${b64UrlEncode(salt)}$${b64UrlEncode(hash)}`;
}

export async function verifyPassword(plain, hashed) {
  if (!plain || !hashed) return false;
  const parts = hashed.split("$");
  if (parts.length !== 4 || parts[0] !== HASH_FORMAT) return false;
  const iters = parseInt(parts[1], 10);
  if (!Number.isFinite(iters) || iters < 1000) return false;
  const salt = b64UrlDecode(parts[2]);
  const expected = b64UrlDecode(parts[3]);
  const actual = new Uint8Array(await pbkdf2(plain, salt, iters));
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}

async function hmacSign(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: HASH_ALGO },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
}

export async function signJWT(payload, secret, ttl = JWT_TTL_SECONDS) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + ttl };
  const enc = new TextEncoder();
  const p1 = b64UrlEncode(enc.encode(JSON.stringify(header)));
  const p2 = b64UrlEncode(enc.encode(JSON.stringify(body)));
  const sig = await hmacSign(secret, `${p1}.${p2}`);
  return `${p1}.${p2}.${b64UrlEncode(sig)}`;
}

export async function verifyJWT(token, secret) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [p1, p2, sig] = parts;
  const expected = b64UrlEncode(await hmacSign(secret, `${p1}.${p2}`));
  // Constant-time-ish compare via length + character mismatch sum
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  if (diff !== 0) return null;
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64UrlDecode(p2)));
  } catch {
    return null;
  }
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}
