#!/usr/bin/env bash
#
# 发布前自检 —— 只读，不改任何文件、不碰 git 状态。
#
# 用法:  bash .claude/skills/deploy-aliyun/scripts/preflight.sh
#
# 检查这几件最容易让"本地好好的、线上却坏了"的事:
#   1. 本地是否落后 origin/main（落后就 push 不上去）
#   2. 改动清单（工作区 + 已提交未推送）
#   3. 新增/改动的图片是否在 deploy.yml 的打包白名单里 ← 最常见的坑
#   4. index.html 里的图片/视频引用能否找到真实文件
#   5. index.html 体积有没有异常缩水（防编辑事故）
#   6. index.html 改动会不会让部署脚本 og-pages.mjs 挂掉
#   7. 有没有手改自动生成的 data/*.json
#
# 退出码: 0 = 可以发布（可能有提醒）, 1 = 有阻塞问题

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$ROOT" || exit 1

RED=$'\033[31m'; YEL=$'\033[33m'; GRN=$'\033[32m'; DIM=$'\033[2m'; BOLD=$'\033[1m'; OFF=$'\033[0m'
FAIL=0; WARN=0

ok()   { printf '  %s✓%s %s\n' "$GRN" "$OFF" "$*"; }
warn() { printf '  %s!%s %s\n' "$YEL" "$OFF" "$*"; WARN=$((WARN+1)); }
bad()  { printf '  %s✗%s %s\n' "$RED" "$OFF" "$*"; FAIL=$((FAIL+1)); }
info() { printf '    %s%s%s\n' "$DIM" "$*" "$OFF"; }
head_() { printf '\n%s%s%s\n' "$BOLD" "$*" "$OFF"; }

[ -f index.html ] && [ -d .github/workflows ] || {
  printf '%s✗%s 没找到 index.html / .github —— 这个脚本要在 RCWeb-2605 仓库根目录跑\n' "$RED" "$OFF"
  exit 1
}

printf '%s发布前自检%s  %s(只读，不会改动任何东西)%s\n' "$BOLD" "$OFF" "$DIM" "$OFF"

# ── 1. 跟 origin/main 的关系 ────────────────────────────────────────────
head_ "1. 分支状态"
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
info "当前分支: $BRANCH"

if git fetch --quiet origin main 2>/dev/null; then
  BEHIND="$(git rev-list --count HEAD..origin/main 2>/dev/null || echo 0)"
  AHEAD="$(git rev-list --count origin/main..HEAD 2>/dev/null || echo 0)"
  if [ "$BEHIND" -gt 0 ]; then
    bad "落后 origin/main $BEHIND 个提交 —— 直接 push 会被拒"
    info "先跑: git pull --rebase origin main"
  else
    ok "跟 origin/main 同步"
  fi
  [ "$AHEAD" -gt 0 ] && info "本地有 $AHEAD 个提交还没推"
else
  warn "拉不到 origin（网络？）—— 跳过同步检查，push 时留意 non-fast-forward"
fi

[ "$BRANCH" != "main" ] && warn "不在 main 分支上。日常内容发布走 main；确认这是你想要的"

# ── 2. 改动清单 ────────────────────────────────────────────────────────
head_ "2. 这次要发布的改动"
# -uall: 新目录里的文件要逐个列出来，否则 git 只显示目录名，第 3 步就查不到新图片
CHANGED="$(git status --porcelain -uall | sed -E 's/^.{3}//' | sed 's/.* -> //' | tr -d '"')"
if git rev-parse --verify --quiet origin/main >/dev/null; then
  COMMITTED="$(git diff --name-only origin/main...HEAD 2>/dev/null)"
  CHANGED="$(printf '%s\n%s\n' "$CHANGED" "$COMMITTED")"
fi
CHANGED="$(printf '%s\n' "$CHANGED" | grep -v '^$' | sort -u)"

if [ -z "$CHANGED" ]; then
  warn "没有任何改动 —— 没东西可发布"
else
  printf '%s\n' "$CHANGED" | sed 's/^/    /'
fi

# ── 3. 图片是否在 deploy.yml 的打包白名单里 ─────────────────────────────
head_ "3. 新增/改动的资源文件会不会被上传"
DEPLOY_YML=".github/workflows/deploy.yml"
# 从 deploy.yml 的 Stage 步骤里反推白名单，这样改了 workflow 这里自动跟着变
CP_SRCS="$(sed -n '/Stage deployable files/,/Set environment variables/p' "$DEPLOY_YML" \
  | grep -oE 'cp (-r )?[A-Za-z0-9_./*-]+' | sed -E 's/^cp (-r )?//' | grep -v '^\$' | sort -u)"

ASSETS="$(printf '%s\n' "$CHANGED" | grep -E '^(media|public)/' || true)"
if [ -z "$ASSETS" ]; then
  info "这次没有改动 media/ 或 public/ 下的文件"
else
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    covered=0
    for S in $CP_SRCS; do
      Sd="${S%/.}"
      case "$f" in
        $S|"$Sd"/*) covered=1; break ;;
      esac
    done
    if [ "$covered" = 1 ]; then
      ok "$f"
    else
      bad "$f —— 不在 deploy.yml 的打包范围内，线上会 404"
      info "挪到 media/team/ 或 media/avatars/ 下，或在 deploy.yml 的 Stage 步骤加一行 cp"
    fi
  done <<< "$ASSETS"
fi

# ── 4. index.html 里的资源引用能否解析 ──────────────────────────────────
head_ "4. index.html 里的图片/视频引用"
MISSING=0
REFS="$(grep -oE '(src|href)="(/)?(media|og)/[^"]+"' index.html \
  | sed -E 's/^[^=]*="//; s/"$//; s/\?.*$//' | sort -u)"
while IFS= read -r p; do
  [ -z "$p" ] && continue
  case "$p" in
    /og/*)    f="public${p}" ;;
    og/*)     f="public/${p}" ;;
    /media/*) f="${p#/}" ;;
    *)        f="$p" ;;
  esac
  if [ ! -e "$f" ]; then
    bad "引用了不存在的文件: $p"
    MISSING=$((MISSING+1))
  fi
done <<< "$REFS"
TOTAL_REFS="$(printf '%s\n' "$REFS" | grep -c . || true)"
[ "$MISSING" = 0 ] && ok "$TOTAL_REFS 个引用全部指向真实文件"
[ "$MISSING" != 0 ] && info "注意 OSS 区分大小写，Foo.PNG ≠ foo.png"

# ── 5. index.html 体积 ─────────────────────────────────────────────────
head_ "5. index.html 完整性"
NOW="$(wc -c < index.html | tr -d ' ')"
if BASE="$(git cat-file -p origin/main:index.html 2>/dev/null | wc -c | tr -d ' ')" && [ "${BASE:-0}" -gt 0 ]; then
  PCT=$(( NOW * 100 / BASE ))
  if [ "$PCT" -lt 90 ]; then
    bad "比 origin/main 小了 $((100-PCT))%（${BASE} → ${NOW} 字节）—— 是不是误删了内容？"
    info "确认一下: git diff --stat origin/main -- index.html"
  else
    ok "体积正常（${NOW} 字节，origin/main 的 ${PCT}%）"
  fi
else
  info "拿不到 origin/main 的版本，跳过体积对比（当前 ${NOW} 字节）"
fi

if ! grep -q '</html>' index.html; then
  bad "文件末尾没有 </html> —— 文件很可能被截断了"
fi

# ── 6. index.html 里的 JS 语法 + 预渲染脚本 ────────────────────────────
head_ "6. index.html 能不能正常跑"
if ! printf '%s\n' "$CHANGED" | grep -q '^index\.html$'; then
  info "这次没改 index.html，跳过"
elif ! command -v node >/dev/null 2>&1; then
  warn "本机没有 node，跳过 JS 语法检查"
  info "语法错误不会让部署失败，但会让线上白屏 —— 装个 node 再发比较稳妥"
else
  # (a) 内联 JS 语法。这条最关键：语法错了部署照样绿灯，线上却是白屏。
  SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if OUT="$(node "$SELF_DIR/check-inline-js.mjs" index.html 2>&1)"; then
    ok "$(printf '%s' "$OUT" | tail -1)"
  else
    bad "内联 JS 有语法错误 —— 部署会成功，但线上页面会白屏"
    printf '%s\n' "$OUT" | sed 's/^/    /'
  fi

  # (b) 部署时会跑的预渲染脚本，本地先验一遍。只写 dist/（已 gitignore）。
  if OUT="$(node scripts/og-pages.mjs 2>&1)"; then
    ok "og-pages.mjs 跑通（$(printf '%s' "$OUT" | tail -1)）"
  else
    bad "og-pages.mjs 跑挂了 —— 部署会在同一步失败"
    printf '%s\n' "$OUT" | tail -5 | sed 's/^/    /'
    info "多半是 routeMeta / BG_ROUTE_META 那几段结构被改坏了"
  fi
fi

# ── 7. data/*.json 手改检查 ────────────────────────────────────────────
head_ "7. 自动生成的文件"
if printf '%s\n' "$CHANGED" | grep -q '^data/.*\.json$'; then
  if printf '%s\n' "$CHANGED" | grep -q '^index\.html$'; then
    info "data/*.json 跟着 index.html 一起改了，正常"
  else
    warn "只改了 data/*.json 没改 index.html"
    info "线上页面渲染的是 index.html，改 JSON 不会让页面变；且下次自动同步会覆盖掉"
  fi
else
  ok "没有手改 data/*.json"
fi

# ── 结论 ───────────────────────────────────────────────────────────────
printf '\n%s────────────────────────────%s\n' "$DIM" "$OFF"
if [ "$FAIL" -gt 0 ]; then
  printf '%s✗ %d 个问题要先解决%s' "$RED" "$FAIL" "$OFF"
  [ "$WARN" -gt 0 ] && printf '%s，%d 条提醒%s' "$YEL" "$WARN" "$OFF"
  printf '\n'
  exit 1
fi
if [ "$WARN" -gt 0 ]; then
  printf '%s✓ 没有阻塞问题%s，%s%d 条提醒自己判断一下%s\n' "$GRN" "$OFF" "$YEL" "$WARN" "$OFF"
else
  printf '%s✓ 全部通过%s\n' "$GRN" "$OFF"
fi
printf '%s下一步: python3 serve.py 8765 本地看一眼，确认没问题再 push%s\n' "$DIM" "$OFF"
exit 0
