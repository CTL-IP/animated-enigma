/**
 * Pure PayPal logic: every decision the app makes about collecting a client's
 * payment through PayPal that can be made without talking to PayPal.
 *
 * PayPal is the collection page, not the record. The Foreman invoice is the
 * record and the tax document; what goes to PayPal is a copy built from it,
 * and what comes back from PayPal is a payment the ledger records once. The
 * obvious alternative — let PayPal be the invoice and copy it back — was
 * rejected because every report in the app reads the Foreman's tables, and
 * money that exists only in PayPal is invisible to them.
 *
 * No I/O, so all of it is unit-testable.
 */

import { parseEncryptionKey } from '@/lib/google/google-core';
import { isEmailAddress } from '@/lib/email/email-core';
import { toNum } from '@/lib/catalog/catalog-core';
import { formatCalendarDate, type InvoiceStatus, type PaymentMethod } from '@/lib/invoices/invoices-core';

// ── Environment ──────────────────────────────────────────────────────────────

export type PayPalEnvironment = 'sandbox' | 'live';

export function isPayPalEnvironment(value: string): value is PayPalEnvironment {
  return value === 'sandbox' || value === 'live';
}

/** PayPal's REST hosts. The `api-m` hosts are the ones PayPal documents for servers. */
export const PAYPAL_API_BASE: Record<PayPalEnvironment, string> = {
  sandbox: 'https://api-m.sandbox.paypal.com',
  live: 'https://api-m.paypal.com',
};

/** The webhook events the app acts on. Everything else is answered and ignored. */
export const PAYPAL_EVENTS = [
  'INVOICING.INVOICE.PAID',
  'INVOICING.INVOICE.REFUNDED',
  'INVOICING.INVOICE.CANCELLED',
] as const;
export type PayPalEventType = (typeof PAYPAL_EVENTS)[number];

export function isPayPalEvent(type: string): type is PayPalEventType {
  return (PAYPAL_EVENTS as readonly string[]).includes(type);
}

// ── Provider status ──────────────────────────────────────────────────────────

export interface PayPalEnv {
  encryptionKey?: string | null;
}

export interface ProviderStatus {
  configured: boolean;
  /** Which variables are absent, by name — so the fix is obvious. */
  missing: string[];
  /** One sentence for the screen. */
  message: string;
}

/**
 * Whether a PayPal account can be connected on this deployment at all.
 *
 * Only one variable gates it: the key that encrypts the client secret before
 * it reaches the database. The credentials themselves are per organization
 * and live in a table, so they are not the deployment's business. A screen
 * that quietly does nothing is worse than one that names the missing line.
 */
export function providerStatus(env: PayPalEnv): ProviderStatus {
  const missing: string[] = [];
  if (!parseEncryptionKey(env.encryptionKey)) missing.push('PAYPAL_CREDENTIAL_ENCRYPTION_KEY');

  if (missing.length === 0) {
    return {
      configured: true,
      missing,
      message: "PayPal is set up on this deployment. Connect the business's PayPal account below.",
    };
  }
  return {
    configured: false,
    missing,
    message: `PayPal isn't available yet. Missing: ${missing.join(', ')}. Nothing can be stored until it is set.`,
  };
}

// ── A stored connection, as the screen sees it ───────────────────────────────

export interface ConnectionRow {
  environment: string;
  clientId: string;
  webhookId: string | null;
  webhookUrl: string | null;
  connectedAt: Date;
  lastVerifiedAt: Date | null;
  revokedAt: Date | null;
}

export interface ConnectionSummary {
  live: boolean;
  environment: PayPalEnvironment;
  clientId: string;
  webhookRegistered: boolean;
  webhookUrl: string | null;
  connectedOn: string;
  lastVerifiedOn: string | null;
}

/**
 * Never the ciphertext. An environment value the code does not recognise
 * reads as sandbox: mistaking a test setup for live is the expensive error,
 * and the CHECK constraint makes the case unreachable anyway.
 */
export function connectionSummary(row: ConnectionRow): ConnectionSummary {
  return {
    live: row.revokedAt === null,
    environment: isPayPalEnvironment(row.environment) ? row.environment : 'sandbox',
    clientId: row.clientId,
    webhookRegistered: Boolean(row.webhookId),
    webhookUrl: row.webhookUrl,
    connectedOn: formatCalendarDate(row.connectedAt),
    lastVerifiedOn: row.lastVerifiedAt ? formatCalendarDate(row.lastVerifiedAt) : null,
  };
}

// ── Maps between PayPal's vocabulary and the Foreman's ───────────────────────

export type PayPalInvoiceStatus =
  | 'DRAFT'
  | 'SENT'
  | 'SCHEDULED'
  | 'PAID'
  | 'MARKED_AS_PAID'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'PARTIALLY_PAID'
  | 'PARTIALLY_REFUNDED'
  | 'MARKED_AS_REFUNDED'
  | 'UNPAID'
  | 'PAYMENT_PENDING'
  | 'AUTO_CANCELLED'
  | 'PAID_EXTERNAL'
  | 'REFUNDED_EXTERNAL'
  | 'SHARED';

/**
 * What a PayPal status means in the Foreman's terms, or null to leave the
 * Foreman's status alone. Null is deliberate for the in-flight and refund
 * states: a pending payment is not yet money, and a refund is recorded as a
 * payment row rather than as a status.
 */
const STATUS_MAP: Record<PayPalInvoiceStatus, InvoiceStatus | null> = {
  DRAFT: 'draft',
  SCHEDULED: 'draft',
  SENT: 'sent',
  UNPAID: 'sent',
  SHARED: 'sent',
  PAYMENT_PENDING: null,
  PARTIALLY_PAID: 'partially_paid',
  PAID: 'paid',
  MARKED_AS_PAID: 'paid',
  PAID_EXTERNAL: 'paid',
  CANCELLED: 'void',
  AUTO_CANCELLED: 'void',
  REFUNDED: null,
  PARTIALLY_REFUNDED: null,
  MARKED_AS_REFUNDED: null,
  REFUNDED_EXTERNAL: null,
};

export function mapPayPalStatus(status: string): InvoiceStatus | null {
  return Object.prototype.hasOwnProperty.call(STATUS_MAP, status)
    ? STATUS_MAP[status as PayPalInvoiceStatus]
    : null;
}

/**
 * PayPal's payment method onto the ledger's. A card paid through PayPal is
 * still a card payment; money from a PayPal balance or Pay Later is `paypal`.
 */
export function mapPayPalMethod(method: string | null | undefined): PaymentMethod {
  switch (method) {
    case 'PAYPAL':
      return 'paypal';
    case 'CREDIT_CARD':
    case 'DEBIT_CARD':
      return 'card';
    case 'BANK_TRANSFER':
    case 'WIRE_TRANSFER':
      return 'ach';
    case 'CASH':
      return 'cash';
    case 'CHECK':
      return 'check';
    default:
      return 'other';
  }
}

// ── Webhook headers ──────────────────────────────────────────────────────────

export interface WebhookHeaders {
  transmissionId: string;
  transmissionTime: string;
  transmissionSig: string;
  certUrl: string;
  authAlgo: string;
}

/**
 * The five headers PayPal signs a delivery with. Any one missing or blank
 * means the request cannot be verified, and an unverifiable request is
 * answered 400 before anything is read from its body.
 */
export function readWebhookHeaders(get: (name: string) => string | null): WebhookHeaders | null {
  const read = (name: string) => get(name)?.trim() ?? '';
  const headers: WebhookHeaders = {
    transmissionId: read('paypal-transmission-id'),
    transmissionTime: read('paypal-transmission-time'),
    transmissionSig: read('paypal-transmission-sig'),
    certUrl: read('paypal-cert-url'),
    authAlgo: read('paypal-auth-algo'),
  };
  return Object.values(headers).every((v) => v.length > 0) ? headers : null;
}

// ── Building the PayPal invoice from the Foreman's ───────────────────────────

export interface ForemanInvoiceForPayPal {
  id: string;
  invoiceNumber: string;
  issuedAt: Date | null;
  /** `YYYY-MM-DD` or null. */
  dueDate: string | null;
  /** A percentage: 8.25 means 8.25%. */
  taxRatePercent: number;
  credits: number;
  total: number;
  paymentInstructions: string | null;
  lines: { description: string; quantity: string | number; unitPrice: string | number; taxable: boolean }[];
}

export interface OrgForPayPal {
  name: string;
  logoUrl: string | null;
  timezone: string;
}

export interface ClientForPayPal {
  displayName: string;
  companyName: string | null;
  email: string | null;
}

export interface PayPalMoney {
  currency_code: string;
  value: string;
}

export interface PayPalInvoiceItem {
  name: string;
  description?: string;
  quantity: string;
  unit_amount: PayPalMoney;
  tax?: { name: string; percent: string };
  unit_of_measure: 'QUANTITY';
}

/** The subset of PayPal's create-invoice request the app sends. */
export interface PayPalInvoiceBody {
  detail: {
    invoice_number: string;
    invoice_date: string;
    currency_code: 'USD';
    note: string;
    memo: string;
    payment_term: { term_type: 'DUE_ON_DATE_SPECIFIED'; due_date: string } | { term_type: 'DUE_ON_RECEIPT' };
  };
  invoicer: { business_name: string; logo_url?: string };
  primary_recipients: [{ billing_info: { business_name: string; email_address: string } }];
  items: PayPalInvoiceItem[];
  configuration: {
    tax_calculated_after_discount: false;
    tax_inclusive: false;
    allow_tip: false;
    partial_payment: { allow_partial_payment: false };
  };
  amount?: { breakdown: { discount: { invoice_discount: { amount: PayPalMoney } } } };
}

export type BuildResult = { ok: true; body: PayPalInvoiceBody } | { ok: false; error: string };

const CURRENCY = 'USD';
const ITEM_NAME_MAX = 200;
const ITEM_DESCRIPTION_MAX = 1000;

/**
 * A calendar day in a named zone, as `YYYY-MM-DD`. An invoice issued at
 * 21:30 in Dallas is a 5 November invoice even though the stored instant
 * is already the 6th in UTC; the client's copy has to say what the office
 * clock said.
 */
export function calendarDateInZone(instant: Date, timeZone: string): string {
  const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: '2-digit', day: '2-digit' };
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-CA', { ...options, timeZone });
  } catch {
    formatter = new Intl.DateTimeFormat('en-CA', { ...options, timeZone: 'UTC' });
  }
  return formatter.format(instant);
}

/**
 * PayPal takes a quantity as a decimal string with up to five places; the
 * Foreman stores four. Trailing zeros are dropped so `1.5000` reads as `1.5`
 * on the client's copy. Null for anything that is not a positive number —
 * a zero-quantity line is a mistake on the invoice, not something to send.
 */
export function formatQuantity(value: string | number): string | null {
  const n = toNum(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Number(n.toFixed(4)).toString();
}

/** Two decimals, as the string PayPal's money fields want. */
export function money(value: string | number): string {
  return toNum(value).toFixed(2);
}

/** PayPal's computed total against the Foreman's, to the cent. */
export function totalsAgree(paypalValue: string, foremanTotal: number): boolean {
  const theirs = Number(paypalValue);
  if (!Number.isFinite(theirs)) return false;
  return Math.abs(theirs - Math.round(foremanTotal * 100) / 100) < 0.005;
}

function normaliseEmail(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase() ?? '';
  return email.length > 0 && isEmailAddress(email) ? email : null;
}

/**
 * The PayPal invoice request for a Foreman invoice. Returns the first
 * problem only, phrased for the person who can fix it.
 *
 * Tax goes on the taxable lines only, at the invoice's rate, which is what
 * keeps exempt labor exempt on the client's copy; a credit becomes an
 * invoice-level discount; and the configuration is fixed — no tip prompt, no
 * partial payment, tax before discount — because the Foreman already decided
 * those.
 */
export function buildInvoiceRequest(
  invoice: ForemanInvoiceForPayPal,
  org: OrgForPayPal,
  client: ClientForPayPal,
  now: Date = new Date(),
): BuildResult {
  const email = normaliseEmail(client.email);
  if (!email) {
    return {
      ok: false,
      error: `Add a valid email address to ${client.displayName} first; PayPal sends the invoice to it.`,
    };
  }

  const items: PayPalInvoiceItem[] = [];
  for (const [index, line] of invoice.lines.entries()) {
    const quantity = formatQuantity(line.quantity);
    if (!quantity) {
      return {
        ok: false,
        error: `Line ${index + 1} has a quantity of zero. Fix it on the invoice first.`,
      };
    }
    const description = line.description.trim();
    const item: PayPalInvoiceItem = {
      name: description.slice(0, ITEM_NAME_MAX),
      quantity,
      unit_amount: { currency_code: CURRENCY, value: money(line.unitPrice) },
      unit_of_measure: 'QUANTITY',
    };
    if (description.length > ITEM_NAME_MAX) {
      item.description = description.slice(ITEM_NAME_MAX, ITEM_NAME_MAX + ITEM_DESCRIPTION_MAX);
    }
    if (line.taxable && invoice.taxRatePercent > 0) {
      item.tax = { name: 'Sales tax', percent: String(invoice.taxRatePercent) };
    }
    items.push(item);
  }

  const instructions = invoice.paymentInstructions?.trim();
  const note =
    `Invoice ${invoice.invoiceNumber} from ${org.name}. Pay securely with the button below.` +
    (instructions ? ` ${instructions}` : '');

  const invoicer: PayPalInvoiceBody['invoicer'] = { business_name: org.name };
  if (org.logoUrl && /^https:\/\//i.test(org.logoUrl)) invoicer.logo_url = org.logoUrl;

  const body: PayPalInvoiceBody = {
    detail: {
      invoice_number: invoice.invoiceNumber,
      invoice_date: calendarDateInZone(invoice.issuedAt ?? now, org.timezone),
      currency_code: CURRENCY,
      note,
      memo: `foreman:${invoice.id}`,
      payment_term: invoice.dueDate
        ? { term_type: 'DUE_ON_DATE_SPECIFIED', due_date: invoice.dueDate }
        : { term_type: 'DUE_ON_RECEIPT' },
    },
    invoicer,
    primary_recipients: [
      {
        billing_info: {
          business_name: client.companyName?.trim() || client.displayName,
          email_address: email,
        },
      },
    ],
    items,
    configuration: {
      tax_calculated_after_discount: false,
      tax_inclusive: false,
      allow_tip: false,
      partial_payment: { allow_partial_payment: false },
    },
  };

  const credits = toNum(invoice.credits);
  if (credits > 0) {
    body.amount = {
      breakdown: {
        discount: { invoice_discount: { amount: { currency_code: CURRENCY, value: money(credits) } } },
      },
    };
  }

  return { ok: true, body };
}

// ── Whether an invoice can be sent through PayPal right now ──────────────────

export interface SendPreconditionInput {
  status: InvoiceStatus;
  clientEmail: string | null;
  clientName: string;
  paypalInvoiceId: string | null;
  paypalSentAt: Date | null;
  connectionLive: boolean;
}

/**
 * The refusals, in the order a person would want to hear them: no connection
 * at all before anything about this invoice, the invoice's own state before
 * the client's record. `retry` is true when a PayPal invoice exists but was
 * never sent — the send is tried again against it rather than a second
 * invoice being created.
 */
export function sendPreconditions(
  input: SendPreconditionInput,
): { ok: true; retry: boolean } | { ok: false; error: string } {
  if (!input.connectionLive) return { ok: false, error: 'Connect PayPal in Settings first.' };
  if (input.status === 'draft' || input.status === 'void') {
    return {
      ok: false,
      error: 'Issue the invoice first; its amounts have to be locked before a client can pay them.',
    };
  }
  if (input.status === 'paid') return { ok: false, error: 'This invoice is already paid.' };
  if (!input.clientEmail?.trim()) {
    return {
      ok: false,
      error: `Add an email address to ${input.clientName} first; PayPal sends the invoice to it.`,
    };
  }
  if (input.paypalInvoiceId && input.paypalSentAt) {
    return {
      ok: false,
      error: `Already sent through PayPal on ${formatCalendarDate(input.paypalSentAt)}.`,
    };
  }
  return { ok: true, retry: Boolean(input.paypalInvoiceId) };
}

// ── PayPal's errors, in words ────────────────────────────────────────────────

function readErrorName(body: unknown): string | null {
  if (body && typeof body === 'object' && 'name' in body && typeof body.name === 'string') {
    return body.name;
  }
  return null;
}

function readErrorIssues(body: unknown): string[] {
  if (!body || typeof body !== 'object' || !('details' in body) || !Array.isArray(body.details)) {
    return [];
  }
  return body.details
    .map((d: unknown) => (d && typeof d === 'object' && 'issue' in d ? String(d.issue) : ''))
    .filter((issue: string) => issue.length > 0);
}

/**
 * What a failed PayPal call means to the person who pressed the button.
 * The duplicate-number issue code is PayPal's documented one; the sandbox
 * run confirms the spelling.
 */
export function explainPayPalError(
  status: number,
  body: unknown,
  invoiceNumber: string,
  phase: 'before_send' | 'after_send' = 'before_send',
): string {
  if (status === 401) return 'PayPal refused the client id and secret. Check them in Settings.';
  if (readErrorIssues(body).includes('DUPLICATE_INVOICE_NUMBER')) {
    return `PayPal already has an invoice numbered ${invoiceNumber}. Change the number on PayPal's side or void and re-issue here.`;
  }
  const name = readErrorName(body);
  const returned = `${status}${name ? ` (${name})` : ''}`;
  // Once the send has gone through, the client has the email. Saying
  // "nothing was sent" at that point would be the one lie this screen must
  // never tell.
  if (phase === 'after_send') {
    return `The invoice was sent, but PayPal returned ${returned} when it was read back. Reload in a minute.`;
  }
  return `PayPal returned ${returned}. Nothing was sent; try again in a minute.`;
}

// ── Which recorded payment came through PayPal ───────────────────────────────

/**
 * The date of the first PayPal-recorded payment on an invoice, or null. A
 * payment carries a processor id only when the webhook wrote it; one typed
 * in by hand after a check arrived has none — so an invoice sent through
 * PayPal and then paid by check must not read "paid through PayPal".
 */
export function paypalPaymentOn(
  applied: { externalId: string | null; isRefund: boolean | null; paymentDate: string }[],
): string | null {
  const paypal = applied.find((p) => Boolean(p.externalId) && !p.isRefund);
  return paypal?.paymentDate ?? null;
}

// ── What a fetched PayPal invoice means for the ledger ───────────────────────

export interface PayPalPaymentDetail {
  type?: 'PAYPAL' | 'EXTERNAL';
  payment_id?: string;
  payment_date?: string;
  payment_date_time?: string;
  method?: string;
  amount?: PayPalMoney;
  note?: string;
}

export interface PayPalRefundDetail {
  type?: 'PAYPAL' | 'EXTERNAL';
  refund_id?: string;
  refund_date?: string;
  amount?: PayPalMoney;
  method?: string;
}

/** The subset of PayPal's invoice object the app reads back. */
export interface PayPalFetchedInvoice {
  id: string;
  status: string;
  detail?: {
    invoice_number?: string;
    metadata?: { recipient_view_url?: string; invoicer_view_url?: string };
  };
  amount?: PayPalMoney;
  due_amount?: PayPalMoney;
  payments?: { paid_amount?: PayPalMoney; transactions?: PayPalPaymentDetail[] };
  refunds?: { refund_amount?: PayPalMoney; transactions?: PayPalRefundDetail[] };
}

export type LedgerOp =
  | {
      kind: 'payment';
      externalId: string;
      amount: number;
      method: PaymentMethod;
      paymentDate: string;
      notes: string;
    }
  | { kind: 'refund'; externalId: string; amount: number; paymentDate: string; notes: string }
  | { kind: 'skip'; externalId: string | null; reason: string };

function usableAmount(money: PayPalMoney | undefined): number | null {
  const n = Number(money?.value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * The ledger rows a fetched PayPal invoice implies, minus the ones already
 * recorded. Only PayPal-processed transactions post: an entry Patrick marked
 * as paid inside PayPal may carry no transaction id, so there is nothing to
 * stop it posting twice, and it stays hand-entered. Amounts are gross — the
 * client paid the invoice; PayPal's fee is the business's cost and is not in
 * this record. Payments come before refunds so a refund never lands on an
 * invoice whose payment the same event is still writing.
 */
export function ledgerOpsFor(
  invoice: PayPalFetchedInvoice,
  knownExternalIds: ReadonlySet<string>,
  now: Date = new Date(),
): LedgerOp[] {
  const today = calendarDateInZone(now, 'UTC');
  const ops: LedgerOp[] = [];

  for (const t of invoice.payments?.transactions ?? []) {
    if (t.type !== 'PAYPAL') {
      ops.push({ kind: 'skip', externalId: null, reason: 'external payment; record by hand' });
      continue;
    }
    const id = t.payment_id?.trim();
    if (!id) {
      ops.push({ kind: 'skip', externalId: null, reason: 'no transaction id' });
      continue;
    }
    if (knownExternalIds.has(id)) {
      ops.push({ kind: 'skip', externalId: id, reason: 'already recorded' });
      continue;
    }
    const amount = usableAmount(t.amount);
    if (amount === null) {
      ops.push({ kind: 'skip', externalId: id, reason: 'no usable amount' });
      continue;
    }
    ops.push({
      kind: 'payment',
      externalId: id,
      amount,
      method: mapPayPalMethod(t.method),
      paymentDate: t.payment_date?.trim() || today,
      notes: `PayPal invoice ${invoice.id}`,
    });
  }

  for (const r of invoice.refunds?.transactions ?? []) {
    if (r.type !== 'PAYPAL') {
      ops.push({ kind: 'skip', externalId: null, reason: 'external refund; record by hand' });
      continue;
    }
    const id = r.refund_id?.trim();
    if (!id) {
      ops.push({ kind: 'skip', externalId: null, reason: 'no transaction id' });
      continue;
    }
    if (knownExternalIds.has(id)) {
      ops.push({ kind: 'skip', externalId: id, reason: 'already recorded' });
      continue;
    }
    const amount = usableAmount(r.amount);
    if (amount === null) {
      ops.push({ kind: 'skip', externalId: id, reason: 'no usable amount' });
      continue;
    }
    ops.push({
      kind: 'refund',
      externalId: id,
      amount,
      paymentDate: r.refund_date?.trim() || today,
      notes: `PayPal refund on invoice ${invoice.id}`,
    });
  }

  return ops;
}
