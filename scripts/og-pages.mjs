/**
 * Pre-render per-route static HTML so social/search crawlers (WeChat, etc.,
 * which do NOT run JS) get the right title / description / og:image when a
 * deep link is shared. The SPA still boots and routes from the URL on load.
 *
 * Source of truth = the routeMeta / BG_ROUTE_META objects inside index.html;
 * we extract them so this never drifts from the runtime router.
 *
 * Reads ./index.html, writes ./dist/<path>/index.html for each route.
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
function applyHead(src, { title, desc, url, og }){
  let out = src;
  const canonical = url;
  out = out.replace(/(<title id="meta-title">)[^<]*(<\/title>)/, `$1${esc(title)}$2`);
  const setAttr = (id, attr, val) => {
    const re = new RegExp(`(<[^>]*id="${id}"[^>]*${attr}=")[^"]*(")`);
    out = out.replace(re, `$1${esc(val)}$2`);
  };
  setAttr('meta-description', 'content', desc);
  setAttr('meta-canonical', 'href', canonical);
  setAttr('og-title', 'content', title);
  setAttr('og-description', 'content', desc);
  setAttr('og-url', 'content', canonical);
  setAttr('og-image', 'content', og);
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
  pages.push({ path: m.path, title: m.title, desc: m.desc, og: m.og });
}
// Background per-direction sub-pages share background's og image.
const bgOg = routeMeta.background.og;
for(const slug in BG_DIR_BY_SLUG){
  const dir = BG_DIR_BY_SLUG[slug];
  const bgm = BG_ROUTE_META[dir];
  if(!bgm) continue;
  pages.push({ path: '/background/' + slug, title: bgm.title, desc: bgm.desc, og: bgOg });
}

// Write each page as an EXTENSIONLESS object whose key exactly matches the
// clean URL (e.g. key "offer" for /offer, "background/quant" for
// /background/quant). OSS serves such objects directly via the bound CNAME —
// the same way it serves /robots.txt or /media/*. A subdir object literally
// named index.html (e.g. offer/index.html) is instead intercepted by the
// IndexDocument/SupportSubDir logic and shadowed by the root index.html, so we
// must NOT use that form. Unknown paths still fall back to root index.html via
// the bucket's ErrorDocument, so client-side SPA routing keeps working.
//
// We stage files FLAT (key "background/quant" -> file "background__quant")
// because a local filesystem cannot hold both a file "background" and a dir
// "background/" at once, whereas OSS's flat namespace can. The deploy reads
// manifest.txt and uploads each to its real key with Content-Type: text/html.
const outDir = path.join(ROOT, 'dist-pages');
fs.mkdirSync(outDir, { recursive: true });
let count = 0;
const manifest = [];
for(const pg of pages){
  const key = pg.path.replace(/^\//, '');          // e.g. background/quant
  const file = key.replace(/\//g, '__');           // e.g. background__quant
  const rendered = applyHead(html, { title: pg.title, desc: pg.desc, url: ORIGIN + pg.path, og: pg.og });
  fs.writeFileSync(path.join(outDir, file), rendered);
  manifest.push(`${file}\t${key}`);
  count++;
  console.log('  wrote', file, '->', key, '← og:', pg.og.replace(ORIGIN, ''));
}
fs.writeFileSync(path.join(outDir, 'manifest.txt'), manifest.join('\n') + '\n');
// Top-level build marker so the deploy result can be verified from the live
// site (curl /og-build-marker.txt) without access to CI logs.
fs.writeFileSync(path.join(ROOT, 'dist', 'og-build-marker.txt'), `og-pages built ${count} clean-path files at ${new Date().toISOString()}\n`);
console.log(`og-pages: generated ${count} clean-path HTML files + manifest in dist-pages/.`);
