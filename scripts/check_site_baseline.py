#!/usr/bin/env python3
"""Stop the production deploy if an older marketing-page snapshot is committed."""
from pathlib import Path
import json
import re
import sys

root = Path(__file__).resolve().parents[1]
html = (root / "index.html").read_text(encoding="utf-8")
errors = []
required = {
    "SAR 首页": "SAR · 核心求职服务",
    "完整服务图": "Full Service Map.",
    "智能搜岗": "Job Smart Search Service",
    "岗位投递": "Application Service",
    "Hiring Team 内推": "Hiring Team Referral Service",
    "四档套餐": "四种服务计划",
}
for name, marker in required.items():
    if marker not in html:
        errors.append(f"缺少新版页面内容：{name}")
start = html.find('<!-- ============ 6. PACKAGE COMPARISON ============ -->')
end = html.find('<!-- ============ 7. CTA ============ -->', start)
if start < 0 or end < 0:
    errors.append("找不到套餐对比区，停止发布")
else:
    table = html[start:end]
    for marker in ("黄金计划", "白银计划", "CPT/OPT支持", "价格"):
        if marker in table:
            errors.append(f"旧套餐内容重新出现：{marker}")
for marker in ("按合同退款", "保Offer", "保 Offer", "OUTCOME GUARANTEE"):
    if marker in html:
        errors.append(f"旧承诺文案重新出现：{marker}")
try:
    articles = json.loads((root / "data/articles.json").read_text(encoding="utf-8"))
    data_slugs = [article["slug"] for article in articles]
    article_start = html.index("// @data:articles:start")
    article_end = html.index("// @data:articles:end", article_start)
    page_slugs = re.findall(r"[\"']?slug[\"']?\s*:\s*[\"']([^\"']+)[\"']", html[article_start:article_end])
    if (len(data_slugs) != len(set(data_slugs))
            or len(page_slugs) != len(set(page_slugs))
            or len(data_slugs) != len(page_slugs)
            or set(data_slugs) != set(page_slugs)):
        errors.append("index.html 与 data/articles.json 的文章清单不一致")
except (OSError, ValueError, KeyError) as exc:
    errors.append(f"无法核对文章清单：{exc}")
if errors:
    for error in errors:
        print("BLOCK:", error, file=sys.stderr)
    sys.exit(1)
print("官网新版页面与文章数据检查通过")
