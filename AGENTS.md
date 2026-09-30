# Agent instructions (Codex, Cursor, any AGENTS.md-aware tool)

Claude Code reads `CLAUDE.md` instead and ignores this file while `CLAUDE.md` exists. Keep the two
consistent. This file is deliberately short: the real content lives in `CLAUDE.md` and in the skills.

1. **Read `CLAUDE.md`** for this project's conventions, stack and rules. Ignore its Git and
   attribution section (it is written for one assistant); follow your own tool's commit-attribution
   rules, and never put a model identifier in any file in this repository.
2. **Reusable procedures are skills.** Each is `.claude/skills/<name>/SKILL.md` (mirrored for Codex at
   `.agents/skills/<name>`, a symlink). Before starting work that matches a skill's description, open that
   `SKILL.md` and follow it. Skills you can use in any tool:

   | Skill | When |
   |---|---|
   | `rfp-response` | answering a government or housing-authority solicitation: extract, register, price, write, assemble, gate |
   | `gov-contract-review` | reviewing contract terms, insurance and flow-downs; questions to the agency; negotiation language |
   | `hud-pha-procurement` | HUD-funded or housing-authority forms and certifications; what each commits the firm to |
   | `texas-tax`, `db-change`, `domain-slice`, `ship-check` | this application's own procedures |

   The scripts in `rfp-response/scripts/` are plain Python (`python-docx`, `openpyxl`, `pyyaml`, `pillow`;
   `soffice` and PyMuPDF optional). `python3 .claude/skills/rfp-response/scripts/selftest.py` runs them all
   against a synthetic solicitation and prints real pass counts.
3. **Never invent a fact, number, credential, citation, licence, reference or price.** Unknown stays unknown and
   is flagged. This is the most important rule in the repository (`CLAUDE.md` binding rule 6).
4. **Company-specific data never goes in this public repository** — identifiers, prices, insurance, workforce,
   references, strategy. Procedures and generic research may. Bid work happens in a private folder outside the repo.
5. **Check a skill still parses in every tool** after editing it: `python3 scripts/validate-skills.py .claude/skills/*/`.
   Shared skills use only `name` and `description` in their frontmatter; do not add tool-specific keys.
6. **Symlink drift check** (run when adding or renaming a skill):
   `for l in .agents/skills/*; do [ -L "$l" ] && [ "$(readlink -f "$l")" = "$(readlink -f ".claude/skills/$(basename "$l")")" ] || echo "DRIFT: $l"; done`
   On a checkout without symlink support, copy the directory instead and keep one copy authoritative.

Subagents: `.claude/agents/bid-verifier.md` (Claude Code; Cursor also reads `.claude/agents`) and
`.codex/agents/bid-verifier.toml` (Codex). Neither has been exercised in a live Cursor or Codex session.
