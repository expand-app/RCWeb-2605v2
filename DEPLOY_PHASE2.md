# Phase 2 部署 Runbook

你执行,我已把所有源码 ready。预计 30-45 分钟。

按顺序做即可,每一步都给了**命令、期望输出、出错处理**。卡哪一步直接发我。

---

## 0. 准备清单

需要拿到的东西:

- [ ] **Cloudflare 账号**(免费 plan 足够)。`rexpandcareer.com` 域名最好也托管在 Cloudflare,DNS 设置最丝滑;如果还在阿里云 DNS,也能用,改 CNAME 即可。
- [ ] **Aliyun RAM 子用户 AK/SK** —— 单独给视频上传用,**仅** `oss:PutObject` 权限到 `rexpand-official-website/videos/*`(权限最小化原则)。
- [ ] **GitHub fine-grained PAT** —— `Contents: Read and write` on **expand-app/rcweb-2605v2** only,90 天有效。
- [ ] **本机已装 Node 18+** 和 **Python 3.8+**(几乎所有 mac/linux 默认有)。

---

## 1. 部署 Cloudflare Worker(后端)

### 1.1 装 wrangler + 登录

```sh
npm install -g wrangler
wrangler login
# 浏览器会弹出,授权 Cloudflare 账号即可
```

### 1.2 配置

```sh
cd worker
npm install
cp wrangler.toml.example wrangler.toml
```

打开 `worker/wrangler.toml`,改两个字段:

```toml
[vars]
ADMIN_ORIGIN = "https://webadmin.rexpandcareer.com"  # 如果选了 subdir 方案改成 "https://rexpandcareer.com"
OSS_BUCKET = "rexpand-official-website"  # 跟 deploy.yml 里一致
```

其他字段(`GITHUB_REPO`、`OSS_REGION`、`OSS_ENDPOINT`、`OSS_PUBLIC_BASE`)默认值已经对了。

### 1.3 5 个 secret

```sh
# (1) 管理员密码 —— 强密码 12+ 字符
python3 ../scripts/hash_password.py
# 把整行 pbkdf2_sha256$... 复制
echo "<paste-the-hash>" | wrangler secret put ADMIN_PASSWORD_HASH

# (2) JWT 签名密钥 —— 随机 64 hex
openssl rand -hex 32 | wrangler secret put JWT_SECRET

# (3) GitHub PAT
echo "<your-ghp-token>" | wrangler secret put GITHUB_TOKEN

# (4)(5) Aliyun OSS 子用户
echo "<aliyun-access-key-id>" | wrangler secret put OSS_ACCESS_KEY_ID
echo "<aliyun-access-key-secret>" | wrangler secret put OSS_ACCESS_KEY_SECRET
```

期望每次都看到:

```
🌀 Creating the secret for the Worker "rexpand-admin-api"
✨ Success! Uploaded secret <NAME>
```

### 1.4 部署

```sh
wrangler deploy
```

期望输出末尾:

```
Published rexpand-admin-api (1.xx sec)
  https://rexpand-admin-api.<your-subdomain>.workers.dev
Current Version ID: ...
```

记下这个 `.workers.dev` URL,**1.6 节烟雾测试要用**。

### 1.5 绑定自定义域名 `admin-api.rexpandcareer.com`

**Cloudflare 仪表盘 → Workers & Pages → rexpand-admin-api → Settings → Triggers → Custom Domains → Add Custom Domain**,输入 `admin-api.rexpandcareer.com`,自动加 DNS 记录(前提:`rexpandcareer.com` 托管在 Cloudflare)。

如果域名**还在阿里云 DNS**:加一条 CNAME `admin-api` → `rexpand-admin-api.<your-subdomain>.workers.dev`,然后在 Cloudflare 的 Custom Domain 里手动绑定。

### 1.6 烟雾测试

```sh
# 用刚才记下的 .workers.dev URL,先验后端能跑
WORKER=https://rexpand-admin-api.<your-subdomain>.workers.dev
curl -s $WORKER/api/health
# 期望:{"ok":true,"time":"2026-..."}

# 验登录(用你刚才设的密码)
curl -s -X POST $WORKER/api/login \
  -H "Content-Type: application/json" \
  -d '{"password":"<your-admin-password>"}'
# 期望:{"token":"eyJ...","expiresIn":28800}

# 用 token 拉数据
TOKEN="<paste-token>"
curl -s $WORKER/api/state -H "Authorization: Bearer $TOKEN" | jq 'keys'
# 期望:["articles","cases","mentors","replays"]
```

✅ 通过 = Worker 可用。

---

## 2. 部署管理端 SPA

**两个方案,二选一**。推荐 A:省一个域名,内部工具够用。

### 方案 A:同 OSS bucket,子目录 `/webadmin/`(推荐)

ssh / 本机:

```sh
cd webadmin
ossutil cp -r -f --include "*" . oss://rexpand-official-website/webadmin/
# 给 index.html 加 no-cache
ossutil cp -f --meta "Cache-Control:no-cache" index.html oss://rexpand-official-website/webadmin/index.html
```

访问:`https://rexpandcareer.com/webadmin/`。

如果想加到 deploy.yml 自动部署:跟我说一声,我加一条 stage 步骤。

### 方案 B:独立子域 `webadmin.rexpandcareer.com`(需新 OSS bucket + CNAME)

1. 阿里云控制台 → 创建 OSS bucket `webadmin-rexpandcareer`,关掉 read 权限以外的所有 ACL
2. 把 `webadmin/` 三个文件上传到 bucket 根
3. bucket → 域名管理 → 绑定 `webadmin.rexpandcareer.com`
4. DNS 加 CNAME `webadmin` → `webadmin-rexpandcareer.oss-cn-hangzhou.aliyuncs.com`
5. (可选)加 HTTPS 证书

---

## 3. 首次登录 + 验证

1. 打开方案 A:`https://rexpandcareer.com/webadmin/` 或 方案 B:`https://webadmin.rexpandcareer.com`
2. 如果 API 地址不对(显示在登录页底部),点"切换",填 `https://admin-api.rexpandcareer.com`(自定义域名生效后)或 `.workers.dev` URL(临时用)
3. 输入你刚才设的密码
4. 应该看到 Dashboard:案例 63 / 导师 23 / 回放 3 / 资讯 55

### 端到端验证(改一条无关紧要的测试数据,确认提交→部署链路)

1. 进**案例**,挑一条不显眼的(比如 #10067),改 quote 末尾加一个字
2. 点"保存到生产"
3. 期望 toast:`已提交 commit <sha>; 2 个文件 ✓`
4. 去 GitHub 看 PR/commits:应该有一条新 commit,作者是 Worker
5. 等 2-3 分钟,看到 `✅ Deploy success` bot 回评
6. 刷新线上对应页面,确认改动生效
7. 进 webadmin 把字改回来,保存一次

---

## 4. 出错处理速查

| 现象 | 原因 | 解决 |
|---|---|---|
| `wrangler deploy` 报 `not logged in` | 没 `wrangler login` | 重跑 1.1 |
| `/api/login` 返回 `wrong password` | hash 没生效 / 密码记错 | `wrangler secret list` 验证 `ADMIN_PASSWORD_HASH` 存在;重生成 hash 重 put |
| `/api/state` 返回 502 / GitHub error | PAT 权限不对 | 重新签 PAT,确保 `Contents: write` on `expand-app/rcweb-2605v2`;`wrangler secret put GITHUB_TOKEN` 覆盖 |
| 保存时报 `marker not found` | 有人手改 index.html 把 marker 删了 | `python3 scripts/add_html_markers.py` 重新注入;或者还原 index.html |
| 视频上传 403 | OSS 子用户权限不够 / Region 不对 | 检查 wrangler.toml 的 `OSS_REGION` 和子用户的 region 一致;子用户至少有 `oss:PutObject` |
| SPA 登录页 console 报 CORS | `ADMIN_ORIGIN` 跟实际访问域不一致 | 改 wrangler.toml 的 `ADMIN_ORIGIN`,重 `wrangler deploy` |
| 保存按钮灰色一直不可点 | 没改动 / dirty 检测 bug | 确认编辑后点了"确认"关 modal;再不行刷新页面重做 |

---

## 5. 安全 housekeeping(部署完做一次)

- [ ] 在 Cloudflare WAF 加一条规则:`admin-api.rexpandcareer.com` 路径 = `/api/login` 时,**限速 5 次 / 分钟 / IP**(防爆破)
- [ ] PAT 设 90 天到期,到期前提醒自己重签
- [ ] OSS 子用户的 AccessKey 也 90 天轮换一次
- [ ] 把这个 runbook 收藏到 1Password / Bitwarden

---

## 6. 哪些场景找我

- 上面任何一步报错且 troubleshoot 表里没覆盖
- 想加新字段 / 改数据 schema
- 想加管理员权限分级(目前是单密码)
- 想要 audit log / undo
- 想把 webadmin 也加进 deploy.yml 自动部署
- 想把视频源迁移到不同的 OSS / S3 / CDN

直接发我现象 + screenshot,我看完会给修改方案。
