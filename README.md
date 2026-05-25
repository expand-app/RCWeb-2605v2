# RCWeb-2605 · Rexpand 睿思班

Single-page marketing site for **Rexpand** (睿思班) — AI-driven career placement for international students in North America.

Live at: **https://rexpandcareer.com**

---

## 📁 Repo layout

```
.
├── index.html              # Entire site (SPA, ~1.6 MB)
├── sitemap.xml             # SEO sitemap (all routes)
├── robots.txt              # Crawler config (incl. Baiduspider, GPTBot, ClaudeBot)
├── vercel.json             # Vercel SPA rewrites + cache + security headers
├── netlify.toml            # Netlify SPA fallback config
├── _redirects              # Cloudflare Pages / Netlify fallback
├── .htaccess               # Apache shared hosting fallback
├── DEPLOY.md               # Step-by-step deployment guide
├── README.md               # This file
├── serve.py                # Local dev static server (python serve.py)
└── media/
    ├── team/               # Company photos (gala, founders, office, training)
    ├── instructors/        # Mentor video clips (.mp4)
    ├── food-*.png          # Food photos for Meetfood mockup
    ├── meetfood-logo.png
    ├── food.mp4            # Food video used in Meetfood mockup
    └── replays/            # Interview replays (gitignored — host on CDN)
```

---

## 🏗️ Architecture

- **Single HTML file** with inline CSS + JS — no build step
- **JS router** using `history.pushState` — each "page" (`/about`, `/cases`, etc.) has a clean URL
- **Server config** (vercel.json / netlify.toml / _redirects / .htaccess) handles SPA fallback (any unknown route returns `index.html` so the JS router can take over)
- **SEO ready**: per-route meta tags, JSON-LD Organization schema, sitemap.xml, robots.txt with AI crawler allow-list
- **55 blog articles** in `ARTICLES[]` constant inside `index.html`, with custom SVG illustrations
- **Mobile responsive** with hamburger menu nav

---

## 🚀 Deploy

See **`DEPLOY.md`** for full step-by-step instructions. TL;DR:

### Vercel (recommended)
```bash
npm i -g vercel
vercel --prod
```
Vercel auto-reads `vercel.json` for SPA rewrites + caching.

### Other hosts
- **Cloudflare Pages / Netlify**: drop the directory, `_redirects` handles SPA fallback
- **Apache shared hosting**: drop into `public_html/`, `.htaccess` handles routing
- **nginx VPS**: see nginx config in `DEPLOY.md`

---

## 💻 Local development

```bash
python serve.py
# → http://localhost:8765
```

Or any static server (`python -m http.server 8765`, `npx serve`, etc.).

---

## 📞 Contact

- Site: https://rexpandcareer.com
- Email: hello@rexpandcareer.com
- 微信: scan QR on the site footer
