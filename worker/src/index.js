// Cloudflare Worker entry — backs webadmin.rexpandcareer.com.
//
// Routes (all under /api/):
//   POST   /api/login              { password } → { token }
//   GET    /api/state              → { cases, mentors, replays, articles, sha }
//   POST   /api/save               { cases?, mentors?, replays?, articles?, message? } → { commit }
//   POST   /api/upload-url         { prefix, filename, contentType } → { url, publicUrl }
//   POST   /api/puebulo            { input } → { draft, pueblo_score_preview }
//
// Everything except /api/login requires `Authorization: Bearer <jwt>`.

import { verifyPassword, signJWT, verifyJWT } from "./auth.js";
import { readFile, commitFiles } from "./github.js";
import { buildCommitFiles } from "./sync-html.js";
import { presignPutObject, makeVideoKey } from "./oss.js";
import { importShare } from "./puebulo.js";

// --- response helpers ---
function jsonResponse(env, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": env.ADMIN_ORIGIN || "*",
      "Access-Control-Allow-Credentials": "true",
      "Vary": "Origin",
    },
  });
}
function err(env, status, msg) {
  return jsonResponse(env, { error: msg }, status);
}

function corsPreflight(env) {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": env.ADMIN_ORIGIN || "*",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    },
  });
}

async function requireAuth(env, req) {
  const auth = req.headers.get("Authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  return verifyJWT(m[1], env.JWT_SECRET);
}

// --- handlers ---

async function handleLogin(env, req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return err(env, 400, "invalid JSON");
  }
  const ok = await verifyPassword(body.password || "", env.ADMIN_PASSWORD_HASH);
  if (!ok) return err(env, 401, "wrong password");
  const token = await signJWT({ sub: "admin" }, env.JWT_SECRET);
  return jsonResponse(env, { token, expiresIn: 8 * 3600 });
}

async function handleState(env, req) {
  const claims = await requireAuth(env, req);
  if (!claims) return err(env, 401, "unauthorized");

  // Pull the 4 data JSON files (single-source-of-truth for admin).
  const [casesRaw, mentorsRaw, replaysRaw, articlesRaw] = await Promise.all([
    readFile(env, "data/cases.json"),
    readFile(env, "data/mentors.json"),
    readFile(env, "data/replays.json"),
    readFile(env, "data/articles.json"),
  ]);
  return jsonResponse(env, {
    cases: JSON.parse(casesRaw),
    mentors: JSON.parse(mentorsRaw),
    replays: JSON.parse(replaysRaw),
    articles: JSON.parse(articlesRaw),
  });
}

async function handleSave(env, req) {
  const claims = await requireAuth(env, req);
  if (!claims) return err(env, 401, "unauthorized");
  let body;
  try {
    body = await req.json();
  } catch {
    return err(env, 400, "invalid JSON");
  }
  const updates = {
    cases: Array.isArray(body.cases) ? body.cases : undefined,
    mentors: Array.isArray(body.mentors) ? body.mentors : undefined,
    replays: Array.isArray(body.replays) ? body.replays : undefined,
    articles: Array.isArray(body.articles) ? body.articles : undefined,
  };
  if (
    !updates.cases &&
    !updates.mentors &&
    !updates.replays &&
    !updates.articles
  ) {
    return err(env, 400, "nothing to save");
  }

  // Pull the current index.html so we can apply the marker-based rewrites.
  const html = await readFile(env, "index.html");
  let files;
  try {
    files = buildCommitFiles(html, {}, updates);
  } catch (e) {
    return err(env, 500, `sync-html failed: ${e.message}`);
  }
  if (files.length === 0) return jsonResponse(env, { commit: null, note: "no-op" });

  const changedTypes = Object.keys(updates).filter((k) => updates[k]);
  const message = body.message?.trim() ||
    `webadmin: 更新 ${changedTypes.join(" / ")} (${changedTypes.map((t) => updates[t].length).join("/")} 条)`;
  const sha = await commitFiles(env, files, message);
  return jsonResponse(env, { commit: sha, files: files.map((f) => f.path) });
}

async function handleUploadUrl(env, req) {
  const claims = await requireAuth(env, req);
  if (!claims) return err(env, 401, "unauthorized");
  const body = await req.json().catch(() => ({}));
  const prefix = body.prefix || "videos/misc";
  if (!/^videos\/(mentors|replays|misc)$/.test(prefix)) {
    return err(env, 400, "prefix must be videos/mentors, videos/replays, or videos/misc");
  }
  if (!body.filename) return err(env, 400, "filename required");
  if (!body.contentType) return err(env, 400, "contentType required");
  let key;
  try {
    key = makeVideoKey(prefix, body.filename);
  } catch (e) {
    return err(env, 400, e.message);
  }
  const presigned = await presignPutObject(env, key, body.contentType);
  return jsonResponse(env, presigned);
}

async function handlePuebulo(env, req) {
  const claims = await requireAuth(env, req);
  if (!claims) return err(env, 401, "unauthorized");
  const body = await req.json().catch(() => ({}));
  if (!body.input) return err(env, 400, "input required (token or share URL)");
  try {
    const result = await importShare(body.input);
    return jsonResponse(env, result);
  } catch (e) {
    return err(env, 502, e.message);
  }
}

// --- router ---
export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return corsPreflight(env);
    const url = new URL(req.url);

    if (!url.pathname.startsWith("/api/")) {
      return err(env, 404, "not found");
    }
    try {
      switch (`${req.method} ${url.pathname}`) {
        case "POST /api/login":
          return await handleLogin(env, req);
        case "GET /api/state":
          return await handleState(env, req);
        case "POST /api/save":
          return await handleSave(env, req);
        case "POST /api/upload-url":
          return await handleUploadUrl(env, req);
        case "POST /api/puebulo":
          return await handlePuebulo(env, req);
        case "GET /api/health":
          return jsonResponse(env, { ok: true, time: new Date().toISOString() });
      }
      return err(env, 404, "no such route");
    } catch (e) {
      return err(env, 500, `worker error: ${e.message}`);
    }
  },
};
