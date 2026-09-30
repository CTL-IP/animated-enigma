#!/usr/bin/env python3
"""Assemble a bid package from drafts, using a manifest.

Reads package.yaml, builds every document, and writes a build report. For each document:
  Markdown -> .docx (md_to_docx.py, facts from the intake file) -> .pdf (LibreOffice, if installed)
External documents are merged into one bookmarked PDF bundle; internal documents are not.
Pages from the agency's own PDF (forms that exist only as images) can be appended to a document.
The report counts what is still unfinished ([[FILL]] flags, unresolved {{tokens}}) per document.

Manifest (YAML):
  intake: facts/intake.yaml            # optional
  out_dir: out                         # default "out"
  bundle_name: Proposal-Package        # default "Proposal-Package"
  docs:
    - src: src/10-tab1-letter.md
      name: Tab1-Letter-of-Interest    # file stem; default = src stem
      audience: external               # external | internal
      append_pdf_pages:                # optional: agency-supplied pages, appended after this document
        - {pdf: in/Solicitation.pdf, pages: [57, 63, 64], title: "Agency pages to complete and sign"}
Paths are relative to the manifest's folder.

Usage: build_package.py package.yaml [--no-pdf]
Requires: python-docx, pyyaml; PyMuPDF for PDF work; soffice (LibreOffice) for docx->pdf.
"""
from __future__ import annotations

import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import md_to_docx  # noqa: E402
import scan_placeholders  # noqa: E402


def to_pdf(docx_path: Path, pdf_dir: Path) -> Path | None:
    soffice = shutil.which("soffice")
    if not soffice:
        return None
    pdf_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="lo-") as profile:
        subprocess.run([soffice, f"-env:UserInstallation=file://{profile}", "--headless", "--convert-to", "pdf",
                        "--outdir", str(pdf_dir), str(docx_path)], capture_output=True, timeout=300)
    out = pdf_dir / (docx_path.stem + ".pdf")
    return out if out.exists() else None


def append_pages(pdf_path: Path, spec: dict, base: Path) -> int:
    import pymupdf
    src = pymupdf.open(base / spec["pdf"])
    doc = pymupdf.open(pdf_path)
    if spec.get("title"):
        page = doc.new_page()
        page.insert_text((72, 120), spec["title"], fontsize=16)
        page.insert_text((72, 150), "Print the following page(s) exactly as supplied by the agency, complete and sign.", fontsize=10)
    for n in spec["pages"]:
        doc.insert_pdf(src, from_page=n - 1, to_page=n - 1)
    out = pdf_path.with_suffix(".tmp.pdf")
    doc.save(out)
    doc.close()
    out.replace(pdf_path)
    return len(spec["pages"])


def main(argv: list[str]) -> int:
    if not argv or argv[0] in {"-h", "--help"}:
        print(__doc__)
        return 2
    manifest_path = Path(argv[0]).resolve()
    base = manifest_path.parent
    make_pdf = "--no-pdf" not in argv
    cfg = yaml.safe_load(manifest_path.read_text(encoding="utf8"))
    intake = md_to_docx.load_intake(str(base / cfg["intake"])) if cfg.get("intake") else {}
    out_dir = base / cfg.get("out_dir", "out")
    docx_dir, pdf_dir = out_dir / "docx", out_dir / "pdf"
    docx_dir.mkdir(parents=True, exist_ok=True)

    rows, ext_pdfs = [], []
    for d in cfg["docs"]:
        src = base / d["src"]
        name = d.get("name") or src.stem
        docx_path = docx_dir / f"{name}.docx"
        text = src.read_text(encoding="utf8")
        doc, missing = md_to_docx.convert(text, intake, cfg.get("accent", "F76808"))
        doc.save(docx_path)
        pdf_path, pages = (to_pdf(docx_path, pdf_dir) if make_pdf else None), None
        appended = 0
        if pdf_path and d.get("append_pdf_pages"):
            for spec in d["append_pdf_pages"]:
                appended += append_pages(pdf_path, spec, base)
        if pdf_path:
            import pymupdf
            with pymupdf.open(pdf_path) as pd:
                pages = len(pd)
            if d.get("audience", "external") == "external":
                ext_pdfs.append((name, pdf_path))
        scan = scan_placeholders.scan(docx_path)
        rows.append({"name": name, "audience": d.get("audience", "external"), "pages": pages, "appended": appended,
                     "fill": len(scan["fill"]), "token": len(scan["token"]), "leftover": len(scan["leftover"]),
                     "unresolved_tokens": sorted(set(missing))})

    bundle = None
    if ext_pdfs:
        import pymupdf
        bundle = out_dir / f"{cfg.get('bundle_name', 'Proposal-Package')}.pdf"
        merged, toc, start = pymupdf.open(), [], 1
        for name, path in ext_pdfs:
            with pymupdf.open(path) as part:
                merged.insert_pdf(part)
                toc.append([1, name.replace("-", " "), start])
                start += len(part)
        merged.set_toc(toc)
        merged.save(bundle)
        merged.close()

    lines = ["# Build report", "", "| Document | Audience | Pages | [[FILL]] | {{token}} | Left-overs |", "|---|---|---|---|---|---|"]
    for r in rows:
        pages = "n/a" if r["pages"] is None else str(r["pages"])
        if r["appended"]:
            pages += f" (+{r['appended']} agency)"
        lines.append(f"| {r['name']} | {r['audience']} | {pages} | {r['fill']} | {r['token']} | {r['leftover']} |")
    total = sum(r["fill"] + r["token"] + r["leftover"] for r in rows)
    lines += ["", f"Unfinished items in total: **{total}**. A package is not ready to upload while this is above zero.",
              f"Bundle: {bundle.name if bundle else 'not built (no PDFs: is LibreOffice installed?)'}"]
    (out_dir / "build-report.md").write_text("\n".join(lines) + "\n", encoding="utf8")
    print("\n".join(lines))
    return 0 if total == 0 else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
