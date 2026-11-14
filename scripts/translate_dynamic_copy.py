"""Generate a reviewable English text map for JS-driven background, case and replay content.

Run locally with Python 3.12, tree-sitter-javascript, and an installed Argos zh/en
model. The resulting map is merged with the static text map before publishing.
"""
from html.parser import HTMLParser
from pathlib import Path
import ast
import json
import re

from tree_sitter import Language, Parser
import tree_sitter_javascript
from english_translation_engine import translate

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = re.findall(r'<script(?:\s[^>]*)?>(.*?)</script>', (ROOT / 'index.html').read_text(), re.S)[-1]
SOURCE = SCRIPT.encode()
TREE = Parser(Language(tree_sitter_javascript.language())).parse(SOURCE).root_node


class TextCollector(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, value):
        value = value.strip()
        if re.search(r'[\u4e00-\u9fff]', value):
            self.parts.append(value)


def values(wanted=None):
    wanted = wanted or {'BG_DATA', 'CASES_DATA', 'REPLAYS'}
    nodes = [TREE]
    while nodes:
        node = nodes.pop()
        nodes.extend(node.children)
        if node.type != 'variable_declarator':
            continue
        name = node.child_by_field_name('name')
        if name is None or SOURCE[name.start_byte:name.end_byte].decode() not in wanted:
            continue
        value = node.child_by_field_name('value')
        pending = [value]
        while pending:
            child = pending.pop()
            pending.extend(child.children)
            if child.type != 'string':
                continue
            raw = SOURCE[child.start_byte:child.end_byte].decode(errors='replace')
            try:
                yield ast.literal_eval(raw)
            except (SyntaxError, ValueError):
                yield raw[1:-1]


def strings(value):
    if isinstance(value, str):
        collector = TextCollector()
        collector.feed(value)
        yield from collector.parts
    elif isinstance(value, list):
        for item in value:
            yield from strings(item)
    elif isinstance(value, dict):
        for item in value.values():
            yield from strings(item)


def script_strings():
    """Copy generated UI strings outside the article data blob."""
    article_range = None
    pending = [TREE]
    while pending:
        node = pending.pop()
        pending.extend(node.children)
        if node.type == 'variable_declarator':
            name = node.child_by_field_name('name')
            if name and SOURCE[name.start_byte:name.end_byte] == b'ARTICLES':
                value = node.child_by_field_name('value')
                article_range = (value.start_byte, value.end_byte)
                break
    pending = [TREE]
    while pending:
        node = pending.pop()
        if article_range and article_range[0] <= node.start_byte and node.end_byte <= article_range[1]:
            continue
        if node.type in ('string', 'string_fragment'):
            raw = SOURCE[node.start_byte:node.end_byte].decode(errors='replace')
            if node.type == 'string':
                try:
                    raw = ast.literal_eval(raw)
                except (SyntaxError, ValueError):
                    raw = raw[1:-1]
            yield raw
            continue
        pending.extend(node.children)


def main():
    path = ROOT / 'i18n/dynamic.en.draft.json'
    existing = json.loads(path.read_text()) if path.exists() else {}
    candidates = set(text for obj in values() for text in strings(obj))
    candidates.update(text for obj in script_strings() for text in strings(obj))
    # Replay detail text can contain line breaks that the HTML parser splits;
    # translate the complete field before the renderer turns them into <br>.
    candidates.update(text for text in values({'REPLAYS'}) if re.search(r'[\u4e00-\u9fff]', text))
    candidates = sorted(candidates, key=lambda s: (len(s), s))
    for i, text in enumerate(candidates, 1):
        if text not in existing:
            existing[text] = translate(text)
        if i % 25 == 0:
            path.write_text(json.dumps(existing, ensure_ascii=False, indent=2) + '\n')
            print('Dynamic', i, '/', len(candidates), flush=True)
    path.write_text(json.dumps(existing, ensure_ascii=False, indent=2) + '\n')
    print('Dynamic complete', len(existing))


if __name__ == '__main__':
    main()
