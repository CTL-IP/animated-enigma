---
name: paypal
description: The PayPal connector wired into this claude.ai account — invoices, transactions, disputes and payment links on the business's real PayPal account. Use when asked to invoice a client through PayPal, send or chase a PayPal invoice, find out whether and how a client paid, record a PayPal payment in the Foreman, reconcile PayPal against the ledger, check for disputes, or decide whether PayPal belongs in the app (the `src/lib/paypal/` seam that does not exist yet). Trigger on any mention of PayPal, a PayPal invoice number, or "did the client pay".
---

# PayPal

The Foreman records client payments by hand (CLAUDE.md, open item 4). PayPal is
the rail the business actually collects on today, and it is connected to this
claude.ai account as a connector. This skill is how to use that connector
without creating a mess in a live money account, and how a PayPal payment gets
back into the Foreman's ledger so the numbers there stay true.

Two rules, and the first one matters most.

1. **Nothing leaves the account on your say-so.** Creating a draft is
   reversible only by hand in the PayPal dashboard; *sending* an invoice emails
   a client and cannot be undone. Show the exact payload — recipient, amount,
   due date, note — and get a plain yes before any create or send. A bulk run
   repeated "to be sure" leaves duplicate drafts that someone has to cancel one
   at a time. There is no delete tool here.
2. **The Foreman invoice is the record; the PayPal invoice is the collection
   page.** Issue the Foreman invoice first, carry its number onto the PayPal
   invoice, and record the payment back in the Foreman when it lands. Money
   that exists only in PayPal is invisible to every report in this app.

## What is connected, and what was verified

Read-only calls were made against the live account on **2026-11-05** and all
returned real data: invoices in every lifecycle status, a month of
balance-affecting transactions including a card payment against an invoice
with its fee, zero payment links, zero disputes. The account is active and in
daily use, so **treat every call as touching real money.**

Not verified: creating, sending, or marking anything. No invoice, link or
email has been created from a Claude session through this connector as far as
this repository knows. The first time one is, record it in `docs/agent-log.md`.

| Tool | Does | Touches the world? |
|---|---|---|
| `list_invoices` | Pages of invoices, filterable by status. 100 per page max. | No |
| `list_transactions` | Balance-affecting records in a date window. **31 days max per call.** Pages of 10 by default. | No |
| `list_disputes` | Disputes, filterable by state. Update-time filters must be within 180 days. | No |
| `list_payment_links`, `show_payment_link_status` | Shareable links and one link's state. | No |
| `create_invoice` | Opens an interactive form for one invoice. Call it **once**; the person fills it in. | Creates a draft |
| `create_bulk_invoices` | Up to 10 drafts from a fully validated payload. | Creates drafts |
| `send_invoice` | Opens a form to email one invoice. Call it **once**. Without an id it picks the most recently created invoice — so always pass the id you mean. | **Emails the client. Irreversible.** |
| `send_bulk_invoices` | Emails several drafts at once. Drafts with no recipient email fail. | **Irreversible.** |
| `create_payment_link` | Opens a form for a reusable pay page. | Creates a live link |

Things the connector cannot do, which the dashboard can: edit a sent invoice,
cancel an invoice, mark one as paid, refund, reply to a dispute. Say so rather
than improvising.

## The invoice lifecycle, in PayPal's words and the Foreman's

| PayPal status | Means | Foreman `invoices.status` |
|---|---|---|
| `DRAFT` | Created, not sent. Fully editable. | `draft` |
| `SCHEDULED` | Will send on a future date. Editable until then. | `draft` |
| `SENT` | Sent to the recipient's email. Payable. | `sent` |
| `UNPAID` | Shared by link or QR rather than email. Payable. | `sent` |
| `PAYMENT_PENDING` | A payment is in flight. Do nothing yet. | leave as is |
| `PARTIALLY_PAID` | Some paid, balance outstanding. | `partially_paid` |
| `PAID` | Paid through PayPal. | `paid` |
| `MARKED_AS_PAID` | The business recorded an outside payment (check, cash). | `paid` — with the real method |
| `CANCELLED`, `AUTO_CANCELLED` | No longer payable; kept for audit. Terminal. | `void` |
| `REFUNDED`, `MARKED_AS_REFUNDED` | Terminal. | a refund payment row, `isRefund` |

PayPal does not store *overdue* as a status; it is derived from the due date,
the same as here. A PayPal invoice created without a due date is due the day it
is created, which reads as overdue by the next morning. Always set one.

## Invoicing a job through PayPal

1. **Issue the Foreman invoice first.** Lines, per-line tax, number, due date —
   the Foreman is the tax document and the ledger. If it is not issued, there is
   nothing to collect against.
2. **Create the PayPal invoice from it**, one call, and put the Foreman invoice
   number where it will survive: in `product_name` (for example
   `PTTR Invoice 0031 — Kitchen remodel, progress billing 2`) and in
   `note_from_seller`. The connector's invoice form has no invoice-number
   field, and the number is what lets a transaction be matched later.
3. **Amount and tax.** The connector takes one amount and one tax percentage
   for the whole invoice. The Foreman taxes per line because labor on a
   residential repair can be exempt while materials are not. So pass the
   Foreman **total** as the amount and leave the tax field empty, and say in
   the note that tax is itemized on the attached invoice. Passing a blanket
   percentage would tax the exempt lines twice on the client's receipt.
4. **Confirm before sending.** Read back recipient email, amount, due date, and
   the note. Then `send_invoice` with that invoice's id, once. The form copies
   the business by default; leave that on, it is the only email trail.
5. **Log it** in the Foreman invoice's notes: the PayPal invoice id
   (`INV2-…`) and the date sent. The Foreman has no column for a processor's
   invoice id, and nothing should pretend otherwise.

### When not to use a payment link

A payment link is a reusable page anyone with the URL can pay on; it is not
tied to a customer and carries no invoice number. It suits a tip jar or a
fixed-price deposit on a flyer. It does not suit job money: a link payment
arrives with no reconciliation key, and the Foreman cannot say which invoice it
settled. Use invoices for anything that appears on a Foreman invoice.

## A payment came in: getting it into the Foreman

`list_transactions` over a window that covers the payment (31 days at most;
split a longer search). Find the client's payment by its `invoice_id` field —
that is PayPal's *invoice number*, not the `INV2-…` id — or by amount and
date. Then record it in the Foreman (Invoices → Record payment) with:

| Foreman field | From PayPal |
|---|---|
| Amount | `transaction_amount.value` — the **gross**. The client paid the invoice in full; the fee is the business's cost, not a short payment. |
| Method | `card` when `instrument_type` is Credit Card or Debit Card; `other` when it is PayPal (wallet or balance). ACH through PayPal still arrives as PayPal. |
| Payment date | `transaction_initiation_date`, as a date. |
| Reference number | `transaction_id` (17 characters). This is the key a future webhook would use for idempotency. |
| Notes | The PayPal invoice id and the fee: `PayPal INV2-… · fee 105.19`. |

The `payments` table has a `processor_fee` column but the record-payment form
does not take it yet, so the fee lives in notes until that form grows a field.
Noted in the agent log; do not invent a fee of zero.

If a client paid the Foreman invoice some other way — check, cash, Zelle — the
PayPal invoice must be *marked as paid* in the PayPal dashboard or it will sit
as due and PayPal will chase. The connector cannot do that.

### Reading a transaction record

The useful fields and codes, from PayPal's transaction event code reference:

| Code | Meaning |
|---|---|
| `T0006`, `T0007` | A payment received through checkout. The one invoice card payment seen on 2026-11-05 arrived as `T0006`, with `invoice_id` set and `fee_amount` negative. |
| `T0011` | Payment started from a mobile device. |
| `T0000` | General payment. |
| `T1107` | Refund issued. |
| `T1110` / `T1111` | Hold placed, then released, while a dispute is investigated. |
| `T1201` | Chargeback. |
| `T0500` | Spend on the PayPal debit card. Business purchasing, not client money. |
| `T1501` / `T1105` | Authorization hold and its reversal. Pairs that net to zero. |
| `T0400` | Withdrawal to the bank. |
| `T0300` | Deposit from the bank. |

`transaction_status`: `S` succeeded, `P` pending, `D` denied, `V` reversed.
Only `S` is money. `last_refreshed_datetime` in the response tells you how
stale the report is; PayPal's reporting lags the live account, so a payment made
this morning may not be in the feed yet.

Fees: PayPal's developer pages do not state them. The one card payment seen on
2026-11-05 carried a fee consistent with PayPal's published invoicing rate for
cards, a percentage plus a fixed amount. Check the current merchant fee page
before quoting a rate; do not quote one from memory.

## Disputes

`list_disputes` with `dispute_state: ["OPEN", "UNDER_REVIEW"]` is the check.
The Foreman has no dispute record; when one exists, note it on the project and
the invoice, and gather what the Foreman already holds — daily logs, photos,
the signed contract and approved change orders, the client's proposal
acceptance. That is the evidence PayPal asks for, and it is why the daily log
exists. Replying goes through the Resolution Center, not the connector.

## What this repository must never hold

This repository is public. Invoice numbers, amounts, balances, client names,
merchant names from the transaction feed, and what the business buys stay out
of code, docs, commits, PR text and the agent log. Say "the account holds
stale drafts"; never say how many or for how much.

## How PayPal is wired into the app (Task 34)

Built 2026-11-05; see `docs/superpowers/specs/2026-11-05-paypal-client-payments-design.md`
for the decisions and `docs/superpowers/plans/2026-11-05-paypal-client-payments.md`
for how it was built. The connector above is still the right tool for looking at
the account; the app is the right tool for collecting on a Foreman invoice.

| Where | What |
|---|---|
| Settings → PayPal | Per-organization client id and secret (encrypted app-side under `PAYPAL_CREDENTIAL_ENCRYPTION_KEY`), sandbox or live, proved against PayPal before being stored. The app registers its own webhook at `<app URL>/api/webhooks/paypal`. Owner only. |
| An issued invoice → PayPal card | **Send through PayPal** creates the PayPal copy (same number, same lines, tax only on taxable lines, a credit as a discount, full payment only, no tip), checks PayPal's total against ours, sends it, and shows the pay link for texting. The printed invoice carries a "Pay online" line. |
| `src/app/api/webhooks/paypal/` | `INVOICING.INVOICE.PAID` and `.REFUNDED` post to the ledger at gross through the shared write path, once per PayPal transaction id; `.CANCELLED` clears the pay link. The invoice is fetched from PayPal before anything is written. |
| `src/lib/paypal/` | `paypal-core.ts` (pure), `client.ts` (the only file that calls PayPal), `connection.ts` (the only place the secret is decrypted), `webhook.ts` behind a dependency port, `webhook-live.ts`, `queries.ts`, `actions.ts`, `mirror.ts` (voiding a Foreman invoice cancels the PayPal copy, best effort). |

What the app does **not** do: pull PayPal's fee into `processor_fee` (left
blank, not zero); post payments marked as paid by hand inside PayPal (no
transaction id to dedupe on — record those here by hand); send reminders;
start refunds. Disputes stay in the Resolution Center.

**Verified and not.** The unit suite, the component render tests and the
real-Postgres RLS harness cover every decision. No call to PayPal has been made
from this code: the sandbox run (connect a sandbox app, send a test invoice, pay
it as a sandbox buyer, watch the ledger row, refund it, watch the refund row)
and the first live invoice are the owner's to run, and `CLAUDE.md` open item 4
says whether they have been.
