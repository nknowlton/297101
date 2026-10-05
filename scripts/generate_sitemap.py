#!/usr/bin/env python3
from pathlib import Path
from urllib.parse import quote

root = Path("_site")
urls = []
for page in sorted(root.rglob("*.html")):
    rel = page.relative_to(root).as_posix()
    lower = rel.lower()
    if any(token in lower for token in ("_guide", "-sols", "/solutions/", "/answers/")):
        continue
    if rel.endswith("index.html"):
        rel = rel[:-10]
    urls.append("https://knowlton.co.nz/297101/" + quote(rel, safe="/"))

lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    *[f"  <url><loc>{url}</loc></url>" for url in urls],
    "</urlset>",
    "",
]
(root / "sitemap.xml").write_text("\n".join(lines), encoding="utf-8")
