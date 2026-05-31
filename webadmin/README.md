# `webadmin/` — Rexpand 站点后台 SPA

Vanilla JS, no build step. Hosted at `webadmin.rexpandcareer.com`. Talks to
the `worker/` Cloudflare Worker via JSON over HTTPS.

## Files

- `index.html` — shell (loads `app.js` as module)
- `app.css` — utility-flavored admin styles, system font
- `app.js` — all state + routing + 4 CRUD views + Pueblo importer + OSS upload

State lives in memory plus a single `token` value in `localStorage`. Reloading
re-fetches from `/api/state`; the user logs in once per 8 hours.

## What the operator can do

| 视图 | 增 | 改 | 删 | 备注 |
|---|---|---|---|---|
| 案例 (cases) | ✓ | ✓ | ✓ | 含 feature/roster 切换 |
| 导师 (mentors) | ✓ | ✓ | ✓ | 含视频上传 |
| 面试回放 (replays) | ✓ | ✓ | ✓ | 含 Pueblo 一键导入 + 视频上传 |
| 求职情报 (articles) | — | — | ✓ | 仅删除(创建/改写走别的工具) |

每次"保存到生产"会:
1. POST 当前视图的整个数组到 `POST /api/save`
2. Worker 把 JSON 文件写回 `data/<view>.json`,同时把 `index.html` 里对应
   markers 之间的内容重写
3. 一次 git commit 推到 `main`,触发现有 deploy.yml
4. 实际线上更新窗口约 2-3 分钟

## Local dev

```sh
# 1. Run the Worker locally (see ../worker/README.md)
cd ../worker && npx wrangler dev --local --port 8787

# 2. Serve the SPA locally
cd ../webadmin
python3 -m http.server 8081
# Open http://localhost:8081
# Login screen → "切换" → set API base to http://localhost:8787
```

## Deploy

Static SPA — pick whichever host you prefer. Options:

### A) Aliyun OSS subdirectory (same bucket as main site)
Upload `webadmin/` to OSS prefix `webadmin/`, then expose at
`webadmin.rexpandcareer.com` via a separate CNAME + bucket binding.

### B) Cloudflare Pages
Connect this repo, set build command `(none)`, output dir `webadmin/`,
preview branch off. Domain → `webadmin.rexpandcareer.com`.

Either way, the SPA is fully static — no server-side rendering.

## Tips

- The "API" link on the login page lets you switch the Worker origin without
  rebuilding. Useful for `dev` ↔ `prod` switching.
- If you see "未保存" 在某个视图旁边,意味着该视图有改动还没提交。每个视图
  各自保存,不会一起提交。
- 退出登录 = 清掉本地 token。改动会丢失。`beforeunload` 会给一次确认机会。
