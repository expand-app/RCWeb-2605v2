---
name: deploy-aliyun
description: >-
  Rexpand 官网（expand-app/RCWeb-2605v2）改完文案 / 换完图片之后，把站点发布到阿里云 OSS 并刷新
  CDN 的完整流程：发布前自检 → 本地预览确认 → 提交并推送 main → GitHub Actions 自动部署 →
  盯 run → 线上校验 → 出错回滚。只要用户说「上线」「发布」「部署」「推到生产」「让线上生效」
  「网站更新了但线上没变」「回滚 / 撤回刚才的改动」，或者刚改完 index.html / media 里的图片在问
  下一步怎么办，就用这个 skill —— 哪怕他没说「阿里云」「GitHub Actions」这些词。这是运营同事
  日常改站点内容后的默认发布路径，别自己临时拼 git 和 ossutil 命令。
---

# 发布 Rexpand 官网到阿里云

## 这个站是怎么上线的

一句话：**代码进了 `main`，网站就自动更新了。**

```
你改 index.html / media 里的图
        ↓  git push 到 main
GitHub Actions（.github/workflows/deploy.yml）自动跑
        ↓  把该上线的文件打包进 dist/
        ↓  ossutil 传到 阿里云 OSS bucket: rexpand-official-website
        ↓  aliyun dcdn 刷新 CDN 缓存
线上 https://www.rexpandcareer.com 生效（约 2-3 分钟）
```

没有构建步骤、没有 npm、没有服务器要登。阿里云的 AccessKey 已经存在仓库的
GitHub Secrets 里（`ACCESS_KEY_ID` / `ACCESS_KEY_SECRET`），本机不需要配任何阿里云凭证。

用这个 skill 的对象常常是不写代码的运营同事。所以每一步都要**说人话解释你在干什么**，
命令你自己跑，别把一串 shell 甩给他让他自己贴。遇到要他做决定的地方（比如线上文案
到底用哪版），停下来问，别替他拍板。

---

## 第一次接手？先确认环境

如果是这个人第一次用（或者你发现某个命令报 command not found），先花一分钟核对：

```bash
git rev-parse --show-toplevel   # 必须落在 RCWeb-2605v2 仓库根目录
python3 --version               # 本地预览要用
node --version                  # 发布前自检的 JS 语法检查要用
gh auth status                  # 可选，见下
```

- **必须在仓库根目录开会话**。在别的目录开，这个 skill 根本不会被加载。
- **`python3` 缺了** → 本地预览起不来。macOS 自带，一般不会缺；缺了装 Xcode command line tools。
- **`node` 缺了** → 自检会跳过 JS 语法检查并给出警告。能发布，但少了一道最关键的防线
  （见第 2 步），建议先 `brew install node`。
- **`gh` 没装或没登录** → 只影响"盯部署"那一步，改用浏览器看，不影响发布本身。
  仓库是 public，**看 Actions 不需要登录**。

推送权限有两种可能，直接影响第 5 步怎么走：

| 他手上是什么 | `gh` 能用吗 | 第 5 步怎么盯部署 |
|---|---|---|
| GitHub 账号 / PAT | ✅ | `gh run watch` |
| Deploy key（仓库级 SSH key） | ❌ | 浏览器打开 Actions 页面 |

---

## 完整流程

### 第 0 步 · 先跟 main 对齐

这个仓库有机器人会往 `main` 推 commit（webadmin 后台发布、`sync-data.yml`
自动回写 `data/*.json`），本地很容易落后。开工前先同步，能省掉后面一堆 push 冲突：

```bash
git checkout main && git pull --rebase origin main
```

如果本地已经有没提交的改动，`git stash` 一下再 pull，然后 `git stash pop`。

### 第 1 步 · 改内容

文案和图片绝大多数都在 **`index.html` 这一个文件**里（4 万行 / 2.7 MB 的单页应用）。

- **绝不要整份重写 `index.html`**，只做精确的局部替换。这个文件太大，重写必然丢东西。
- 改文案前先用 `grep -n "那句原文" index.html` 定位，确认只命中一处再改。
- 换图片、加图片有坑，**必看 [references/content-map.md](references/content-map.md)**
  —— 那里写了哪些目录的图才会被部署上线、哪些内容其实该走 webadmin 后台改。

### 第 2 步 · 跑发布前自检

```bash
bash .claude/skills/deploy-aliyun/scripts/preflight.sh
```

它是只读的，不会改任何东西。会检查这几件最容易翻车的事：

| 检查 | 为什么重要 |
|---|---|
| 本地是否落后 `origin/main` | 落后就 push 不上去 |
| 新图片是否在 deploy.yml 的打包范围内 | **最常见的坑**：图片进了 git，但没被打包上传 OSS → 线上 404 |
| `index.html` 里每个图片/视频引用能否找到真实文件 | 路径打错本地可能有缓存看不出来，线上直接裂图 |
| 内联 `<script>` 的 JS 语法 | **最阴的坑**：语法错了部署照样绿灯，线上却白屏 |
| `index.html` 体积有没有异常缩水 | 防止编辑事故把大段内容删掉 |
| 部署时会跑的 `scripts/og-pages.mjs` 能否跑通 | 它挂了整个部署就红 |
| 有没有手改 `data/*.json` | 那些是自动生成的，手改会被覆盖 |

有 `✗` 就先修掉再往下走，有 `!` 是提醒、自己判断。

那条"部署绿灯但线上白屏"值得单独记住：GitHub Actions 只负责把文件传上去，
**不会执行页面里的 JS**。所以 `index.html` 里的 JS 写坏了，Actions 一路绿灯、
你以为发布成功了，用户打开却是一片空白。自检里的语法检查就是专门防这个的，
也可以单独跑：

```bash
node .claude/skills/deploy-aliyun/scripts/check-inline-js.mjs
```

### 第 3 步 · 本地预览确认

改动是给人看的，一定要真在浏览器里看过再发。

```bash
python3 serve.py 8765
```

然后打开 `http://localhost:8765`，跳到改动那一页确认。`serve.py` 带 SPA 回退，
所以 `/about`、`/cases`、`/offer` 这些子路径本地也能直接打开。

> 如果这个会话有 `preview_*` 工具，用 `preview_start` 起 `.claude/launch.json` 里的
> `static` 配置，再用 `read_page` / 截图确认，比让用户自己开浏览器可靠。
>
> 本项目**没有 staging 环境**（`staging.rexpandcareer.com` 已废弃）。手动触发
> workflow 时也不要选 `staging`。本地预览就是上线前唯一的验证关口，别跳过。

给用户一个明确的确认点：「本地这样对吗？确认了我就推上线。」等他点头再走第 4 步。
推到 `main` 之后就是直接改生产站，没有中间缓冲。

### 第 4 步 · 提交并推送到 main

**改动只有推到 `main` 才会上线。** 改完文件不提交、或者提交了不推，本地看着都是好的，
线上一点变化都没有 —— 这是最容易发生的"我明明改了啊"。所以别假设当前是什么状态，
先看一眼再动手：

```bash
git status --short
git log --oneline origin/main..HEAD
```

自检的第 2 步已经替你分好类了，三种情况分别这么走：

#### A. 有改了但没提交的文件（最常见）

先把改动念给用户听，确认**每一条都是他想发的**，再提交。

**别 `git add -A` 一把梭。** 运营同事的工作目录里常有跟这次发布无关的东西 ——
下载的原图、临时截图、自己记的备注。全提交进去会污染仓库，图片还可能被误当成
站点资源。逐个 add 你确认过的文件：

```bash
git add index.html media/team/2024-annual-gala.png
git commit -m "content: 关于我们 团队照片更新"
git push origin main
```

如果 `git status` 里有你判断不了的文件（不知道是不是他要发的），**停下来问**，
别自己决定加不加。

#### B. 已经提交了，但没推

```bash
git push origin main
```

推上去就会触发部署。先跟用户念一遍这些 commit 里都改了什么，确认是他要发的内容。

#### C. 工作区干净，也没有未推送的提交

这次没有新东西可发布。**别造一个空 commit 硬凑一次部署。** 先问清楚他想干什么：

- 内容其实还没改 → 回到第 1 步
- 上次 run 挂了想重跑 / 想强制刷一遍 CDN → 用手动触发，见
  [references/troubleshooting.md](references/troubleshooting.md) 的「不改代码，手动触发一次部署」

#### 如果发现不在 `main` 分支上

日常内容发布就是直推 `main`（这个仓库没有分支保护，webadmin 后台也是这么发的）。
不在 main 上时别自作主张切分支或强行合并，先告诉用户当前在哪个分支，然后按情况问他：

- 改动还没提交 → `git stash` → `git checkout main && git pull --rebase origin main` → `git stash pop`
- 改动已经提交在别的分支上 → 开 PR 合并到 main，或者把那几个 commit cherry-pick 过来

#### commit message

用中文写清楚改了哪一页的什么，跟仓库现有习惯一致：`content: …`（内容改动）/
`fix: …`（修问题）。以后线上出问题要回滚时，是靠这行字找到该撤哪一次的。

### 第 5 步 · 盯部署

推完立刻盯着跑：

```bash
gh run watch --exit-status $(gh run list --workflow=deploy.yml --limit 1 --json databaseId --jq '.[0].databaseId')
```

正常 90 秒到 2 分钟跑完。

**如果 `gh` 用不了**（没装、没登录，或者他用的是 deploy key —— deploy key 撑不起 `gh`），
让他直接开浏览器看，**仓库是 public，看 Actions 不需要登录**：

<https://github.com/expand-app/RCWeb-2605v2/actions/workflows/deploy.yml>

最上面那条就是他刚推的，黄点=在跑，绿勾=成功，红叉=失败。别因为 `gh` 用不了就跳过这一步 ——
不确认跑没跑成，等于不知道有没有上线。

跑完之后会在 commit 下面看到机器人回评 `✅ Deploy success — production`。

> 你还会看到 **`Sync data/*.json from index.html`** 这个 workflow 也跟着跑，并且多推
> 一个 `auto-sync: data/*.json` 的 commit。这是正常的 —— 改了 `index.html` 就会自动
> 把结构化数据回写一份给后台用。不是出错，不用管。

### 第 6 步 · 验证线上

CDN 刷新完大概 2-3 分钟生效。验证：

```bash
curl -s https://www.rexpandcareer.com/ | grep -c "改动后的那句文案"
```

返回 ≥1 就是上线了。换了图的话再确认一下图能取到：

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://www.rexpandcareer.com/media/team/新图.jpg
```

要 `200`。

告诉用户：**浏览器要硬刷新**（Mac `Cmd+Shift+R`），否则看到的还是本地缓存的旧页面。

> 从中国大陆以外或挂着 VPN 时，这两个域名可能连不上 / 超时 —— 那是本机网络问题，
> 不代表部署失败。以 Actions 的绿勾为准，让用户在自己网络环境下确认页面。

---

## 出问题了

按现象查 **[references/troubleshooting.md](references/troubleshooting.md)**：Actions 红了、
线上没变化、图片 404、push 被拒、想回滚，都在里面。

最常用的一条 —— **回滚**：

```bash
git revert --no-edit HEAD && git push origin main
```

`revert` 会生成一个反向 commit，推上去照样触发一次部署，两三分钟后线上就回到上一版。
不要用 `git reset --hard` + 强推来回滚生产，那会打乱别人和机器人的提交。

---

## 一些不要做的事

- **别在本机直接跑 `ossutil` / `scripts/deploy.sh` 传生产。** 那需要在本机放阿里云
  AccessKey，而 GitHub Actions 里已经有了。走 Actions，操作有记录、可追溯、能回滚。
- **别为了"快点看到效果"跳过本地预览。** 没有 staging 兜底，推错了就是线上错。
- **别手改 `data/*.json`。** 那是 `scripts/extract_data.py` 从 `index.html` 自动生成的，
  手改下次同步就没了。
- **别改 `.github/workflows/deploy.yml` 里的 OSS bucket、域名、CDN 配置**，除非用户
  明确要求。加新图片目录是唯一常见的合理改动（见 content-map.md）。
