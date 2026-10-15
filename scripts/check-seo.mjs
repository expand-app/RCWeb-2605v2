// Run after node scripts/og-pages.mjs. No network or extra dependencies.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = fs.readFileSync('index.html', 'utf8');
const articles = JSON.parse(fs.readFileSync('data/articles.json', 'utf8'));
const sitemap = fs.readFileSync('dist/sitemap.xml', 'utf8');
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
assert.equal(urls.length, new Set(urls).size, 'Duplicate sitemap URLs');
for(const url of urls){
  const pathname = new URL(url).pathname;
  const file = pathname === '/' ? 'dist/index.html' : 'dist' + pathname + '.html';
  const html = fs.readFileSync(file, 'utf8');
  const canonical = html.match(/id="meta-canonical"[^>]*href="([^"]+)"/)[1];
  assert.equal(canonical, url, 'Static canonical: ' + pathname);
  for(const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)){
    if(m[1].trim()) JSON.parse(m[1]);
  }
}
for(const a of articles){
  const html = fs.readFileSync('dist/a-' + a.slug + '.html', 'utf8');
  assert.ok(html.includes('<main class="page active" id="page-article">'), a.slug);
  assert.ok(html.includes('<div class="art-body" id="artBody">' + a.body), 'Article body changed: ' + a.slug);
  assert.ok(sitemap.includes('/a-' + a.slug + '</loc>'), 'Article missing from sitemap: ' + a.slug);
}
for(const [route,id] of [['index','home'],['offer','offer'],['about','about'],['resources','resources']]){
  assert.ok(fs.readFileSync('dist/' + route + '.html','utf8').includes(`<main class="page active" id="page-${id}">`));
}
const directory=fs.readFileSync('dist/llms.txt','utf8');
assert.doesNotMatch(directory, /money-back|pay only|保\s*offer|in North America/i);
assert.doesNotMatch(source, /class="hero-stats-strip"/);
assert.ok(source.includes('ssar-title-brand">SAR</span>'));
assert.ok(source.includes('40 节'), 'Keep actual package configuration');
for(const copy of ['保证岗位发布后 24 小时内投递', '拿面试，还要靠内推', 'AI 内推服务，24×7 帮你争取组内内推', '面试准备不足']) assert.ok(source.includes(copy), 'Missing approved copy: ' + copy);
for(const pageId of ['home','about']){
  const start=source.indexOf(`id="page-${pageId}"`);
  const main=source.slice(start,source.indexOf('</main>',start));
  assert.doesNotMatch(main, /40\s*次\s*1v1|钻石计划含\s*40/);
}
assert.ok(fs.readFileSync('robots.txt','utf8').includes('User-agent: OAI-SearchBot'));
console.log(`SEO checks passed: ${urls.length} URLs; ${articles.length} unchanged article bodies; JSON-LD, canonical, service copy and package guards.`);
