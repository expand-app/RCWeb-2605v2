"""Create reviewable English drafts from public Chinese site copy and articles."""
from html.parser import HTMLParser
from pathlib import Path
from collections import OrderedDict
import json
import re
import sys

from english_translation_engine import translate

PAGES = {"page-home", "page-offer", "page-cases", "page-background", "page-resources", "page-about", "page-legal"}

class CopyParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.page = ""
        self.in_main = False
        self.skip = 0
        self.copy = OrderedDict()

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        for attr in ("alt", "title", "aria-label", "placeholder"):
            value = (attrs.get(attr) or "").strip()
            if re.search(r"[\u4e00-\u9fff]", value):
                self.copy[value] = None
        if tag == "main":
            self.in_main = True
            self.page = attrs.get("id", "") if attrs.get("id") in PAGES else ""
        if tag in ("script", "style"):
            self.skip += 1

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.skip = max(0, self.skip - 1)
        if tag == "main":
            self.page = ""
            self.in_main = False

    def handle_data(self, data):
        value = data.strip()
        if (self.page or not self.in_main) and not self.skip and re.search(r"[\u4e00-\u9fff]", value):
            self.copy[value] = None

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "i18n"
OUT.mkdir(exist_ok=True)
def draft(text):
    return translate(text)


class BodyTranslator(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.parts = []

    def handle_starttag(self, tag, attrs):
        self.parts.append(self.get_starttag_text())

    def handle_startendtag(self, tag, attrs):
        self.parts.append(self.get_starttag_text())

    def handle_endtag(self, tag):
        self.parts.append(f"</{tag}>")

    def handle_data(self, data):
        clean = data.strip()
        if clean and re.search(r"[\u4e00-\u9fff]", clean):
            start = len(data) - len(data.lstrip())
            end = len(data) - len(data.rstrip())
            self.parts.append(data[:start] + draft(clean) + (data[len(data)-end:] if end else ""))
        else:
            self.parts.append(data)

    def handle_entityref(self, name):
        self.parts.append(f"&{name};")

    def handle_charref(self, name):
        self.parts.append(f"&#{name};")


parser = CopyParser()
parser.feed((ROOT / "index.html").read_text())
copy = list(parser.copy)
static_path = OUT / "en.draft.json"
static = json.loads(static_path.read_text()) if static_path.exists() else {}
for i, text in enumerate(copy, 1):
    if text not in static:
        static[text] = draft(text)
    if i % 25 == 0:
        (OUT / "en.draft.json").write_text(json.dumps(static, ensure_ascii=False, indent=2) + "\n")
        print("Static", i, "/", len(copy), flush=True)
(OUT / "en.draft.json").write_text(json.dumps(static, ensure_ascii=False, indent=2) + "\n")

if '--static-only' in sys.argv:
    print("Static draft complete", len(static))
    raise SystemExit(0)

articles = json.loads((ROOT / "data/articles.json").read_text())
article_path = OUT / "articles.en.draft.json"
article_en = json.loads(article_path.read_text()) if article_path.exists() else {}
for i, article in enumerate(articles, 1):
    if article["slug"] in article_en:
        continue
    body = BodyTranslator()
    body.feed(article.get("body", ""))
    body.close()
    article_en[article["slug"]] = {
        "title": draft(article.get("title", "")),
        "dek": draft(article.get("dek", "")),
        "body": "".join(body.parts),
        "category": draft(article.get("category", "")),
        "tldr": [draft(x) for x in article.get("tldr", [])],
        "faq": [{"q": draft(x.get("q", "")), "a": draft(x.get("a", ""))} for x in article.get("faq", [])],
    }
    if i % 5 == 0:
        (OUT / "articles.en.draft.json").write_text(json.dumps(article_en, ensure_ascii=False, indent=2) + "\n")
        print("Articles", i, "/", len(articles), flush=True)
(OUT / "articles.en.draft.json").write_text(json.dumps(article_en, ensure_ascii=False, indent=2) + "\n")
print("Draft complete", len(static), len(article_en))
