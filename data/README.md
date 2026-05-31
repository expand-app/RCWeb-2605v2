# Structured data snapshots

Pre-extracted JSON snapshots of every dynamically-editable block on the site.
Pulled from `index.html` (currently the source of truth at runtime) by
`scripts/extract_data.py`.

| File | Count | Description | Editable in admin |
|---|---|---|---|
| `cases.json` | 63 | Student success cases shown on `/cases` and in the home marquee | CRUD |
| `mentors.json` | 23 | Mentors on `/about` (12 have video clips) | CRUD (info + video) |
| `replays.json` | 3 | Long-form mock-interview replays on `/resources` (Pueblo-style score + transcript) | CRUD (Pueblo extract + video) |
| `articles.json` | 55 | Career-intel blog articles on `/resources` (long + short form) | Delete only (auth tool generates these) |

## Schema

Each file is an array of objects. Field shapes follow the original JS structures
inside `index.html` — see the matching extractor function in
`scripts/extract_data.py` for the exact mapping (one section per data type).

Notable conventions:

- **cases**: `id` is the canonical archive number ("10003"); `display_id` is
  the marketing-facing number ("15372"); `degree` is Chinese ("硕士"/"博士"/"学士");
  `has_narrative` indicates whether `reason` + `focus` fields are filled.
- **mentors**: `avatar_src` is an absolute path under `/media/avatars/`;
  `video_url` is an absolute URL on `resources.rexpandcareer.com` (OSS).
- **replays**: nested `score.dimensions` (5 per replay) + `questions` (n per
  replay with `t` seconds-from-start timestamps) match Puebulo's share API
  output 1:1, so the Phase 1 admin can import a Puebulo share link directly.
- **articles**: `body` is a raw HTML string (rendered as-is); `image` is the
  output of an inline `mkImg(type, alt)` helper (`{type, alt}` placeholder).

## Phase 0 invariant (today)

JSON files are **parallel snapshots** — `index.html` is still what renders the
site. Save flow: nothing yet writes JSON automatically.

## Phase 1 invariant (admin online)

The admin (`webadmin.rexpandcareer.com`) reads & writes these JSON files via a
Cloudflare Worker that commits to this repo. The Worker also updates the
corresponding HTML segments in `index.html` so the site keeps rendering the
same content.

## Re-running the extractor

If you hand-edit `index.html` and want the JSON snapshot to catch up:

```sh
python3 scripts/extract_data.py
```

Requires `node` on `$PATH` (used to evaluate the JS literals: `REPLAYS`,
`ARTICLES`, plus the `mkImg(...)` placeholder helper).
