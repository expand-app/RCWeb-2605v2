#!/usr/bin/env python3
"""
One-time extractor: index.html → data/*.json snapshots.

Phase 0 of the admin migration. Pulls the currently-hardcoded site data out of
index.html into structured JSON files so the (Phase 1) admin can read & write
them via a Cloudflare Worker + GitHub API.

Re-run only when you change index.html outside the admin and want the JSON
snapshot to catch up. The admin (Phase 1) writes JSON directly and propagates
to index.html, so day-to-day operations never run this.

Usage:
    python3 scripts/extract_data.py

Writes:
    data/cases.json      (63 student cases)
    data/mentors.json    (23 mentors with optional videos)
    data/replays.json    ( 3 Pueblo-style mock interview replays)
    data/articles.json   (55 industry/career articles)
"""
import re, json, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HTML = (ROOT / "index.html").read_text()


def _balanced(start_open, open_ch, close_ch):
    """Return slice [open_ch ... matching close_ch] starting at HTML[start_open],
    correctly skipping over single-quote, double-quote, and template-literal strings."""
    depth = 0
    i = start_open
    in_str = False
    str_ch = None
    in_tpl = False
    esc = False
    while i < len(HTML):
        c = HTML[i]
        if esc:
            esc = False
        elif in_tpl:
            if c == "\\": esc = True
            elif c == "`": in_tpl = False
        elif in_str:
            if c == "\\": esc = True
            elif c == str_ch: in_str = False
        else:
            if c in '"\'':
                in_str = True; str_ch = c
            elif c == "`":
                in_tpl = True
            elif c == open_ch:
                depth += 1
            elif c == close_ch:
                depth -= 1
                if depth == 0:
                    return HTML[start_open : i + 1]
        i += 1
    raise ValueError("unbalanced")


def _node_parse(literal: str, prelude: str = "") -> object:
    """Parse a JS literal via Node (handles unquoted keys, template literals, helpers)."""
    js = f"{prelude}\nmodule.exports = {literal};"
    tmp = Path("/tmp/_extract_data.js")
    tmp.write_text(js)
    r = subprocess.run(
        ["node", "-e", f'console.log(JSON.stringify(require("{tmp}")))'],
        capture_output=True, text=True, timeout=30,
    )
    if r.returncode != 0:
        raise RuntimeError(r.stderr)
    return json.loads(r.stdout)


# --- 1) Cases: merge CASES_DATA (JS dict) with name_label + quote (from .case-card HTML) ---
def extract_cases():
    m = re.search(r"const CASES_DATA\s*=\s*(\{[^\n]*?\});", HTML)
    base = json.loads(m.group(1))  # already strict JSON
    out = []
    for cid, fields in base.items():
        card = re.search(
            r'<div class="case-card"[^>]*data-case="' + cid + r'"[\s\S]*?'
            r'<div class="cc-name">([^<]+)</div>[\s\S]*?'
            r'<div class="cc-quote(?:[^"]*)">([^<]+)</div>',
            HTML,
        )
        if card:
            name_label = card.group(1).strip()
            quote = (card.group(2).strip()
                     .replace("&quot;", '"').replace("&amp;", "&")
                     .replace("&lt;", "<").replace("&gt;", ">"))
        else:
            name_label = fields["avatar"] + " 同学"
            quote = ""
        out.append({"id": cid, **fields, "name_label": name_label, "quote": quote})
    return out


# --- 2) Mentors: 23 .mentor-card divs ---
def extract_mentors():
    start = HTML.find('<div class="mentor-card')
    end = HTML.find("</section>", start)
    section = HTML[start : end if end > 0 else start + 30000]
    chunks = re.split(r'<div class="mentor-card', section)
    mentors = []
    for ch in chunks:
        if not ch.strip(): continue
        head = re.match(r'([^"]*)"(?:\s+data-video="([^"]+)")?\s*>', ch)
        if not head: continue
        video = head.group(2) or None
        body = ch[head.end():]
        avatar = re.search(r'<img src="([^"]+)"\s+alt="([^"]+)"', body)
        name = re.search(r'<div class="name">([^<]+)<span class="role">/\s*([^<]+)</span></div>', body)
        company = re.search(r'<div class="company">([\s\S]*?)</div>', body)
        ul = re.search(r'<ul class="focus-list">([\s\S]*?)</ul>', body)
        focus = re.findall(r"<li>([^<]+)</li>", ul.group(1)) if ul else []
        if not (name and company): continue
        parts = re.split(r"<br>", company.group(1).strip(), 1)
        mentors.append({
            "name": name.group(1).strip(),
            "role_title": name.group(2).strip(),
            "avatar_src": avatar.group(1).strip() if avatar else None,
            "company": parts[0].strip(),
            "company_sub": parts[1].strip() if len(parts) > 1 else "",
            "focus": [t.strip() for t in focus],
            "video_url": video,
            "has_video": bool(video),
        })
    return mentors


# --- 3) Replays: the REPLAYS = [ ... ]; JS array (3 real entries, 7 commented placeholders) ---
def extract_replays():
    m = re.search(r"const REPLAYS\s*=\s*\[", HTML)
    arr_lit = _balanced(m.end() - 1, "[", "]")
    return _node_parse(arr_lit)


# --- 4) Articles: ARTICLES = [ ... ]; uses mkImg() helper + template literals ---
def extract_articles():
    m = re.search(r"const ARTICLES\s*=\s*\[", HTML)
    arr_lit = _balanced(m.end() - 1, "[", "]")
    return _node_parse(arr_lit, prelude="const mkImg=(t,a)=>({type:t,alt:a});")


def main():
    data_dir = ROOT / "data"
    data_dir.mkdir(exist_ok=True)
    for name, fn in [
        ("cases", extract_cases),
        ("mentors", extract_mentors),
        ("replays", extract_replays),
        ("articles", extract_articles),
    ]:
        items = fn()
        path = data_dir / f"{name}.json"
        # Match Worker's JSON.stringify(..., null, 2) + "\n" exactly so the
        # auto-sync workflow doesn't trip over a 1-byte trailing-newline diff
        # and create a churn-commit on every push.
        path.write_text(json.dumps(items, ensure_ascii=False, indent=2) + "\n")
        print(f"  data/{name}.json  ← {len(items)} 条")


if __name__ == "__main__":
    main()
