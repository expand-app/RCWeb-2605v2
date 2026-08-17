# 内容在哪改 · 图片放哪

发布前需要知道的两件事：**要改的东西在哪个文件里**，以及**新加的图片放哪才会真的上线**。

---

## 1. 页面 ↔ 代码位置

整站是一个单文件 SPA。每一"页"是 `index.html` 里的一个 `<main class="page" id="page-xxx">`，
JS router 按 URL 切换显示哪一个。

| 线上 URL | `<main>` 的 id | 说明 |
|---|---|---|
| `/` | `page-home` | 首页 |
| `/offer` | `page-offer` | 服务 / 套餐 |
| `/cases` | `page-cases` | 学员案例（数据来自 `CASES` 常量） |
| `/bg-quant`、`/bg-data-science` … | `page-background` | 各求职方向落地页，按 slug 切内容 |
| `/resources` | `page-resources` | 求职情报 + 面试回放 |
| `/a-<slug>` | `page-article` | 单篇文章（数据来自 `ARTICLES` 常量） |
| `/r-<slug>` | `page-replay` | 单个面试回放（`REPLAYS` 常量） |
| `/about` | `page-about` | 关于我们 + 导师墙 |
| `/legal/privacy`、`/legal/user-terms`、`/legal/mentor-terms` | `page-legal` | 法务条款 |

定位文案的办法就是 `grep -n "原文里的一小段" index.html`。命中多处时先看上下文，
确认改的是哪一页再动手 —— 同一句话可能同时出现在首页摘要和详情页里，用户想改的
往往是两处都改。

**改之前确认命中范围：**

```bash
grep -c "要改的原文" index.html    # 出现几次
grep -n "要改的原文" index.html    # 分别在哪几行
```

`index.html` 有 4 万行 / 2.7 MB。**只做精确的局部替换，绝不整份重写。**

---

## 2. 有些内容不该在 index.html 里手改

站点有个后台 <https://webadmin.rexpandcareer.com>，运营同事可以自己登录增删改这几类内容，
保存后会自动提交并触发部署 —— 比手改 `index.html` 安全得多：

| 内容 | 后台能做 | 建议 |
|---|---|---|
| 学员案例 cases | 增 / 改 / 删 | **走后台** |
| 导师 mentors（含视频） | 增 / 改 / 删 | **走后台** |
| 面试回放 replays | 增 / 改 / 删 | **走后台** |
| 求职情报 articles | 只能删 | 新增走内容生成工具，删除走后台 |
| 页面文案、标题、按钮、板块结构 | 后台管不了 | 改 `index.html`，走这个 skill 的流程 |
| 图片、Logo、团队照片 | 后台管不了 | 改 `index.html` + `media/`，走这个 skill |

如果用户想改的正好是案例 / 导师 / 回放，先告诉他后台能自己改，问他要不要走后台。
他坚持要在代码里改也可以 —— 改完 `index.html` 后 `sync-data.yml` 会自动把
`data/*.json` 同步过去，不会打架。

**`data/*.json` 是自动生成的产物，任何时候都不要手改。**

---

## 3. 图片：放对目录才会上线 ⚠️

这是**最容易翻车的一步**。`deploy.yml` 的 "Stage deployable files" 步骤是一份**白名单**，
只有列进去的文件才会被打包上传到 OSS。图片放错目录的话：本地预览完全正常、git 也提交了、
Actions 也是绿的 —— 但线上就是 404 裂图。

### 会被上线的目录

| 路径 | 用途 |
|---|---|
| `media/team/**` | 团队照片、公司活动照 |
| `media/avatars/**` | 导师 / 学员头像 |
| `public/og/**` | 分享卡片缩略图（对应线上 `/og/...`） |
| `media/food-*.png`、`media/food.mp4`、`media/meetfood-logo.png` | Meetfood 演示模块专用 |

**新图片放进 `media/team/` 或 `media/avatars/` 就对了。** 不要新建 `media/logos/`、
`media/icons/` 这种目录 —— 除非同时改 `deploy.yml`（见下）。

### 引用路径

`index.html` 里两种写法都在用，跟着改动位置附近的现有写法走：

```html
<img src="/media/avatars/avatar_xxx.png">   <!-- 绝对路径，头像区在用 -->
<img src="media/team/2024-annual-gala.png"> <!-- 相对路径，团队照在用 -->
```

`public/og/xxx.png` 在线上是 `/og/xxx.png`（`public/` 这一层不出现在 URL 里）。

### 换图（最常见）

最省事的做法是**沿用原文件名直接覆盖**，这样 `index.html` 一个字都不用改：

```bash
cp ~/Downloads/新照片.jpg media/team/2024-annual-gala.png
```

注意扩展名要跟原文件一致（`.png` 就还是 `.png`），否则得同步改引用。
覆盖后 CDN 会在部署时自动刷新，不用担心缓存。

### 真的需要新目录时

改 `.github/workflows/deploy.yml` 的 "Stage deployable files" 步骤，加一行 `cp`：

```yaml
          cp -r media/team dist/media/
          cp -r media/avatars dist/media/
          cp -r media/logos dist/media/     # ← 新增
```

改完在 SKILL.md 的第 2 步自检里会被验证到。这是唯一常见的、合理改动 `deploy.yml` 的场景。

### 视频不要提交进 git

`media/instructors/*.mp4` 和 `media/replays/*.mp4` 在 `.gitignore` 里 —— 单个动辄
几百 MB，超过 GitHub 的 100 MB 限制。视频走 OSS 直传，通过后台的视频上传功能，
或者传到 `resources.rexpandcareer.com` 后在 `index.html` 里写完整 URL。

### 图片体积

上线前顺手看一眼大小，超过 500 KB 的照片建议先压一下 —— 首页图太大直接拖慢加载：

```bash
ls -lh media/team/ | sort -k5 -h | tail -5
sips -Z 1600 media/team/新照片.jpg     # macOS 自带，长边压到 1600px
```
