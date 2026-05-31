#!/usr/bin/env python3
"""
One-time migration: inject sync-html markers + a tiny runtime fix into index.html.

After this runs, the Cloudflare Worker (worker/src/sync-html.js) can locate
each editable region by its marker comment and rewrite just that region.
Other edits to index.html stay untouched.

Markers added:
  HTML body markers (wrap card grids):
    <!-- @data:cases-cards:start --> ... <!-- @data:cases-cards:end -->
    <!-- @data:mentor-cards:start --> ... <!-- @data:mentor-cards:end -->
  JS markers (wrap data constants inside <script>):
    // @data:cases-data:start ... // @data:cases-data:end
    // @data:replays:start ... // @data:replays:end
    // @data:articles:start ... // @data:articles:end

Runtime fix added: after `const ARTICLES = [...];`, a small post-process loop
resolves placeholder image objects ({type, alt}) back to full {url, alt,
credit} via mkImg(). This lets the Worker store articles as plain JSON.

Idempotent: re-runs are no-ops once markers are in place.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "index.html"

ARTICLE_IMG_FIX = """
  // Resolve placeholder image objects ({type, alt}) back to full {url, alt, credit}
  // shape. Lets the admin save articles as plain JSON (data/articles.json).
  ARTICLES.forEach(function (a) {
    if (a && a.image && a.image.type && !a.image.url) {
      a.image = mkImg(a.image.type, a.image.alt);
    }
  });
"""


def patch(html: str) -> str:
    if "@data:cases-data:start" in html:
        print("  markers already present — no-op")
        return html

    out = html

    # 1) cases-data: single-line const CASES_DATA = {...};
    pattern = re.compile(r"^(const CASES_DATA\s*=.+?;)$", re.MULTILINE)
    m = pattern.search(out)
    if not m:
        raise SystemExit("failed: const CASES_DATA = ...; not found on its own line")
    out = pattern.sub(
        "  // @data:cases-data:start\n  \\1\n  // @data:cases-data:end",
        out,
        count=1,
    )

    # 2) cases-cards: wrap content of <div class="cases-grid">…</div>
    # We anchor on the opening tag, then put start marker right after it, and
    # end marker right before its matching closing tag.
    out = inject_html_wrap(out, '    <div class="cases-grid">', "cases-cards")

    # 3) mentor-cards: same idea on .mentor-grid
    out = inject_html_wrap(out, '    <div class="mentor-grid">', "mentor-cards")

    # 4) replays: const REPLAYS = [ ... ];
    out = inject_js_const_wrap(out, "REPLAYS", "replays")

    # 5) articles: const ARTICLES = [ ... ];
    out = inject_js_const_wrap(out, "ARTICLES", "articles")

    # 6) add the article image-fix loop right after the articles closing marker
    out = out.replace(
        "  // @data:articles:end",
        "  // @data:articles:end\n" + ARTICLE_IMG_FIX.rstrip("\n"),
        1,
    )

    return out


def inject_html_wrap(html: str, open_line: str, name: str) -> str:
    """Wrap the inner content of <div ...> ... </div> with HTML comment markers.
    Anchored on the literal opening line; uses a stack to find the matching </div>.
    """
    idx = html.find(open_line)
    if idx < 0:
        raise SystemExit(f"failed: anchor not found for {name}: {open_line!r}")
    # Find the end of this opening tag line
    line_end = html.index("\n", idx)

    # Now walk char-by-char from line_end+1, counting <div> opens vs </div> closes
    pos = line_end + 1
    depth = 1
    while depth > 0 and pos < len(html):
        next_open = html.find("<div", pos)
        next_close = html.find("</div>", pos)
        if next_close < 0:
            raise SystemExit(f"failed: no closing </div> for {name}")
        if next_open != -1 and next_open < next_close:
            depth += 1
            pos = next_open + 4
        else:
            depth -= 1
            close_at = next_close
            pos = next_close + 6
    # close_at points at the matching </div>; we want to inject end marker
    # immediately before the line containing that </div>.
    close_line_start = html.rfind("\n", 0, close_at) + 1

    start_marker = f"      <!-- @data:{name}:start -->\n"
    end_marker = f"      <!-- @data:{name}:end -->\n"

    return (
        html[: line_end + 1]
        + start_marker
        + html[line_end + 1 : close_line_start]
        + end_marker
        + html[close_line_start:]
    )


def inject_js_const_wrap(html: str, const_name: str, marker: str) -> str:
    """Find `const NAME = ...;` (possibly multi-line) and wrap with JS markers
    (// @data:marker:start, // @data:marker:end) on adjacent lines.

    Anchored on the opening line `const NAME = [` or `const NAME = {`; the
    closing is the first `];` or `};` at the same indentation level.
    """
    # Find opening line
    pat = re.compile(rf"^(\s*)const {const_name}\s*=\s*[\[\{{]", re.MULTILINE)
    m = pat.search(html)
    if not m:
        raise SystemExit(f"failed: const {const_name} = ... not found")
    indent = m.group(1)
    start_line_idx = m.start()
    # Find matching closing on its own line at the same indent
    close_pat = re.compile(rf"^{re.escape(indent)}[\]\}}];$", re.MULTILINE)
    cm = close_pat.search(html, m.end())
    if not cm:
        raise SystemExit(f"failed: closing of const {const_name} not found")
    # End of closing line
    end_line_end = cm.end()

    start_marker = f"{indent}// @data:{marker}:start\n"
    end_marker = f"\n{indent}// @data:{marker}:end"

    return (
        html[:start_line_idx]
        + start_marker
        + html[start_line_idx:end_line_end]
        + end_marker
        + html[end_line_end:]
    )


def main():
    original = INDEX.read_text()
    patched = patch(original)
    if patched == original:
        return
    INDEX.write_text(patched)
    print(f"  index.html: +{patched.count(chr(10)) - original.count(chr(10))} lines")


if __name__ == "__main__":
    main()
