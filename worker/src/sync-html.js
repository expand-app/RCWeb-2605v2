// Regenerate sections of index.html from JSON data.
//
// Strategy: each replaceable region in index.html is wrapped in marker comments
// added once during Phase 1 setup (see scripts/add_html_markers.py).
//
//   HTML body markers (inside <body>):     <!-- @data:NAME:start --> ... <!-- @data:NAME:end -->
//   <script> markers (inside <script>):    // @data:NAME:start ... // @data:NAME:end
//
// The Worker NEVER touches HTML outside markers, so any other edits to
// index.html stay intact.

const HTML_START = (n) => `<!-- @data:${n}:start -->`;
const HTML_END = (n) => `<!-- @data:${n}:end -->`;
const JS_START = (n) => `// @data:${n}:start`;
const JS_END = (n) => `// @data:${n}:end`;

function replaceBetween(html, startMarker, endMarker, newBody) {
  const si = html.indexOf(startMarker);
  if (si < 0) throw new Error(`marker not found: ${startMarker}`);
  const ei = html.indexOf(endMarker, si + startMarker.length);
  if (ei < 0) throw new Error(`closing marker not found: ${endMarker}`);
  return (
    html.slice(0, si + startMarker.length) +
    "\n" +
    newBody +
    "\n" +
    html.slice(ei).replace(/^[ \t]*/, "")  // dedent the end marker we kept
  );
}

// --- HTML helpers ---

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ============================================================
// 1) Cases
// ============================================================

// Mirror of original `<div class="case-card">` structure (see index.html ~17690).
function renderCaseCard(c) {
  const dirShort = (c.dir || "").split(" / ")[0];
  const quoteHtml =
    c.has_narrative && c.quote
      ? `<div class="cc-quote">${esc(c.quote)}</div>`
      : `<div class="cc-quote cc-quote-soft">档案 <span class="cc-archive-id">#${esc(c.display_id)}</span> · Offer letter 留档 · 完整辅导记录可在 1v1 咨询中分享。</div>`;
  return `      <div class="case-card" data-dir="${esc(c.dir_key)}" data-case="${esc(c.id)}">
        <div class="cc-head">
          <span class="cc-tag"><span class="dot"></span>${esc(c.dir)}</span>
        </div>
        <div class="cc-student">
          <div class="cc-avatar">${esc(c.avatar)}</div>
          <div>
            <div class="cc-name">${esc(c.name_label)}</div>
            <div class="cc-school">${esc(c.school)} · <em>${esc(c.major)}</em></div>
          </div>
        </div>
        <div class="cc-offer">
          <div class="cc-arrow">→</div>
          <div class="cc-offer-body">
            <div class="cc-company">${esc(c.company)}</div>
            <div class="cc-role">${esc(c.role)}</div>
          </div>
        </div>
        <div class="cc-metrics">
          <div class="cc-metric"><div class="lbl">方向</div><div class="val">${esc(dirShort)}</div></div>
          <div class="cc-metric"><div class="lbl">学位</div><div class="val">${esc(c.degree)}</div></div>
        </div>
        ${quoteHtml}
        <div class="cc-foot">
          <span class="more" data-case-open="${esc(c.id)}">VIEW FULL CASE</span>
        </div>
      </div>`;
}

export function syncCases(html, cases) {
  // 1. CASES_DATA single-line dict inside <script>
  const dataMap = {};
  for (const c of cases) {
    const { id, name_label, quote, ...rest } = c;
    dataMap[id] = rest;
  }
  let out = replaceBetween(
    html,
    JS_START("cases-data"),
    JS_END("cases-data"),
    `  const CASES_DATA = ${JSON.stringify(dataMap)};`,
  );

  // 2. case-card list in HTML
  const cardsHtml = cases.map(renderCaseCard).join("\n");
  out = replaceBetween(
    out,
    HTML_START("cases-cards"),
    HTML_END("cases-cards"),
    cardsHtml,
  );
  return out;
}

// ============================================================
// 2) Mentors
// ============================================================

function renderMentorCard(m) {
  const klass = m.has_video ? "mentor-card has-video" : "mentor-card";
  const dataVideo = m.has_video && m.video_url
    ? ` data-video="${esc(m.video_url)}"`
    : "";
  const avatarInner = m.has_video
    ? `<img src="${esc(m.avatar_src)}" alt="${esc(m.name)}"><div class="avatar-play">▶</div>`
    : `<img src="${esc(m.avatar_src)}" alt="${esc(m.name)}">`;
  const subBr = m.company_sub ? `<br>${esc(m.company_sub)}` : "";
  const liItems = (m.focus || []).map((t) => `<li>${esc(t)}</li>`).join("");
  return `      <div class="${klass}"${dataVideo}>
        <div class="avatar">${avatarInner}</div>
        <div class="name">${esc(m.name)}<span class="role">/ ${esc(m.role_title)}</span></div>
        <div class="company">${esc(m.company)}${subBr}</div>
        <div class="focus-label">— Focus</div>
        <ul class="focus-list">${liItems}</ul>
      </div>`;
}

export function syncMentors(html, mentors) {
  const cards = mentors.map(renderMentorCard).join("\n");
  return replaceBetween(
    html,
    HTML_START("mentor-cards"),
    HTML_END("mentor-cards"),
    cards,
  );
}

// ============================================================
// 3) Replays (JSON-shaped → JS array literal via JSON.stringify)
// ============================================================

export function syncReplays(html, replays) {
  const literal = `  const REPLAYS = ${JSON.stringify(replays, null, 2)};`;
  return replaceBetween(
    html,
    JS_START("replays"),
    JS_END("replays"),
    literal,
  );
}

// ============================================================
// 4) Articles (use mkImg(type, alt) helper for image field)
// ============================================================
//
// `image` shape in JSON: {type, alt}. Runtime expects {url, alt, credit} from
// mkImg(). To bridge, the index.html has a one-time post-process loop added
// in setup that calls mkImg(a.image.type, a.image.alt) when only {type,alt}
// is present. So plain JSON.stringify here is safe.

export function syncArticles(html, articles) {
  const literal = `  const ARTICLES = ${JSON.stringify(articles, null, 2)};`;
  return replaceBetween(
    html,
    JS_START("articles"),
    JS_END("articles"),
    literal,
  );
}

// ============================================================
// Helper for the Worker: full multi-file commit content
// ============================================================

export function buildCommitFiles(originalHtml, original, updates) {
  // updates: { cases?, mentors?, replays?, articles? }
  const files = [];
  let html = originalHtml;
  if (updates.cases) {
    html = syncCases(html, updates.cases);
    files.push({
      path: "data/cases.json",
      content: JSON.stringify(updates.cases, null, 2) + "\n",
    });
  }
  if (updates.mentors) {
    html = syncMentors(html, updates.mentors);
    files.push({
      path: "data/mentors.json",
      content: JSON.stringify(updates.mentors, null, 2) + "\n",
    });
  }
  if (updates.replays) {
    html = syncReplays(html, updates.replays);
    files.push({
      path: "data/replays.json",
      content: JSON.stringify(updates.replays, null, 2) + "\n",
    });
  }
  if (updates.articles) {
    html = syncArticles(html, updates.articles);
    files.push({
      path: "data/articles.json",
      content: JSON.stringify(updates.articles, null, 2) + "\n",
    });
  }
  if (html !== originalHtml) {
    files.push({ path: "index.html", content: html });
  }
  return files;
}
