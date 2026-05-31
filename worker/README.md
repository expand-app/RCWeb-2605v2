# `rexpand-admin-api` — Cloudflare Worker

Backs `webadmin.rexpandcareer.com`. Auths the operator, commits JSON + index.html
changes to GitHub, signs OSS upload URLs, imports Pueblo share links.

## Routes

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/login` | — | `{password}` → `{token, expiresIn}` |
| GET  | `/api/health` | — | liveness |
| GET  | `/api/state` | JWT | returns `{cases, mentors, replays, articles}` from `data/*.json` |
| POST | `/api/save` | JWT | `{cases?, mentors?, replays?, articles?, message?}` → single git commit |
| POST | `/api/upload-url` | JWT | `{prefix, filename, contentType}` → OSS presigned PUT |
| POST | `/api/puebulo` | JWT | `{input}` (token or share URL) → REPLAYS draft + raw Pueblo data |

All non-`login` routes require `Authorization: Bearer <jwt>`. Tokens expire in 8h.

## Local dev

```sh
cd worker
npm install
cp wrangler.toml.example wrangler.toml      # tweak [vars] for your domain
# Set up local .dev.vars (NOT committed) for secrets:
cat >.dev.vars <<EOF
ADMIN_PASSWORD_HASH=pbkdf2_sha256$100000$...$...
JWT_SECRET=$(openssl rand -hex 32)
GITHUB_TOKEN=ghp_...
OSS_ACCESS_KEY_ID=LTAI...
OSS_ACCESS_KEY_SECRET=...
EOF
npx wrangler dev --local
```

## Deploy

Prerequisite: Cloudflare account, `wrangler login` once.

```sh
cd worker
npm install
cp wrangler.toml.example wrangler.toml
# Edit [vars] in wrangler.toml — at minimum set OSS_BUCKET to your real bucket.

# Generate + set the admin password hash (one-time, offline):
python3 ../scripts/hash_password.py | wrangler secret put ADMIN_PASSWORD_HASH

# JWT signing secret (one-time, random):
openssl rand -hex 32 | wrangler secret put JWT_SECRET

# GitHub fine-grained PAT, `contents: write` on expand-app/rcweb-2605v2:
wrangler secret put GITHUB_TOKEN

# Aliyun OSS sub-user with PutObject on the resources bucket:
wrangler secret put OSS_ACCESS_KEY_ID
wrangler secret put OSS_ACCESS_KEY_SECRET

wrangler deploy
```

Then bind the custom domain `admin-api.rexpandcareer.com` to the Worker
either via `[[routes]]` in `wrangler.toml` (uncomment + tweak) or via the
Cloudflare dashboard. The admin SPA defaults to that origin; user can
override via the "switch" link on the login screen.

## Pueblo API

Verified shape (2026-05-31, `GET https://puebulo.com/api/share/<token>`):

```jsonc
{
  "session": {
    "id": "...", "title": "...", "startedAt": "ISO",
    "durationSeconds": 3000, "score": { ... }, "speakerRoles": { ... }
  },
  "recordings": { "videoUrl": "https://...", "audioUrl": "https://..." },
  "questions": [
    { "id": "...", "text": "...", "askedAtSeconds": 86,
      "kind": "interviewer", "answerText": "..." }
  ],
  "comments":   [...],
  "utterances": [...]
}
```

Tokens may 404 (deleted/never-existed) or 410 (revoked); both surface to the
operator with a helpful message.

## Sync-HTML invariants

`src/sync-html.js` rewrites only the regions of `index.html` between marker
comments added in setup:

| Marker | Where | Wraps |
|---|---|---|
| `@data:cases-data` | `<script>` | `const CASES_DATA = {...};` |
| `@data:cases-cards` | inside `.cases-grid` | the 63 `.case-card` divs |
| `@data:mentor-cards` | inside `.mentor-grid` | the 23 `.mentor-card` divs |
| `@data:replays` | `<script>` | `const REPLAYS = [...];` |
| `@data:articles` | `<script>` | `const ARTICLES = [...];` |

A small post-process loop (added next to the `@data:articles` markers) maps
the placeholder `{type, alt}` image shape back to the full `{url, alt, credit}`
shape via `mkImg`, so admin can save articles as plain JSON.

Hand-edits to `index.html` OUTSIDE these markers are safe — the Worker
preserves them. If you accidentally remove a marker, the next save will
throw `marker not found` and refuse to commit.

## Security notes

- Single shared admin password (sufficient for one operator). Bump to per-user
  if/when needed.
- JWT secret is symmetric (HS256). Rotate by `wrangler secret put JWT_SECRET`
  with a new value — all sessions invalidate.
- The OSS sub-user only needs `PutObject` permission on
  `resources-rexpandcareer/videos/*`. Do not grant ListObject, DeleteObject,
  or any bucket-policy permission.
- CORS allows only `ADMIN_ORIGIN` (set in `wrangler.toml`); browsers won't
  let the Worker be invoked from anywhere else.
