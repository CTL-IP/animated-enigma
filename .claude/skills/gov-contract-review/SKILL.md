---
name: gov-contract-review
description: Use when reviewing the contract terms inside a government or housing-authority solicitation for a small contractor before bidding — a sample contract, HUD-style general conditions, insurance requirements, flow-down clauses. Rates each clause, picks a position (accept, clarify, negotiate after award, price it, send to counsel), drafts the questions to put to the agency with the assumption that will be priced if unanswered, writes replacement language for the worst clauses, builds the insurance gap table and the subcontract flow-down checklist. Trigger on "review this contract", "indemnity", "termination for convenience", "insurance requirements", "flow-down", "exceptions", "RFI questions", "what should we ask the agency". It produces a memo for counsel; it is not legal advice.
---

# Reviewing a government contract as the small contractor

The job is to turn a pile of clauses into **decisions with dates on them**: what to ask,
what to price, what to fix after award, what to hand to a lawyer, and what would make
you walk away. The output is a memo the owner can act on and an attorney can check.

## Ground rules

1. **Not legal advice.** The memo is preparation for counsel. Say so on page one.
2. **Label every legal statement** `confirmed-primary` (you read the statute, rule or form),
   `search-excerpt` (a summary you did not open), or `unverified` (recall). Never write a
   section number, threshold or date as fact without its label. If the network blocks the
   primary sources, say that, keep the labels, and list what to read when it is open.
3. **The contract usually controls over the proposal**, and a submission usually
   "constitutes acceptance" of the terms. So exceptions written into a proposal are
   worthless or risky. The places to change terms are (a) the agency's question window, and
   (b) negotiation after selection. Plan both; do not improvise in the proposal.
4. **Read the PDF, not just the text.** Reconcile any extraction with the rendered pages
   (`rfp-response` step 1) before you report a blank, a missing attachment or a conflict.
5. **A clause is judged against this firm's facts** — size, cash, insurance, staffing, age of
   the company — not in the abstract. The same indemnity is tolerable for one firm and
   fatal for another.

## Method

1. **Register.** One row per clause or requirement (the `rfp-response` matrix already has
   them): location (section, page, line), duty, exposure, flow-down (yes/no, threshold).
2. **Rate** each row: *severity* (cost if it goes wrong), *likelihood* (how often this work
   triggers it), *control* (can the firm manage it). High severity with low control is the
   list that matters.
3. **Choose a position** for every high and medium row — exactly one:
   - **Accept** — cost is bounded and manageable; say why in one line.
   - **Clarify** — the text is ambiguous or inconsistent; put a question to the agency and
     state the assumption you will price to if unanswered (`references/clause-positions.md`).
   - **Price it** — the risk is real but insurable or estimable; add it to the price and say
     where (overhead, contingency, insurance cost).
   - **Negotiate after award** — worth a fight, but only once selected; write the ask and the
     fallback. Do not use up goodwill before award.
   - **Counsel** — a legal question only a lawyer can answer (statute interaction, enforceability).
   - **Walk away** — name the condition that makes you not sign.
4. **Questions to the agency** (`references/rfi-craft.md`): one issue each; cite the page and
   quote ten words; ask neutrally; state the assumption; never reveal pricing strategy or
   the firm's weaknesses. Put the ones that change price or eligibility first.
5. **Insurance gap table** (`references/insurance-and-flowdowns.md`): one row per requirement
   with the firm's actual status. "No evidence" is a valid and common status; do not fill a
   gap with a marketing line. Mark items that may be unobtainable or inapplicable.
6. **Flow-down checklist:** which clauses must be copied into every subcontract, at what
   dollar threshold, so the firm is not in breach through a sub.
7. **Negotiation playbook:** asks ranked must / should / nice; what can be given; walk-away
   conditions; short replacement language for the top few clauses, marked "for counsel".
8. **Questions for counsel:** numbered, each answerable in a paragraph.

## Red flags that recur in agency sample contracts

Indemnity that covers the agency's own negligence, or a second indemnity under a heading
that says something else; payment "on account only, subject to adjustment after audit" with
no look-back limit; termination for convenience with payment only for work already done; a
30-day window to assert a price change after a written order; "deemed accepted" one way
only; unlimited correction "at no charge"; responsibility for other trades' damage with no
baseline; open-ended scope ("repairs identified by the agency"); no volume guarantee and a
blank not-to-exceed amount; insurance that cites an obsolete form edition or demands a
30-day cancellation-notice endorsement insurers often will not issue; a professional-
liability requirement copied from a consulting contract; flow-down clauses that cite
revoked or superseded rules; boilerplate from another solicitation still in the headers.
Each has a default position in `references/clause-positions.md`.

## Output

`02-contract-risk-memo.md` (internal): 1 how to read; 2 top-15 table; 3 detail by theme
(money, time, liability, scope creep, compliance flow-downs, exit, disputes, precedence);
4 insurance gap table; 5 negotiation playbook; 6 statutory flags with status labels;
7 questions for counsel; 8 what the owner does before signing. Every risk line cites a
location and a register id.
