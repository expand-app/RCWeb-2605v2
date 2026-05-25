# Rexpand · 部署指南

这个网站是一个 single-page app —— 整个站点就一个 `index.html`，但通过 `history.pushState` 让每一页都有自己的 URL（`/about`、`/cases`、`/offer` 等）。

部署的关键：**服务器要把所有未知路径都重写到 `/index.html`**。JS router 会读 `location.pathname` 并显示对应页面。

---

## 1. 静态文件清单

部署时上传整个目录，但只有这些是真正需要的：

```
index.html              ← 主入口（包含所有页面 + JS router + SEO meta）
sitemap.xml             ← Google / Baidu 用
robots.txt              ← 爬虫指南
/media/                 ← 团队照片、视频、食物照片等
```

加上一个 host 配置文件（按平台选一个）：
- `vercel.json`     → Vercel
- `netlify.toml`    → Netlify
- `_redirects`      → Cloudflare Pages / Netlify (备用)
- `.htaccess`       → Apache shared hosting

---

## 2. 按平台部署

### Vercel（推荐）

```bash
npm i -g vercel
vercel --prod
```

Vercel 会自动读取 `vercel.json`。完成后绑定域名 `rexpandcareer.com` 即可。

### Cloudflare Pages

1. 上传整个目录（不需要 build command，直接 deploy static）
2. `_redirects` 会自动生效
3. Custom domain → `rexpandcareer.com`

### Netlify

```bash
npm i -g netlify-cli
netlify deploy --prod --dir=.
```

`netlify.toml` 自动生效。

### nginx (VPS / 自建)

`/etc/nginx/sites-available/rexpand`:

```nginx
server {
    listen 443 ssl http2;
    server_name rexpandcareer.com;
    root /var/www/rexpand;
    index index.html;

    # SPA fallback — unknown routes → index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Long cache for static media
    location /media/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location = /sitemap.xml {
        add_header Content-Type "application/xml; charset=utf-8";
    }

    # Security
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";
    add_header Referrer-Policy "strict-origin-when-cross-origin";
}

server {
    listen 80;
    server_name rexpandcareer.com www.rexpandcareer.com;
    return 301 https://rexpandcareer.com$request_uri;
}
```

### Apache shared hosting

把 `.htaccess` 放在 `public_html/` 根目录即可。

---

## 3. 域名 DNS 设置

| Record | Name | Value |
|---|---|---|
| A     | @   | (主机 IP) |
| CNAME | www | rexpandcareer.com |

对于 Vercel / Netlify / Cloudflare Pages，按它们 dashboard 给的 CNAME 配置即可。

---

## 4. SEO 上线后必做

### 4.1 提交搜索引擎

- **Google Search Console**: 添加 `rexpandcareer.com`，验证后提交 `/sitemap.xml`
- **Baidu 站长平台**: 同上 (https://ziyuan.baidu.com/)
- **Bing Webmaster**: https://www.bing.com/webmasters

### 4.2 验证富媒体卡片

- Google Rich Results: https://search.google.com/test/rich-results?url=https%3A%2F%2Frexpandcareer.com
- Facebook OG Debugger: https://developers.facebook.com/tools/debug/?q=https%3A%2F%2Frexpandcareer.com
- Twitter Card Validator: https://cards-dev.twitter.com/validator
- LinkedIn Post Inspector: https://www.linkedin.com/post-inspector/

### 4.3 移动端友好测试

- https://search.google.com/test/mobile-friendly
- 用真实手机访问每一页，检查 hamburger 菜单 + 横向滚动

### 4.4 性能 & Core Web Vitals

- https://pagespeed.web.dev/?url=https%3A%2F%2Frexpandcareer.com

---

## 5. 可选优化

### 把大图压缩 / 转 WebP

```bash
# 安装 cwebp 后批量转
for f in media/team/*.{jpg,png}; do
  cwebp -q 82 "$f" -o "${f%.*}.webp"
done
```

然后用 `<picture>` 标签同时支持 WebP + 兼容回退。当前的 `<img>` 直接用 jpg/png 已经足够，浏览器 + Cloudflare/Vercel 的 image optimizer 会自动转 WebP。

### CDN 前置

如果国内访问慢，建议套一层 Cloudflare 或腾讯云 CDN。
