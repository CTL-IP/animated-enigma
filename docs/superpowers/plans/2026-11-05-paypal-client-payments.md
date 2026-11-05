# PayPal Client Payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An issued Foreman invoice can be sent to the client as a PayPal-hosted invoice with one tap, and the payment PayPal collects lands in the Foreman's ledger on its own, once, at the right amount.

**Architecture:** A new `src/lib/paypal/` seam in the Stripe shape: a pure core that makes every decision, one client file that talks to PayPal over plain `fetch`, a webhook applier behind an injectable dependency port, and the route. Credentials are per organization, encrypted app-side with the AES helpers already in `google-core.ts`. The ledger write that `recordPayment` does inline is lifted into a shared module so the webhook and the form take one path.

**Tech Stack:** Next.js 15.1.6 App Router, React 18.3.1, TypeScript strict, Drizzle 0.36.4 on Supabase Postgres 17, Vitest + jsdom + Testing Library, Tailwind, pnpm. PayPal Invoicing API v2 and Webhooks API v1 over `fetch`; no PayPal SDK.

**Spec:** `docs/superpowers/specs/2026-11-05-paypal-client-payments-design.md`. The plan argues from the spec; read both.

## Global Constraints

- Branch `claude/new-session-w4xlnw`; push only there. Never force-push. Every commit ends with the attribution trailer this harness supplies (the `Co-Authored-By` and `Claude-Session` lines). No model identifier anywhere else in a repo artifact.
- `CLAUDE.md` binding rules hold: review before changing; only the required changes; preserve working functionality; validation and error handling are part of the work; never record something as run, applied or verified unless it was.
- Money is `numeric(14,2)`; a calendar day is `date`; anything time-dependent takes `now: Date = new Date()` as a defaulted last parameter; say nothing rather than zero (null, never `0`, for a value that is not known).
- External services go behind the seam: nothing outside `src/lib/paypal/` calls PayPal. A credential that outlives a request is encrypted app-side; `parseEncryptionKey` refuses anything but exactly 32 base64 bytes. When a feature is off, the screen names the missing variable.
- Never log a pay URL, a token, a client secret or ciphertext. Log event ids, invoice ids, types and outcomes.
- Every tenant table gets `ENABLE` and `FORCE` row level security and a tenant policy; every trigger function pins `set search_path = ''`.
- User-facing copy is plain and says what to do. Comments explain why, and why not the obvious alternative.
- Mobile first: every control reachable one-handed; no nested `<form>`.
- Before any commit: `pnpm typecheck && pnpm lint && pnpm test`; quote the real counts. The container starts without `node_modules`: run `pnpm install --frozen-lockfile` once before Task 1.
- Nothing in this plan calls the live PayPal API from this environment. The sandbox and live runs in Task 10 need Patrick's credentials and are reported as done only when they were.

## Review Focus

Inputs the spec implies but no section tests directly. Each has its test in the task named.

1. A client email with surrounding whitespace or capitals, or no `@` at all → trimmed and lower-cased before it reaches PayPal; an unusable one refuses the send with "Add a valid email address to <client> first." (Task 4)
2. A line with a fractional quantity such as `1.5`, or one stored as `0` → `1.5` is sent as `"1.5"`, not `"1.5000"`; a zero quantity refuses the build naming the line. (Task 4)
3. PayPal already holds an invoice with this number → the 422 is read, not swallowed, and the screen says "PayPal already has an invoice numbered N. Change the number on PayPal's side or void and re-issue here." (Task 4, Task 8)
4. A webhook for an invoice whose organization has since disconnected PayPal → answered 200 and logged, never 500, so PayPal does not retry it for three days against a connection that is gone. (Task 9)
5. A PayPal payment arriving for a Foreman invoice that was voided after sending → the money is recorded, the allocation is written, and the invoice stays `void`; the recompute never promotes a void invoice. (Task 2, Task 5)

---

### Task 1: Schema, migrations, RLS

**Files:**
- Modify: `src/db/schema.ts` (`paymentMethodEnum`, `invoices`, new `paypalConnections`, type exports at the bottom)
- Create: `drizzle/0051_<generated>.sql` (by `pnpm db:generate`; never hand-edited)
- Create: `drizzle/0052_paypal_rls.sql`
- Modify: `drizzle/meta/_journal.json`, create `drizzle/meta/0052_snapshot.json` (by the registration script in the `db-change` skill)
- Modify: `scripts/rls-assertions.sql` (append a section before the final `reset role`)
- Modify: `scripts/supabase-setup.sql` (append `-- ═══ Part 31 — Task 34: PayPal client payments ═══`)

**Interfaces:**
- Consumes: `organizations`, `users`, `invoices`, `payments`, `has_role(org uuid, wanted user_role)`, `current_org()`, `is_member_of()`, `set_updated_at()`, all existing.
- Produces: table `paypal_connections` and Drizzle `schema.paypalConnections` with columns `id`, `organizationId`, `environment` (text), `clientId`, `clientSecretCiphertext`, `webhookId`, `webhookUrl`, `connectedBy`, `connectedAt`, `lastVerifiedAt`, `revokedAt`, `createdAt`, `updatedAt`; `invoices.paypalInvoiceId`, `invoices.paypalPayUrl`, `invoices.paypalSentAt`; enum value `'paypal'` on `payment_method`; `export type PayPalConnection = typeof paypalConnections.$inferSelect`.

- [ ] **Step 1: Follow the `db-change` skill, section 1.** In `src/db/schema.ts`: append `'paypal'` to `paymentMethodEnum`; add to `invoices` the three columns `paypalInvoiceId: text('paypal_invoice_id')`, `paypalPayUrl: text('paypal_pay_url')`, `paypalSentAt: timestamp('paypal_sent_at', { withTimezone: true })`, and in its index list `uniqueIndex('invoices_org_paypal_invoice_idx').on(table.organizationId, table.paypalInvoiceId).where(sql\`paypal_invoice_id is not null\`)`; add `paypalConnections = pgTable('paypal_connections', …)` with the columns above (`organizationId` with `onDelete: 'restrict'`, `connectedBy` referencing `users.id`, `connectedAt` not null default now, `createdAt`/`updatedAt` as every other table) and `uniqueIndex('paypal_connections_org_idx').on(table.organizationId)`; add the type export beside `GoogleConnection`. The doc comment says why one row per organization and why the secret column holds ciphertext.

- [ ] **Step 2: Generate the DDL.** Run: `pnpm db:generate`. Expected: a new `drizzle/0051_*.sql` containing `ALTER TYPE "public"."payment_method" ADD VALUE 'paypal';`, the three `ALTER TABLE "invoices" ADD COLUMN` lines, the `CREATE TABLE "paypal_connections"`, and the two indexes. Confirm nothing in that file uses the new enum value.

- [ ] **Step 3: Write `drizzle/0052_paypal_rls.sql`.** Model it on `drizzle/0050_billing_rls.sql`. It contains, in order: a header comment on why the write policy is owner-only (what `org:manage` means, and `has_role(…, 'owner')` is its database form); CHECK constraints `paypal_connections_environment_known` (`environment in ('sandbox','live')`), `paypal_connections_has_client_id` (`char_length(client_id) > 0`), `paypal_connections_webhook_id_not_blank` (`webhook_id is null or char_length(webhook_id) > 0`), `paypal_connections_revoked_after_connected` (`revoked_at is null or revoked_at >= connected_at`); the `set_updated_at` trigger; `enable` and `force` row level security; policy `paypal_connections_tenant` for `select` using the tenant predicate; policy `paypal_connections_owner_insert` for `insert` with check (tenant predicate `and has_role(organization_id, 'owner')`); policy `paypal_connections_owner_update` for `update` using and with check the same. No delete policy, and the comment says rows are revoked, not removed.

- [ ] **Step 4: Register the migration.** Run the registration script from the `db-change` skill, section 4, with `TAG = '0052_paypal_rls'`, `PREV = '0051'`, `NEW = '0052'`. Expected output: `journal appended` and `snapshot chained`.

- [ ] **Step 5: Write the failing RLS assertions.** Append to `scripts/rls-assertions.sql`, before the final `reset role`, a section headed `-- ═══ PayPal client payments (Task 34) ═══` in the file's `do $$ … exception when <errcode> then raise notice 'PASS: …'` shape, as these roles:

  As Alice (org A owner): insert a connection (`environment 'sandbox'`, `client_id 'cid-a'`, `client_secret_ciphertext 'v1.x.y.z'`) → `PASS: an owner can store the organization's PayPal connection`; a second row for org A → `unique_violation` → `PASS: one PayPal connection per organization`; `environment 'prod'` → `check_violation`; `client_id ''` → `check_violation`; update `revoked_at = connected_at - interval '1 hour'` → `check_violation`; `delete from paypal_connections` → row count 0 → `PASS: a PayPal connection is revoked, never deleted`. Insert an invoice for org A with `status 'sent'`, then `update invoices set paypal_invoice_id = 'INV2-TEST', paypal_pay_url = 'https://www.paypal.com/invoice/p/x', paypal_sent_at = now()` on it → succeeds → `PASS: PayPal fields stay writable on an issued invoice`; then `update invoices set total = total + 1` on the same row → `restrict_violation` → `PASS: the freeze still holds beside the PayPal fields`; a second invoice for org A with the same `paypal_invoice_id` → `unique_violation`.

  As Carl (org A estimator, fixture user `00000ccc-…`): `select count(*) from paypal_connections` = 1 → `PASS: a member can see the organization's connection`; insert a connection → `insufficient_privilege` → `PASS: only an owner can store a PayPal connection`; update `client_id` → row count 0 → `PASS: only an owner can change it`.

  As Bob (org B owner): `select count(*) from paypal_connections` = 0 → `PASS: cross-org SELECT isolation (paypal_connections)`.

- [ ] **Step 6: Run the harness to green.** Run: `bash scripts/test-rls.sh`. Expected: every existing `PASS:` line plus the fourteen new ones; exit 0. If an assertion raises, fix the migration, not the assertion, unless the assertion encoded the wrong rule, and say which.

- [ ] **Step 7: Mirror into the setup script.** Append Part 31 to `scripts/supabase-setup.sql`, guard-wrapped per the `db-change` skill section 6: `alter type payment_method add value if not exists 'paypal';`, `create table if not exists paypal_connections (…)`, `alter table invoices add column if not exists …` ×3, `create unique index if not exists …` ×2, the four constraints inside `do $$ begin … exception when duplicate_object then null; end $$;`, `drop trigger if exists` / `create trigger`, enable + force, `drop policy if exists` / `create policy` ×3.

- [ ] **Step 8: Verify the mirror.** Run: `bash scripts/test-setup-sql.sh`. Expected: exit 0 and no table reported without ENABLE + FORCE.

- [ ] **Step 9: Typecheck and commit.** Run: `pnpm typecheck`. Expected: no errors (the new columns are unused yet). Commit: `git add src/db/schema.ts drizzle scripts/rls-assertions.sql scripts/supabase-setup.sql && git commit -m "Task 34: PayPal connection table, invoice PayPal columns, paypal payment method"` with the body naming the migration files and stating that they are **not yet applied to the live project** (Task 10 does that).

### Task 2: One ledger write path, and a status rule that respects void

**Files:**
- Modify: `src/lib/invoices/invoices-core.ts` (`PAYMENT_METHODS`, `PAYMENT_METHOD_LABELS`, new `nextInvoiceStatus`)
- Modify: `src/lib/invoices/invoices-core.test.ts`
- Create: `src/lib/invoices/ledger.ts`
- Modify: `src/lib/invoices/actions.ts` (`recordPayment` calls the shared module)

**Interfaces:**
- Consumes: `balanceOf`, `toNum`, `schema.payments`, `schema.paymentAllocations`, `schema.invoices`.
- Produces:
  - `nextInvoiceStatus(current: InvoiceStatus, total: string | number, amountPaid: string | number): InvoiceStatus`
  - `PAYMENT_METHODS` now includes `'paypal'` with label `'PayPal'`.
  - In `ledger.ts`: `type Tx` (the Drizzle transaction type used in `actions.ts`), `interface LedgerPaymentInput { organizationId: string; projectId: string | null; clientId: string | null; amount: number; method: PaymentMethod; paymentDate: string; referenceNumber: string | null; externalId: string | null; notes: string | null; isRefund: boolean; createdBy: string | null; allocations: { invoiceId: string; amount: number }[] }` and `applyPaymentWithAllocations(tx: Tx, input: LedgerPaymentInput, now?: Date): Promise<{ paymentId: string } | { duplicate: true }>`.

- [ ] **Step 1: Write the failing tests** in `invoices-core.test.ts`:

```ts
describe('nextInvoiceStatus', () => {
  it('never promotes a void invoice', () => expect(nextInvoiceStatus('void', 100, 100)).toBe('void'));
  it('leaves a draft alone', () => expect(nextInvoiceStatus('draft', 100, 0)).toBe('draft'));
  it('is paid at or above the total', () => expect(nextInvoiceStatus('sent', '100.00', '100.00')).toBe('paid'));
  it('is partially paid with money against it', () => expect(nextInvoiceStatus('sent', 100, 40)).toBe('partially_paid'));
  it('returns to sent when a refund takes it to nothing', () => expect(nextInvoiceStatus('paid', 100, 0)).toBe('sent'));
});
it('lists paypal as a payment method with a label', () => {
  expect(PAYMENT_METHODS).toContain('paypal');
  expect(PAYMENT_METHOD_LABELS.paypal).toBe('PayPal');
});
```

- [ ] **Step 2: Run to verify failure.** Run: `pnpm vitest run src/lib/invoices/invoices-core.test.ts`. Expected: FAIL, `nextInvoiceStatus is not a function` and the `toContain` assertion.

- [ ] **Step 3: Implement** `nextInvoiceStatus` in `invoices-core.ts` under the status-derivation section, and the enum additions (append `'paypal'` last so existing index-based tests keep passing).

- [ ] **Step 4: Run to verify pass.** Run: `pnpm vitest run src/lib/invoices`. Expected: PASS, every existing test still green.

- [ ] **Step 5: Create `ledger.ts`** with `applyPaymentWithAllocations`. It is a plain module (no `'use server'`), and its doc comment says why: it checks no permission. Behaviour: when `externalId` is set and a row with that `(organizationId, externalId)` already exists, return `{ duplicate: true }` without writing; otherwise insert the payment with `lockedAt: now`, insert each allocation with `lockedAt: now`, and for each touched invoice recompute `amountPaid` from the sum of its allocations, `balance` with `balanceOf`, and `status` with `nextInvoiceStatus(current, total, amountPaid)`. The body is the transaction block currently inside `recordPayment`, moved, with the status line replaced.

- [ ] **Step 6: Make `recordPayment` call it** with `isRefund: false`, `externalId: null`, and the form's values. Nothing else in `recordPayment` changes; the pre-checks stay where they are.

- [ ] **Step 7: Verify.** Run: `pnpm typecheck && pnpm vitest run src/lib/invoices`. Expected: no type errors; PASS.

- [ ] **Step 8: Commit.** `git add src/lib/invoices && git commit -m "Task 34: shared ledger write path and a status rule that respects void"`.

### Task 3: The PayPal core, part 1 — status, environment, maps, headers

**Files:**
- Create: `src/lib/paypal/paypal-core.ts`
- Create: `src/lib/paypal/paypal-core.test.ts`

**Interfaces:**
- Consumes: `parseEncryptionKey` from `@/lib/google/google-core`; `InvoiceStatus`, `PaymentMethod` from `@/lib/invoices/invoices-core`.
- Produces:
  - `type PayPalEnvironment = 'sandbox' | 'live'`; `isPayPalEnvironment(value: string): value is PayPalEnvironment`; `PAYPAL_API_BASE: Record<PayPalEnvironment, string>` = `{ sandbox: 'https://api-m.sandbox.paypal.com', live: 'https://api-m.paypal.com' }`.
  - `PAYPAL_EVENTS = ['INVOICING.INVOICE.PAID', 'INVOICING.INVOICE.REFUNDED', 'INVOICING.INVOICE.CANCELLED'] as const`; `type PayPalEventType`; `isPayPalEvent(type: string): type is PayPalEventType`.
  - `interface PayPalEnv { encryptionKey?: string | null }`; `interface ProviderStatus { configured: boolean; missing: string[]; message: string }`; `providerStatus(env: PayPalEnv): ProviderStatus`.
  - `interface ConnectionRow { environment: string; clientId: string; webhookId: string | null; webhookUrl: string | null; connectedAt: Date; lastVerifiedAt: Date | null; revokedAt: Date | null }`; `interface ConnectionSummary { live: boolean; environment: PayPalEnvironment; clientId: string; webhookRegistered: boolean; webhookUrl: string | null; connectedOn: string; lastVerifiedOn: string | null }`; `connectionSummary(row: ConnectionRow): ConnectionSummary`.
  - `type PayPalInvoiceStatus` = the sixteen values in the spec's status table plus `'PAID_EXTERNAL' | 'REFUNDED_EXTERNAL' | 'SHARED'`; `mapPayPalStatus(status: string): InvoiceStatus | null` (null = leave the Foreman status alone).
  - `mapPayPalMethod(method: string | null | undefined): PaymentMethod`.
  - `interface WebhookHeaders { transmissionId: string; transmissionTime: string; transmissionSig: string; certUrl: string; authAlgo: string }`; `readWebhookHeaders(get: (name: string) => string | null): WebhookHeaders | null` (null when any of the five `paypal-*` headers is missing or blank).

- [ ] **Step 1: Write the failing tests** (`paypal-core.test.ts`, import style as `stripe-core.test.ts`):

```ts
describe('providerStatus', () => {
  it('names the missing key', () => {
    const s = providerStatus({ encryptionKey: null });
    expect(s.configured).toBe(false);
    expect(s.missing).toEqual(['PAYPAL_CREDENTIAL_ENCRYPTION_KEY']);
    expect(s.message).toContain('PAYPAL_CREDENTIAL_ENCRYPTION_KEY');
  });
  it('refuses a key that is not 32 bytes', () => {
    expect(providerStatus({ encryptionKey: 'c2hvcnQ=' }).configured).toBe(false);
  });
  it('is configured with a 32-byte base64 key', () => {
    expect(providerStatus({ encryptionKey: Buffer.alloc(32, 7).toString('base64') }).configured).toBe(true);
  });
});
describe('maps', () => {
  it('maps PayPal statuses onto the Foreman', () => {
    expect(mapPayPalStatus('SENT')).toBe('sent');
    expect(mapPayPalStatus('UNPAID')).toBe('sent');
    expect(mapPayPalStatus('MARKED_AS_PAID')).toBe('paid');
    expect(mapPayPalStatus('PAYMENT_PENDING')).toBeNull();
    expect(mapPayPalStatus('AUTO_CANCELLED')).toBe('void');
    expect(mapPayPalStatus('nonsense')).toBeNull();
  });
  it('maps payment methods', () => {
    expect(mapPayPalMethod('PAYPAL')).toBe('paypal');
    expect(mapPayPalMethod('DEBIT_CARD')).toBe('card');
    expect(mapPayPalMethod('WIRE_TRANSFER')).toBe('ach');
    expect(mapPayPalMethod(undefined)).toBe('other');
  });
});
describe('readWebhookHeaders', () => {
  it('returns null when a header is missing', () => {
    expect(readWebhookHeaders(() => null)).toBeNull();
  });
  it('reads all five case-insensitively', () => {
    const h = readWebhookHeaders((n) => ({ 'paypal-transmission-id': 'id', 'paypal-transmission-time': 't', 'paypal-transmission-sig': 's', 'paypal-cert-url': 'https://api.paypal.com/cert', 'paypal-auth-algo': 'SHA256withRSA' })[n.toLowerCase()] ?? null);
    expect(h?.certUrl).toBe('https://api.paypal.com/cert');
  });
});
describe('connectionSummary', () => {
  it('is live only while not revoked', () => {
    const row = { environment: 'sandbox', clientId: 'c', webhookId: null, webhookUrl: null, connectedAt: new Date('2026-11-05T00:00:00Z'), lastVerifiedAt: null, revokedAt: null };
    expect(connectionSummary(row).live).toBe(true);
    expect(connectionSummary(row).webhookRegistered).toBe(false);
    expect(connectionSummary({ ...row, revokedAt: new Date() }).live).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure.** Run: `pnpm vitest run src/lib/paypal`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement** `paypal-core.ts` with the interfaces above. The module header comment explains, as `stripe-core.ts` does, that PayPal is the collection rail and the Foreman invoice is the record. `providerStatus`'s configured message: "PayPal is set up on this deployment. Connect the business's PayPal account below." Its missing message: "PayPal isn't available yet. Missing: PAYPAL_CREDENTIAL_ENCRYPTION_KEY. Nothing can be stored until it is set." `connectedOn`/`lastVerifiedOn` use `formatCalendarDate` from `invoices-core`, which prints `11/5/2026`.

- [ ] **Step 4: Run to verify pass.** Run: `pnpm vitest run src/lib/paypal`. Expected: PASS.

- [ ] **Step 5: Commit.** `git add src/lib/paypal && git commit -m "Task 34: PayPal core — status, environment, maps, webhook headers"`.

### Task 4: The PayPal core, part 2 — building the invoice request

**Files:**
- Modify: `src/lib/paypal/paypal-core.ts`
- Modify: `src/lib/paypal/paypal-core.test.ts`

**Interfaces:**
- Consumes: `isEmailAddress` from `@/lib/email/email-core`; `lineAmount`, `invoiceTotals`, `isCollectable`, `toNum`.
- Produces:
  - `interface ForemanInvoiceForPayPal { id: string; invoiceNumber: string; issuedAt: Date | null; dueDate: string | null; taxRatePercent: number; credits: number; total: number; paymentInstructions: string | null; lines: { description: string; quantity: string | number; unitPrice: string | number; taxable: boolean }[] }`
  - `interface OrgForPayPal { name: string; logoUrl: string | null; timezone: string }`
  - `interface ClientForPayPal { displayName: string; companyName: string | null; email: string | null }`
  - `interface PayPalInvoiceBody` — the request subset: `detail { invoice_number, invoice_date, currency_code, note, memo, payment_term { term_type, due_date? } }`, `invoicer { business_name, logo_url? }`, `primary_recipients: [{ billing_info: { business_name, email_address } }]`, `items: { name, description?, quantity, unit_amount: { currency_code, value }, tax?: { name, percent }, unit_of_measure }[]`, `configuration { tax_calculated_after_discount, tax_inclusive, allow_tip, partial_payment: { allow_partial_payment } }`, `amount?: { breakdown: { discount: { invoice_discount: { amount: { currency_code, value } } } } }`.
  - `type BuildResult = { ok: true; body: PayPalInvoiceBody } | { ok: false; error: string }`; `buildInvoiceRequest(invoice: ForemanInvoiceForPayPal, org: OrgForPayPal, client: ClientForPayPal, now?: Date): BuildResult`
  - `calendarDateInZone(instant: Date, timeZone: string): string` (`YYYY-MM-DD`)
  - `formatQuantity(value: string | number): string | null` (null for zero, negative or unparseable; otherwise up to four decimals with trailing zeros trimmed)
  - `money(value: string | number): string` (two decimals, as a string)
  - `totalsAgree(paypalValue: string, foremanTotal: number): boolean`
  - `interface SendPreconditionInput { status: InvoiceStatus; clientEmail: string | null; clientName: string; paypalInvoiceId: string | null; paypalSentAt: Date | null; connectionLive: boolean }`; `sendPreconditions(input: SendPreconditionInput): { ok: true; retry: boolean } | { ok: false; error: string }`
  - `explainPayPalError(status: number, body: unknown, invoiceNumber: string): string`

- [ ] **Step 1: Write the failing tests.** The fixture: an invoice numbered `INV-2026-0031`, issued `2026-11-05T03:30:00Z`, due `2026-11-20`, tax rate `8.25`, credits `50`, two lines: `Demo and haul-off` qty `1` at `450` not taxable, `Tile, 120 sq ft` qty `1.5` at `300` taxable; org `PT's Tactical Renovations`, logo `https://example.test/logo.png`, timezone `America/Chicago`; client display `Mary Ann Lee`, company null, email `  Mary@Example.com `.

```ts
describe('buildInvoiceRequest', () => {
  it('maps number, dates and terms', () => {
    const r = buildInvoiceRequest(invoice, org, client, new Date('2026-11-05T12:00:00Z'));
    if (!r.ok) throw new Error(r.error);
    expect(r.body.detail.invoice_number).toBe('INV-2026-0031');
    expect(r.body.detail.invoice_date).toBe('2026-11-04'); // 03:30Z is the 4th in Chicago
    expect(r.body.detail.payment_term).toEqual({ term_type: 'DUE_ON_DATE_SPECIFIED', due_date: '2026-11-20' });
    expect(r.body.detail.memo).toBe(`foreman:${invoice.id}`);
    expect(r.body.detail.currency_code).toBe('USD');
  });
  it('is due on receipt without a due date', () => { /* dueDate: null → { term_type: 'DUE_ON_RECEIPT' } */ });
  it('taxes only taxable lines, at the invoice rate', () => {
    // items[0] has no tax; items[1].tax equals { name: 'Sales tax', percent: '8.25' }
  });
  it('formats quantities and money as PayPal wants them', () => {
    // items[1].quantity === '1.5'; items[1].unit_amount === { currency_code: 'USD', value: '300.00' }
  });
  it('carries a credit as an invoice-level discount', () => {
    // amount.breakdown.discount.invoice_discount.amount.value === '50.00'
  });
  it('omits the discount when there is no credit', () => { /* credits: 0 → body.amount undefined */ });
  it('uses the display name for a person and the company name for a company', () => {
    // billing_info.business_name === 'Mary Ann Lee'; with companyName 'Lee Holdings' → 'Lee Holdings'
  });
  it('normalises the email', () => { /* email_address === 'mary@example.com' */ });
  it('refuses an unusable email, naming the client', () => {
    const r = buildInvoiceRequest(invoice, org, { ...client, email: 'not-an-email' });
    expect(r).toEqual({ ok: false, error: 'Add a valid email address to Mary Ann Lee first; PayPal sends the invoice to it.' });
  });
  it('refuses a zero quantity, naming the line', () => {
    // line 2 quantity 0 → { ok: false, error: 'Line 2 has a quantity of zero. Fix it on the invoice first.' }
  });
  it('splits a long description at 200 characters', () => { /* name.length === 200; description holds the rest */ });
  it('fixes the configuration', () => {
    // { tax_calculated_after_discount: false, tax_inclusive: false, allow_tip: false, partial_payment: { allow_partial_payment: false } }
  });
  it('writes the note and sends the logo only over https', () => {
    // note starts with "Invoice INV-2026-0031 from PT's Tactical Renovations. Pay securely with the button below."
    // paymentInstructions 'Checks to PO Box 1' → note ends with that sentence
    // logoUrl 'http://x' → invoicer.logo_url undefined
  });
});
describe('helpers', () => {
  it('calendarDateInZone', () => expect(calendarDateInZone(new Date('2026-11-05T03:30:00Z'), 'America/Chicago')).toBe('2026-11-04'));
  it('formatQuantity', () => {
    expect(formatQuantity('1.5000')).toBe('1.5'); expect(formatQuantity(2)).toBe('2'); expect(formatQuantity('0')).toBeNull(); expect(formatQuantity('abc')).toBeNull();
  });
  it('totalsAgree', () => { expect(totalsAgree('1250.00', 1250)).toBe(true); expect(totalsAgree('1250.01', 1250)).toBe(false); });
});
describe('sendPreconditions', () => {
  const base = { status: 'sent' as const, clientEmail: 'a@b.co', clientName: 'A', paypalInvoiceId: null, paypalSentAt: null, connectionLive: true };
  it('refuses without a connection', () => expect(sendPreconditions({ ...base, connectionLive: false })).toEqual({ ok: false, error: 'Connect PayPal in Settings first.' }));
  it('refuses a draft', () => expect(sendPreconditions({ ...base, status: 'draft' })).toEqual({ ok: false, error: 'Issue the invoice first; its amounts have to be locked before a client can pay them.' }));
  it('refuses a paid invoice', () => expect(sendPreconditions({ ...base, status: 'paid' })).toEqual({ ok: false, error: 'This invoice is already paid.' }));
  it('refuses without an email', () => expect(sendPreconditions({ ...base, clientEmail: null })).toEqual({ ok: false, error: 'Add an email address to A first; PayPal sends the invoice to it.' }));
  it('refuses a second send', () => expect(sendPreconditions({ ...base, paypalInvoiceId: 'INV2-X', paypalSentAt: new Date(2026, 10, 5) })).toEqual({ ok: false, error: 'Already sent through PayPal on 11/5/2026.' }));
  it('allows a retry when created but not sent', () => expect(sendPreconditions({ ...base, paypalInvoiceId: 'INV2-X' })).toEqual({ ok: true, retry: true }));
  it('allows a fresh send', () => expect(sendPreconditions(base)).toEqual({ ok: true, retry: false }));
});
describe('explainPayPalError', () => {
  it('names a duplicate number', () => expect(explainPayPalError(422, { name: 'UNPROCESSABLE_ENTITY', details: [{ issue: 'DUPLICATE_INVOICE_NUMBER' }] }, 'INV-1')).toBe('PayPal already has an invoice numbered INV-1. Change the number on PayPal\'s side or void and re-issue here.'));
  it('names bad credentials', () => expect(explainPayPalError(401, {}, 'INV-1')).toBe('PayPal refused the client id and secret. Check them in Settings.'));
  it('falls back to the status and name', () => expect(explainPayPalError(500, { name: 'INTERNAL_SERVER_ERROR' }, 'INV-1')).toBe('PayPal returned 500 (INTERNAL_SERVER_ERROR). Nothing was sent; try again in a minute.'));
});
```

The exact `issue` code for a duplicate number is taken from PayPal's error catalogue as `DUPLICATE_INVOICE_NUMBER`; the sandbox run in Task 10 confirms it, and the fixture is corrected there if PayPal spells it differently.

- [ ] **Step 2: Run to verify failure.** Run: `pnpm vitest run src/lib/paypal`. Expected: FAIL on every new test.

- [ ] **Step 3: Implement** the functions in `paypal-core.ts`. `calendarDateInZone` uses `Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })`. `buildInvoiceRequest` validates email and quantities first and returns the first problem only. `explainPayPalError` reads `details[].issue` and `name` defensively from `unknown`.

- [ ] **Step 4: Run to verify pass.** Run: `pnpm vitest run src/lib/paypal`. Expected: PASS.

- [ ] **Step 5: Commit.** `git add src/lib/paypal && git commit -m "Task 34: PayPal core — the invoice request, send preconditions, error copy"`.

### Task 5: The PayPal core, part 3 — what a fetched invoice means for the ledger

**Files:**
- Modify: `src/lib/paypal/paypal-core.ts`
- Modify: `src/lib/paypal/paypal-core.test.ts`

**Interfaces:**
- Produces:
  - `interface PayPalMoney { currency_code: string; value: string }`
  - `interface PayPalPaymentDetail { type?: 'PAYPAL' | 'EXTERNAL'; payment_id?: string; payment_date?: string; payment_date_time?: string; method?: string; amount?: PayPalMoney; note?: string }`
  - `interface PayPalRefundDetail { type?: 'PAYPAL' | 'EXTERNAL'; refund_id?: string; refund_date?: string; amount?: PayPalMoney; method?: string }`
  - `interface PayPalFetchedInvoice { id: string; status: string; detail?: { invoice_number?: string; metadata?: { recipient_view_url?: string; invoicer_view_url?: string } }; amount?: PayPalMoney; due_amount?: PayPalMoney; payments?: { paid_amount?: PayPalMoney; transactions?: PayPalPaymentDetail[] }; refunds?: { refund_amount?: PayPalMoney; transactions?: PayPalRefundDetail[] } }`
  - `type LedgerOp = { kind: 'payment'; externalId: string; amount: number; method: PaymentMethod; paymentDate: string; notes: string } | { kind: 'refund'; externalId: string; amount: number; paymentDate: string; notes: string } | { kind: 'skip'; externalId: string | null; reason: string }`
  - `ledgerOpsFor(invoice: PayPalFetchedInvoice, knownExternalIds: ReadonlySet<string>, now?: Date): LedgerOp[]`

- [ ] **Step 1: Write the failing tests:**

```ts
describe('ledgerOpsFor', () => {
  const paid = { id: 'INV2-A', status: 'PAID', payments: { transactions: [{ type: 'PAYPAL', payment_id: 'TX1', payment_date: '2026-11-06', method: 'CREDIT_CARD', amount: { currency_code: 'USD', value: '1250.00' } }] } } as const;
  it('turns a PayPal payment into one payment op at gross', () => {
    expect(ledgerOpsFor(paid, new Set())).toEqual([{ kind: 'payment', externalId: 'TX1', amount: 1250, method: 'card', paymentDate: '2026-11-06', notes: 'PayPal invoice INV2-A' }]);
  });
  it('skips a payment it has already recorded', () => {
    expect(ledgerOpsFor(paid, new Set(['TX1']))).toEqual([{ kind: 'skip', externalId: 'TX1', reason: 'already recorded' }]);
  });
  it('leaves an external payment to hand entry', () => {
    const ext = { ...paid, payments: { transactions: [{ type: 'EXTERNAL', method: 'CHECK', amount: { currency_code: 'USD', value: '10.00' } }] } };
    expect(ledgerOpsFor(ext, new Set())).toEqual([{ kind: 'skip', externalId: null, reason: 'external payment; record by hand' }]);
  });
  it('turns a PayPal refund into a refund op', () => {
    const refunded = { id: 'INV2-A', status: 'REFUNDED', refunds: { transactions: [{ type: 'PAYPAL', refund_id: 'RF1', refund_date: '2026-11-07', amount: { currency_code: 'USD', value: '1250.00' } }] } };
    expect(ledgerOpsFor(refunded, new Set())).toEqual([{ kind: 'refund', externalId: 'RF1', amount: 1250, paymentDate: '2026-11-07', notes: 'PayPal refund on invoice INV2-A' }]);
  });
  it('falls back to today when PayPal gives no date', () => {
    const undated = { ...paid, payments: { transactions: [{ type: 'PAYPAL', payment_id: 'TX2', method: 'PAYPAL', amount: { currency_code: 'USD', value: '5.00' } }] } };
    expect(ledgerOpsFor(undated, new Set(), new Date('2026-11-08T12:00:00Z'))[0]).toMatchObject({ paymentDate: '2026-11-08', method: 'paypal' });
  });
  it('skips a payment with no usable amount', () => {
    const bad = { ...paid, payments: { transactions: [{ type: 'PAYPAL', payment_id: 'TX3', amount: { currency_code: 'USD', value: 'x' } }] } };
    expect(ledgerOpsFor(bad, new Set())).toEqual([{ kind: 'skip', externalId: 'TX3', reason: 'no usable amount' }]);
  });
  it('is empty for an invoice with no transactions', () => expect(ledgerOpsFor({ id: 'INV2-B', status: 'SENT' }, new Set())).toEqual([]));
});
```

- [ ] **Step 2: Run to verify failure.** Run: `pnpm vitest run src/lib/paypal`. Expected: FAIL.

- [ ] **Step 3: Implement `ledgerOpsFor`.** Amounts parse through `toNum` and are rejected when not finite or not positive. Payment and refund ops are returned in PayPal's order, payments first.

- [ ] **Step 4: Run to verify pass.** Run: `pnpm vitest run src/lib/paypal`. Expected: PASS.

- [ ] **Step 5: Commit.** `git add src/lib/paypal && git commit -m "Task 34: PayPal core — ledger ops from a fetched invoice"`.

### Task 6: The client — the one file that talks to PayPal

**Files:**
- Create: `src/lib/paypal/client.ts`
- Create: `src/lib/paypal/client.test.ts`

**Interfaces:**
- Consumes: `PAYPAL_API_BASE`, `PayPalEnvironment`, `PayPalInvoiceBody`, `PayPalFetchedInvoice`, `WebhookHeaders` from the core.
- Produces:
  - `class PayPalApiError extends Error { constructor(public status: number, public body: unknown, public operation: string) }`
  - `interface PayPalClientConfig { environment: PayPalEnvironment; clientId: string; clientSecret: string; fetchImpl?: typeof fetch; now?: () => Date }`
  - `interface PayPalClient { token(): Promise<string>; createInvoice(body: PayPalInvoiceBody): Promise<PayPalFetchedInvoice>; deleteInvoice(id: string): Promise<void>; sendInvoice(id: string): Promise<void>; cancelInvoice(id: string): Promise<void>; getInvoice(id: string): Promise<PayPalFetchedInvoice>; listWebhooks(): Promise<{ id: string; url: string }[]>; createWebhook(url: string, eventTypes: readonly string[]): Promise<{ id: string }>; verifyWebhookSignature(args: { headers: WebhookHeaders; webhookId: string; rawBody: string }): Promise<boolean> }`
  - `createPayPalClient(config: PayPalClientConfig): PayPalClient`

- [ ] **Step 1: Write the failing tests** with a recording fake `fetchImpl` that returns queued `Response` objects:

```ts
it('fetches a token with basic auth against the environment base and reuses it', async () => {
  // queue: 200 {"access_token":"T","expires_in":3600}, then 200 {"id":"INV2-1","status":"DRAFT"}, then 200 {"id":"INV2-1","status":"DRAFT"}
  // after createInvoice twice: calls[0].url === 'https://api-m.sandbox.paypal.com/v1/oauth2/token';
  // calls[0].headers.Authorization === 'Basic ' + Buffer.from('cid:sec').toString('base64'); calls[0].body === 'grant_type=client_credentials';
  // calls[1].headers.Authorization === 'Bearer T'; only one token call among three fetches
});
it('refreshes the token inside the last minute of its life', async () => { /* expires_in 30 → second operation fetches a new token */ });
it('sends with recipient and invoicer copies', async () => {
  // sendInvoice('INV2-1') posts to /v2/invoicing/invoices/INV2-1/send with body { send_to_recipient: true, send_to_invoicer: true }
});
it('cancels without emailing anyone', async () => { /* body { send_to_recipient: false, send_to_invoicer: false } */ });
it('throws PayPalApiError with the status and body on a non-2xx', async () => {
  // 422 {"name":"UNPROCESSABLE_ENTITY"} → rejects with err.status 422, err.operation 'createInvoice'
});
it('posts the raw body back verbatim when verifying', async () => {
  // rawBody '{"id":"WH-1","resource":{"id":"INV2-1"}}' → the verify request body string contains '"webhook_event":{"id":"WH-1","resource":{"id":"INV2-1"}}' exactly, and verification_status SUCCESS → true, FAILURE → false
});
it('lists webhooks as id and url pairs', async () => { /* {"webhooks":[{"id":"W1","url":"https://x/api/webhooks/paypal"}]} → [{ id: 'W1', url: 'https://x/api/webhooks/paypal' }] */ });
```

- [ ] **Step 2: Run to verify failure.** Run: `pnpm vitest run src/lib/paypal/client.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement `client.ts`.** `import 'server-only'` at the top (the Vitest alias stubs it). One `request(method, path, body?)` helper adds the bearer token, JSON headers and `PayPal-Request-Id` (a fresh `randomUUID()` per create, so a network retry cannot create two invoices). The verify body is built by string concatenation so `webhook_event` is the raw bytes: `'{"auth_algo":' + JSON.stringify(h.authAlgo) + ',"cert_url":' + … + ',"webhook_event":' + rawBody + '}'`. `cancelInvoice` posts to `…/cancel`; `deleteInvoice` sends `DELETE …/invoices/{id}`; `listWebhooks` reads `GET /v1/notifications/webhooks`; `createWebhook` posts `{ url, event_types: eventTypes.map((name) => ({ name })) }`. 204 and empty bodies resolve to `undefined`.

- [ ] **Step 4: Run to verify pass.** Run: `pnpm vitest run src/lib/paypal`. Expected: PASS.

- [ ] **Step 5: Commit.** `git add src/lib/paypal && git commit -m "Task 34: PayPal client over fetch, with token caching and raw-body verification"`.

### Task 7: Connecting an organization — credentials, webhook registration, the Settings card

**Files:**
- Create: `src/lib/paypal/connection.ts`
- Create: `src/lib/paypal/queries.ts`
- Create: `src/lib/paypal/actions.ts`
- Create: `src/components/paypal/paypal-connection-card.tsx`
- Create: `src/components/paypal/paypal-connection-card.test.tsx`
- Modify: `src/lib/env.ts` (add `PAYPAL_CREDENTIAL_ENCRYPTION_KEY: z.string().optional()` beside the Google key)
- Modify: `.env.example` (a `# --- Client payments (PayPal) ---` block beside the Google key, same wording pattern: 32 random bytes, base64, `openssl rand -base64 32`, rotating it invalidates stored connections)
- Modify: `src/app/(app)/settings/page.tsx` (load the connection, render the card after the Google card, read `?paypal=` notices)

**Interfaces:**
- Consumes: `encryptToken`, `decryptToken`, `parseEncryptionKey` (`@/lib/google/google-core`); `serverEnv`, `publicEnv` (`@/lib/env`); `createPayPalClient`; `providerStatus`, `connectionSummary`, `PAYPAL_EVENTS`, `isPayPalEnvironment`; `getAuthContext`, `can`; `FormState`; `SubmitButton`, `FormNotice` from `@/components/forms/form-bits`.
- Produces:
  - `queries.ts`: `connectionRow(organizationId: string): Promise<PayPalConnection | null>` (the only query that returns the ciphertext column); `connectionSummaryFor(organizationId: string): Promise<ConnectionSummary | null>` (never selects the ciphertext).
  - `connection.ts` (plain module): `paypalEnv(): PayPalEnv`; `interface ReadyConnection { organizationId: string; environment: PayPalEnvironment; client: PayPalClient; webhookId: string | null; webhookUrl: string | null }`; `connectionFor(organizationId: string): Promise<ReadyConnection | null>` (null when none, revoked, key missing or ciphertext unreadable; the reason is logged, as `accessTokenFor` does); `webhookUrlFor(appUrl: string): string` (`${appUrl}/api/webhooks/paypal`); `ensureWebhook(conn: ReadyConnection, appUrl: string): Promise<{ id: string; url: string }>` (lists, reuses a webhook at that URL, else creates with `PAYPAL_EVENTS`).
  - `actions.ts` (`'use server'`): `savePayPalConnection(_prev: FormState, formData: FormData): Promise<FormState>` with fields `environment`, `clientId`, `clientSecret`; `testPayPalConnection(): Promise<void>`; `retryPayPalWebhook(): Promise<void>`; `disconnectPayPal(): Promise<void>`. The three one-tap actions redirect to `/settings?paypal=<notice>` with notices `verified`, `webhook`, `webhook_failed`, `disconnected`, `forbidden`, `unconfigured`, `failed`. All four require `org:manage`.
  - `PayPalConnectionCard({ status, summary, mayManage, notice }: { status: ProviderStatus; summary: ConnectionSummary | null; mayManage: boolean; notice?: string })`.

- [ ] **Step 1: Write the failing card tests** (`paypal-connection-card.test.tsx`, Testing Library, the way `invoice-taxable.test.tsx` renders):

```ts
it('names the missing variable when the deployment is not configured', () => {
  render(<PayPalConnectionCard status={{ configured: false, missing: ['PAYPAL_CREDENTIAL_ENCRYPTION_KEY'], message: 'PayPal isn\'t available yet. Missing: PAYPAL_CREDENTIAL_ENCRYPTION_KEY. Nothing can be stored until it is set.' }} summary={null} mayManage />);
  expect(screen.getByText(/Missing: PAYPAL_CREDENTIAL_ENCRYPTION_KEY/)).toBeInTheDocument();
  expect(screen.queryByLabelText('Client ID')).toBeNull();
});
it('offers the form to an owner with no connection', () => {
  render(<PayPalConnectionCard status={configured} summary={null} mayManage />);
  expect(screen.getByLabelText('Environment')).toBeInTheDocument();
  expect(screen.getByLabelText('Client ID')).toBeInTheDocument();
  expect(screen.getByLabelText('Client secret')).toHaveAttribute('type', 'password');
  expect(screen.getByRole('button', { name: 'Save and test' })).toBeInTheDocument();
});
it('tells a non-owner who can connect', () => {
  render(<PayPalConnectionCard status={configured} summary={null} mayManage={false} />);
  expect(screen.getByText('Only an owner can connect PayPal.')).toBeInTheDocument();
});
it('shows a sandbox badge and the retry button when the webhook is missing', () => {
  render(<PayPalConnectionCard status={configured} summary={{ live: true, environment: 'sandbox', clientId: 'AbC…', webhookRegistered: false, webhookUrl: null, connectedOn: 'Nov 5, 2026', lastVerifiedOn: null }} mayManage />);
  expect(screen.getByText('SANDBOX')).toBeInTheDocument();
  expect(screen.getByText(/payments will not post automatically/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Retry webhook' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify failure.** Run: `pnpm vitest run src/components/paypal`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement `queries.ts` and `connection.ts`.** `connectionFor` decrypts with `decryptToken(row.clientSecretCiphertext, key)` and builds the client with `createPayPalClient`. `ensureWebhook` matches on exact URL equality.

- [ ] **Step 4: Implement `actions.ts`.** `savePayPalConnection`: gate `org:manage` (refuse with "Only an owner can connect PayPal."); `providerStatus(paypalEnv())` must be configured (refuse with its message); validate `environment` with `isPayPalEnvironment`, `clientId` and `clientSecret` non-blank; build a client and call `token()` — on `PayPalApiError` 401 return `{ error: 'PayPal refused the client id and secret. Check them and try again.' }` without storing; on success upsert the row (insert, or update the existing row's environment, client id, ciphertext, `connectedBy`, `connectedAt: now`, `revokedAt: null`, `lastVerifiedAt: now`); then `ensureWebhook` with `publicEnv.appUrl` and store `webhookId`/`webhookUrl`, or on failure log and return `{ message: 'PayPal is connected, but the webhook could not be registered. Payments will not post automatically until Retry webhook succeeds.' }`; otherwise `{ message: 'PayPal is connected and the webhook is registered.' }`. `revalidatePath('/settings')` after every write. `testPayPalConnection` fetches a token and sets `lastVerifiedAt`. `disconnectPayPal` sets `revokedAt: now`.

- [ ] **Step 5: Implement the card.** A `'use client'` component using `useActionState(savePayPalConnection, {})` for the form and plain `<form action={…}>` for the three one-tap actions, never nested. Copy: the connected state reads "Connected to PayPal (<environment>) as client <clientId> since <connectedOn>." and, when the webhook is registered, "Payments post to the ledger automatically through <webhookUrl>." Notices map like `NOTICES` in `google-connection.tsx`.

- [ ] **Step 6: Wire the Settings page.** Add `paypal?: string` to `SearchParams`; load `connectionSummaryFor(orgId)` in the existing `Promise.all`; render `<PayPalConnectionCard status={providerStatus(paypalEnv())} summary={…} mayManage={mayManage} notice={sp.paypal} />` directly after the Google card.

- [ ] **Step 7: Verify.** Run: `pnpm vitest run src/components/paypal src/lib/paypal && pnpm typecheck && pnpm lint`. Expected: PASS, no errors.

- [ ] **Step 8: Commit.** `git add src/lib/paypal src/components/paypal src/lib/env.ts .env.example "src/app/(app)/settings/page.tsx" && git commit -m "Task 34: connect an organization's PayPal account from Settings"`.

### Task 8: Sending an invoice through PayPal

**Files:**
- Modify: `src/lib/paypal/actions.ts` (add `sendInvoiceThroughPayPal`)
- Create: `src/lib/paypal/mirror.ts`
- Create: `src/components/paypal/invoice-paypal-card.tsx`
- Modify: `src/app/(app)/invoices/[id]/page.tsx` (render the card after the Amount card)
- Modify: `src/components/invoices/invoice-print-document.tsx` and `src/app/(print)/invoices/[id]/print/page.tsx` (the "Pay online" line)
- Modify: `src/lib/invoices/actions.ts` (`setInvoiceStatus`: on void, call the mirror)
- Modify: `src/lib/paypal/paypal-core.test.ts` only if a mapping gap is found; otherwise no new unit tests — the decisions are already tested in Tasks 4 and 5

**Interfaces:**
- Consumes: `buildInvoiceRequest`, `sendPreconditions`, `totalsAgree`, `explainPayPalError`, `connectionFor`, `recipientForClient` (`@/lib/email/queries`), `getInvoice`, `requireFinancialsWrite` (private in `invoices/actions.ts`; copy the helper into `paypal/actions.ts` rather than export one from a `'use server'` file, which would make it an endpoint), `after` from `next/server`.
- Produces:
  - `sendInvoiceThroughPayPal(_prev: FormState, formData: FormData): Promise<FormState>` with field `invoiceId`.
  - `mirror.ts` (plain module): `cancelPayPalInvoiceLater(organizationId: string, paypalInvoiceId: string, wasSent: boolean): void` — `after()` as `mirrorLater` does; cancels when `wasSent`, deletes the draft otherwise; logs the outcome; never throws into the action.
  - `InvoicePayPalCard({ invoiceId, state, clientEmail, clientName, payUrl, sentOn, paidOn, settingsMissing, mayWrite }: { invoiceId: string; state: 'unconfigured' | 'not_issued' | 'no_email' | 'ready' | 'created' | 'sent' | 'paid'; clientEmail: string | null; clientName: string; payUrl: string | null; sentOn: string | null; paidOn: string | null; settingsMissing: string[]; mayWrite: boolean })`.
  - `InvoicePrintProps.payUrl: string | null`.

- [ ] **Step 1: Implement the action.** Gate `financials:write`; `uuidOrNull(invoiceId)`; load the invoice with `getInvoice(orgId, id)`, the client with `recipientForClient`, the organization's name, logo and timezone, and `connectionFor(orgId)`. Run `sendPreconditions`; on refusal return `{ error }`. Build with `buildInvoiceRequest`; on refusal return `{ error }`. Then the spec's six-step flow, section 7: create → store `paypalInvoiceId` → compare with `totalsAgree` (on mismatch `deleteInvoice`, clear the id, return `{ error: \`PayPal computed $X for this invoice; the Foreman has $Y. Nothing was sent.\` }` with both formatted by `formatMoney`) → `sendInvoice` → `getInvoice` → store `paypalPayUrl` and `paypalSentAt`. On a retry (`retry: true`), skip create and compare and go straight to send. `PayPalApiError` anywhere → `{ error: explainPayPalError(err.status, err.body, invoiceNumber) }`; any other error → log and `{ error: 'Something went wrong talking to PayPal. Nothing was sent; try again in a minute.' }`. `revalidatePath` the invoice and `/invoices`. Return `{ message: 'Sent through PayPal to <email>.' }`.

- [ ] **Step 2: Implement `mirror.ts`** and call it from `setInvoiceStatus` when `next === 'void'` and the invoice has a `paypalInvoiceId`, passing `wasSent = paypalSentAt != null`.

- [ ] **Step 3: Implement the card.** `'use client'`, `useActionState(sendInvoiceThroughPayPal, {})`. Each `state` renders the copy in the spec's section 9 table verbatim; `ready` shows the email and the **Send through PayPal** button; `created` shows **Retry send**; `sent` shows the pay URL in a read-only, `select-all` input with a **Copy link** button that calls `navigator.clipboard.writeText` and falls back to selecting the field. Nothing renders for a viewer without `financials:read`; the button renders only with `mayWrite`.

- [ ] **Step 4: Wire the invoice page.** Derive `state` from `providerStatus(paypalEnv())`, `connectionSummaryFor(orgId)`, `stored`, `recipient?.email`, `invoice.paypalInvoiceId`, `invoice.paypalSentAt`, and whether any applied payment carries a PayPal reference (`row.applied` with `referenceNumber` matching a recorded `externalId`; simplest: `display === 'paid' && invoice.paypalSentAt`). Render the card after the Amount card and before "Send to client".

- [ ] **Step 5: The print line.** Add `payUrl` to `InvoicePrintProps`; render `<section className="ptin-block"><div className="ptin-field-label">Pay online</div><p className="ptin-p">{payUrl}</p></section>` after "How to pay" when set; the print page passes `invoice.paypalPayUrl`.

- [ ] **Step 6: Verify.** Run: `pnpm typecheck && pnpm lint && pnpm test`. Expected: no errors; all tests PASS (quote the counts).

- [ ] **Step 7: Commit.** `git add src/lib/paypal src/lib/invoices/actions.ts src/components/paypal src/components/invoices "src/app/(app)/invoices" "src/app/(print)/invoices" && git commit -m "Task 34: send an issued invoice through PayPal, with the pay link on screen and in print"`.

### Task 9: The webhook — payments land in the ledger

**Files:**
- Create: `src/lib/paypal/webhook.ts`
- Create: `src/lib/paypal/webhook.test.ts`
- Create: `src/app/api/webhooks/paypal/route.ts`
- Modify: `src/lib/paypal/queries.ts` (add `invoiceByPayPalId`, `knownExternalIds`)

**Interfaces:**
- Consumes: `readWebhookHeaders`, `isPayPalEvent`, `ledgerOpsFor`, `PayPalFetchedInvoice`, `ReadyConnection`, `connectionFor`, `applyPaymentWithAllocations`, `PayPalApiError`, `logger`.
- Produces:
  - `queries.ts`: `invoiceByPayPalId(paypalInvoiceId: string): Promise<InvoiceRef | null>` where `interface InvoiceRef { id: string; organizationId: string; projectId: string; clientId: string; invoiceNumber: string; status: InvoiceStatus }` — the one deliberately cross-tenant read, with the comment the spec gives; `knownExternalIds(organizationId: string, ids: string[]): Promise<Set<string>>`.
  - `webhook.ts`: `interface WebhookDeps { findInvoice(paypalInvoiceId: string): Promise<InvoiceRef | null>; connectionFor(organizationId: string): Promise<ReadyConnection | null>; knownExternalIds(organizationId: string, ids: string[]): Promise<Set<string>>; applyOps(invoice: InvoiceRef, ops: LedgerOp[], now: Date): Promise<{ written: number; skipped: number }>; clearPayUrl(invoiceId: string): Promise<void> }`; `interface WebhookOutcome { status: 200 | 400; handled: boolean; note: string }`; `handlePayPalWebhook(rawBody: string, headers: WebhookHeaders | null, deps: WebhookDeps, now?: Date): Promise<WebhookOutcome>` (throws only for failures a retry can fix); `liveDeps(): WebhookDeps`.

- [ ] **Step 1: Write the failing tests** with a `fakeDeps()` builder that records calls and a `fakeConnection(fetchedInvoice, verified = true)` whose `client.getInvoice` returns the fixture and `client.verifyWebhookSignature` returns `verified`:

```ts
const headers = { transmissionId: 't', transmissionTime: '2026-11-06T00:00:00Z', transmissionSig: 's', certUrl: 'https://api.paypal.com/c', authAlgo: 'SHA256withRSA' };
const paidEvent = JSON.stringify({ id: 'WH-1', event_type: 'INVOICING.INVOICE.PAID', resource: { id: 'INV2-A' } });
it('rejects a request with no PayPal headers', async () => {
  expect(await handlePayPalWebhook(paidEvent, null, fakeDeps())).toEqual({ status: 400, handled: false, note: 'missing PayPal headers' });
});
it('answers 200 and does nothing for an invoice that is not ours', async () => {
  const deps = fakeDeps({ findInvoice: async () => null });
  expect(await handlePayPalWebhook(paidEvent, headers, deps)).toEqual({ status: 200, handled: false, note: 'not ours' });
  expect(deps.calls.applyOps).toHaveLength(0);
});
it('answers 200 and logs when the organization has disconnected PayPal', async () => {
  const deps = fakeDeps({ connectionFor: async () => null });
  expect(await handlePayPalWebhook(paidEvent, headers, deps)).toMatchObject({ status: 200, handled: false, note: 'no live connection' });
});
it('rejects a signature PayPal does not verify', async () => {
  const deps = fakeDeps({ connectionFor: async () => fakeConnection(paidInvoice, false) });
  expect(await handlePayPalWebhook(paidEvent, headers, deps)).toEqual({ status: 400, handled: false, note: 'signature rejected' });
});
it('writes one payment for a paid invoice', async () => {
  const deps = fakeDeps({ connectionFor: async () => fakeConnection(paidInvoice) });
  expect(await handlePayPalWebhook(paidEvent, headers, deps)).toEqual({ status: 200, handled: true, note: 'wrote 1, skipped 0' });
  expect(deps.calls.applyOps[0].ops).toEqual([{ kind: 'payment', externalId: 'TX1', amount: 1250, method: 'card', paymentDate: '2026-11-06', notes: 'PayPal invoice INV2-A' }]);
});
it('writes nothing the second time the same event arrives', async () => {
  const deps = fakeDeps({ connectionFor: async () => fakeConnection(paidInvoice), knownExternalIds: async () => new Set(['TX1']) });
  expect(await handlePayPalWebhook(paidEvent, headers, deps)).toEqual({ status: 200, handled: true, note: 'wrote 0, skipped 1' });
});
it('writes a refund op for a refunded invoice', async () => { /* REFUNDED event + refunded fixture → ops[0].kind === 'refund' */ });
it('clears the pay link on cancellation and leaves the ledger alone', async () => {
  const deps = fakeDeps({ connectionFor: async () => fakeConnection({ id: 'INV2-A', status: 'CANCELLED' }) });
  const cancelled = JSON.stringify({ id: 'WH-2', event_type: 'INVOICING.INVOICE.CANCELLED', resource: { id: 'INV2-A' } });
  expect(await handlePayPalWebhook(cancelled, headers, deps)).toEqual({ status: 200, handled: true, note: 'pay link cleared' });
  expect(deps.calls.clearPayUrl).toEqual(['inv-uuid']);
  expect(deps.calls.applyOps).toHaveLength(0);
});
it('ignores an event type it does not act on', async () => { /* INVOICING.INVOICE.SENT → { status: 200, handled: false, note: 'ignored INVOICING.INVOICE.SENT' } */ });
it('throws when PayPal cannot be reached, so PayPal retries', async () => {
  const deps = fakeDeps({ connectionFor: async () => fakeConnection(paidInvoice, true, { getInvoiceThrows: new PayPalApiError(503, {}, 'getInvoice') }) });
  await expect(handlePayPalWebhook(paidEvent, headers, deps)).rejects.toBeInstanceOf(PayPalApiError);
});
it('answers 400 to a body that is not JSON', async () => {
  expect(await handlePayPalWebhook('not json', headers, fakeDeps())).toEqual({ status: 400, handled: false, note: 'unreadable body' });
});
```

- [ ] **Step 2: Run to verify failure.** Run: `pnpm vitest run src/lib/paypal/webhook.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement `webhook.ts`.** Order inside `handlePayPalWebhook`: headers → parse → `isPayPalEvent` (ignore otherwise, but only after the "not ours" check so an unknown invoice never costs a verify call) → `findInvoice` → `connectionFor` → `verifyWebhookSignature` → fetch → `ledgerOpsFor` with `knownExternalIds` → `applyOps` / `clearPayUrl`. A `PayPalApiError` with status 429 or ≥ 500 from the fetch, or any database error inside `applyOps`, propagates; a 4xx other than those is logged at error and answered 200 with note `permanent: <status>`. `liveDeps()` wires `invoiceByPayPalId`, `connectionFor`, `knownExternalIds`, an `applyOps` that runs `applyPaymentWithAllocations` per op inside one transaction (payment ops with `isRefund: false`, refund ops with `isRefund: true` and a negative allocation amount), and `clearPayUrl`.

- [ ] **Step 4: Implement the route** as `src/app/api/webhooks/stripe/route.ts` is shaped: `dynamic = 'force-dynamic'`; read `request.text()`; `readWebhookHeaders((n) => request.headers.get(n))`; call the handler with `liveDeps()`; respond with the outcome's status; catch anything thrown, log at error with the event id when parseable, respond 500 `{ error: 'Could not apply the event; PayPal will retry.' }`. Log every outcome at info with `{ note, handled }`.

- [ ] **Step 5: Verify.** Run: `pnpm vitest run src/lib/paypal && pnpm typecheck && pnpm lint`. Expected: PASS, no errors.

- [ ] **Step 6: Commit.** `git add src/lib/paypal src/app/api/webhooks/paypal && git commit -m "Task 34: PayPal webhook — verified events post payments and refunds to the ledger"`.

### Task 10: Gate, live migration, documentation, the honest report

**Files:**
- Modify: `docs/tech-stack.md` (the Stripe row)
- Modify: `CLAUDE.md` (open item 4; the domains list; the seam section's `stripe/` paragraph gains a `paypal/` sentence; the counts under Current state, from real output only)
- Modify: `.claude/skills/paypal/SKILL.md` (replace "Putting PayPal in the app — not built" with how it is built: the files, the Settings card, the send button, the webhook URL, what the sandbox and live runs proved or have not yet)
- Modify: `docs/agent-log.md` (new entry at the top of the Log)
- PR #38 body on GitHub

**Interfaces:** none new.

- [ ] **Step 1: Run the full gate.** Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`, then `bash scripts/test-rls.sh` and `bash scripts/test-setup-sql.sh`. Expected: every command exits 0; note the printed test-file and test counts and the RLS `PASS:` count for the report.

- [ ] **Step 2: Apply the migrations to the live project** with the Supabase MCP `apply_migration`, one call per file (`0051_…`, `0052_paypal_rls`), on project `zhlkfuvscnblkkyfticz` (if `get_project` reports `INACTIVE`, `restore_project` first). Then run the verification query from the `db-change` skill, section 7, for `paypal_connections` and `invoices`: `enabled` and `forced` true, policies 3 and the invoices count unchanged, triggers 1 on the new table, checks 4. Run `get_advisors` with `type: security`; only the three known WARNs may appear. If any of this could not be run, the commit message and the report say so in those words.

- [ ] **Step 3: Update the documents.** `docs/tech-stack.md`: the Stripe row becomes "Stripe for platform billing; PayPal for client invoice payments (2026-11-05: the account the business collects on; ledger stays provider-independent)". `CLAUDE.md` open item 4: "Client payments collect through PayPal (Task 34). Sandbox and live runs: <what was done, by date, or 'not yet run'>." Add `paypal` to the domains list. In the seam section, after the `stripe/` paragraph: one sentence that `paypal/` is the same shape for client payments and that a payment is moved into the ledger only by a verified webhook or by hand, never by the app on its own say-so. Counts only from Step 1's output. The skill: rewrite its last section as described above; its "What is connected, and what was verified" section gains the date of the first app-made invoice, or says none has been made.

- [ ] **Step 4: The agent-log entry**, newest first, in the file's format: what was built, the judgement calls (full payment only; PayPal sends the email; gross amount, fee blank; external payments stay by hand; the app registers its own webhook; owner-only write policy), what was verified with the real numbers from Step 1, whether the migrations were applied and verified live, what the sandbox and live runs showed or that they have not been run, and found-not-fixed items (PayPal's fee not pulled; the duplicate-number error code assumed until the sandbox confirms it).

- [ ] **Step 5: Commit and push.** `git add docs CLAUDE.md .claude/skills/paypal/SKILL.md && git commit -m "Task 34: PayPal client payments — docs, agent log, and what was and wasn't run"` then `git push -u origin claude/new-session-w4xlnw` (retry up to four times on network failure, 2s/4s/8s/16s).

- [ ] **Step 6: Update PR #38's description** to what the branch now carries: the skill, the spec, the plan, and Task 34's code, with the Verified and Not run sections rewritten from Step 1 and Step 2's real results.

- [ ] **Step 7: Report to Patrick** in the shape `CLAUDE.md` rule 8 requires: plain-language summary; files changed; testing results with the real numbers; what needs his decision or action (the PayPal REST apps, the Vercel variable, the sandbox run, then the live run); and the next prompt.

---

## Self-review notes

Spec coverage: §2 decisions → Tasks 3–9 and the docs in Task 10; §3 client experience → Task 8 (send, PayPal email) and Task 9 (payment lands); §4 files → Tasks 3–9 one for one, `ledger.ts` in Task 2; §5 schema → Task 1 and Task 2's enum/label change; §6 credentials and Settings → Task 7; §7 send flow and mapping → Tasks 4 and 8; §8 webhook rules → Tasks 5 and 9; §9 screens → Tasks 7 and 8; §10 permissions → Tasks 7, 8, 9; §11 testing → each task's tests plus Task 10's gate and the sandbox/live runs; §12 rollout and §14 documents → Task 10. §13 out of scope: nothing here builds it.

Names used across tasks and defined once: `nextInvoiceStatus`, `applyPaymentWithAllocations`, `LedgerPaymentInput` (Task 2); `providerStatus`, `connectionSummary`, `mapPayPalStatus`, `mapPayPalMethod`, `readWebhookHeaders`, `WebhookHeaders`, `PAYPAL_EVENTS`, `isPayPalEvent`, `PAYPAL_API_BASE`, `PayPalEnvironment` (Task 3); `buildInvoiceRequest`, `sendPreconditions`, `totalsAgree`, `explainPayPalError`, `PayPalInvoiceBody` (Task 4); `PayPalFetchedInvoice`, `LedgerOp`, `ledgerOpsFor` (Task 5); `PayPalClient`, `createPayPalClient`, `PayPalApiError` (Task 6); `ReadyConnection`, `connectionFor`, `ensureWebhook`, `connectionSummaryFor`, `connectionRow`, `paypalEnv` (Task 7); `invoiceByPayPalId`, `knownExternalIds`, `InvoiceRef`, `WebhookDeps`, `handlePayPalWebhook`, `liveDeps` (Task 9).
