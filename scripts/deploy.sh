#!/usr/bin/env bash
#
# Deploy the static site to Aliyun OSS + refresh the edge cache.
# Mirrors .github/workflows/deploy.yml so it can run locally or in CI.
#
# Usage:
#   scripts/deploy.sh [production]   # default: production
#
# Required env (same keys as the GitHub Actions secrets):
#   ACCESS_KEY_ID       Aliyun AccessKey ID      (or OSS_ACCESS_KEY_ID)
#   ACCESS_KEY_SECRET   Aliyun AccessKey Secret  (or OSS_ACCESS_KEY_SECRET)
# Optional:
#   OSS_ENDPOINT        default: oss-cn-hangzhou.aliyuncs.com
#   ALIYUN_REGION       default: cn-hangzhou
# Required:
#   ESA_SITE_ID         ESA site to purge after publishing

set -euo pipefail

ENVIRONMENT="${1:-production}"
OSS_ENDPOINT="${OSS_ENDPOINT:-oss-cn-hangzhou.aliyuncs.com}"
ALIYUN_REGION="${ALIYUN_REGION:-cn-hangzhou}"

# Run from the repo root regardless of where the script is invoked.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

log() { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

# --- Resolve target ---------------------------------------------------------
case "$ENVIRONMENT" in
  production)
    OSS_BUCKET="rexpand-official-website"
    [ -n "${ESA_SITE_ID:-}" ] || die "ESA_SITE_ID is required for production"
    ;;
  *)
    die "unknown environment '$ENVIRONMENT' (only production is supported)"
    ;;
esac

# --- Resolve credentials ----------------------------------------------------
AK_ID="${ACCESS_KEY_ID:-${OSS_ACCESS_KEY_ID:-}}"
AK_SECRET="${ACCESS_KEY_SECRET:-${OSS_ACCESS_KEY_SECRET:-}}"
[ -n "$AK_ID" ]     || die "ACCESS_KEY_ID (or OSS_ACCESS_KEY_ID) is not set"
[ -n "$AK_SECRET" ] || die "ACCESS_KEY_SECRET (or OSS_ACCESS_KEY_SECRET) is not set"

command -v ossutil >/dev/null 2>&1 || die "ossutil not found. Install: curl https://gosspublic.alicdn.com/ossutil/install.sh | sudo bash"
command -v aliyun  >/dev/null 2>&1 || die "aliyun CLI not found. See: https://github.com/aliyun/aliyun-cli/releases"
command -v node    >/dev/null 2>&1 || die "node not found"
python3 -c 'from PIL import Image' >/dev/null 2>&1 || die "Pillow not found. Install scripts/image-optimizer-requirements.txt in a Python environment."

log "Deploying to '$ENVIRONMENT'  (bucket: $OSS_BUCKET)"

# --- Stage deployable files -------------------------------------------------
log "Staging deployable files into dist/"
rm -rf dist
mkdir -p dist/media
cp index.html dist/
cp email.html dist/
cp robots.txt dist/
cp sitemap.xml dist/
cp media/food.mp4 dist/media/
cp media/food-*.png dist/media/
cp media/meetfood-logo.png dist/media/
cp -r media/team dist/media/
cp -r media/avatars dist/media/
mkdir -p dist/og
cp -r public/og/. dist/og/
node scripts/og-pages.mjs
python3 scripts/optimize-deploy-images.py dist
python3 scripts/build-card-thumbnails.py dist
echo "--- dist tree ---"
find dist -maxdepth 3 -type f | sort
du -sh dist

# --- Upload to OSS ----------------------------------------------------------
log "Uploading dist/ to oss://$OSS_BUCKET/"
ossutil config -e "$OSS_ENDPOINT" -i "$AK_ID" -k "$AK_SECRET"
ossutil cp -r -f ./dist/ "oss://$OSS_BUCKET/"
ossutil cp -r -f --include "*.html" --meta "Cache-Control:no-cache" ./dist/ "oss://$OSS_BUCKET/"
ossutil cp -r -f --meta "Content-Type:text/html; charset=utf-8#Cache-Control:no-cache" ./dist-clean-root/ "oss://$OSS_BUCKET/"
ossutil cp -r -f --meta "Content-Type:text/html; charset=utf-8#Cache-Control:no-cache" ./dist-clean-nested/ "oss://$OSS_BUCKET/"

# --- Refresh edge cache -----------------------------------------------------
aliyun configure set \
  --profile AkProfile \
  --mode AK \
  --access-key-id "$AK_ID" \
  --access-key-secret "$AK_SECRET" \
  --region "$ALIYUN_REGION"

log "Refreshing ESA cache"
aliyun esa PurgeCaches \
  --force --method POST --version 2024-09-10 \
  --endpoint esa.cn-hangzhou.aliyuncs.com \
  --SiteId "$ESA_SITE_ID" --Type directory \
  --Content '{"Directories":["https://www.rexpandcareer.com/","https://rexpandcareer.com/"]}'

log "Done. Deployed '$ENVIRONMENT' to $OSS_BUCKET and requested edge cache refresh."
