# 视频文件交接说明 · Video Asset Handoff

## 概述

Rexpand 网站（[GitHub](https://github.com/wilsonleechen/RCWeb-2605)）有 17 个视频文件，总计约 **2.43 GB**。这些文件因为单文件超过 GitHub 的 100 MB 限制，没有在仓库里，需要单独上传到 CDN。

---

## 📦 文件构成

### A. 导师课程视频（12 个，~520 MB）
位于 `media/instructors/` —— 用于"关于我们"页面的导师介绍模态弹窗。

| 文件 | 大小 | 对应导师 |
|---|---|---|
| `Jennie.mp4` | 100.7 MB | Jennie / Sr. Recruiter |
| `Cathy.mp4` | 88.0 MB | Cathy / Banking VP |
| `Vivian.mp4` | 65.5 MB | Vivian / DS |
| `danny.mp4` | 63.8 MB | Danny / Quant |
| `Claire.mp4` | 63.7 MB | Claire / Audit Partner |
| `tom.mp4` | 47.2 MB | Tom / SDE |
| `Amber.mp4` | 39.5 MB | Amber / PM |
| `Jiexuan.mp4` | 17.6 MB | Jiexuan / Sr. Analyst |
| `Xiaoyi.mp4` | 16.8 MB | Xiaoyi / Strategy |
| `Ryan.mp4` | 7.6 MB | Ryan / Consulting |
| `James.mp4` | 6.4 MB | James / FP&A |
| `Florence.mp4` | 5.3 MB | Florence / IB |

### B. 面试复盘视频（3 个，~1.97 GB）
位于 `media/replays/` —— 用于"免费资源"页面的面试录播。

| 文件 | 大小 |
|---|---|
| `walmart-senior-data-scientist-2026-05-25.mp4` | 929.0 MB |
| `mckinsey-senior-data-science-analyst-2026-05-25.mp4` | 685.5 MB |
| `goldman-business-operations-analyst-2026-05-25.mp4` | 352.0 MB |

### C. 其他（2 个，~3.6 MB）
| 文件 | 大小 | 用途 |
|---|---|---|
| `media/food.mp4` | 1.0 MB | Meetfood 项目移动端 mockup —— **已在 GitHub repo 里**，不用单独传 |
| `media/food-hevc-original.mp4` | 2.6 MB | 食物视频的 HEVC 原始版 —— **可忽略**，已被 `food.mp4` 替代 |

---

## 🎯 部署步骤（请按顺序执行）

### Step 1 — Clone 仓库

```bash
git clone https://github.com/wilsonleechen/RCWeb-2605.git
cd RCWeb-2605
```

### Step 2 — 下载视频包

从委托方获得视频压缩包（百度网盘 / 阿里云盘 / WeTransfer 链接）。
解压后，**保持原有目录结构**，把 `instructors/` 和 `replays/` 两个文件夹拷贝到 `media/` 下：

```
RCWeb-2605/
└── media/
    ├── instructors/   ← 12 个 mp4
    └── replays/       ← 3 个 mp4
```

### Step 3 — 选择 CDN

**推荐 Cloudflare R2**（最便宜，2.43 GB ~$0.04/月，出流量免费）：

1. 注册 Cloudflare 账户 → R2 → Create bucket → 命名 `rexpand-media`
2. 把整个 `media/` 文件夹上传（用 web dashboard 拖拽，或 `rclone`）
3. Bucket settings → Public Access → 启用 → 拿到 public URL（形如 `https://pub-xxxxxxxxxxxxxx.r2.dev/`）
4. 可选：绑定自定义子域名 `cdn.rexpandcareer.com`

**替代选项**：
- **Vercel Blob**: `vercel blob put media/instructors/*.mp4 --public`
- **AWS S3 + CloudFront**: 适合大规模流量

### Step 4 — 替换 HTML 里的视频路径

15 个视频在 `index.html` 各被引用 1 次（详见 `VIDEO_MANIFEST.csv`）。
用以下脚本一键替换（假设你的 CDN base URL 是 `https://cdn.rexpandcareer.com`）：

```bash
# 修改 CDN_BASE 为你的实际 CDN URL
CDN_BASE="https://cdn.rexpandcareer.com"

# Mac / Linux
sed -i.bak \
  -e "s|media/instructors/|${CDN_BASE}/instructors/|g" \
  -e "s|media/replays/|${CDN_BASE}/replays/|g" \
  index.html

# Windows PowerShell
(Get-Content index.html) `
  -replace 'media/instructors/', "${env:CDN_BASE}/instructors/" `
  -replace 'media/replays/', "${env:CDN_BASE}/replays/" `
  | Set-Content index.html
```

⚠️ **不要替换 `media/food.mp4`** —— 这个小文件已经在 git repo 里，应该继续走相对路径。

### Step 5 — 验证

启动本地服务器测试：
```bash
python -m http.server 8765
# 打开 http://localhost:8765
# 测试三个有视频的页面：
# 1. /about — 点击带 ▶ 标记的导师卡，确认视频能播
# 2. /resources — 点击面试复盘，确认录播能播
# 3. /background → SE 方向 → Meetfood —— 食物视频应该自动播
```

### Step 6 — 部署

```bash
git add index.html
git commit -m "Switch video sources to CDN"
git push
```

如果连接了 Vercel/Netlify，会自动重新部署。

---

## ✅ 完成检查清单

- [ ] 17 个视频已上传到 CDN（除 `food.mp4` 和 `food-hevc-original.mp4`）
- [ ] CDN bucket 设为 public read
- [ ] CORS 允许 `https://rexpandcareer.com`（如果在自定义域名下）
- [ ] `index.html` 中 15 处视频路径已改为 CDN URL
- [ ] 本地测试三个视频页面都能播
- [ ] `git push` 完成，Vercel/Netlify 部署成功
- [ ] 线上访问 `https://rexpandcareer.com/about` 验证导师视频可播
- [ ] 线上访问 `https://rexpandcareer.com/resources` 验证 replay 可播

---

## 💰 月度成本估算

| CDN | 2.43 GB 存储 | 1 万次播放（假设平均 50 MB） | 总计 |
|---|---|---|---|
| **Cloudflare R2** | $0.04 | **$0**（egress 免费） | **~$0.04** |
| **Vercel Blob** | $0.36 | $0（含在 Pro 计划） | **~$0.36** |
| **AWS S3 + CloudFront** | $0.06 | $42 | **~$42** |

强烈推荐 **R2**。

---

## 📞 有问题联系

委托方: wilsonleechen@gmail.com
代码仓库: https://github.com/wilsonleechen/RCWeb-2605
