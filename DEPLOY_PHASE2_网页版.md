# Phase 2 部署 · 纯网页版(零命令行)

全程在浏览器里点,不用装 Node、不用 PowerShell、不用 wrangler。
适合不想碰命令行的人。

预计 40 分钟。卡哪一步,**截图发我**(把密钥涂掉),我看图指你。

---

## 你需要先拿到的 3 样东西

| 东西 | 在哪拿 | 拿到长啥样 |
|---|---|---|
| Cloudflare 账号 | ✅ 你已注册 | 能登 dash.cloudflare.com |
| Aliyun RAM 子用户 AK/SK | 阿里云 RAM 控制台 | `LTAI...` + 一串 secret |
| GitHub Fine-grained PAT | github.com/settings/tokens | `github_pat_...` |

> RAM 子用户和 GitHub PAT 怎么建,看本文最后【附录】。先建好再往下走。

---

## 第 1 步:建 Worker(后端)

1. 登录 https://dash.cloudflare.com
2. 左侧菜单点 **Workers & Pages**
3. 点 **Create application** → **Create Worker**
4. 名字填:`rexpand-admin-api` → 点 **Deploy**(先部署一个默认的 hello world,待会替换)
5. 部署完点 **Edit code**(或 **Continue to project** → 右上 **Edit code**),进网页代码编辑器

### 1.1 粘贴我打包好的代码

1. 浏览器打开这个文件(GitHub 上):
   `https://github.com/expand-app/RCWeb-2605v2/blob/main/worker/dist/worker.bundled.js`
2. 点页面右上的 **Copy raw file** 按钮(或点 **Raw** 后全选 `Ctrl+A` 复制 `Ctrl+C`)
3. 回到 Cloudflare 代码编辑器,**全选删掉**里面的默认代码,**粘贴**我的代码
4. 右上点 **Deploy** → **Save and deploy**

✅ 现在后端代码上去了,但还没配密钥,先别测。

---

## 第 2 步:填环境变量 + 密钥(网页表单)

在这个 Worker 页面:**Settings** 标签 → **Variables and Secrets**(变量与机密)。

### 2.1 普通变量(Plaintext,点 "Add" 一条条加)

| 变量名 | 值 | 类型 |
|---|---|---|
| `ADMIN_ORIGIN` | `https://webadmin.rexpandcareer.com` | Text |
| `GITHUB_REPO` | `expand-app/rcweb-2605v2` | Text |
| `GITHUB_BRANCH` | `main` | Text |
| `OSS_REGION` | `oss-cn-hangzhou` | Text |
| `OSS_BUCKET` | `rexpand-official-website` | Text |
| `OSS_ENDPOINT` | `https://oss-cn-hangzhou.aliyuncs.com` | Text |
| `OSS_PUBLIC_BASE` | `https://resources.rexpandcareer.com` | Text |

> `ADMIN_ORIGIN` 待会确定管理端用哪个网址后,可能要回来改。先按这个填。

### 2.2 密钥(Secret / Encrypt,共 5 个)

点 **Add**,类型选 **Secret**(加密),逐个加:

| 密钥名 | 值从哪来 |
|---|---|
| `ADMIN_PASSWORD_HASH` | ⚠️ 见下面 2.3,需要先算一下 |
| `JWT_SECRET` | 随便一长串随机字符(32+ 位),见 2.4 |
| `GITHUB_TOKEN` | 你的 `github_pat_...` |
| `OSS_ACCESS_KEY_ID` | 你的 `LTAI...` |
| `OSS_ACCESS_KEY_SECRET` | 你的 RAM secret |

加完点 **Deploy** 让它们生效。

### 2.3 算管理员密码哈希(不能直接填明文密码!)

密码不能明文存,要先转成哈希。最省事的办法——**用浏览器开发者工具跑一段**:

1. 在 **任意网页**(比如就在 Cloudflare 这个页面)按 `F12` 打开开发者工具
2. 点 **Console**(控制台)标签
3. 把下面整段粘进去,**把 `换成你的密码` 改成你想要的登录密码**,回车:

```js
(async () => {
  const pw = "换成你的密码";
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({name:"PBKDF2", salt, iterations:100000, hash:"SHA-256"}, key, 256);
  const b64u = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  console.log(`pbkdf2_sha256$100000$${b64u(salt)}$${b64u(bits)}`);
})();
```

4. 它会打印出 `pbkdf2_sha256$100000$xxxx$yyyy` 一整行 —— **这一整行**就是 `ADMIN_PASSWORD_HASH` 的值,复制去填
5. **记住你刚才输入的明文密码**,这是你以后登录后台用的

### 2.4 生成 JWT_SECRET

同一个 Console 里粘这行回车:

```js
console.log([...crypto.getRandomValues(new Uint8Array(32))].map(b=>b.toString(16).padStart(2,"0")).join(""))
```

打印出的 64 位十六进制串,就是 `JWT_SECRET` 的值,复制去填。

---

## 第 3 步:测后端通不通

Worker 页面顶部有个网址,长这样:
`https://rexpand-admin-api.<你的名字>.workers.dev`

浏览器直接打开:
`https://rexpand-admin-api.<你的名字>.workers.dev/api/health`

看到 `{"ok":true,"time":"..."}` → ✅ 后端活了。

---

## 第 4 步:部署管理端界面(Cloudflare Pages)

用 Cloudflare Pages 直接连 GitHub,全自动:

1. 左侧 **Workers & Pages** → **Create application** → **Pages** 标签 → **Connect to Git**
2. 授权 GitHub → 选仓库 `expand-app/RCWeb-2605v2`
3. 配置:
   - **Production branch**: `main`
   - **Framework preset**: `None`
   - **Build command**: 留空
   - **Build output directory**: `webadmin`
4. **Save and Deploy**
5. 部署完会给你一个网址:`https://rexpand-xxxx.pages.dev`

浏览器打开这个 `.pages.dev` 网址,应该看到 **Rexpand 站点后台** 登录页。

---

## 第 5 步:首次登录

1. 登录页底部有 "API: ..." 和一个 "切换" 链接
2. 点 **切换**,填你第 3 步那个 `https://rexpand-admin-api.<你的名字>.workers.dev`,确定
3. 输入你 2.3 设的**明文密码**
4. ✅ 看到 Dashboard:案例 63 / 导师 23 / 回放 3 / 资讯 55 → **成功了!**

> ⚠️ 这一步如果浏览器控制台报 CORS 错误,是因为 `ADMIN_ORIGIN` 跟你实际访问的 `.pages.dev` 网址对不上。回第 2.1 步把 `ADMIN_ORIGIN` 改成你的 `.pages.dev` 完整网址(带 https://),重新 Deploy。或者等第 6 步绑了正式域名再说。

---

## 第 6 步(可选,以后再做):绑正式域名

不绑也能用,`.pages.dev` 和 `.workers.dev` 一样能干活。想要好看的域名再做:

- **后端** `admin-api.rexpandcareer.com`:Worker → Settings → Triggers → Custom Domains → 加
- **前端** `webadmin.rexpandcareer.com`:Pages 项目 → Custom domains → 加

绑完记得回 2.1 把 `ADMIN_ORIGIN` 改成 `https://webadmin.rexpandcareer.com` 重新 Deploy。

---

## 第 7 步:端到端验证(确认改了真能上线)

1. 后台进**案例**,挑一条不显眼的改一个字
2. 点 **保存到生产**
3. 看到 `已提交 commit xxxxx` → 去 GitHub 仓库 commits 应该有一条新提交
4. 等 2-3 分钟,主站对应内容更新
5. 改回来再保存一次

全过 = Phase 2 完成 🎉

---

# 附录

## A. 建 Aliyun RAM 子用户

1. 阿里云控制台搜 "RAM" → 进 RAM 控制台
2. 身份管理 → 用户 → **创建用户**
   - 登录名 `rexpand-admin-uploader`
   - 访问方式只勾 **"OpenAPI 调用访问"**
3. ⚠️ 创建后**立刻复制 AccessKey ID + Secret**(Secret 只显示一次)
4. 点该用户 → 权限管理 → 添加权限 → 新建自定义策略:
   - 名称 `OSSPutVideoOnly`,脚本编辑粘:
   ```json
   {"Version":"1","Statement":[{"Effect":"Allow","Action":"oss:PutObject","Resource":"acs:oss:*:*:rexpand-official-website/videos/*"}]}
   ```
   - 保存后勾上这个策略给用户

## B. 建 GitHub Fine-grained PAT

1. github.com → 头像 → Settings → 最底 Developer settings
2. Personal access tokens → **Fine-grained tokens** → Generate new token
3. 填:
   - Name: `rexpand-webadmin-worker`
   - Expiration: 90 days
   - Resource owner: `expand-app`
   - Repository access: Only select → `expand-app/RCWeb-2605v2`
   - Permissions → **Contents: Read and write**(只改这一个,其他全 No access)
4. Generate → ⚠️ 立刻复制 `github_pat_...`
5. 如果你不是 `expand-app` 组织 owner,可能需要组织管理员批准这个 token

---

## 出错速查

| 现象 | 解决 |
|---|---|
| `/api/health` 打不开 / 报错 | Worker 代码没粘对,回第 1.1 重粘重 Deploy |
| 登录报 "wrong password" | 2.3 算哈希时的明文 ≠ 你登录输的;重算重填 `ADMIN_PASSWORD_HASH` |
| 登录后转圈 / Dashboard 不出 | 控制台(F12)看红字;多半是 `GITHUB_TOKEN` 权限不对,重签 PAT |
| 控制台报 CORS | `ADMIN_ORIGIN` 跟访问网址不一致,改了重 Deploy(见第 5 步注) |
| 保存报 "marker not found" | index.html 的标记被人删了,告诉我,我修 |
| 视频上传 403 | RAM 子用户权限/region 不对,核对附录 A |

**任何一步卡住,截图(涂掉密钥)发我。**
