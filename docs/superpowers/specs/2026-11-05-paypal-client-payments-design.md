# PayPal client payments — design

**Task 34** · Drafted 2026-11-05 · Status: for Patrick's review before the implementation plan is written.

## 1. What this is for

PayPal is the rail PT's Tactical Renovations collects on. Today a Foreman invoice is
printed or emailed, the client pays however they can, and the payment is typed into
the Foreman by hand. Open item 4 in `CLAUDE.md`.

After this task: issuing a Foreman invoice and tapping **Send through PayPal** puts a
matching invoice in front of the client with PayPal's Pay button. The client pays with
PayPal, a card, or Pay Later, with no account and no login. When the money lands,
PayPal tells the app and the payment appears in the Foreman's ledger on its own,
against the right invoice, at the right amount, once.

**Success is measured by the client's side of it.** One email or one texted link. One
tap to pay. Nothing to sign up for. On the business's side: nothing typed twice, and
the ledger's numbers stay true.

## 2. Decisions made, and what was rejected

| Decision | Rejected | Why |
|---|---|---|
| PayPal-hosted invoice through the Invoicing API v2; PayPal emails the client | A PTTR-branded pay page with PayPal's button embedded (Orders API + JS SDK) | The branded page is more to build, needs a client token page that does not exist, and the client still ends on PayPal's payment sheet. Not simpler for the client, only prettier for us. |
| | Payment links | A link is tied to neither a client nor an invoice, so a payment arrives with nothing to reconcile against. |
| The Foreman invoice is the record and the tax document; the PayPal invoice is the collection page | Let PayPal be the invoice and copy it back | Every report in the app reads the Foreman's tables. Money that exists only in PayPal is invisible to them. |
| PayPal sends the email, copy to the business | The app sends it through Gmail or Resend with the pay link | PayPal's email carries the Pay button, the receipt and PayPal's own reminders. One email from PayPal beats one from us plus one from PayPal. The pay link is still shown in the app for texting. |
| Full payment only | Allow partial payment | Milestones already split a job into deposit and progress bills. A partial-payment field on PayPal's page is one more thing for the client to get wrong. |
| No tip prompt | PayPal's `allow_tip` | A tip prompt on a renovation invoice reads as a mistake. |
| Credentials per organization, entered on Settings, secret encrypted app-side | Platform-level `PAYPAL_*` environment variables | The app bills organizations as a product. A client's money must land in that contractor's PayPal, never the platform's. For Patrick today it is one card filled in once. |
| The app registers its own webhook with PayPal when credentials are saved | Patrick registers the URL in PayPal's dashboard and copies the webhook id over | One fewer manual step and one fewer thing to mistype. PayPal's API creates webhooks; the id comes back in the response. |
| Signature verification by posting the event back to PayPal's verify endpoint | Verifying the RSA signature locally | PayPal does the crypto and the certificate caching. One extra API call per event on an app that sees a handful of events a month. |
| The event is a trigger, not a fact: the handler fetches the invoice and acts on its current state | Act on the event body | PayPal delivers at least once and out of order. The fetched invoice is always current; the event may not be. |
| A PayPal payment is recorded at the gross amount; the fee stays blank | Record net, or record a fee of zero | The client paid the invoice in full; the fee is a cost. The invoice payment record does not carry the fee, and zero would be a lie. |
| Only PayPal-processed transactions post automatically | Also post payments Patrick marks as paid inside PayPal | A marked-as-paid entry may carry no PayPal transaction id, so there is no idempotency key. Those stay hand-recorded, which is where Patrick already is. |
| On a cancellation from PayPal's side, clear the pay link and log; never void the Foreman invoice | Mirror the cancellation as a void | The app is the source of truth. A vendor event does not get to delete the business's record. |

Reversal recorded: `docs/tech-stack.md` chose Stripe over PayPal for client payments.
Stripe stays for the app's own subscription billing. Client invoice payments go
through PayPal because it is the account the business collects on. The tech-stack row
is updated in this task.

## 3. The client's experience

1. The client gets an email from PayPal: "<Business> sent you an invoice for $X", with
   the invoice number, the lines, the due date, and a **Pay** button. Or Patrick texts
   them the same link from the Foreman.
2. They tap Pay and choose PayPal, a card, or Pay Later. No PayPal account is needed
   for a card.
3. PayPal sends them the receipt. The Foreman shows the invoice as paid within a
   minute, with the payment on the project.

That is the whole of it.

## 4. Where it lives

A new domain, `src/lib/paypal/`, in the Stripe shape. Nothing outside it calls PayPal.

| File | Owns |
|---|---|
| `paypal-core.ts` | Pure. `providerStatus()` for the environment and for a stored connection. API base URL by environment. Building the PayPal invoice request from a Foreman invoice (section 7). The PayPal→Foreman status and payment-method maps. `ledgerOpsFor(fetchedInvoice, knownExternalIds)`: the list of payment and refund rows a fetched PayPal invoice implies, minus the ones already recorded. Webhook header checks. The three webhook event names. Zero I/O. |
| `client.ts` | The only file that calls `api-m.paypal.com` or `api-m.sandbox.paypal.com`. OAuth token (client-credentials, cached per connection until shortly before expiry), create invoice, delete draft, send, get, create webhook, list webhooks, verify webhook signature. Takes a ready secret from `connection.ts` and never sees ciphertext. Plain `fetch`; no SDK. |
| `connection.ts` | Loading an organization's connection and turning it into a ready client; the only place the secret's ciphertext is read. Not `'use server'`. |
| `webhook.ts` | Applies a verified event: resolve the organization, fetch the invoice, compute the ledger ops in the core, write them. Not `'use server'`; never reachable from a browser. |
| `queries.ts` | Org-scoped reads: the connection summary for Settings, the PayPal fields of an invoice. |
| `actions.ts` | `'use server'`. `savePayPalConnection`, `disconnectPayPal` (gated `org:manage`); `sendInvoiceThroughPayPal` (gated `financials:write`). |
| `src/app/api/webhooks/paypal/route.ts` | Verifies and hands off. Raw body, no session. |
| `src/lib/invoices/ledger.ts` | New, plain module. The "apply a payment and its allocations, then recompute the invoice's paid, balance and status" block lifted out of `recordPayment` so the webhook and the form share one write path. `recordPayment` calls it; its behaviour does not change. |
| `src/components/paypal/` | The Settings card and the invoice card. |

`encryptToken`, `decryptToken` and `parseEncryptionKey` are imported from
`src/lib/google/google-core.ts`. They are pure AES-GCM helpers that happen to live
there; one implementation with one set of tests beats a copy.

## 5. Data model

Handled through the `db-change` skill: schema, generated migration, hand-written RLS
migration, RLS assertions, applied and verified on the live project.

### New table `paypal_connections`

One row per organization.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `organization_id` | uuid, not null, FK restrict | unique index |
| `environment` | text, not null | `'sandbox'` or `'live'`, CHECK |
| `client_id` | text, not null | CHECK non-blank. Not secret; PayPal shows it openly. |
| `client_secret_ciphertext` | text, not null | `v1.<iv>.<tag>.<ciphertext>`, never plaintext |
| `webhook_id` | text | Set when the app registers its webhook; CHECK non-blank when set |
| `webhook_url` | text | The URL registered, so a changed deployment URL is visible |
| `connected_by` | uuid FK users | |
| `connected_at` | timestamptz, not null | |
| `last_verified_at` | timestamptz | Last successful token fetch from Test connection or a send |
| `revoked_at` | timestamptz | CHECK `>= connected_at` when set. A revoked row keeps the audit trail; reconnecting updates it in place. |
| `created_at`, `updated_at` | timestamptz | `set_updated_at` trigger |

RLS: `ENABLE` and `FORCE`. Tenant policy for `select`. `insert`/`update` only for
members holding owner or administrator roles, through `has_role`, matching what
`org:manage` means. No `delete` policy: rows are revoked, not removed.

### `invoices` gains three columns

| Column | Type | Notes |
|---|---|---|
| `paypal_invoice_id` | text | PayPal's `INV2-…` id. Unique per organization where not null. |
| `paypal_pay_url` | text | `metadata.recipient_view_url`. Cleared on cancellation. |
| `paypal_sent_at` | timestamptz | Null between create and a successful send, which is how a failed send is retried without a duplicate. |

The freeze trigger `invoices_freeze_when_issued` guards amounts, number, type and
ownership and does not name these columns, so they stay writable on an issued
invoice. Confirmed in `drizzle/0030_invoices_rls.sql`; the RLS assertions prove it.

### `payment_method` enum gains `paypal`

For money that arrived from a PayPal balance or Pay Later. Card payments through
PayPal stay `card`; bank transfers stay `ach`. `PAYMENT_METHODS` and its labels in
`invoices-core.ts` gain the value too, so the record-payment form can also pick it.
Postgres adds the enum value in its own migration file, ahead of anything that uses
it.

### Already there and reused

`payments.external_id` with its unique index per organization (idempotency),
`payments.processor_fee` (left null), `payments.is_refund`, `payment_allocations`.

## 6. Credentials and configuration

**Environment:** one new variable, `PAYPAL_CREDENTIAL_ENCRYPTION_KEY`, 32 random
bytes as base64, generated with `openssl rand -base64 32`, documented in
`.env.example` beside the Google key. Rotating it invalidates every stored PayPal
connection; organizations reconnect once.

**Settings card** (`org:manage` only), below the Google card:

- Not configured on the deployment: the card names the missing variable and nothing
  else is offered. `providerStatus()` pattern.
- No connection: a form with Environment (sandbox / live), Client ID, Client secret
  (password field), and **Save and test**. Saving fetches a token with the pair and
  registers the webhook. If the token fetch fails, nothing is stored and the card
  says PayPal refused the pair. If the token works but the webhook registration
  fails, the credentials are stored, `webhook_id` stays null, and the card says
  payments will not post automatically until **Retry webhook** succeeds.
- Connected: environment badge (a plain "SANDBOX" badge when it is sandbox, so a
  test setup is never mistaken for live), the client id, when it was last verified,
  the registered webhook URL, **Test connection**, **Retry webhook** when needed, and
  **Disconnect**.

**Webhook registration:** `POST /v1/notifications/webhooks` with the deployment's
`<app URL>/api/webhooks/paypal` and the three event types. Before creating, list the
app's webhooks and reuse one that already points at that URL, so saving twice does
not register twice.

The client secret is decrypted only in `connection.ts`, for the lifetime of one
token fetch. Tokens are held in process memory, never stored.

## 7. Sending an invoice through PayPal

`sendInvoiceThroughPayPal(invoiceId)`, `financials:write`.

**Refuses, with the reason on screen, when:**

- the organization has no live PayPal connection ("Connect PayPal in Settings first");
- the invoice is a draft or void ("Issue the invoice first; its amounts have to be
  locked before a client can pay them");
- the invoice is already paid;
- the client has no email address ("Add an email address to the client; PayPal
  sends the invoice to it");
- the invoice already has a `paypal_invoice_id` and `paypal_sent_at` ("Already sent
  through PayPal on <date>").

**Flow:**

1. Build the request in the core (table below).
2. `POST /v2/invoicing/invoices`. On 201, store `paypal_invoice_id` immediately.
3. Compare PayPal's computed `amount.value` with the Foreman total. If they differ,
   `DELETE` the draft, clear the id, and refuse: "PayPal computed $X for this invoice;
   the Foreman has $Y. Nothing was sent." Sandbox testing will show whether PayPal's
   per-item tax rounding ever disagrees with the Foreman's tax-on-subtotal by a
   cent; if it does, the follow-up is a labelled rounding adjustment through
   `amount.breakdown.custom`, decided then, not guessed now.
4. `POST …/send` with `send_to_recipient: true`, `send_to_invoicer: true`. 200 and
   202 are both success.
5. `GET` the invoice; store `metadata.recipient_view_url` and set `paypal_sent_at`.
6. If step 4 or 5 fails, the id is kept and `paypal_sent_at` stays null. The button
   becomes **Retry send** and sends the existing PayPal invoice rather than creating
   another.

**Request mapping, Foreman → PayPal:**

| PayPal field | Source | Rule |
|---|---|---|
| `detail.invoice_number` | `invoices.invoice_number` | Verbatim. PayPal refuses a duplicate number within the account; the error is shown as "PayPal already has an invoice numbered N". |
| `detail.invoice_date` | `invoices.issued_at` | As a calendar day in the organization's timezone. |
| `detail.currency_code` | | `USD` |
| `detail.payment_term` | `invoices.due_date` | `DUE_ON_DATE_SPECIFIED` with the date; `DUE_ON_RECEIPT` when null. |
| `detail.note` | | "Invoice N from <business>. Pay securely with the button below." followed by `payment_instructions` when set. Appears in PayPal's email. |
| `detail.memo` | `invoices.id` | `foreman:<uuid>`. Private to the merchant; ties the PayPal record back to ours from PayPal's side. |
| `invoicer.business_name` | `organizations.name` | |
| `invoicer.logo_url` | `organizations.logo_url` | Only when it is an `https` URL. PayPal fills address and email from the account. |
| `primary_recipients[0].billing_info.business_name` | `clients.company_name` or `clients.display_name` | The display name for everyone. Splitting a person's name into given and surname guesses wrong on "Mary Ann Lee" and on "Dr. J. Smith", and the field is display only. |
| `primary_recipients[0].billing_info.email_address` | `clients.primary_email` | Required. |
| `items[]` | `invoice_line_items` in `sort_order` | `name` = first 200 characters of the description; `description` = the rest, up to 1000. `quantity` as a string with up to four decimals. `unit_amount` = `unit_price` in USD. `unit_of_measure` = `QUANTITY`. |
| `items[].tax` | `invoices.tax_rate`, `invoice_line_items.taxable` | Only on taxable lines: `{ name: 'Sales tax', percent: <rate> }`. Untaxed lines carry no tax object. This is what keeps exempt labor exempt on the client's copy. |
| `amount.breakdown.discount.invoice_discount.amount` | `invoices.credits` | Only when greater than zero. |
| `configuration.tax_calculated_after_discount` | | `false`. The Foreman taxes the taxable subtotal and subtracts credits after tax, which is tax-before-discount in PayPal's terms. |
| `configuration.tax_inclusive` | | `false` |
| `configuration.allow_tip` | | `false` |
| `configuration.partial_payment.allow_partial_payment` | | `false` |

Everything in this table is a pure function in the core with a test per row.

## 8. Payments landing: the webhook

`POST /api/webhooks/paypal`. No session, no cookie. `dynamic = 'force-dynamic'`.

1. Read the raw body. Require the five `PAYPAL-*` headers; without them, 400.
2. Parse the envelope. Take `resource.id` (the PayPal invoice id). Look up the
   invoice across organizations by `paypal_invoice_id` — the one deliberately
   cross-tenant read in this domain, the same way the Stripe webhook finds a
   subscription by its Stripe id, because PayPal does not know our organizations.
   If none, respond 200
   `{ ignored: 'not ours' }` without verifying and without acting: an invoice Patrick
   made in PayPal's own screens, or a stray event, is not this app's business, and a
   200 stops PayPal retrying it for three days.
3. Load that organization's connection. Post the headers, the stored `webhook_id` and
   the raw body back to `POST /v1/notifications/verify-webhook-signature`. Anything
   but `verification_status: 'SUCCESS'` is a 400 and a warning in the log.
4. Apply by `event_type`:

| Event | Does |
|---|---|
| `INVOICING.INVOICE.PAID` | Fetch the invoice. For every `payments.transactions[]` entry with `type: 'PAYPAL'` and a `payment_id` not already in `payments.external_id` for this organization: insert a payment at `amount.value` (gross), `method` from the map below, `payment_date` from the entry, `reference_number` and `external_id` = `payment_id`, `notes` = "PayPal invoice <id>", `locked_at` now, `created_by` null, project and client from the invoice; one allocation for the full amount; then the shared ledger recompute. Entries with `type: 'EXTERNAL'` are logged and left to hand entry. |
| `INVOICING.INVOICE.REFUNDED` | Fetch the invoice. For every `refunds.transactions[]` entry with `type: 'PAYPAL'` and a `refund_id` not already recorded: insert a payment with `is_refund: true`, the refund amount, `external_id` = `refund_id`, and an allocation of the negative amount to the invoice, so the shared recompute nets it off. |
| `INVOICING.INVOICE.CANCELLED` | Clear `paypal_pay_url` so nobody texts a dead link. Keep the id. Log. The Foreman invoice's status is untouched. |
| anything else | 200 `{ ignored: <type> }` |

Payment-method map: `PAYPAL` → `paypal`; `CREDIT_CARD`, `DEBIT_CARD` → `card`;
`BANK_TRANSFER`, `WIRE_TRANSFER` → `ach`; `CASH` → `cash`; `CHECK` → `check`;
`OTHER` → `other`.

**Shared ledger recompute** (`src/lib/invoices/ledger.ts`): `amount_paid` is the sum
of the invoice's allocations, `balance` is `balanceOf(total, amount_paid)`, and status
becomes `paid` when the balance is zero, `partially_paid` when something is paid, and
back to `sent` when a refund takes it to nothing. `recordPayment` today only moves
to `paid` or `partially_paid`; the `sent` case is new and only a refund reaches it.

**Idempotency:** the unique index on `(organization_id, external_id)` makes a
redelivered event a no-op at the database, and the core skips ids it has already
seen before that. **Out of order:** the fetched invoice is current whatever the
event's age. **Transient failure** (database unreachable, PayPal fetch timed out):
throw, respond 500, PayPal retries, up to 25 times over 3 days. **Permanent
failure** (an invoice shape the core refuses): log at error, respond 200 so it is
not retried, and the Foreman invoice shows "PayPal reported a payment the app could
not record; see the log" on its PayPal card.

Every outcome is logged with the event id, type, invoice id and what was written.
Never the pay URL, never a token, never the secret.

## 9. Screens

Mobile first; every control reachable one-handed.

**Invoice detail, a PayPal card** after the Amount card:

| State | Shows |
|---|---|
| Deployment or organization not set up | "PayPal isn't connected. Connect it in Settings." with the link, and the missing variable when that is the cause. |
| Draft or void | "Issue the invoice first; PayPal sends locked amounts." Button disabled. |
| No client email | "Add an email address to <client> first." with a link to the client. |
| Ready | The client's email as it will be sent to, and **Send through PayPal**. |
| Created, not sent | "Created on PayPal but not sent." and **Retry send**. |
| Sent | "Sent through PayPal on <date> to <email>." The pay link with **Copy link** (for texting). |
| Paid | "Paid through PayPal on <date>." The payment is in the list below like any other. |

**Printed invoice:** a line under payment instructions, "Pay online: <pay URL>", when
the URL is set. Self-contained HTML, no new styling.

**Settings → PayPal card:** section 6.

## 10. Permissions

| Action | Permission |
|---|---|
| Save, test, retry, disconnect the connection | `org:manage` |
| Send an invoice through PayPal; see the PayPal card | `financials:write` to act, `financials:read` to see |
| Webhook | none; the verified signature is the credential |

## 11. Testing

**Unit** (`paypal-core.test.ts`, `ledger.test.ts`): every row of the request-mapping
table, including a mixed taxable/exempt invoice, a credit, a null due date, a
description over 200 characters; the status and method maps; `ledgerOpsFor` with a
single payment, a redelivered payment, a refund, an external payment, an unknown
transaction type; `providerStatus` for each missing piece; header checks; the
`sent`/`partially_paid`/`paid` recompute including the refund-to-zero case.

**Webhook** (`webhook.test.ts`): recorded fixtures from PayPal's documented event
shape, against a fake client: paid once, paid delivered twice, refunded, cancelled,
unknown invoice, verification failure, fetch timeout → thrown.

**RLS** (`scripts/rls-assertions.sql`): `paypal_connections` invisible across
tenants; a technician cannot insert or update one; environment and non-blank
checks; revoked-before-connected refused; `paypal_invoice_id` unique per
organization; the three invoice columns writable on an issued invoice while the
frozen columns still raise `restrict_violation`.

**Gate:** `pnpm typecheck && pnpm lint && pnpm test && pnpm build`, then
`bash scripts/test-rls.sh` and `bash scripts/test-setup-sql.sh`. Real counts quoted.

**Sandbox, with Patrick's sandbox app, before anything live:** connect in sandbox
mode on a Vercel preview, send a test invoice to a sandbox buyer, pay it as that
buyer, watch the webhook log line and the ledger row, then refund it in PayPal's
sandbox and watch the refund row. This is the only way the end-to-end path is
proven; the container cannot do it.

**Live:** switch the Settings card to the live app, send one real invoice, and watch
the first real payment land. Until that has happened, the agent log and `CLAUDE.md`
say so.

## 12. Rollout, in order

1. Merge and deploy. Set `PAYPAL_CREDENTIAL_ENCRYPTION_KEY` on Vercel.
2. On developer.paypal.com: create a sandbox REST app and a sandbox buyer account.
   Enter the sandbox client id and secret on Settings with Environment = sandbox.
3. Run the sandbox check in section 11.
4. Create the live REST app. Enter its pair on Settings with Environment = live.
5. Send one real invoice and watch it.

## 13. Out of scope

Stripe and the app's subscription billing. A client-facing invoice page. Reminders
(PayPal's dashboard sends them). Refunds started from the app. Pulling PayPal's fee
into `processor_fee`. Partial payments. Disputes. Multiple recipients. Any change to
how invoices are built or issued.

## 14. Documents this task updates

`docs/tech-stack.md` (the Stripe row: PayPal for client payments, with the date and
reason), `CLAUDE.md` (open item 4, the domain list, the seam section, the schema
counts), `.env.example`, `.claude/skills/paypal/SKILL.md` (the "not built" section
becomes "how it is built"), and `docs/agent-log.md`.
