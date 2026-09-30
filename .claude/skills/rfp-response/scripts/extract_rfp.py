#!/usr/bin/env python3
"""Turn a solicitation .docx into text you can trust, and list what text can't show you.

A solicitation is rarely just paragraphs. Forms hide in text boxes, the certificate you
must sign is a scanned image, headers carry leftovers from last year's RFP, and the table
of contents promises attachments that are not in the file. This script produces:

  OUT/rfp.txt          body in document order: paragraphs, tables as  a | b | c  rows,
                       text boxes as  [TEXTBOX] ... , headers/footers at the end
  OUT/inventory.json   dates and times, URLs, emails, phones, dollar figures, RFP numbers
                       seen, images (with the text that precedes each), header/footer text,
                       and contents-list entries with no body text behind them
  OUT/media/           every embedded image; single-bitmap EMF files are converted to PNG

Usage: extract_rfp.py SOLICITATION.docx OUT_DIR
Requires: python-docx, pillow.  (PDF rendering is separate: soffice --headless --convert-to pdf)
"""
from __future__ import annotations

import json
import re
import struct
import sys
import zipfile
from pathlib import Path

import docx
from docx.oxml.ns import qn
from docx.table import Table
from docx.text.paragraph import Paragraph

MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December"
DATE_RE = re.compile(rf"\b(?:{MONTHS}|Ocotber|Septmber)\s+\d{{1,2}}(?:st|nd|rd|th)?,?\s+\d{{4}}\b", re.I)
TIME_RE = re.compile(r"\b\d{1,2}:\d{2}\s*(?:a\.?m\.?|p\.?m\.?)\b", re.I)
URL_RE = re.compile(r"https?://[^\s)>\]]+")
EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
PHONE_RE = re.compile(r"\(\d{3}\)\s*\d{3}-\d{4}")
MONEY_RE = re.compile(r"\$\s?\d[\d,]*(?:\.\d+)?")
RFPNO_RE = re.compile(r"\b(?:RFP|RFQ|IFB|ITB)[\s#-]*\d{4}-\d+\b", re.I)


def iter_blocks(document):
    body = document.element.body
    for child in body.iterchildren():
        if child.tag == qn("w:p"):
            yield Paragraph(child, document)
        elif child.tag == qn("w:tbl"):
            yield Table(child, document)


def textbox_texts(par) -> list[str]:
    out, last = [], None
    for box in par._p.iter(qn("w:txbxContent")):
        lines = []
        for p in box.iter(qn("w:p")):
            t = "".join(x.text or "" for x in p.iter(qn("w:t"))).strip()
            if t:
                lines.append(t)
        block = "\n".join(lines)
        if block and block != last:  # Word stores Choice + Fallback copies; keep one
            out.append(block)
        last = block
    return out


def table_rows(tbl) -> list[str]:
    rows = []
    for r in tbl.rows:
        seen, cells = set(), []
        for c in r.cells:
            if id(c._tc) in seen:
                continue
            seen.add(id(c._tc))
            cells.append(c.text.strip().replace("\n", " / "))
        rows.append(" | ".join(cells))
    return rows


def emf_to_png(data: bytes, dest: Path) -> bool:
    """Extract the single STRETCHDIBITS bitmap many scanned-form EMFs wrap."""
    try:
        from PIL import Image
        off = 0
        while off + 8 <= len(data):
            rtype, size = struct.unpack_from("<II", data, off)
            if rtype == 81 and size:  # EMR_STRETCHDIBITS
                v = struct.unpack_from("<4i6i4I2I2i", data, off + 8)
                off_bmi, cb_bmi, off_bits, cb_bits = v[10:14]
                bmi = data[off + off_bmi: off + off_bmi + cb_bmi]
                _, w, h, _, bpp, comp = struct.unpack_from("<IiiHHI", bmi, 0)
                mode = {32: "BGRX", 24: "BGR"}.get(bpp)
                if comp != 0 or not mode:
                    return False
                stride = (w * bpp // 8 + 3) // 4 * 4
                bits = data[off + off_bits: off + off_bits + cb_bits]
                img = Image.frombuffer("RGB", (w, abs(h)), bits, "raw", mode, stride, -1 if h > 0 else 1)
                img.save(dest)
                return True
            if rtype == 14 or size == 0:
                break
            off += size
    except Exception:
        return False
    return False


def toc_audit(lines: list[str]) -> list[dict]:
    """Contents-list entries that have (almost) no text behind them: missing or image-only.

    The contents region is the run of short lines after the "table of contents" heading; it
    ends at the first long paragraph. Anything a list names but the body never discusses is
    flagged for a human to check against the images and the PDF -- a flag is a question,
    not a verdict.
    """
    start = next((i for i, l in enumerate(lines) if re.search(r"table of contents", l, re.I)), None)
    if start is None:
        return []
    end = start + 1
    while end < len(lines) and end < start + 60 and len(lines[end]) <= 110 and not lines[end].startswith("<<"):
        end += 1
    entries = []
    for l in lines[start + 1: end]:
        clean = re.sub(r"[.\u2026]{3,}\s*\d*$|\s+\d+$", "", l).strip(" \t:-")
        for _ in range(3):
            clean = re.sub(r"^(?:Exhibit\s+[A-Z]:|[IVX]+\.|[a-z]\)|[A-Z]\.)\s*", "", clean).strip()
        if 6 <= len(clean) <= 90:
            entries.append(clean)
    body = lines[end:]
    flagged = []
    for e in dict.fromkeys(entries):
        words = re.findall(r"[A-Za-z0-9]{4,}", e.lower())[:6]
        if not words:
            continue
        need = max(1, min(3, len(words)))
        hits = sum(1 for l in body if sum(w in l.lower() for w in words) >= need)
        if hits <= 2:
            flagged.append({"entry": e, "mentions_after_contents": hits,
                            "reading": "named in a list but little or no body text: missing, or an image-only form -- check media/ and the PDF"})
    return flagged


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__)
        return 2
    src, out = Path(argv[0]), Path(argv[1])
    (out / "media").mkdir(parents=True, exist_ok=True)
    document = docx.Document(src)

    lines: list[str] = []
    for blk in iter_blocks(document):
        if isinstance(blk, Paragraph):
            t = blk.text.strip()
            if t:
                lines.append(t)
            for tb in textbox_texts(blk):
                lines.append("[TEXTBOX] " + tb.replace("\n", "\n[TEXTBOX] "))
        else:
            lines.append("<<TABLE>>")
            lines += table_rows(blk)
            lines.append("<<END TABLE>>")

    hf: dict[str, str] = {}
    with zipfile.ZipFile(src) as z:
        for name in z.namelist():
            if re.match(r"word/(header|footer)\d*\.xml", name):
                xml = z.read(name).decode("utf8", "replace")
                t = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", xml)).strip()
                if t:
                    hf[name.split("/")[-1]] = t
            if name.startswith("word/media/"):
                (out / "media" / Path(name).name).write_bytes(z.read(name))

    converted = []
    for emf in sorted((out / "media").glob("*.emf")):
        png = emf.with_suffix(".png")
        if emf_to_png(emf.read_bytes(), png):
            converted.append(png.name)

    # images and the words that precede them
    images = []
    try:
        with zipfile.ZipFile(src) as z:
            rels = z.read("word/_rels/document.xml.rels").decode("utf8")
            xml = z.read("word/document.xml").decode("utf8")
        rid = {}
        for m in re.finditer(r"<Relationship [^>]*>", rels):
            a = m.group(0)
            i, t = re.search(r'Id="(rId\d+)"', a), re.search(r'Target="(media/[^"]+)"', a)
            if i and t:
                rid[i.group(1)] = t.group(1)
        for m in re.finditer(r'r:(?:embed|id)="(rId\d+)"', xml):
            if m.group(1) in rid:
                before = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", xml[max(0, m.start() - 4000): m.start()]))[-100:]
                images.append({"file": rid[m.group(1)].split("/")[-1], "text_before": before.strip()})
    except KeyError:
        pass

    full = "\n".join(lines)
    hf_text = "\n".join(f"[{k}] {v}" for k, v in hf.items())
    (out / "rfp.txt").write_text(full + "\n\n=== HEADERS/FOOTERS ===\n" + hf_text + "\n", encoding="utf8")

    main_numbers = RFPNO_RE.findall(full)
    body_no = max(set(main_numbers), key=main_numbers.count) if main_numbers else None
    stale = sorted({n for v in hf.values() for n in RFPNO_RE.findall(v)
                    if body_no and n.upper().replace(" ", "") != body_no.upper().replace(" ", "")})
    inv = {
        "source": str(src),
        "lines": len(lines),
        "solicitation_number_in_body": body_no,
        "other_solicitation_numbers_in_headers_or_footers": stale,
        "dates": sorted(set(DATE_RE.findall(full))),
        "times": sorted(set(TIME_RE.findall(full))),
        "urls": sorted(set(URL_RE.findall(full))),
        "emails": sorted(set(EMAIL_RE.findall(full))),
        "phones": sorted(set(PHONE_RE.findall(full))),
        "dollar_figures": sorted(set(MONEY_RE.findall(full)))[:200],
        "headers_footers": hf,
        "images": images,
        "emf_converted_to_png": converted,
        "textboxes": sum(1 for l in lines if l.startswith("[TEXTBOX]")),
        "contents_entries_without_body_text": toc_audit(lines),
    }
    (out / "inventory.json").write_text(json.dumps(inv, indent=2), encoding="utf8")
    print(f"{out/'rfp.txt'}: {len(lines)} lines; {len(images)} image refs; "
          f"{len(inv['contents_entries_without_body_text'])} contents entries with no body text; "
          f"{len(stale)} foreign solicitation numbers in headers/footers")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
