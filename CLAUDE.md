# 项目协作约定

## 语言
- **始终使用简体中文**与用户交流(包括状态更新、说明、总结、提交后的汇报等)。
- **不要使用日语**,也不要中日混用。涉及代码、技术术语、英文专有名词时可保留英文原文。

## 站点结构
- 本站是单文件 SPA:`index.html`(内联 CSS + 路由脚本),通过 `.page.active` 切换多个 `<main class="page" id="page-...">`。
- 头像等静态资源放在 `media/`(头像在 `media/avatars/`),由 `.github/workflows/deploy.yml` 打包部署到 OSS。
- 修改图片引用时使用本地路径 `/media/avatars/...`,不要再用旧的 `_next/static/media/` 远程路径。

## 部署
- 部署通过合并到 `main` 触发(GitHub Actions),完成后机器人会在 PR 上回评部署结果。
- 改动静态资源后,记得在 deploy.yml 的 "Stage deployable files" 步骤中确认对应目录已被打包。
