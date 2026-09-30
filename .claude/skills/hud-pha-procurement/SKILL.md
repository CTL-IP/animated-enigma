---
name: hud-pha-procurement
description: Use when a solicitation comes from a public housing authority or is HUD-funded — HUD-5369-B instructions to offerors, HUD-5370-C general conditions, Form HUD-50071 lobbying certification, Section 3, MBE/WBE/HUB status forms, Texas boycott certifications and the conflict-of-interest questionnaire, labor-standards and lead/asbestos questions, bidder responsibility and debarment. Says what each form is, who must sign, what signing commits the firm to, what to verify at the primary source before relying on it, and which questions to put to the authority. Trigger on HUD 5369, HUD 5370, HUD 50071, Section 3, PHA, housing authority, make ready, unit turn, M/WBE, Bonfire. Verification labels are part of the content.
---

# Housing-authority and HUD-funded solicitations

Housing authorities buy with federal money, so their solicitations carry HUD forms, federal
clauses and local certifications, often copied from older solicitations. The work is to
know what each piece **is**, **who signs it**, **what signing commits the firm to**, and
**what is stale**.

## Two honesty rules for this domain

1. **Regulatory claims carry a status**: `confirmed-primary` (you read the rule or form),
   `search-excerpt` (a summary you did not open), `unverified` (recall). Rules and form editions
   change; HUD and state sites may be unreachable from a build environment. When they are,
   say so, keep the labels, and list the primary sources to read. `references/regulatory-pointers.md`
   shows the state of knowledge at its date — it is a reading list, not authority.
2. **Attestations belong to the signer.** Debarment, boycott certifications, MBE / WBE / HUB /
   Section 3 status, workforce counts, conflicts, "no collusion" — prepare the form; never decide
   the answer. A self-representation in a federal registration is not a certificate.

## What to do, in order

1. **Extract and reconcile** the solicitation with `rfp-response` step 1. Housing-authority
   packages often contain image-only forms and leftovers from other solicitations; check every
   page before reporting a form missing.
2. **Inventory the forms** against `references/forms-and-certifications.md`: for each, is it
   present (text, image or missing), which edition, what it asks, who signs, notary, and the trap.
3. **Test the firm against the responsibility standard** in the instructions to offerors:
   adequate financial resources, satisfactory performance record, satisfactory record of integrity and
   business ethics, compliance with public-policy requirements, and not suspended or debarred.
   The authority may ask for documentation after the deadline; know the answers now, including
   anything unflattering (tax filings, liens, name and ownership records that do not match).
4. **Ask the authority the questions only it can answer** (labor standards, Section 3 regime and
   reporting format, which properties are public housing, environmental surveys, form editions,
   submission mechanics). Patterns in `gov-contract-review/references/rfi-craft.md`.
5. **Price with the unknowns visible.** If maintenance prevailing-wage clauses may apply, labor prices
   are provisional until the authority answers — build from hours by classification once the decision
   is in hand; do not invent a rate.
6. **Build the compliance engine into operations**, not just the proposal: Section 3 needs a record of
   every worker's hours and status; records must be kept for the stated retention period and flow to
   subcontractors; lead-safe practices and asbestos stop-work rules are site procedures, not paragraphs.

## Environmental triggers to raise for unit work
Units built before 1978 may contain lead-based paint; sanding, scraping, demolition and some patching can be
regulated work needing a certified firm and certified renovators. Older resilient flooring, texture,
mastics and ceiling finishes may contain asbestos; a survey before disturbance is the usual rule. Check
the current federal and state rules at the primary source (see pointers), ask the authority which properties
have surveys, and never disturb suspect material without that answer. The scope text of older solicitations
often omits both.

## Licensed trades
Electrical and plumbing work (and often HVAC) is licensed by state agencies. A general contractor normally
covers these by employing licensed individuals or subcontracting named licensed firms. Do not offer a
licensed trade without that arrangement in writing. Check the trade licensing agency's current rules.

## Files
- `references/forms-and-certifications.md` — form by form.
- `references/regulatory-pointers.md` — topics, what was found, status, and the primary source to read.
