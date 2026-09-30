---
name: rfp-response
description: Use when a contractor is responding to a government or housing-authority solicitation (RFP, RFQ, IFB) — shredding the document into a requirement register, finding what is missing or contradictory in it, drafting questions to the agency, writing the proposal to the evaluation criteria, pricing a unit-price schedule, completing the required forms and certifications, and assembling and gating the final package. Trigger on "RFP", "bid package", "proposal", "Bonfire", "price schedule", "Exhibit B forms", "housing authority", "HUD 5369 / 5370", "Section 3", or any request to put a submission together. Works the same in Claude Code, Codex and Cursor.
---

# Responding to a government solicitation

A bid is won or lost on four things, in this order: **being compliant** (a
non-responsive package is never scored), **being priced right**, **saying what the
evaluators score, in their words**, and **never saying anything untrue**. The last one
matters most. Every government package carries certifications a person signs under
penalty; one invented credential costs more than a blank.

## Binding rules

1. **Never invent.** No past project, reference, licence, certification, headcount,
   insurance limit, tool "in use today", price, or statute section. Unknown stays
   unknown and renders as a yellow `[[FILL: ...]]` flag. A package with flags is
   honest; a package without flags that contains a guess is a liability.
2. **Attestations belong to the signer.** Debarment status, boycott certifications,
   MBE / WBE / HUB / Section 3 status, "no collusion", workforce counts — record what a
   signed source says, prepare the form, leave the judgement and the signature to the
   owner. Say which ones they are.
3. **Commitments are not past performance.** "We will photograph every room" is a
   promise the firm must be able to keep; "we have photographed 400 units" is a fact
   that must be provable. Label which is which, and get the owner to confirm every
   commitment before it is submitted.
4. **Company data stays out of any public repository.** Procedures, scripts and
   generic research may be committed. A particular firm's identifiers, prices, insurance,
   workforce, references and strategy live in a private working folder and are delivered
   to the owner directly. Describe kinds of business, not a named company.
5. **Report only what was run.** If the gate was not run, say so. Quote real counts.

## The private bid workspace

```
bid/
  in/           solicitation.docx, rendered PDF, extracted images
  research/     shred-*.json, anomalies, regulatory and pricing research (cited, dated)
  facts/        intake.yaml (single source of company facts) + provenance
  src/          drafts in Markdown with {{fact.keys}} and [[FILL: ...]] flags
  out/          .docx / .pdf / .xlsx as they will be uploaded
  qa/           verification reports, placeholder report, compliance matrix
```

## Procedure

### 1. Extract and inventory the solicitation
`python scripts/extract_rfp.py SOLICITATION.docx bid/in/extract` produces text in
document order (tables as `a | b | c`, text boxes tagged), every embedded image
(single-bitmap EMF files become PNG — scanned certificates hide there), headers and
footers, and `inventory.json`.

Read `inventory.json` before you read anything else. It answers four questions a plain
read misses: **Which forms does the contents list promise that have no text?** (missing
from the file, or image-only — open the images). **Do headers or footers name a
different solicitation?** (recycled boilerplate: expect stale clauses.) **What are all
the dates and times?** **Is anything in a text box or image?**

Also render the docx to PDF (`soffice --headless --convert-to pdf`) and look at the pages
that matter. Extracted text lies about layout.

### 2. Shred into a requirement register
One row per obligation, deadline, deliverable, form-field group, or scored factor —
granular (a clause with three duties is three rows). Fields: `id, lines, section, type,
requirement, quote (<=25 words, verbatim), response_location, owner, risk, note`. The
register becomes the compliance matrix and the contract-risk memo. Work the document in
segments in parallel; merge by id.

**Hunt contradictions as their own deliverable.** Categories that recur: term of
contract stated two ways; two submission methods; two answer dates; a schedule whose
pricing structure is described differently in two attachments; materials "furnished by
owner" versus a price schedule that asks for materials; clauses that cite a section not
in the document; stale legal references (revoked orders, expired form editions,
superseded regulations); blanks left in the sample contract (state, venue, amount);
typos in dates; table rows with missing names or truncated addresses; attachments that
share a letter with different meanings.

### 3. Work the calendar backwards from the upload time
Find the question deadline and the answer date (they are usually the only moment the
terms can be changed). Then list lead times the owner controls: notary, insurance
endorsements and certificates, certifications from third parties, references to call,
signatures. Plan to upload 24 hours early; portals fail at deadlines and "received"
means received, not "I clicked submit".

### 4. Fill the intake from real sources
`assets/intake.template.yaml` lists every fact the forms and narrative need. Fill it
only from documents (certificate of insurance, W-9, licence, prior proposals, project
records). Record `_provenance`. When two sources disagree — two spellings of the firm's
legal name, for instance — record both and stop: the forms must match the secretary of
state's record exactly, and only the owner can say which is right.

### 5. Ask the agency (this is where contract writing earns its fee)
Write the questions while the terms can still move. Rules that work:
- One issue per question, cite the section and line, state the conflict or gap plainly,
  then state the assumption you will price to if not answered. Agencies answer questions
  that come with a proposed resolution faster.
- Ask about what changes price or eligibility first (labor-standards wage rates,
  quantities, who furnishes what, bonds, term and price adjustment, how cost is scored).
- Never reveal pricing strategy, and never put exceptions in the proposal if a question
  can cure the issue: "submission constitutes acceptance" language makes exceptions a
  responsiveness risk. Keep exceptions for post-award negotiation and list them in the
  risk memo so they are a plan, not a surprise.

See `gov-contract-review` for clause-by-clause positions.

### 6. Write to the evaluation criteria
Mirror the agency's factors and point weights as your section headings, in their order,
using their words. Open each section with what the evaluator is scoring, then answer it.
Every claim gets a proof type: *past performance* (provable), *commitment* (owner-confirmed),
or *method* (how the work is done). Prefer specifics (hours, counts, tools, who does what)
to adjectives. Answer every bullet under the factor, including the awkward ones —
an unanswered bullet is lost points.

### 7. Price the schedule
`python scripts/price_workbook.py parse RFP.txt FIRST-LAST schedule.json` then
`build schedule.json price.xlsx`. The workbook computes a price only when every input is a
real number and keeps overrides separate. Rules: (a) no price is invented — rates,
overhead, profit, tax, hours come from the owner; (b) every line that appears in two
schedules prices once and is referenced, so they cannot disagree; (c) check that the
numbers of price cells in your workbook equal the solicitation's; (d) benchmarks are
cited public figures only; (e) when the scoring method is unknown, ask and price for the
likeliest basket.

### 8. Forms
Reproduce the agency's wording verbatim. Prefill facts from the intake; leave
signatures, dates, notary blocks and attestations blank and named in the readiness
report. If a form exists only as an image, print-and-sign the agency's own page or
use the issuing authority's current edition and say so. Flag forms whose edition is old.

### 9. Assemble and gate
Build: `python scripts/md_to_docx.py draft.md out.docx --intake intake.yaml`.
Gate: `python scripts/scan_placeholders.py bid/out bid/src` — exit 1 while any `[[FILL]]`,
unresolved `{{token}}` or template leftover remains. Verify independently (a second
agent or person who did not write it): every register row answered, dates and names
consistent across documents, no fact without a source, totals reconcile, file names and
sizes meet the portal's limits. Only then call the package ready — and say exactly what
the owner still has to do.

## When the solicitation is HUD-funded or a housing authority's
Read `hud-pha-procurement` for the forms (HUD-5369-B, HUD-5370-C, 50071, Section 3,
M/WBE, Texas certifications) and what signing each one means.

## Tools in each assistant
Same scripts everywhere: they are plain Python (`python-docx`, `openpyxl`, `pyyaml`,
`pillow`; `soffice` optional for PDF rendering). Claude Code loads this skill directly;
Cursor and Codex reach it through the adapters listed in the repository's `AGENTS.md`.
