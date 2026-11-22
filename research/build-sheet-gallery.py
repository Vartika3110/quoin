#!/usr/bin/env python3
"""A page for looking at what an extraction run actually produced.

    .venv/bin/python research/build-sheet-gallery.py research/data/sheets/<run>

Writes `gallery.html` beside the images it points at, so it opens
straight from disk with no server and nothing copied. A spreadsheet row
is the wrong place to judge a photograph — the thumbnail is 96px and
there is no way to scan a thousand of them — and this is the right one:
every picture at a usable size, grouped by brand, filterable by code or
name, with what the sheet believes about each one printed underneath.
"""

import html
import json
import sys
from pathlib import Path

CSS = """
:root { --bg:#fff; --fg:#111; --muted:#666; --line:#e5e5e5; --card:#fff; }
@media (prefers-color-scheme: dark) { :root:not([data-theme=light]) {
  --bg:#141414; --fg:#f0f0f0; --muted:#9a9a9a; --line:#2e2e2e; --card:#1d1d1d; } }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--fg);
  font:14px/1.45 ui-sans-serif,-apple-system,Segoe UI,Roboto,sans-serif; }
header { position:sticky; top:0; background:var(--bg); border-bottom:1px solid var(--line);
  padding:14px 16px; z-index:5; }
h1 { font-size:17px; margin:0 0 10px; font-weight:600; }
.controls { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
input[type=search] { flex:1; min-width:200px; padding:7px 10px; border:1px solid var(--line);
  border-radius:7px; background:var(--card); color:var(--fg); font-size:14px; }
button { padding:7px 11px; border:1px solid var(--line); border-radius:7px;
  background:var(--card); color:var(--fg); cursor:pointer; font-size:13px; }
button[aria-pressed=true] { background:var(--fg); color:var(--bg); border-color:var(--fg); }
#count { color:var(--muted); font-size:13px; }
main { padding:16px; display:grid; gap:14px;
  grid-template-columns:repeat(auto-fill,minmax(190px,1fr)); }
figure { margin:0; border:1px solid var(--line); border-radius:9px; overflow:hidden;
  background:var(--card); }
figure img { display:block; width:100%; height:180px; object-fit:contain; background:#fff; }
figcaption { padding:8px 9px; border-top:1px solid var(--line); }
.code { font-weight:600; font-size:13px; word-break:break-all; }
.name { color:var(--muted); font-size:12px; margin-top:2px;
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.meta { color:var(--muted); font-size:11px; margin-top:5px; }
.flag { color:#b45309; }
@media (max-width:420px) { main { grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); padding:16px; } }
"""

JS = """
const cards = [...document.querySelectorAll('figure')];
const search = document.getElementById('q');
const count = document.getElementById('count');
let brand = '';
function apply() {
  const q = search.value.trim().toLowerCase();
  let shown = 0;
  for (const c of cards) {
    const ok = (!brand || c.dataset.brand === brand) &&
               (!q || c.dataset.find.includes(q));
    c.hidden = !ok;
    if (ok) shown++;
  }
  count.textContent = shown.toLocaleString() + ' shown';
}
search.addEventListener('input', apply);
for (const b of document.querySelectorAll('[data-pick]')) {
  b.addEventListener('click', () => {
    brand = b.dataset.pick;
    for (const o of document.querySelectorAll('[data-pick]'))
      o.setAttribute('aria-pressed', String(o === b));
    apply();
  });
}
apply();
"""


def build(run_dir):
    run_dir = Path(run_dir)
    rows = json.load(open(run_dir / "catalogue-extract.json"))["rows"]
    brands = sorted({r["brand"] for r in rows})

    parts = [
        "<!doctype html><html lang=en><meta charset=utf-8>",
        "<meta name=viewport content='width=device-width,initial-scale=1'>",
        f"<title>Catalogue extraction — {run_dir.name}</title>",
        f"<style>{CSS}</style>",
        "<header><h1>Extracted product photography "
        f"<span id=count></span></h1><div class=controls>",
        "<input id=q type=search placeholder='Filter by code, name or series'>",
        "<button data-pick='' aria-pressed=true>All</button>",
    ]
    for b in brands:
        n = sum(1 for r in rows if r["brand"] == b)
        parts.append(
            f"<button data-pick='{html.escape(b)}'>{html.escape(b)} ({n})</button>"
        )
    parts.append("</div></header><main>")

    for r in rows:
        price = r["cataloguePricePaise"]
        price_text = f"₹{price / 100:,.0f}" if price else "no price"
        find = " ".join(
            filter(None, [r["code"], r["name"], r.get("series"), r["brand"]])
        ).lower()
        notes = r.get("notes") or ""
        flag = (
            f"<div class='meta flag'>{html.escape(notes[:70])}</div>" if notes else ""
        )
        parts.append(
            f"<figure data-brand='{html.escape(r['brand'])}' "
            f"data-find='{html.escape(find)}'>"
            f"<img loading=lazy src='images/{html.escape(r['image'])}' "
            f"alt='{html.escape(r['name'][:80])}'>"
            f"<figcaption><div class=code>{html.escape(r['code'])}</div>"
            f"<div class=name>{html.escape(r['name'][:90])}</div>"
            f"<div class=meta>{html.escape(r['brand'])} · p{r['page']} · "
            f"{price_text} · {r.get('photography') or '-'}</div>"
            f"{flag}</figcaption></figure>"
        )

    parts.append(f"</main><script>{JS}</script></html>")
    out = run_dir / "gallery.html"
    out.write_text("".join(parts))
    print(f"{len(rows)} pictures -> {out}")
    return out


if __name__ == "__main__":
    build(sys.argv[1] if len(sys.argv) > 1 else "research/data/sheets/2026-11-18-clean")
