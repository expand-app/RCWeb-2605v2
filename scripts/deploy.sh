#!/usr/bin/env bash
#
# Deploy the static site to Aliyun OSS + refresh the CDN.
# Mirrors .github/workflows/deploy.yml so it can run locally or in CI.
#
# Usage:
#   scripts/deploy.sh [production|staging]   # default: production
#
# Required env (same keys as the GitHub Actions secrets):
#   ACCESS_KEY_ID       Aliyun AccessKey ID      (or OSS_ACCESS_KEY_ID)
#   ACCESS_KEY_SECRET   Aliyun AccessKey Secret  (or OSS_ACCESS_KEY_SECRET)
# Optional:
#   OSS_ENDPOINT        default: oss-cn-hangzhou.aliyuncs.com
#   ALIYUN_REGION       default: cn-hangzhou

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
    CDN_DOMAINS="https://www.rexpandcareer.com/ https://rexpandcareer.com/"
    ;;
  staging)
    OSS_BUCKET="staging-rexpand-official-website"
    CDN_DOMAINS="http://staging.rexpandcareer.com/"
    ;;
  *)
    die "unknown environment '$ENVIRONMENT' (expected: production | staging)"
    ;;
esac

# --- Resolve credentials ----------------------------------------------------
AK_ID="${ACCESS_KEY_ID:-${OSS_ACCESS_KEY_ID:-}}"
AK_SECRET="${ACCESS_KEY_SECRET:-${OSS_ACCESS_KEY_SECRET:-}}"
[ -n "$AK_ID" ]     || die "ACCESS_KEY_ID (or OSS_ACCESS_KEY_ID) is not set"
[ -n "$AK_SECRET" ] || die "ACCESS_KEY_SECRET (or OSS_ACCESS_KEY_SECRET) is not set"

command -v ossutil >/dev/null 2>&1 || die "ossutil not found. Install: curl https://gosspublic.alicdn.com/ossutil/install.sh | sudo bash"
command -v aliyun  >/dev/null 2>&1 || die "aliyun CLI not found. See: https://github.com/aliyun/aliyun-cli/releases"

log "Deploying to '$ENVIRONMENT'  (bucket: $OSS_BUCKET)"

# --- Stage deployable files -------------------------------------------------
log "Staging deployable files into dist/"
rm -rf dist
mkdir -p dist/media
cp index.html dist/
cp robots.txt dist/
cp sitemap.xml dist/
cp media/food.mp4 dist/media/
cp media/food-*.png dist/media/
cp media/meetfood-logo.png dist/media/
cp -r media/team dist/media/
echo "--- dist tree ---"
find dist -maxdepth 3 -type f | sort
du -sh dist

# --- Upload to OSS ----------------------------------------------------------
log "Uploading dist/ to oss://$OSS_BUCKET/"
ossutil config -e "$OSS_ENDPOINT" -i "$AK_ID" -k "$AK_SECRET"
ossutil cp -r -f ./dist/ "oss://$OSS_BUCKET/"

# --- Refresh CDN ------------------------------------------------------------
log "Refreshing Aliyun DCDN cache"
aliyun configure set \
  --profile AkProfile \
  --mode AK \
  --access-key-id "$AK_ID" \
  --access-key-secret "$AK_SECRET" \
  --region "$ALIYUN_REGION"

for domain in $CDN_DOMAINS; do
  echo "  refreshing ${domain}*"
  aliyun dcdn RefreshDcdnObjectCaches \
    --region "$ALIYUN_REGION" \
    --ObjectPath "${domain}*" \
    --ObjectType File
done

log "Done. Deployed '$ENVIRONMENT' to $OSS_BUCKET and requested CDN refresh."
