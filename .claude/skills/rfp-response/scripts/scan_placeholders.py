#!/usr/bin/env python3
"""Count what is still unfinished in a bid package.

Looks in .docx, .xlsx, .md and .txt files for:
  [[FILL: ...]]   a fact or decision the owner still has to supply
  {{key}}         a token nobody resolved
  lorem / TBD / XXX / "INSERT"   leftovers from templates

Exit status 1 if anything is found (use --report-only to always exit 0). A package is
not ready to upload while this exits 1 -- that is the gate, not a suggestion.

Usage: scan_placeholders.py DIR_OR_FILE [...] [--report-only] [--json out.json]
Requires: python-docx, openpyxl (only for the formats you scan).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import zipfile
from pathlib import Path

PATTERNS = {
    "fill": re.compile(r"\[\[(.*?)\]\]", re.S),
    "token": re.compile(r"\{\{\s*[A-Za-z0-9_.\[\]-]+\s*\}\}"),
    "leftover": re.compile(r"\b(lorem ipsum|TBD|XXX+)\b|\bINSERT [A-Z ]{4,}", re.I),
}


def text_of(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix in {".md", ".txt", ".yaml", ".yml"}:
        return path.read_text(encoding="utf8", errors="replace")
    if suffix == ".docx":
        with zipfile.ZipFile(path) as z:
            parts = [n for n in z.namelist() if re.match(r"word/(document|header\d*|footer\d*)\.xml", n)]
            xml = "\n".join(z.read(n).decode("utf8", "replace") for n in parts)
        xml = re.sub(r"</w:p>", "\n", xml)
        return re.sub(r"<[^>]+>", "", xml)
    if suffix == ".xlsx":
        import openpyxl
        wb = openpyxl.load_workbook(path, data_only=False)
        out = []
        for ws in wb.worksheets:
            for row in ws.iter_rows():
                for c in row:
                    if isinstance(c.value, str):
                        out.append(c.value)
        return "\n".join(out)
    return ""


QUOTED = re.compile(r'["\u201c][^"\u201c\u201d\n]{0,300}["\u201d]')


def quoted_spans(text: str) -> list[tuple[int, int]]:
    return [(m.start(), m.end()) for m in QUOTED.finditer(text)]


def scan(path: Path) -> dict:
    text = text_of(path)
    spans = quoted_spans(text)
    found = {}
    for k, rx in PATTERNS.items():
        hits = []
        for m in rx.finditer(text):
            # A template left-over inside quotation marks is the solicitation's own blank being
            # quoted back ("an amount not to exceed INSERT AMOUNT OF CONTRACT LIMIT"), not ours.
            if k == "leftover" and any(a <= m.start() < b for a, b in spans):
                continue
            hits.append(m.group(0).strip())
        found[k] = hits
    return {"file": str(path), **{k: v for k, v in found.items()}, "total": sum(len(v) for v in found.values())}


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("paths", nargs="+")
    ap.add_argument("--report-only", action="store_true")
    ap.add_argument("--json")
    args = ap.parse_args(argv)

    files: list[Path] = []
    for p in map(Path, args.paths):
        if p.is_dir():
            files += sorted(q for q in p.rglob("*") if q.suffix.lower() in {".docx", ".xlsx", ".md", ".txt"} and not q.name.startswith("~$"))
        elif p.exists():
            files.append(p)
        else:
            print(f"not found: {p}", file=sys.stderr)
            return 2

    results = [scan(f) for f in files]
    grand = 0
    print(f"{'file':64} {'FILL':>5} {'token':>6} {'left':>5}")
    for r in results:
        grand += r["total"]
        print(f"{Path(r['file']).name[:64]:64} {len(r['fill']):>5} {len(r['token']):>6} {len(r['leftover']):>5}")
    print(f"\nfiles scanned: {len(results)}   unfinished items: {grand}")
    if args.json:
        Path(args.json).write_text(json.dumps(results, indent=2), encoding="utf8")
    return 0 if (args.report_only or grand == 0) else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
