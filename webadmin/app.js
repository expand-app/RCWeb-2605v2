// Rexpand webadmin SPA — vanilla JS, talks to the Cloudflare Worker.
//
// State lives in memory plus a `token` + `apiBase` snapshot in localStorage.
// All data mutations are local until the user clicks "保存到生产". Then we
// POST the entire (cases | mentors | replays | articles) array — whichever
// the current view edits — to /api/save, which writes both the JSON file and
// the matching segment of index.html in one Git commit.

const State = {
  token: localStorage.getItem("token") || null,
  apiBase: localStorage.getItem("apiBase") || "https://admin-api.rexpandcareer.com",
  data: null, // { cases, mentors, replays, articles }
  baseline: null, // server snapshot for dirty-check
  view: "dash",
  editing: null, // record being edited, or 'new'
  loading: false,
};

// ====================================================================
// DOM helpers
// ====================================================================
function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "style") n.style.cssText = v;
    else if (k === "html") n.innerHTML = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2).toLowerCase(), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    n.appendChild(typeof c === "string" || typeof c === "number"
      ? document.createTextNode(String(c)) : c);
  }
  return n;
}
const $ = (sel) => document.querySelector(sel);

function toast(msg, kind = "") {
  let host = $("#toast");
  if (!host) { host = el("div", { id: "toast" }); document.body.appendChild(host); }
  const t = el("div", { class: `toast ${kind}` }, msg);
  host.appendChild(t);
  setTimeout(() => t.remove(), kind === "err" ? 6000 : 3500);
}

// ====================================================================
// API
// ====================================================================
const api = {
  async fetch(path, opts = {}) {
    const r = await fetch(State.apiBase + path, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        ...(State.token ? { Authorization: `Bearer ${State.token}` } : {}),
        ...(opts.headers || {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (r.status === 401 && State.token) { logout(); throw new Error("登录已过期"); }
    if (!r.ok) {
      const j = await r.json().catch(() => ({ error: r.statusText }));
      throw new Error(j.error || `HTTP ${r.status}`);
    }
    return r.json();
  },
  login(password) { return this.fetch("/api/login", { method: "POST", body: { password } }); },
  state() { return this.fetch("/api/state"); },
  save(updates, message) { return this.fetch("/api/save", { method: "POST", body: { ...updates, message } }); },
  uploadUrl(prefix, filename, contentType) {
    return this.fetch("/api/upload-url", { method: "POST", body: { prefix, filename, contentType } });
  },
  puebulo(input) { return this.fetch("/api/puebulo", { method: "POST", body: { input } }); },
};

// ====================================================================
// Dirty tracking
// ====================================================================
function isDirty(view) {
  if (!State.baseline || !State.data) return false;
  return JSON.stringify(State.data[view]) !== JSON.stringify(State.baseline[view]);
}
function viewKeys() { return ["cases", "mentors", "replays", "articles"]; }
function anyDirty() { return viewKeys().some(isDirty); }
function dirtyList() { return viewKeys().filter(isDirty); }

// ====================================================================
// Render
// ====================================================================
function render() {
  const app = document.getElementById("app");
  app.innerHTML = "";
  if (!State.token) return app.appendChild(renderLogin());
  if (!State.data) return app.appendChild(el("div", { class: "boot" }, "加载数据…"));
  app.appendChild(renderShell());
}

function renderLogin() {
  return el("div", { class: "login" },
    el("div", { class: "login-card" },
      el("div", { class: "login-brand" },
        // Hidden API switch: triple-click the brand to reopen the API-base prompt.
        // Default deployed UI hides it; only needed if you re-bind admin-api domain.
        el("h1", {
          ondblclick: () => {
            const v = prompt("API base URL", State.apiBase);
            if (v) { State.apiBase = v; localStorage.setItem("apiBase", v); render(); }
          },
        }, "Rexpand 站点后台"),
        el("p", { class: "sub" }, "登录后可编辑案例、导师、面试回放,删除资讯文章。"),
      ),
      el("form", {
        onsubmit: async (e) => {
          e.preventDefault();
          const pw = e.target.password.value;
          const errEl = $(".login-card .err");
          if (errEl) errEl.remove();
          try {
            const r = await api.login(pw);
            State.token = r.token;
            localStorage.setItem("token", r.token);
            await reloadState();
            State.view = "dash";
            render();
          } catch (err) {
            e.target.appendChild(el("div", { class: "err" }, err.message));
          }
        },
      },
        el("label", {}, "密码"),
        el("input", { type: "password", name: "password", required: true, autofocus: true }),
        el("button", { type: "submit" }, "登录"),
      ),
    ),
  );
}

function renderShell() {
  return el("div", { class: "shell" },
    renderSidebar(),
    el("main", { class: "main" }, renderView()),
  );
}

function renderSidebar() {
  const tab = (key, label, count) =>
    el("a", {
      class: State.view === key ? "active" : "",
      onclick: () => { State.view = key; State.editing = null; render(); },
    },
      el("span", {}, label),
      el("span", { class: "count" }, count),
    );
  const dirtyTabs = dirtyList();
  return el("aside", { class: "side" },
    el("div", { class: "brand" }, "Rexpand Admin"),
    el("nav", { class: "nav" },
      tab("dash", "Dashboard", "·"),
      tab("cases", "案例" + (dirtyTabs.includes("cases") ? " *" : ""), State.data.cases.length),
      tab("mentors", "导师" + (dirtyTabs.includes("mentors") ? " *" : ""), State.data.mentors.length),
      tab("replays", "面试回放" + (dirtyTabs.includes("replays") ? " *" : ""), State.data.replays.length),
      tab("articles", "资讯" + (dirtyTabs.includes("articles") ? " *" : ""), State.data.articles.length),
    ),
    el("div", { class: "foot" },
      el("button", { onclick: logout }, "退出登录"),
    ),
  );
}

function renderView() {
  switch (State.view) {
    case "dash": return renderDash();
    case "cases": return renderCases();
    case "mentors": return renderMentors();
    case "replays": return renderReplays();
    case "articles": return renderArticles();
  }
  return el("div", {}, "未知视图");
}

// ====================================================================
// Dashboard
// ====================================================================
function renderDash() {
  const tile = (key, label, count, meta) =>
    el("div", { class: "tile", onclick: () => { State.view = key; render(); } },
      el("div", { class: "label" }, label),
      el("div", { class: "num" }, count),
      el("div", { class: "meta" }, meta),
    );
  return el("div", {},
    el("div", { class: "toolbar" },
      el("h2", {}, "Dashboard"),
      el("div", { class: "right" }, anyDirty() ? el("span", { class: "dirty-flag" }, `未保存:${dirtyList().join(" / ")}`) : null),
    ),
    el("div", { class: "dash-tiles" },
      tile("cases", "学员案例", State.data.cases.length, `${State.data.cases.filter(c => c.has_narrative).length} 条 featured`),
      tile("mentors", "导师", State.data.mentors.length, `${State.data.mentors.filter(m => m.has_video).length} 位有视频`),
      tile("replays", "面试回放", State.data.replays.length, "完整评分 + 题目时间戳"),
      tile("articles", "求职情报", State.data.articles.length, "仅支持删除"),
    ),
    el("div", { class: "dash-hint" },
      el("p", {}, "改动保存后,会自动提交到 GitHub `main` 分支,触发现有部署流。"),
      el("p", {}, "线上更新窗口:通常 2-3 分钟(取决于 GitHub Actions 队列)。"),
    ),
  );
}

// ====================================================================
// Generic table view
// ====================================================================
function renderTable({ title, rows, cols, onNew, onEdit, onDelete, viewKey }) {
  const dirtyHere = isDirty(viewKey);
  return el("div", {},
    el("div", { class: "toolbar" },
      el("h2", {}, title, el("span", { class: "count" }, `(${rows.length} 条)`)),
      el("div", { class: "right" },
        dirtyHere ? el("span", { class: "dirty-flag" }, "● 未保存") : null,
        onNew ? el("button", { class: "ghost", onclick: onNew }, "+ 新增") : null,
        el("button", { onclick: saveCurrentView, disabled: !dirtyHere }, "保存到生产"),
      ),
    ),
    rows.length === 0
      ? el("div", { class: "tbl" }, el("div", { class: "empty" }, "暂无数据"))
      : el("div", { class: "tbl" }, el("table", {},
        el("thead", {}, el("tr", {}, cols.map((c) => el("th", { style: c.width ? `width:${c.width}` : "" }, c.label)), el("th", { style: "width:140px;text-align:right" }, ""))),
        el("tbody", {}, rows.map((r, i) =>
          el("tr", {},
            cols.map((c) => el("td", {}, c.render(r, i))),
            el("td", { class: "row-actions" },
              onEdit ? el("button", { class: "ghost", onclick: () => onEdit(r, i) }, "编辑") : null,
              onDelete ? el("button", { class: "ghost", onclick: () => onDelete(r, i) }, "删除") : null,
            ),
          ),
        )),
      )),
    State.editing != null ? renderModal() : null,
  );
}

function renderModal() {
  if (State.editing == null) return null;
  try {
    switch (State.view) {
      case "cases": return caseModal(State.editing);
      case "mentors": return mentorModal(State.editing);
      case "replays": return replayModal(State.editing);
    }
  } catch (e) {
    console.error("Modal render error:", e, "editing record:", State.editing);
    toast(`打开编辑器出错: ${e.message}`, "err");
    State.editing = null;
  }
  return null;
}

// ====================================================================
// Save / Discard
// ====================================================================
async function saveCurrentView() {
  const k = State.view;
  if (!isDirty(k)) return;
  if (!confirm(`确认把 ${k} 的改动提交到 main 分支并触发部署?`)) return;
  try {
    const r = await api.save({ [k]: State.data[k] });
    toast(`已提交 commit ${r.commit?.slice(0, 7)}; ${r.files?.length || 0} 个文件 ✓`, "ok");
    State.baseline = JSON.parse(JSON.stringify(State.data));
    render();
  } catch (e) {
    toast("保存失败:" + e.message, "err");
  }
}

async function reloadState() {
  State.loading = true; render();
  State.data = await api.state();
  State.baseline = JSON.parse(JSON.stringify(State.data));
  State.loading = false;
}

function logout() {
  localStorage.removeItem("token");
  State.token = null; State.data = null; State.baseline = null;
  State.view = "login"; State.editing = null;
  render();
}

// ====================================================================
// Cases
// ====================================================================
function renderCases() {
  return renderTable({
    title: "学员案例",
    viewKey: "cases",
    rows: State.data.cases,
    cols: [
      { label: "ID", width: "80px", render: (c) => c.id },
      { label: "姓名", width: "90px", render: (c) => c.name_label },
      { label: "学校 / 专业", render: (c) => `${c.school} · ${c.major}` },
      { label: "方向", width: "120px", render: (c) => c.dir },
      { label: "去向", render: (c) => `${c.company} — ${c.role}` },
      { label: "Featured", width: "70px", render: (c) => c.has_narrative ? el("span", { class: "pill pill-narrative" }, "✓") : "" },
    ],
    onNew: () => { State.editing = makeBlankCase(); render(); },
    onEdit: (c) => { State.editing = JSON.parse(JSON.stringify(c)); render(); },
    onDelete: (c, i) => {
      if (confirm(`删除案例 ${c.id} (${c.name_label})?`)) {
        State.data.cases.splice(i, 1); render();
      }
    },
  });
}

function makeBlankCase() {
  return {
    __new: true,
    id: "", display_id: "", avatar: "", name_label: "",
    school: "", major: "", dir: "", dir_key: "data",
    company: "", role: "", degree: "硕士",
    quote: "", reason: "", focus: "",
    has_narrative: false,
  };
}

function caseModal(c) {
  const set = (k, v) => { c[k] = v; };
  const close = () => { State.editing = null; render(); };
  const ok = () => {
    if (!c.id) return toast("ID 必填", "err");
    const idx = State.data.cases.findIndex((x) => x.id === c.id);
    if (c.__new) {
      if (idx >= 0) return toast(`ID ${c.id} 已存在`, "err");
      delete c.__new; State.data.cases.unshift(c);
    } else {
      if (idx < 0) return toast("找不到原记录", "err");
      State.data.cases[idx] = c;
    }
    State.editing = null; render();
  };
  return el("div", { class: "modal-back", onclick: (e) => { if (e.target.classList.contains("modal-back")) close(); } },
    el("div", { class: "modal" },
      el("div", { class: "modal-hd" },
        el("h3", {}, c.__new ? "新增案例" : `编辑案例 ${c.id}`),
        el("button", { class: "close", onclick: close }, "×"),
      ),
      el("div", { class: "modal-bd" },
        el("div", { class: "row3" },
          field("ID(内部档案号)", input(c, "id", { disabled: !c.__new })),
          field("Display ID(展示给学员)", input(c, "display_id")),
          field("Avatar(单字母)", input(c, "avatar", { maxlength: 2 })),
        ),
        el("div", { class: "row2" },
          field("Name label(展示)", input(c, "name_label", { placeholder: "F 同学" })),
          field("Degree", select(c, "degree", ["学士", "硕士", "博士", "MBA"])),
        ),
        el("div", { class: "row2" },
          field("School", input(c, "school")),
          field("Major", input(c, "major")),
        ),
        el("div", { class: "row3" },
          field("方向(展示)", input(c, "dir", { placeholder: "Data / 风控" })),
          field("方向 key(过滤器用)", select(c, "dir_key", ["data", "finance", "quant", "sde"])),
          field("Company", input(c, "company")),
        ),
        field("Role", input(c, "role")),
        el("div", { class: "section-divider" }, "Modal 展示"),
        el("div", {},
          el("label", {},
            el("input", { type: "checkbox", checked: c.has_narrative, onchange: (e) => set("has_narrative", e.target.checked), style: "width:auto;margin-right:6px;vertical-align:middle" }),
            " has_narrative (勾选后在详情 modal 显示 reason / focus,卡片显示真实 quote;否则显示 \"档案 #XXX · 留档\" 占位)",
          ),
        ),
        field("Quote(卡片上的引述)", textarea(c, "quote", { rows: 3 })),
        field("Reason(modal 列出的求职痛点)", textarea(c, "reason", { rows: 4 })),
        field("Focus(modal 列出的辅导动作)", textarea(c, "focus", { rows: 4 })),
      ),
      el("div", { class: "modal-ft" },
        el("button", { class: "ghost", onclick: close }, "取消"),
        el("button", { onclick: ok }, "确认"),
      ),
    ),
  );
}

// ====================================================================
// Mentors
// ====================================================================
function renderMentors() {
  return renderTable({
    title: "导师",
    viewKey: "mentors",
    rows: State.data.mentors,
    cols: [
      { label: "姓名", width: "120px", render: (m) => m.name },
      { label: "Title", width: "140px", render: (m) => m.role_title },
      { label: "公司 / 描述", render: (m) => `${m.company}${m.company_sub ? " · " + m.company_sub : ""}` },
      { label: "Focus 标签", render: (m) => (m.focus || []).join(" · ") },
      { label: "视频", width: "60px", render: (m) => m.has_video ? el("span", { class: "pill pill-video" }, "🎥") : "" },
    ],
    onNew: () => { State.editing = makeBlankMentor(); render(); },
    onEdit: (m) => { State.editing = JSON.parse(JSON.stringify(m)); render(); },
    onDelete: (m, i) => {
      if (confirm(`删除导师 ${m.name}?`)) { State.data.mentors.splice(i, 1); render(); }
    },
  });
}

function makeBlankMentor() {
  return {
    __new: true, __idx: State.data.mentors.length,
    name: "", role_title: "", avatar_src: "",
    company: "", company_sub: "",
    focus: [], video_url: null, has_video: false,
  };
}

function mentorModal(m) {
  const close = () => { State.editing = null; render(); };
  const ok = () => {
    if (!m.name) return toast("姓名必填", "err");
    m.has_video = !!m.video_url;
    if (m.__new) {
      delete m.__new; delete m.__idx; State.data.mentors.push(m);
    } else {
      const idx = State.data.mentors.findIndex((x) => x.name === m.name);
      if (idx < 0) return toast("找不到原记录", "err");
      State.data.mentors[idx] = m;
    }
    State.editing = null; render();
  };
  return el("div", { class: "modal-back", onclick: (e) => { if (e.target.classList.contains("modal-back")) close(); } },
    el("div", { class: "modal" },
      el("div", { class: "modal-hd" },
        el("h3", {}, m.__new ? "新增导师" : `编辑导师 ${m.name}`),
        el("button", { class: "close", onclick: close }, "×"),
      ),
      el("div", { class: "modal-bd" },
        el("div", { class: "row2" },
          field("姓名(英文,会用作 key)", input(m, "name", { disabled: !m.__new })),
          field("Title", input(m, "role_title", { placeholder: "VP / Sr. SDE / ..." })),
        ),
        el("div", { class: "row2" },
          field("Company", input(m, "company")),
          field("Company sub(第二行)", input(m, "company_sub", { placeholder: "Senior Manager · VP" })),
        ),
        el("div", { class: "section-divider" }, "头像(上传 PNG/JPG)"),
        uploadWidget("image", "avatars", m, "avatar_src"),
        el("div", { class: "section-divider" }, "Focus 标签(回车添加,× 删除)"),
        chipEditor(m, "focus"),
        el("div", { class: "section-divider" }, "视频(可选,上传 MP4)"),
        uploadWidget("video", "videos/mentors", m, "video_url"),
      ),
      el("div", { class: "modal-ft" },
        el("button", { class: "ghost", onclick: close }, "取消"),
        el("button", { onclick: ok }, "确认"),
      ),
    ),
  );
}

// ====================================================================
// Replays
// ====================================================================
function renderReplays() {
  return renderTable({
    title: "面试回放",
    viewKey: "replays",
    rows: State.data.replays,
    cols: [
      { label: "日期", width: "100px", render: (r) => r.date },
      { label: "公司", width: "140px", render: (r) => r.company },
      { label: "Role", render: (r) => r.role },
      { label: "时长", width: "70px", render: (r) => r.duration },
      { label: "评分", width: "60px", render: (r) => (r.score && r.score.overall) ?? "" },
      { label: "题数", width: "60px", render: (r) => (r.questions || []).length },
    ],
    onNew: () => { State.editing = makeBlankReplay(); render(); },
    onEdit: (r) => { State.editing = JSON.parse(JSON.stringify(r)); render(); },
    onDelete: (r, i) => {
      if (confirm(`删除回放 ${r.slug}?`)) { State.data.replays.splice(i, 1); render(); }
    },
  });
}

function makeBlankReplay() {
  return {
    __new: true,
    slug: "", date: "", duration: "", company: "", location: "", role: "", logo: "",
    seoTitle: "", dek: "", tags: [], videoSrc: "",
    score: null, summary: "", mainIssue: "", alsoNoting: "",
    questions: [],
  };
}

function replayModal(r) {
  const close = () => { State.editing = null; render(); };
  const ok = () => {
    if (!r.slug) return toast("slug 必填", "err");
    if (!r.videoSrc) return toast("视频未上传", "err");
    const idx = State.data.replays.findIndex((x) => x.slug === r.slug);
    if (r.__new) {
      if (idx >= 0) return toast(`slug ${r.slug} 已存在`, "err");
      delete r.__new; delete r.__advanced; State.data.replays.unshift(r);
    } else {
      if (idx < 0) return toast("找不到原记录", "err");
      State.data.replays[idx] = r;
    }
    State.editing = null; render();
  };
  const body = r.__new
    ? replayCreateBody(r)
    : replayFullEditorBody(r);
  return el("div", {
    class: "modal-back",
    onclick: (e) => { if (e.target.classList.contains("modal-back")) close(); },
  },
    el("div", { class: "modal", style: "max-width:880px" },
      el("div", { class: "modal-hd" },
        el("h3", {}, r.__new ? "新增面试回放" : `编辑回放 ${r.slug || "(空)"}`),
        el("button", { class: "close", onclick: close }, "×"),
      ),
      el("div", { class: "modal-bd" }, body),
      el("div", { class: "modal-ft" },
        el("button", { class: "ghost", onclick: close }, "取消"),
        el("button", { onclick: ok }, "确认"),
      ),
    ),
  );
}

// ----- New-replay flow: video + Pueblo only -----
function replayCreateBody(r) {
  const parts = [
    el("div", { class: "section-divider" }, "① 视频文件(MP4)"),
    uploadWidget("video", "videos/replays", r, "videoSrc"),
    el("div", { class: "section-divider" }, "② Pueblo Share 链接"),
    puebloImporter(r),
  ];
  if (r.slug) {
    parts.push(replayImportSummary(r));
  }
  // Optional advanced editor toggle — if user wants to tweak the auto-filled
  // text fields, they expand it.
  parts.push(
    el("div", { class: "section-divider", style: "margin-top:24px" },
      el("a", { href: "#",
        onclick: (e) => { e.preventDefault(); r.__advanced = !r.__advanced; renderModalOnly(); },
      }, r.__advanced ? "▼ 收起详细字段" : "▶ 展开详细字段(可选,微调文本)"),
    ),
  );
  if (r.__advanced) {
    parts.push(replayFullEditorBody(r, { skipVideo: true, skipImport: true }));
  }
  return parts;
}

// ----- Edit flow: full editor (also used in "advanced" panel of create) -----
function replayFullEditorBody(r, opts = {}) {
  return [
    !opts.skipVideo && el("div", { class: "section-divider" }, "视频(MP4)"),
    !opts.skipVideo && uploadWidget("video", "videos/replays", r, "videoSrc"),
    el("div", { class: "section-divider" }, "基础信息"),
    el("div", { class: "row2" },
      field("Slug(URL 用)", input(r, "slug", { placeholder: "company-role-yyyy-mm-dd" })),
      field("日期(2026.05.31)", input(r, "date")),
    ),
    el("div", { class: "row3" },
      field("Company", input(r, "company")),
      field("Location", input(r, "location")),
      field("Logo(1-2 字符)", input(r, "logo", { maxlength: 3 })),
    ),
    el("div", { class: "row2" },
      field("Role", input(r, "role")),
      field("Duration", input(r, "duration", { placeholder: "MM:SS / HH:MM:SS" })),
    ),
    field("SEO Title", input(r, "seoTitle")),
    field("Dek(摘要)", textarea(r, "dek", { rows: 3 })),
    el("div", { class: "section-divider" }, "标签"),
    chipEditor(r, "tags"),
    el("div", { class: "section-divider" }, "评分 JSON"),
    jsonEditor(r, "score", "Pueblo 导入会自动填这里;留 null 则不显示评分块"),
    el("div", { class: "section-divider" }, "正文叙述"),
    field("Summary(开头一段总评)", textarea(r, "summary", { rows: 4 })),
    el("div", { class: "section-divider" }, "Main Issue(可选,最大问题的标题 + 详细说明)"),
    mainIssueEditor(r),
    el("div", { class: "section-divider" }, "Also Worth Noting(可选,补充观察的列表)"),
    bulletListEditor(r, "alsoNoting"),
    el("div", { class: "section-divider" }, "题目列表(t = 秒)"),
    questionsEditor(r),
  ].filter(Boolean);
}

// Pueblo import — paste link, click import, auto-fills the draft.
function puebloImporter(r) {
  const inputEl = el("input", {
    type: "text",
    placeholder: "https://puebulo.com/share/<token>",
    value: r.__puebulo_input || "",
    onchange: (e) => { r.__puebulo_input = e.target.value; },
  });
  const status = el("div", { class: "upload-status" });
  return el("div", {},
    el("div", { class: "upload-row" }, inputEl,
      el("button", { onclick: async () => {
        const v = (inputEl.value || r.__puebulo_input || "").trim();
        if (!v) return toast("请粘贴 Pueblo share 链接", "err");
        status.textContent = "拉取中…";
        try {
          const result = await api.puebulo(v);
          status.textContent = "✓ 导入成功";
          // Merge — preserve videoSrc the user already uploaded.
          const { videoSrc: _ignore, ...rest } = result.draft;
          Object.assign(r, rest);
          r.__puebulo_input = v;
          renderModalOnly();
        } catch (e) {
          status.textContent = "✗ " + e.message;
        }
      } }, "导入"),
    ), status,
  );
}

// Show a one-line summary of what got auto-filled from Pueblo.
function replayImportSummary(r) {
  const dim = (label, val) => el("span", { class: "summary-dim" }, label + ": ", el("b", {}, String(val || "—")));
  return el("div", { class: "import-summary" },
    el("div", { style: "font-weight:600;margin-bottom:6px;" }, "✓ Pueblo 已导入,可直接确认或展开微调"),
    dim("公司", r.company),
    dim("职位", r.role),
    dim("时长", r.duration),
    dim("题数", (r.questions || []).length),
    dim("评分", r.score?.overall ?? "—"),
  );
}

// mainIssue 是 {title, body} 对象 — 拆成两个 input 编辑;按"清空"还原 null。
function mainIssueEditor(r) {
  if (r.mainIssue && typeof r.mainIssue !== "object") r.mainIssue = null;
  const enabled = r.mainIssue != null;
  if (!enabled) {
    return el("div", {},
      el("div", { class: "help" }, "未填写(对应页面区块隐藏)。"),
      el("button", { class: "ghost",
        onclick: () => { r.mainIssue = { title: "", body: "" }; renderModalOnly(); },
      }, "+ 添加 Main Issue"),
    );
  }
  return el("div", {},
    field("Title(短标题)", el("input", {
      type: "text", value: r.mainIssue.title || "",
      onchange: (e) => { r.mainIssue.title = e.target.value; },
    })),
    field("Body(详细说明,可多行 / 用 \\n• 做项目符号)", el("textarea", {
      rows: 8, onchange: (e) => { r.mainIssue.body = e.target.value; },
    }, r.mainIssue.body || "")),
    el("button", { class: "ghost",
      style: "margin-top:6px;color:var(--danger);border-color:var(--danger)",
      onclick: () => { r.mainIssue = null; renderModalOnly(); },
    }, "× 清空 Main Issue"),
  );
}

// alsoNoting 是字符串数组 — 每项一个 textarea + 删除按钮 + 末尾"加一条"。
// 比 chipEditor 更适合中长文本(50-150 字)。
function bulletListEditor(r, key) {
  if (!Array.isArray(r[key])) r[key] = [];
  return el("div", {},
    el("div", { class: "q-list" },
      r[key].map((item, i) =>
        el("div", { class: "q-item", style: "grid-template-columns:1fr auto" },
          el("textarea", {
            rows: 2,
            onchange: (e) => { r[key][i] = e.target.value; },
          }, String(item || "")),
          el("button", {
            onclick: () => { r[key].splice(i, 1); renderModalOnly(); },
          }, "×"),
        ),
      ),
    ),
    el("button", { class: "ghost", style: "margin-top:8px",
      onclick: () => { r[key].push(""); renderModalOnly(); },
    }, "+ 添加一条"),
  );
}

function questionsEditor(r) {
  if (!Array.isArray(r.questions)) r.questions = [];
  return el("div", { class: "q-list" },
    r.questions.map((q, i) =>
      el("div", { class: "q-item" },
        el("input", { type: "number", value: q.t, placeholder: "秒",
          onchange: (e) => { q.t = parseInt(e.target.value, 10) || 0; } }),
        el("div", {},
          el("input", { type: "text", value: q.q, placeholder: "题干",
            onchange: (e) => { q.q = e.target.value; } }),
          el("input", { type: "text", value: q.meta || "", placeholder: "meta(如 Lead · Self-Intro)", style: "margin-top:6px",
            onchange: (e) => { q.meta = e.target.value; } }),
        ),
        el("button", { onclick: () => { r.questions.splice(i, 1); renderModalOnly(); } }, "×"),
      ),
    ),
    el("button", { class: "ghost", onclick: () => { r.questions.push({ t: 0, q: "", meta: "" }); renderModalOnly(); } }, "+ 添加一道"),
  );
}

// Re-renders only the modal (so input focus elsewhere isn't lost)
function renderModalOnly() {
  const back = document.querySelector(".modal-back");
  if (!back) return render();
  const fresh = renderModal();
  if (fresh) { back.replaceWith(fresh); }
}

// ====================================================================
// Articles (delete-only)
// ====================================================================
function renderArticles() {
  return renderTable({
    title: "求职情报",
    viewKey: "articles",
    rows: State.data.articles,
    cols: [
      { label: "日期", width: "100px", render: (a) => a.date },
      { label: "Category", width: "120px", render: (a) => a.category },
      { label: "Slug", render: (a) => el("span", { class: "truncate" }, a.slug) },
      { label: "标题(简)", render: (a) => el("span", { class: "truncate", html: a.title }) },
    ],
    // No new/edit — only delete
    onDelete: (a, i) => {
      if (confirm(`删除文章 "${a.slug}"?`)) { State.data.articles.splice(i, 1); render(); }
    },
  });
}

// ====================================================================
// Reusable form widgets
// ====================================================================
function field(label, control) {
  return el("div", {}, el("label", {}, label), control);
}
function input(obj, key, attrs = {}) {
  return el("input", {
    type: "text", value: obj[key] ?? "",
    onchange: (e) => { obj[key] = e.target.value; },
    ...attrs,
  });
}
function textarea(obj, key, attrs = {}) {
  return el("textarea", {
    onchange: (e) => { obj[key] = e.target.value; },
    ...attrs,
  }, obj[key] ?? "");
}
function select(obj, key, options) {
  const sel = el("select", { onchange: (e) => { obj[key] = e.target.value; } },
    options.map((o) => el("option", { value: o, selected: obj[key] === o }, o)),
  );
  return sel;
}
function chipEditor(obj, key) {
  if (!Array.isArray(obj[key])) obj[key] = [];
  const inp = el("input", {
    type: "text", placeholder: "回车添加",
    onkeydown: (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const v = inp.value.trim();
        if (v && !obj[key].includes(v)) {
          obj[key].push(v); inp.value = ""; renderModalOnly();
        }
      }
    },
  });
  return el("div", { class: "tags" },
    obj[key].map((t, i) =>
      el("span", { class: "chip" }, t,
        el("button", { onclick: () => { obj[key].splice(i, 1); renderModalOnly(); } }, "×"),
      ),
    ),
    inp,
  );
}
function jsonEditor(obj, key, help) {
  const ta = el("textarea", { rows: 8 }, obj[key] != null ? JSON.stringify(obj[key], null, 2) : "");
  ta.onchange = (e) => {
    const v = e.target.value.trim();
    if (!v) { obj[key] = null; return; }
    try { obj[key] = JSON.parse(v); ta.style.borderColor = ""; }
    catch (err) { ta.style.borderColor = "var(--danger)"; toast("JSON 不合法:" + err.message, "err"); }
  };
  return el("div", {}, ta, el("div", { class: "help" }, help));
}
// Upload widget — file picker + upload button. No URL paste field.
// kind:    "video" | "image"
// prefix:  OSS key prefix (e.g., "videos/mentors", "videos/replays", "avatars")
// obj/key: where to store the resulting public URL
// PUT a file with progress callback. fetch() can't report upload progress,
// so we use XMLHttpRequest which fires `progress` events on the upload stream.
function uploadWithProgress(url, file, contentType, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded, e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`OSS PUT ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("network error"));
    xhr.onabort = () => reject(new Error("upload aborted"));
    xhr.send(file);
  });
}

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function uploadWidget(kind, prefix, obj, key) {
  const isImage = kind === "image";
  const accept = isImage
    ? "image/png,image/jpeg,image/webp"
    : "video/mp4,video/quicktime,video/webm";
  const fallbackMime = isImage ? "image/png" : "video/mp4";
  const file = el("input", { type: "file", accept });
  const status = el("div", { class: "upload-status" });
  const bar = el("div", { class: "upload-bar" }, el("div", { class: "upload-bar-fill" }));
  const fill = bar.firstChild;
  bar.style.display = "none";
  const preview = el("div", { class: "upload-preview" });
  const refreshPreview = () => {
    preview.innerHTML = "";
    if (!obj[key]) return;
    if (isImage) {
      preview.appendChild(el("img", { src: obj[key], class: "upload-preview-img", alt: "" }));
    }
    preview.appendChild(
      el("a", { href: obj[key], target: "_blank", class: "upload-preview-link" }, obj[key]),
    );
  };
  refreshPreview();
  return el("div", {},
    el("div", { class: "upload-row" }, file,
      el("button", { onclick: async () => {
        if (!file.files[0]) return toast("请选择文件", "err");
        const f = file.files[0];
        status.textContent = "申请上传 URL…";
        bar.style.display = "none";
        try {
          const up = await api.uploadUrl(prefix, f.name, f.type || fallbackMime);
          // Reveal the progress bar + live status as bytes upload.
          bar.style.display = "";
          fill.style.width = "0%";
          const start = Date.now();
          let lastUpdate = 0;
          await uploadWithProgress(up.url, f, f.type || fallbackMime, (loaded, total) => {
            const now = Date.now();
            if (now - lastUpdate < 200) return;  // throttle 5 Hz
            lastUpdate = now;
            const pct = (loaded / total) * 100;
            fill.style.width = pct.toFixed(1) + "%";
            const elapsed = (now - start) / 1000;
            const speedBps = elapsed > 0 ? loaded / elapsed : 0;
            const remainBytes = total - loaded;
            const etaSec = speedBps > 0 ? Math.round(remainBytes / speedBps) : 0;
            status.textContent =
              `上传中 ${pct.toFixed(1)}%` +
              ` · ${fmtBytes(loaded)} / ${fmtBytes(total)}` +
              ` · ${fmtBytes(speedBps)}/s` +
              ` · ETA ${etaSec}s`;
          });
          fill.style.width = "100%";
          obj[key] = up.publicUrl;
          const elapsed = ((Date.now() - start) / 1000).toFixed(1);
          status.textContent = `✓ 上传成功 (${fmtBytes(f.size)} · ${elapsed}s)`;
          refreshPreview();
        } catch (e) {
          status.textContent = "失败: " + e.message;
        }
      } }, "上传"),
    ),
    bar, preview, status,
  );
}

// ====================================================================
// Boot
// ====================================================================

// Surface any uncaught error as a toast so the operator sees it instead of
// the modal just silently failing to open.
window.addEventListener("error", (e) => {
  console.error("Uncaught error:", e.error || e.message);
  toast("出错了: " + (e.error?.message || e.message || "unknown"), "err");
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("Unhandled rejection:", e.reason);
  toast("出错了: " + (e.reason?.message || String(e.reason)), "err");
});

async function boot() {
  if (State.token) {
    try { await reloadState(); }
    catch (e) {
      console.error(e);
      logout(); return;
    }
  }
  render();
}
boot();
window.addEventListener("beforeunload", (e) => {
  if (anyDirty()) { e.preventDefault(); e.returnValue = ""; }
});
