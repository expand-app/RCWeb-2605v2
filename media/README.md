# media/

## What's in the repo

- `team/` — company photos (annual gala, founders, office, training)
- `food-*.png` — food photos for Meetfood mockup
- `food.mp4` — H.264-encoded food video (~1 MB, used in mobile mockup)
- `meetfood-logo.png` — Meetfood brand logo

## What's NOT in the repo (host on CDN)

These are gitignored because they exceed GitHub's 100 MB file limit:

- `instructors/*.mp4` — mentor video clips (~60-100 MB each)
- `replays/*.mp4` — interview replay videos (350 MB - 930 MB each)
- `food-hevc-original.mp4` — original HEVC encode (2.5 MB, superseded by `food.mp4`)

### Recommended CDN setup

1. **Vercel Blob** — easiest if using Vercel hosting (`vercel blob put`)
2. **Cloudflare R2** — cheap, S3-compatible, free egress
3. **AWS S3 + CloudFront** — battle-tested, more setup

After upload, update the video `<src>` paths in `index.html`:

```html
<!-- Before -->
<video src="media/instructors/Jennie.mp4" ...>

<!-- After -->
<video src="https://cdn.rexpandcareer.com/instructors/Jennie.mp4" ...>
```

Or use a single env var / constant if you prefer to swap base URLs.
