/**
 * Pre-render per-route static HTML so social/search crawlers (WeChat, etc.,
 * which do NOT run JS) get the right title / description / og:image when a
 * deep link is shared. The SPA still boots and routes from the URL on load.
 *
 * Source of truth = the routeMeta / BG_ROUTE_META objects inside index.html;
 * we extract them so this never drifts from the runtime router.
 *
 * Reads ./index.html, writes ./dist/<path>.html for each route (served at the
 * clean URL via the CDN host_redirect rewrite /<path> -> /<path>.html).
 */
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// Constants the extracted object literals reference.
const ORIGIN = 'https://rexpandcareer.com';
const DEFAULT_OG = ORIGIN + '/media/team/2024-annual-gala.png';

function extractObject(name){
  const re = new RegExp('const ' + name + ' = (\\{[\\s\\S]*?\\n\\});');
  const m = html.match(re);
  if(!m) throw new Error('Could not extract ' + name + ' from index.html');
  // eslint-disable-next-line no-eval
  return eval('(' + m[1] + ')');
}

const routeMeta = extractObject('routeMeta');
const BG_DIR_BY_SLUG = extractObject('BG_DIR_BY_SLUG');
const BG_ROUTE_META = extractObject('BG_ROUTE_META');

function esc(s){
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Replace the value of a head element identified by id (content= or href=),
// or the text of the <title>.
function applyHead(src, { title, desc, url, og, ogw, ogh }){
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
  return out;
}

// Build the list of pages to pre-render (skip home — root index.html already
// carries the home meta — and the replay/article hash sub-views).
const pages = [];
for(const key of ['offer', 'cases', 'background', 'resources', 'about', 'privacy', 'user-terms', 'mentor-terms']){
  const m = routeMeta[key];
  if(!m) continue;
  pages.push({ path: m.path, title: m.title, desc: m.desc, og: m.og, ogw: m.ogw, ogh: m.ogh });
}
// Background per-direction sub-pages: prefer per-direction og/dimensions, fall
// back to the /background parent's og.
const bgParent = routeMeta.background;
for(const slug in BG_DIR_BY_SLUG){
  const dir = BG_DIR_BY_SLUG[slug];
  const bgm = BG_ROUTE_META[dir];
  if(!bgm) continue;
  pages.push({
    path: '/background/' + slug,
    title: bgm.title, desc: bgm.desc,
    og: bgm.og || bgParent.og,
    ogw: bgm.ogw || bgParent.ogw,
    ogh: bgm.ogh || bgParent.ogh
  });
}

// Write each page as a real ".html" object at the clean path (e.g.
// dist/offer.html, dist/background/quant.html, dist/legal/privacy.html). The
// CDN's host_redirect rule rewrites the extensionless single-segment clean URL
// (/offer) to its .html (/offer.html), which OSS serves reliably.
//
// DCDN's host_redirect on this account cannot match multi-segment paths, so
// nested clean URLs (/background/quant, /legal/privacy) are ALSO emitted as
// extensionless flat-staged copies in dist-nested/. The deploy uploads them
// with Content-Type: text/html so OSS serves them directly via CNAME website
// hosting when SupportSubDir=false. Flat staging ("a/b" -> "a__b") is needed
// because a local FS can't hold both a file "background" and a dir "background/".
let count = 0;
const nested = [];
for(const pg of pages){
  const key = pg.path.replace(/^\//, '');               // e.g. background/quant
  const rendered = applyHead(html, { title: pg.title, desc: pg.desc, url: ORIGIN + pg.path, og: pg.og, ogw: pg.ogw, ogh: pg.ogh });
  const outPath = path.join(ROOT, 'dist', key + '.html'); // dist/background/quant.html
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, rendered);
  if(key.includes('/')){
    const flat = key.replace(/\//g, '__');
    fs.mkdirSync(path.join(ROOT, 'dist-nested'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'dist-nested', flat), rendered);
    nested.push(`${flat}\t${key}`);
  }
  count++;
  console.log('  wrote', key + '.html' + (key.includes('/') ? ' (+ extensionless)' : ''), '← og:', pg.og.replace(ORIGIN, ''));
}
if(nested.length){
  fs.writeFileSync(path.join(ROOT, 'dist-nested', 'manifest.txt'), nested.join('\n') + '\n');
}
// Top-level build marker so the deploy result can be verified from the live
// site (curl /og-build-marker.txt) without access to CI logs.
fs.writeFileSync(path.join(ROOT, 'dist', 'og-build-marker.txt'), `og-pages built ${count} .html pages (+${nested.length} extensionless) at ${new Date().toISOString()}\n`);
console.log(`og-pages: generated ${count} per-route .html files in dist/ (+${nested.length} extensionless in dist-nested/).`);
