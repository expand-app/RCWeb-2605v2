# RCWeb-2605 · Rexpand 睿思班

Single-page marketing site for **Rexpand** (睿思班) — AI-driven career placement for international students.

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

本地修改后验证（不会发布）：

```bash
python3 scripts/check_site_baseline.py
node .claude/skills/deploy-aliyun/scripts/check-inline-js.mjs index.html
node scripts/og-pages.mjs
node scripts/check-seo.mjs
node --test scripts/traffic-attribution.test.mjs
```

部署用站点地图由 `og-pages.mjs` 生成至 `dist/sitemap.xml`；不要只编辑根目录的旧静态站点地图。文章正文与 URL 来自现有数据，品牌文案修改不应批量改写文章。

---

## 流量来源与 LLM 归因

`analytics/traffic.js` 在首页跳转和 GA4 初始化之前采集来源，主页、预渲染详情页和邮件页共用。使用公司管理的 GA4 数据流 `G-SSLD98NGK9`，不需要新增后端；正式入库仍取决于 Google Analytics 请求是否成功、浏览器拦截及现有同意设置。脚本缺失时网站和原有 GA4 初始化仍可工作。

识别 DeepSeek、ChatGPT、Claude、Gemini、Perplexity、Copilot、Kimi、豆包、通义/Qwen、腾讯元宝、Grok、文小言和秘塔；普通外站、搜索、邮件、付费推广和来源不明的访问单独分类。域名按完整主机名/子域名匹配，`deepseek.com.evil.com` 不会被认成 DeepSeek；Google/Bing 普通搜索及 x.com 不会被笼统算成 AI。

归因优先级：有效的 `utm_source`（主动标记）→ 外部 `document.referrer`（浏览器提供）→ `direct_unknown`（直接/来源不可知）。`rc_evidence` 保留依据，不能把 UTM 标记当成平台验证。浏览器没提供来源时不猜测；复制链接、App 跳转、隐私设置可能造成来源丢失。

首次来源在同一浏览器、同一 origin 的 localStorage 保留 90 天。本次来源使用 sessionStorage，同标签页内连续访问保留，30 分钟无交互后过期；来源改变或明确提供了不同的对话地址时开启新的归因访问。刷新、站内导航、邮件参数转发不会重复产生落地事件。跨标签页、跨设备、www/裸域访问不可视为同一个自建归因会话；这个口径与 GA4 自身的 Sessions 不同。

### 采集事件

| 事件 | 触发时机 | 统计含义 |
|---|---|---|
| `traffic_landing` | 每次归因访问首次有活动时一次 | 本脚本的归因访问次数，不能与 GA4 会话数混用 |
| `traffic_page_view` | 首次打开、最终 SPA 路径切换、历史返回/前进 | 带来源的逻辑页面浏览；合并同一轮路由的中间地址，不把锚点当成新页面 |
| `consult_click` | 点击企业微信 `/ca/` 咨询链接，包括中键打开 | 咨询意向，不代表成功加微或成交 |

原有 GA4 自动 `page_view` 保留；不要把它与 `traffic_page_view` 相加。报表按事件名筛选，浏览分析用后者，访问量用 `traffic_landing` 的事件数。咨询率用漏斗中完成咨询的访问/用户计算，不能用多次点击的事件数直接除以访问量。历史没有记录的新增参数无法回补。

### GA4 后台配置（上线前完成）

用有编辑权限的账号进入 [Google Analytics](https://analytics.google.com/)，确认网站数据流的衡量 ID 为 `G-SSLD98NGK9`。管理 → 数据展示 → 自定义定义 → 创建自定义维度，以下参数均选择“事件”作用域：

| 展示名称 | 事件参数 | 用途 |
|---|---|---|
| 流量来源 | `rc_source` | deepseek / chatgpt / 外部域名 / 活动来源等 |
| 来源渠道 | `rc_channel` | ai_assistant / organic_search / paid / email / campaign / referral / direct_unknown |
| 来源媒介 | `rc_medium` | referral、email、ai-assistant 或 UTM 媒介 |
| LLM 平台 | `rc_llm` | 按大模型拆分；其他为 none |
| 归因依据 | `rc_evidence` | utm / referrer / none |
| 跳转来源域名 | `rc_referrer_host` | 浏览器实际传来的域名；与 UTM 来源分别记录 |
| 首次落地页 | `rc_landing_path` | 这次归因访问的入口路径 |
| 首次来源 | `rc_first_source` | 90 天内首次记录的来源 |
| 首次 LLM | `rc_first_llm` | 首次来源对应的平台；首次不是 AI 则为 none |
| 对话链接状态 | `rc_conversation` | provided / not_provided / not_applicable |
| 咨询按钮 | `rc_button` | 按钮 ID 或固定文字 |
| 咨询位置 | `rc_placement` | 页面 ID / nav / footer 等 |

`rc_referrer_url` 和 `rc_conversation_url` 也会随事件发送（自定义字符串最多 100 字符），排查时在 DebugView 查看。完整来源/对话 URL 的基数很高，默认不建议注册为常规报表维度；确需逐条分析时，提前连接 GA4 BigQuery 导出（需另行配置 Google Cloud 项目和费用），或按需注册这两个维度。原生页面位置 `page_location` 保存去除查询参数的完整站内页面地址。

对话 URL 只接受少数已知平台路径中的不透明 ID，删除查询参数、片段和凭据，不采集提示词和对话正文。多数 LLM 只传来源域名，因此“未提供对话链接”是正常结果。提供了链接也不代表能打开私有对话；没有对话 URL 时网站无法还原是哪一段聊天。非 LLM 外站保留来源 origin/path，去除 query/hash。

在探索中创建表格：事件名筛选 `traffic_landing`，行用“LLM 平台 / 流量来源”，值用“事件数 / 总用户数”，可增加首次落地页拆分。再建漏斗：`traffic_landing` → `consult_click`，按 LLM 平台对比咨询意向。原生“流量获取”的 AI Assistant 渠道可作对照，但其规则和本脚本的归因访问口径不同。新增维度通常需要 24–48 小时处理，先看实时/DebugView 验证；将 `consult_click` 标记为关键事件只表示咨询意向。

### 本地验证

运行 `python3 serve.py 8765`，访问 `http://localhost:8765/?traffic_debug=1&utm_source=deepseek&utm_medium=ai-assistant`。本地 origin 自动禁用这个 GA4 ID 的采集，避免测试污染生产数据；浏览器控制台的 `[RC traffic]` 输出可查看真实事件参数。`window.RCTraffic.context()` 也可在开发者工具中查看当前归因。线上验收须再确认 `/analytics/traffic.js` 返回 JavaScript、GA4 请求成功且参数入库，不能用本地通过替代线上验收。

来源识别、存储失效、SPA 事件合并、邮件跳转与咨询点击测试：`node --test scripts/traffic-attribution.test.mjs`。发布流程会先运行测试，再把 `analytics/` 整体打包进 OSS。

参考：[Google 自定义参数及维度](https://developers.google.com/analytics/devguides/collection/ga4/event-parameters)、[GA4 AI Assistant 渠道定义](https://support.google.com/analytics/answer/9756891?hl=en)。

---

## 📞 Contact

For bulk email campaigns, link to `https://www.rexpandcareer.com/email.html` with the campaign's existing `utm_*` parameters. Existing homepage links with `utm_medium=email` redirect to this lightweight page. Its “了解我们的服务” link passes the UTM parameters through to the full `/offer` page.

- Site: https://rexpandcareer.com
- Email: hello@rexpandcareer.com
- 微信: scan QR on the site footer
