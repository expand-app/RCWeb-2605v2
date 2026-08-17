# 发布出问题了 · 按现象查

先判断卡在哪一段：**推上去了吗 → Actions 跑绿了吗 → 线上生效了吗**。三段各有各的问题。

---

## A. push 推不上去

### `! [rejected] ... (non-fast-forward)` / `fetch first`

本地落后 `origin/main` 了。这个仓库有机器人在往 main 推 commit（后台发布、
`sync-data.yml` 自动回写），落后是常态。

```bash
git pull --rebase origin main
git push origin main
```

`--rebase` 会把你的 commit 挪到最新的 main 后面，不会产生多余的合并记录。

如果 rebase 报冲突，看冲突文件：
- 冲突在 `data/*.json` → **直接用远端的**：`git checkout --theirs data/ && git add data/ && git rebase --continue`。
  那些是自动生成的，本地版本没有保留价值。
- 冲突在 `index.html` → 手动看清楚两边改了什么再合，别乱选一边。这种情况说明有人
  同时在改同一块内容，值得跟对方确认一下。

### `Permission denied` / 要求输密码

`gh auth status` 看一眼登录状态，没登录就 `gh auth login`。GitHub 早就不支持密码推送了，
必须用 token 或 SSH key。

---

## B. Actions 红了

先看失败在哪一步：

```bash
gh run view --log-failed
```

（不带参数就是最近一次 run。`gh run list --workflow=deploy.yml --limit 5` 可以先挑一个。）

### 挂在 `Stage deployable files` → `node scripts/og-pages.mjs`

最常见的原因：**`index.html` 被改坏了**。这个脚本要从 `index.html` 里解析出
`routeMeta` / `BG_ROUTE_META` 等 JS 结构，改动如果破坏了引号配对、括号、逗号，它就会炸。

好消息是这个脚本本地就能跑，改完 `index.html` 后自己先验一遍：

```bash
node scripts/og-pages.mjs
```

正常输出类似 `og-pages: generated 154 per-route .html files ...`。它只写进 `dist/`
（已 gitignore），不会弄脏仓库。报错的话，错误信息通常能指到问题位置。

### 挂在 `cp: cannot stat 'media/xxx': No such file or directory`

`deploy.yml` 里 `cp` 的某个文件不存在了 —— 多半是有人删了图但没同步改 workflow。
要么把文件加回来，要么把对应的 `cp` 行删掉。

### 挂在 `Upload build to Aliyun OSS`

阿里云凭证或权限的问题，运营同事自己解决不了，**找工程同事**。可能是：

- 仓库 Secrets 里的 `ACCESS_KEY_ID` / `ACCESS_KEY_SECRET` 过期或被轮换了
- 对应 RAM 用户的 OSS 权限被改了
- 阿里云侧临时故障

在 <https://github.com/expand-app/RCWeb-2605v2/settings/secrets/actions> 能看到 Secrets
的最后更新时间（看不到值）。

### 挂在 `Notify deploy result`

**这一步失败不影响上线** —— 文件已经传上去了、CDN 也刷了，只是最后那条"部署成功"的
评论没发出去。确认前面几步都是绿的就行，不用重跑。

### 想重跑

```bash
gh run rerun --failed
```

只重跑失败的 job。如果失败原因是 `index.html` 有问题，重跑没用，得先修代码再推一次。

### 不改代码，手动触发一次部署

用在"代码是对的，只是那次 run 因为网络/阿里云抽风失败了"，或者想强制重刷一遍 CDN：

```bash
gh workflow run deploy.yml --ref main -f environment=production
```

**`environment` 一定选 `production`。** 那个 `staging` 选项是历史遗留，
`staging.rexpandcareer.com` 已经废弃了，选了只会白跑一次、传到一个没人看的 bucket。

网页上触发也一样：Actions → Deploy to Aliyun OSS → Run workflow → 保持
`production` → Run。

---

## C. Actions 绿了，但线上没变化

按这个顺序排查，**九成是第 1 条**：

### 1. 浏览器缓存

让用户**硬刷新**：Mac `Cmd+Shift+R`，Windows `Ctrl+F5`。或者开个无痕窗口。

用 curl 绕过浏览器缓存验证一下到底上没上：

```bash
curl -s https://www.rexpandcareer.com/ | grep -c "新文案"
```

返回 ≥1 就是已经上线了，纯粹是用户本地缓存问题。

### 2. CDN 还没刷完

刷新是异步的，通常 1-2 分钟，偶尔更久。等 3 分钟再 curl 一次。

### 3. 改的内容其实没进这次部署

```bash
git log --oneline -3            # 你的 commit 在不在 main 上
git show --stat HEAD            # 这次到底改了哪些文件
```

有时候文件改了但忘了 `git add`，commit 是空的或者只包含了一部分。

### 4. 改的是 `data/*.json` 而不是 `index.html`

线上渲染用的是 `index.html` 里的内容，`data/*.json` 只是给后台读的快照。
只改 JSON 页面不会变。改 `index.html`，或者走 webadmin 后台。

---

## C2. Actions 绿了，但线上整页白屏 / 内容全没了

**这是最需要紧急处理的一种。** 原因几乎一定是 `index.html` 里的 JS 有语法错误。

GitHub Actions 只把文件传到 OSS，**它不会执行页面里的 JS**。所以 JS 写坏了部署一路绿灯，
用户打开却是空白页 —— 因为整站的路由和内容渲染都靠那段 JS。

立刻确认：

```bash
node .claude/skills/deploy-aliyun/scripts/check-inline-js.mjs
```

它会指出出错的 `<script>` 从哪一行开始、错在哪。常见原因是改文案时：

- 中文引号替换掉了代码里的英文引号（`'` → `'`）
- 文案里本身带引号或反斜杠，没有转义
- 删内容时多删/少删了一个 `}`、`)` 或逗号

**先止血再修**：线上白屏期间用户什么都看不到，优先回滚（见 E 节），
回滚生效后再慢慢在本地把语法改对、跑通自检、重新发布。

---

## D. 图片裂了 / 404

**先确认它在不在部署白名单里** —— 这是最常见的原因（详见
[content-map.md](content-map.md) 第 3 节）。只有这些路径会被上传：
`media/team/`、`media/avatars/`、`public/og/`、`media/food-*.png`、`media/food.mp4`、
`media/meetfood-logo.png`。

放在别的目录（比如新建的 `media/logos/`）→ git 里有、本地能看、线上 404。

直接验证线上取不取得到：

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://www.rexpandcareer.com/media/team/xxx.png
```

- `200` → 文件在，问题在引用路径写错了（大小写！OSS 区分大小写）
- `404` → 文件根本没传上去 → 挪到白名单目录，或改 `deploy.yml` 加 `cp`

再看一眼这次部署到底传了什么：Actions run 的 `Stage deployable files` 步骤日志里
有完整的 `dist` 文件清单。

---

## E. 回滚

改错了要撤回，**用 `revert`，不要用 `reset --hard` 强推**：

```bash
git revert --no-edit HEAD        # 撤销最近一次提交
git push origin main
```

推上去会照常触发一次部署，2-3 分钟后线上回到上一版。

要撤的不是最近一次：

```bash
git log --oneline -10            # 找到那次的 commit id
git revert --no-edit <commit-id>
git push origin main
```

如果那次提交后面又有别人的改动，revert 可能冲突 —— 冲突意味着两次改动碰了同一块，
需要人工判断保留什么，别机械地选一边。

> **为什么不用 `reset --hard` + `push --force`**：这个仓库有机器人和后台在往 main 推
> commit，强推会把别人的提交直接抹掉，而且没有记录。`revert` 留痕、可追溯、能再 revert 回来。

**兜底**：OSS bucket 开了版本控制（`deploy.yml` 每次部署都会确保开着），万一 git 这边
全乱了，工程同事可以在阿里云控制台按版本恢复对象。

---

## F. 环境问题

### `gh: command not found`

`gh` 是 GitHub 官方命令行工具。装：

```bash
brew install gh && gh auth login
```

不想装也行 —— 直接在网页上看部署状态：
<https://github.com/expand-app/RCWeb-2605v2/actions/workflows/deploy.yml>

### curl 线上域名一直超时 / `000`

多半是本机网络或 VPN 的问题，不是部署失败。挂着某些 VPN 时访问国内 CDN 会不通。
判断办法：**以 GitHub Actions 的绿勾为准**，然后让用户在自己的正常网络环境下打开页面确认。

### 本地 `python serve.py` 起不来

端口被占了就换一个：`python serve.py 8766`。或者先杀掉占用进程：

```bash
lsof -ti:8765 | xargs kill
```

---

## G. 看到没见过的 workflow / 多出来的 commit

改了 `index.html` 之后，除了 `Deploy to Aliyun OSS`，你还会看到
**`Sync data/*.json from index.html`** 也跑起来，并且往 main 多推一个
`auto-sync: data/*.json from index.html` 的 commit。

**这是设计好的，不是出错。** 它把 `index.html` 里的案例/导师/文章重新提取一份 JSON，
让后台看到的内容跟线上一致。这个 commit 不会再触发第三次部署（workflow 有防循环）。

唯一的影响：你本地又落后一个 commit 了，下次开工前记得 `git pull --rebase origin main`。
