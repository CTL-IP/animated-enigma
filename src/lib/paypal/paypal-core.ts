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
