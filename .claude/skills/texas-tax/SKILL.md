---
name: texas-tax
description: Texas Comptroller tax publications and the Texas sales, use, franchise and motor-vehicle rules a contractor or small business group acts on. Use when a Texas job's tax treatment is in question (home vs commercial, lump-sum vs separated contract, resale or exemption certificates, the job site's rate, debris haul-off, disaster or maintenance work); when someone asks which Comptroller publication covers something, when a sales tax return or franchise report is due, what a late payment costs, whether revenue clears the franchise no-tax-due threshold, or how vehicle rental tax works; when working on src/lib/texas-tax, the estimate or invoice tax checks, or the texas-tax MCP server; and when the ledger of verified rules needs refreshing.
---

# Texas tax

The Comptroller's tax publication index lists 92 entries. Three decide most
of a contractor's money — 94-116 (repair and remodeling), 94-157 (new construction
and real property services), 94-105 (local tax) — and a handful more decide
the rest of a small group of companies: franchise tax, penalties, vehicle
rental, use tax. This skill is how to use them without guessing.

## The one rule: evidence first

Every rule the code acts on is a fact in `src/lib/texas-tax/ledger.ts`, with
its sources, how it was checked, and a status: **confirmed**, **partly
confirmed**, or **not settled**. Code cites facts by id; a test fails if a
cited id doesn't exist.

- Answer from the ledger, not from memory. If the ledger has it, cite the id
  and the publication.
- Never state a *not settled* fact as settled. Say what is unsettled and which
  publication section settles it.
- A question the ledger doesn't cover gets a plain "not verified here", the
  publication to read, and — if the network allows — a reading of it, after
  which the fact goes into the ledger with a test. Not the other way round.
- The pages were read through web-search excerpts on the check date, because
  comptroller.texas.gov is blocked in the build environment. Say so when it
  matters; the refresh workflow exists to do better.

Research material, not tax advice — and the screens say so too.

## Where it lives

| Path | What |
|---|---|
| `src/lib/texas-tax/publications.ts` | The Comptroller's index, transcribed: 92 publications, 95 subject rows, Spanish editions, links (with which were seen live) |
| `src/lib/texas-tax/ledger.ts` | The facts and their evidence |
| `src/lib/texas-tax/profiles.ts` | Obligations and publication relevance by **kind of business**, never by named company |
| `src/lib/texas-tax/texas-tax-core.ts` | Pure: index search and the three sorts, contract classification, rate check, due dates, late-payment cost, franchise position, vehicle rental |
| `src/lib/texas-tax/job-checks.ts` | Pure: the warnings on estimates and invoices |
| `src/lib/texas-tax/queries.ts` | The one read the screens need: a job's property type and state |
| `src/components/texas-tax/tax-check-card.tsx` | The card on the estimate and invoice screens |
| `src/mcp/texas-tax/` | The MCP server — `stdio.ts` for Claude Code, `http.ts` for a remote connector |
| `references/*.md` | Generated from the above; never edited by hand |

## Classifying a contract job — four questions, in order

`classifyContract()` and the `tx_classify_contract` tool ask them in this
order because each one can make the next irrelevant.

1. **Who is the customer?** Federal, Texas state and Texas local government
   jobs carry no tax; neither do exempt organizations that hand over an
   exemption certificate for work tied to their exempt purpose. On an exempt
   contract the incorporated materials go untaxed either way: a lump-sum
   contractor gives suppliers an exemption certificate (Tax Code §151.311), a
   separated one a resale certificate (`exempt-lump-sum-materials`).
2. **What is the work?** New construction: no tax on labor, home or
   commercial. Real property services such as a debris haul-off charge:
   taxable, on homes too. Repair in a declared disaster area: labor exempt,
   materials taxable, and commercial jobs need a separated contract plus the
   customer's exemption certificate. Scheduled, periodic commercial
   maintenance: not remodeling, if the schedule can be proven.
3. **What is the property?** Residential means family dwellings — homes,
   duplexes, apartments, condos, nursing and retirement homes (not hotels).
   Nonresidential remodeling is taxed on the whole charge at the job site's
   rate. Mixed-use property: the Comptroller asks you to call. Manufactured
   homes: *not settled*.
4. **How is the contract written?** Lump-sum: the contractor is the consumer
   of the materials, pays tax to the supplier, charges the customer none.
   Separated: the contractor resells the materials, buys them on a resale
   certificate, and collects tax on the materials charge — at least what it
   paid. On nonresidential remodeling the form doesn't matter: all of it is
   taxed.

## The collision to check every time: resale certificates

A contractor registered to buy tax-free (a resale certificate on file with a
supplier) is fine exactly when it resells what it buys — separated contracts,
commercial remodeling. On a lump-sum home job the same purchase is
consumption: the tax is owed, reported as taxable purchases on the sales tax
return, and a certificate knowingly issued for items to be used is an offense
(`resale-certificate-knowing-misuse`). When supplier pricing is quoted
"pre-tax", ask which contract form the job is on before agreeing that no tax
belongs anywhere. The estimate screen's "no tax on this home job" check says
exactly this.

## Numbers worth knowing

| | | Ledger |
|---|---|---|
| Sales tax rate | 6.25% state + up to 2% local = 8.25% maximum; look up the job site's address | `rate-range` |
| Sales tax due | 20th of the next month; quarterly Apr/Jul/Oct/Jan 20; yearly Jan 20; weekends move to the next working day | `sales-tax-due-dates` |
| Paying late | 5% (1–30 days), 10% (31+), 20% in all once paid after a Notice of Tax Due; $50 late-filing penalty may be added; interest from day 61 | `late-penalties` |
| Paying on time | 0.5% timely-filing discount; +1.25% for prepaying a reasonable estimate | `timely-filing-discounts` |
| Franchise tax | No-tax-due threshold $2.47M (2024–25 reports), $2.65M (2026; 2027 derived, partly confirmed); report or PIR/OIR due May 15; every LLC files | `franchise-*` |
| Combined group | >50% common ownership + unitary business = one report; threshold tested on the group | `franchise-combined-group` |
| Vehicle rental | 10% (1–30 days), 6.25% (31–180); over 180 is a lease; qualified permit needs 5 vehicles | `vehicle-rental-*`, `rental-*` |
| Records | Keep four years; 30 days to request a redetermination after an audit | `records-four-years`, `audit-redetermination` |
| SaaS bought or sold | Taxed on 80% of the charge | `data-processing-80-percent` |

## The MCP server

`.mcp.json` registers `texas-tax` for Claude Code sessions in this repo (approve
it once when Claude Code asks). Eleven read-only tools, no network:

`tx_search_publications` (search; sort by subject, number or title; filter by
subject or business profile) · `tx_get_publication` · `tx_classify_contract` ·
`tx_sales_tax_due` · `tx_next_sales_tax_due` · `tx_late_payment` ·
`tx_franchise_position` · `tx_vehicle_rental` · `tx_check_rate` ·
`tx_profile_obligations` · `tx_ledger`

Every answer ends with an evidence line; pass it on. `pnpm mcp:texas-tax:http`
serves the same tools over Streamable HTTP at `/mcp` for a remote connector —
where to host that is an owner decision, so nothing deploys it automatically.

## Keeping it current

- **Refresh:** the `texas-tax-refresh` workflow in `.claude/workflows/`
  re-checks every ledger fact against the Comptroller and reports what moved.
  Run it quarterly, after a legislative session, or whenever the
  Comptroller's Tax Policy News announces a change.
- **Changing a rule:** edit the fact in `ledger.ts` (status and note honest),
  update anything that cites it, run the tests, then `pnpm texas-tax:render`
  — the references test fails until you do.
- **A new year's franchise threshold:** add it to `NO_TAX_DUE_THRESHOLDS` only
  once the ledger holds it. Until then the tool says "not recorded", which is
  the truth.

## What never goes in this repository

It is public. Which of an owner's companies rents what to whom, how a company
buys its materials, what it may owe, what it has decided — none of that goes
in code, docs, commits, PR text or the agent log. The rules are public; the
facts about a business stay with its owner, in their private skill or their
own systems. Profiles, not company names.

## References

- `references/publications.md` — the whole index, three ways, with links and relevance
- `references/ledger.md` — every fact with its sources and how it was checked
- `references/obligations.md` — what each kind of business has to do
