#!/usr/bin/env python3
"""Check one or more skill directories against the intersection of the rules the
three tools are known to apply.

Every rule below is tagged with where it comes from (see tool-formats.md):
  [spec]   agentskills.io specification (docs/specification.mdx in agentskills/agentskills)
  [codex]  Codex skill-creator quick_validate.py and the Codex skill parser source
  [claude] code.claude.com/docs/en/skills

Usage: python3 scripts/validate-skills.py .claude/skills/*/
Exit status is non-zero if any skill has an ERROR. WARN lines do not fail.
"""
import re
import sys
from pathlib import Path

import yaml

# [codex] quick_validate.py rejects every other key. Claude Code accepts more, but
# claude.ai uploads and Codex's own validator do not, so the portable set is this.
PORTABLE_KEYS = {"name", "description", "license", "allowed-tools", "metadata"}
NAME_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")  # [spec] no leading/trailing/double hyphen


def check(skill_dir: Path):
    errs, warns = [], []
    skill_md = skill_dir / "SKILL.md"
    if not skill_md.is_file():
        return ["SKILL.md not found"], warns
    text = skill_md.read_text(encoding="utf-8")
    # [claude] frontmatter is read only if the opening --- is the very first line.
    if not text.startswith("---\n"):
        return ["first line is not '---' (Claude Code would treat the whole file as body)"], warns
    m = re.match(r"^---\n(.*?)\n---\n?", text, re.S)
    if not m:
        return ["frontmatter has no closing '---'"], warns
    try:
        fm = yaml.safe_load(m.group(1))
    except yaml.YAMLError as e:
        return [f"frontmatter is not valid YAML: {e}"], warns
    if not isinstance(fm, dict):
        return ["frontmatter is not a mapping"], warns

    extra = set(fm) - PORTABLE_KEYS
    if extra:
        errs.append(
            "keys outside the portable set " + ", ".join(sorted(extra))
            + " (Codex quick_validate and claude.ai upload reject them; Claude Code-only fields belong in a Claude adapter, not here)"
        )
    name = fm.get("name")
    if not isinstance(name, str) or not name:
        errs.append("name missing")
    else:
        if len(name) > 64:
            errs.append(f"name is {len(name)} chars, max 64 [spec][codex]")
        if not NAME_RE.match(name):
            errs.append("name must be lowercase letters/digits with single hyphens [spec]")
        if name != skill_dir.resolve().name and name != skill_dir.name:
            errs.append(f"name '{name}' != directory '{skill_dir.name}' [spec]")
    desc = fm.get("description")
    if not isinstance(desc, str) or not desc.strip():
        errs.append("description missing or empty [spec][codex][claude]")
    else:
        if len(desc) > 1024:
            errs.append(f"description is {len(desc)} chars, max 1024 [spec][codex validator]")
        if "<" in desc or ">" in desc:
            errs.append("description contains angle brackets (Codex quick_validate rejects them)")
        if ": " in desc and not str(m.group(1)).split("description:", 1)[1].lstrip().startswith(("'", '"', ">", "|")):
            # PyYAML accepted it, so this is only a hint: Codex and agentskills both repair it, Claude may not.
            warns.append("description contains ': ' unquoted; quote it or use a block scalar to be safe across parsers")
    md = fm.get("metadata")
    if md is not None:
        if not isinstance(md, dict) or not all(isinstance(k, str) and isinstance(v, str) for k, v in md.items()):
            errs.append("metadata must map string keys to string values [spec]")
    if "compatibility" in fm:
        errs.append("compatibility present (spec allows it, Codex quick_validate rejects it): omit")
    body_lines = text[m.end():].count("\n")
    if body_lines > 500:
        warns.append(f"body is {body_lines} lines; spec recommends < 500, move detail to references/")
    # [spec] references one level deep: flag links that go deeper than references/<file>
    for link in re.findall(r"\]\(([^)#]+)\)", text):
        if not link.startswith(("http", "mailto:", "/")) and link.count("/") > 1:
            warns.append(f"link '{link}' is more than one directory below the skill root [spec]")
    return errs, warns


def main(argv):
    worst = 0
    for arg in argv:
        d = Path(arg)
        errs, warns = check(d)
        status = "FAIL" if errs else "ok"
        print(f"{status:4} {d}")
        for e in errs:
            print(f"     ERROR {e}")
        for w in warns:
            print(f"     WARN  {w}")
        worst |= bool(errs)
    return worst


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(sys.argv[1:]))
