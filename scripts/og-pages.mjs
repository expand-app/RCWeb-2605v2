/**
 * Pre-render per-route static HTML so social/search crawlers (WeChat, etc.,
 * which do NOT run JS) get the right title / description / og:image when a
 * deep link is shared. The SPA still boots and routes from the URL on load.
 *
 * Source of truth = routeMeta / BG_ROUTE_META inside index.html (for the
 * fixed marketing pages) + data/articles.json + data/replays.json (for the
 * 57+6 user-content pages). We extract them so this never drifts.
 *
 * Reads ./index.html + data/*.json, writes ./dist/<path>.html for each route
 * (served at the clean URL via CDN host_redirect rewrite /<path> -> /<path>.html
 * for single-segment, or as extensionless OSS objects via dist-nested/ for
 * multi-segment paths like /article/<slug> and /replay/<slug>).
 *
 * Also writes:
 *   dist/sitemap.xml        — auto-generated, includes every route + article
 *                             + replay, with proper lastmod
 *   dist/llms.txt           — GEO standard (https://llmstxt.org/) so AI
 *                             crawlers (GPTBot/ClaudeBot/PerplexityBot) get
 *                             a curated entry-point summary
 */
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const ORIGIN = 'https://rexpandcareer.com';
const DEFAULT_OG = ORIGIN + '/media/team/2024-annual-gala.png';

// ---------- Helpers ----------

function extractObject(name){
  const re = new RegExp('const ' + name + ' = (\\{[\\s\\S]*?\\n\\});');
  const m = html.match(re);
  if(!m) throw new Error('Could not extract ' + name + ' from index.html');
  return eval('(' + m[1] + ')');
}

function esc(s){
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Strip HTML tags + collapse whitespace. Used to turn article body / title
// HTML into plain text for og:description and JSON-LD articleBody.
function stripHtml(s){
  return String(s ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(s, n){
  s = stripHtml(s);
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…';
}

// Resolve an article's image object. The webadmin stores image as either
//   {url, alt, credit}   (legacy, fully resolved)
// or
//   {type, alt}          (Pueblo-importer style; runtime resolves via mkImg)
// We extract the IMG[] table from index.html so {type} entries resolve to
// the right Unsplash URL — otherwise every article shares the default OG
// image and loses social-share visual variety.
const IMG_TABLE = (() => {
  const m = html.match(/const IMG = (\{[\s\S]*?\n  \});/);
  if(!m) return {};
  try { return eval('(' + m[1] + ')'); } catch { return {}; }
})();

function resolveArticleImage(a){
  if(a?.image?.url) return { url: a.image.url, alt: a.image.alt || '' };
  if(a?.image?.type && IMG_TABLE[a.image.type]?.url){
    return { url: IMG_TABLE[a.image.type].url, alt: a.image.alt || '' };
  }
  return { url: DEFAULT_OG, alt: '' };
}

// 2026.05.31 -> 2026-05-31  (ISO-8601 date the schemas + sitemap want)
function isoDate(s){
  if(!s) return '';
  const m = String(s).match(/^(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
  if(!m) return '';
  return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
}

// "57:56" / "1:00:00" -> ISO-8601 duration  PT57M56S / PT1H0M0S
function isoDuration(s){
  if(!s) return '';
  const parts = String(s).split(':').map((p) => parseInt(p, 10));
  if(parts.some(isNaN)) return '';
  let h = 0, m = 0, sec = 0;
  if(parts.length === 3) [h, m, sec] = parts;
  else if(parts.length === 2) [m, sec] = parts;
  else return '';
  return `PT${h ? h + 'H' : ''}${m}M${sec}S`;
}

// Replace the value of a head element identified by id (content= or href=),
// or the text of the <title>.
function applyHead(src, { title, desc, url, og, ogw, ogh, jsonLd }){
  let out = src;
  const canonical = url;
  out = out.replace(/(<title id="meta-title">)[^<]*(<\/title>)/, `$1${esc(title)}$2`);
  const setAttr = (id, attr, val) => {
    if(val == null) return;
    const re = new RegExp(`(<[^>]*id="${id}"[^>]*${attr}=")[^"]*(")`);
    out = out.replace(re, `$1${esc(val)}$2`);
  };
  setAttr('meta-description', 'content', desc);
  setAttr('meta-canonical', 'href', canonical);
  setAttr('og-title', 'content', title);
  setAttr('og-description', 'content', desc);
  setAttr('og-url', 'content', canonical);
  setAttr('og-image', 'content', og);
  setAttr('og-image-width', 'content', ogw);
  setAttr('og-image-height', 'content', ogh);
  setAttr('tw-title', 'content', title);
  setAttr('tw-description', 'content', desc);
  setAttr('tw-image', 'content', og);
  // Inject one extra JSON-LD block right before </head>. The page already
  // has the Organization + WebSite blocks at the top; adding here is fine.
  if(jsonLd){
    const block = `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>\n`;
    out = out.replace('</head>', block + '</head>');
  }
  return out;
}

// ---------- Build the page list ----------

const routeMeta = extractObject('routeMeta');
const BG_DIR_BY_SLUG = extractObject('BG_DIR_BY_SLUG');
const BG_ROUTE_META = extractObject('BG_ROUTE_META');

const pages = [];

// 1) Fixed marketing routes (offer, cases, background, resources, about,
//    privacy, user-terms, mentor-terms)
for(const key of ['offer', 'cases', 'background', 'resources', 'about', 'privacy', 'user-terms', 'mentor-terms']){
  const m = routeMeta[key];
  if(!m) continue;
  pages.push({ path: m.path, title: m.title, desc: m.desc, og: m.og, ogw: m.ogw, ogh: m.ogh });
}

// 2) Background per-direction sub-pages: prefer per-direction og/dimensions,
//    fall back to the /background parent's og.
const bgParent = routeMeta.background;
for(const slug in BG_DIR_BY_SLUG){
  const dir = BG_DIR_BY_SLUG[slug];
  const bgm = BG_ROUTE_META[dir];
  if(!bgm) continue;
  pages.push({
    path: '/bg-' + slug,
    title: bgm.title, desc: bgm.desc,
    og: bgm.og || bgParent.og,
    ogw: bgm.ogw || bgParent.ogw,
    ogh: bgm.ogh || bgParent.ogh
  });
}

// 3) Each article (data/articles.json) → /article/<slug>
let articles = [];
try {
  articles = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'articles.json'), 'utf8'));
} catch (e) { console.warn('articles.json missing:', e.message); }

for(const a of articles){
  if(!a.slug) continue;
  const titleText = stripHtml(a.title) || stripHtml(a.dek) || a.slug;
  const descText = truncate(a.dek || stripHtml(a.title), 160);
  const img = resolveArticleImage(a);
  const dateISO = isoDate(a.date);
  // NewsArticle JSON-LD: makes content extractable by Google Discover, AI
  // crawlers, and helps featured snippets. articleBody truncated to ~2000
  // chars so AI summarizers get enough context without bloating page size.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: titleText.slice(0, 110),       // schema.org max 110
    description: descText,
    datePublished: dateISO,
    dateModified: dateISO,
    inLanguage: 'zh-CN',
    articleSection: a.category || '求职情报',
    keywords: Array.isArray(a.keywords) ? a.keywords.join(', ') : undefined,
    image: img.url,
    articleBody: truncate(a.body, 2000),
    author: { '@type': 'Organization', name: 'Rexpand · 睿思班', url: ORIGIN + '/' },
    publisher: {
      '@type': 'Organization',
      name: 'Rexpand · 睿思班',
      logo: { '@type': 'ImageObject', url: ORIGIN + '/media/team/2022-founders.png' }
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': ORIGIN + '/article/' + a.slug }
  };
  pages.push({
    path: '/article/' + a.slug,
    title: titleText + ' · Rexpand',
    desc: descText,
    og: img.url,
    ogw: 1200, ogh: 630,
    jsonLd,
    _lastmod: dateISO
  });
}

// 4) Each replay (data/replays.json) → /replay/<slug>
let replays = [];
try {
  replays = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'replays.json'), 'utf8'));
} catch (e) { console.warn('replays.json missing:', e.message); }

for(const r of replays){
  if(!r.slug) continue;
  const titleText = r.seoTitle || (r.role && r.company ? `${r.role} · ${r.company} — Mock Interview Replay` : r.slug);
  const descText = truncate(r.dek || r.summary, 160);
  const dateISO = isoDate(r.date);
  const dur = isoDuration(r.duration);
  // VideoObject JSON-LD: required for Google Video / rich results.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: titleText,
    description: truncate(r.summary || r.dek, 500),
    uploadDate: dateISO,
    duration: dur || undefined,
    contentUrl: r.videoSrc || undefined,
    thumbnailUrl: DEFAULT_OG,
    inLanguage: 'zh-CN',
    publisher: {
      '@type': 'Organization',
      name: 'Rexpand · 睿思班',
      logo: { '@type': 'ImageObject', url: ORIGIN + '/media/team/2022-founders.png' }
    }
  };
  pages.push({
    path: '/replay/' + r.slug,
    title: titleText,
    desc: descText,
    og: DEFAULT_OG,
    ogw: 1200, ogh: 630,
    jsonLd,
    _lastmod: dateISO
  });
}

// ---------- Write each page ----------

let count = 0;
const nested = [];
for(const pg of pages){
  const key = pg.path.replace(/^\//, '');
  const rendered = applyHead(html, {
    title: pg.title, desc: pg.desc, url: ORIGIN + pg.path,
    og: pg.og, ogw: pg.ogw, ogh: pg.ogh, jsonLd: pg.jsonLd,
  });
  const outPath = path.join(ROOT, 'dist', key + '.html');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, rendered);
  if(key.includes('/')){
    const flat = key.replace(/\//g, '__');
    fs.mkdirSync(path.join(ROOT, 'dist-nested'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'dist-nested', flat), rendered);
    nested.push(`${flat}\t${key}`);
  }
  count++;
}
if(nested.length){
  fs.writeFileSync(path.join(ROOT, 'dist-nested', 'manifest.txt'), nested.join('\n') + '\n');
}

// ---------- Auto-regenerate sitemap.xml ----------
// Includes every page above + the homepage. Each entry has proper <lastmod>
// (today for fixed routes, article/replay date for content). Replaces any
// static sitemap.xml that was copied into dist/ earlier in the deploy.
//
// `priority` is mostly cosmetic these days (Google ignores it) but useful
// for Baidu/Yandex which still consult it.
const today = new Date().toISOString().slice(0, 10);
const sitemapUrls = [];
sitemapUrls.push({ loc: ORIGIN + '/', lastmod: today, changefreq: 'weekly', priority: '1.0' });
for(const pg of pages){
  sitemapUrls.push({
    loc: ORIGIN + pg.path,
    lastmod: pg._lastmod || today,
    changefreq: pg._lastmod ? 'monthly' : 'weekly',
    priority: pg.path.startsWith('/article/') || pg.path.startsWith('/replay/') ? '0.7' : '0.9',
  });
}
const sitemapXml =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  sitemapUrls.map((u) =>
    `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`
  ).join('\n') + '\n</urlset>\n';
fs.writeFileSync(path.join(ROOT, 'dist', 'sitemap.xml'), sitemapXml);

// ---------- llms.txt for GEO (Generative Engine Optimization) ----------
// https://llmstxt.org/ — emerging standard for AI crawlers. Gives a curated
// entry-point summary that's easier for LLMs to index than scraping the SPA.
const llmsTxt = `# Rexpand · 睿思班

> AI-driven career placement for international students in North America. Multi-Agent automation + a 1,000+ mentor network for software engineering, data analytics, data science, quantitative finance, and investment banking placements. Money-back guarantee.

## Core Services

- [保 offer 项目 / Money-back Offer Guarantee Program](${ORIGIN}/offer): The flagship program — pay only when an offer lands.
- [案例 / Verified Case Archive](${ORIGIN}/cases): 63 archived student success cases with verified offer letters.
- [面试回放 / Mock Interview Replays](${ORIGIN}/resources): Full-length real-interview recordings with Pueblo-style scoring and timestamped questions.
- [求职情报 / Career Intel](${ORIGIN}/resources): 50+ articles on H1B, layoffs, FAANG/MBB/IB recruiting timelines, and salary data.
- [关于我们 / About](${ORIGIN}/about): Team, mentors, and mission.

## Background Boost Tracks

Per-direction structured prep:
- [Data Analytics](${ORIGIN}/bg-data-analytics)
- [Data Science](${ORIGIN}/bg-data-science)
- [Quantitative Finance](${ORIGIN}/bg-quant)
- [Investment Banking](${ORIGIN}/bg-investment-banking)
- [Software Engineering](${ORIGIN}/bg-software-engineering)

## Latest Articles

${articles.slice(0, 15).map((a) => `- [${stripHtml(a.title)}](${ORIGIN}/article/${a.slug}): ${truncate(a.dek, 120)}`).join('\n')}

## Latest Interview Replays

${replays.slice(0, 6).map((r) => `- [${r.role || r.seoTitle || r.slug} @ ${r.company || ''}](${ORIGIN}/replay/${r.slug}): ${r.duration}, score ${r.score?.overall || '—'}/100`).join('\n')}

## Sitemap

[Full XML sitemap](${ORIGIN}/sitemap.xml) — ${sitemapUrls.length} URLs total.
`;
fs.writeFileSync(path.join(ROOT, 'dist', 'llms.txt'), llmsTxt);

// ---------- Build marker ----------
fs.writeFileSync(
  path.join(ROOT, 'dist', 'og-build-marker.txt'),
  `og-pages built ${count} .html pages (+${nested.length} extensionless), ${sitemapUrls.length} sitemap urls, llms.txt at ${new Date().toISOString()}\n`
);
console.log(`og-pages: generated ${count} per-route .html files (+${nested.length} extensionless), sitemap.xml (${sitemapUrls.length} urls), llms.txt`);
