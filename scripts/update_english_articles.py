"""Update machine-translated English article drafts after admin article saves.

Keeps translations in a separate file, so webadmin's marked index.html rewrite
cannot overwrite them. Existing translations survive unless their Chinese source
changes; deleted Chinese articles are removed from the English index.
"""
from hashlib import sha256
from html.parser import HTMLParser
from html import escape
from pathlib import Path
import json
import re

import argostranslate.package
import argostranslate.translate
import stanza

_pipeline = stanza.Pipeline
def _offline_pipeline(*args, **kwargs):
    kwargs.setdefault("download_method", stanza.DownloadMethod.REUSE_RESOURCES)
    return _pipeline(*args, **kwargs)
stanza.Pipeline = _offline_pipeline

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data/articles.json"
TARGET = ROOT / "i18n/articles.en.json"
FIELDS = ("title", "dek", "body", "category", "tldr", "faq", "image", "hero", "sources", "keywords")


def translation_engine():
    engine = argostranslate.translate.get_translation_from_codes("zh", "en")
    if engine is None:
        argostranslate.package.update_package_index()
        package = next(p for p in argostranslate.package.get_available_packages()
                       if p.from_code == "zh" and p.to_code == "en")
        argostranslate.package.install_from_path(package.download())
        engine = argostranslate.translate.get_translation_from_codes("zh", "en")
    return engine


ENGINE = translation_engine()


def draft(text):
    if not isinstance(text, str) or not re.search(r"[\u4e00-\u9fff]", text):
        return text
    translated = ENGINE.translate(text)
    if "内推" in text:
        translated = re.sub(r"(?i)\b(?:introverts?|introspection|introspective|inner push|internal push|inner thrust|inside push|inner press)\b", "referral", translated)
    return translated


class BodyTranslator(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.parts = []

    def handle_starttag(self, tag, attrs):
        self.parts.append(self.translate_attributes(self.get_starttag_text()))

    def handle_startendtag(self, tag, attrs):
        self.parts.append(self.translate_attributes(self.get_starttag_text()))

    @staticmethod
    def translate_attributes(markup):
        return re.sub(r'\b(alt|title|aria-label)="([^"]*)"',
                      lambda match: f'{match.group(1)}="{escape(draft(match.group(2)), quote=True)}"', markup)

    def handle_endtag(self, tag):
        self.parts.append(f"</{tag}>")

    def handle_data(self, value):
        clean = value.strip()
        if re.search(r"[\u4e00-\u9fff]", clean):
            left = len(value) - len(value.lstrip())
            right = len(value) - len(value.rstrip())
            self.parts.append(value[:left] + draft(clean) + (value[-right:] if right else ""))
        else:
            self.parts.append(value)

    def handle_entityref(self, name):
        self.parts.append(f"&{name};")

    def handle_charref(self, name):
        self.parts.append(f"&#{name};")


def fingerprint(article):
    content = {key: article.get(key) for key in FIELDS}
    return sha256(json.dumps(content, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def translate_article(article, source_hash):
    body = BodyTranslator()
    body.feed(article.get("body", ""))
    body.close()
    return {
        "sourceHash": source_hash,
        "title": draft(article.get("title", "")),
        "dek": draft(article.get("dek", "")),
        "body": "".join(body.parts),
        "category": draft(article.get("category", "")),
        "imageAlt": draft((article.get("image") or {}).get("alt", "")),
        "hero": {**article["hero"], "cap": draft(article["hero"].get("cap", ""))}
                if article.get("hero") else None,
        "sourceTitles": [draft(item.get("title", "")) for item in article.get("sources", [])],
        "keywords": [draft(item) for item in article.get("keywords", [])],
        "tldr": [draft(item) for item in article.get("tldr", [])],
        "faq": [{"q": draft(item.get("q", "")), "a": draft(item.get("a", ""))}
                for item in article.get("faq", [])],
    }


def main():
    articles = json.loads(SOURCE.read_text())
    existing = json.loads(TARGET.read_text()) if TARGET.exists() else {}
    result = {}
    translated_count = 0
    for article in articles:
        slug = article["slug"]
        source_hash = fingerprint(article)
        if existing.get(slug, {}).get("sourceHash") == source_hash:
            result[slug] = existing[slug]
        else:
            result[slug] = translate_article(article, source_hash)
            translated_count += 1
            print(f"Translated {translated_count}: {slug}", flush=True)
    TARGET.parent.mkdir(exist_ok=True)
    TARGET.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(f"English articles: {len(result)}; new or changed: {translated_count}")


if __name__ == "__main__":
    main()
