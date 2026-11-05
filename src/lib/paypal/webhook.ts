import { logger } from '@/lib/logger';
import type { InvoiceStatus } from '@/lib/invoices/invoices-core';
import { PayPalApiError } from './client';
import type { ReadyConnection } from './connection';
import {
  isPayPalEvent,
  ledgerOpsFor,
  type LedgerOp,
  type PayPalFetchedInvoice,
  type WebhookHeaders,
} from './paypal-core';

/**
 * What a PayPal event does to the app's records.
 *
 * Plain module, not `'use server'`: it checks no permission, because the
 * caller is PayPal, proven by the signature PayPal itself verifies for us. It
 * must never be reachable from a browser.
 *
 * Two rules hold throughout. The event is a trigger, not a fact: the invoice
 * is fetched from PayPal before anything is written, so an event delivered
 * late or twice or out of order cannot post the wrong thing. And nothing here
 * throws for a reason a retry won't fix — those are logged and answered 200,
 * so PayPal stops resending — while a transient failure (PayPal unreachable,
 * the database down) is thrown, so PayPal does resend.
 *
 * Everything the handler touches outside itself comes through `WebhookDeps`,
 * which is what lets the whole decision be tested with fakes.
 */

export interface InvoiceRef {
  id: string;
  organizationId: string;
  projectId: string;
  clientId: string;
  invoiceNumber: string;
  status: InvoiceStatus;
}

export interface WebhookDeps {
  /** The one deliberately cross-tenant read: PayPal does not know our organizations. */
  findInvoice(paypalInvoiceId: string): Promise<InvoiceRef | null>;
  connectionFor(organizationId: string): Promise<ReadyConnection | null>;
  knownExternalIds(organizationId: string, ids: string[]): Promise<Set<string>>;
  applyOps(invoice: InvoiceRef, ops: LedgerOp[], now: Date): Promise<{ written: number; skipped: number }>;
  clearPayUrl(invoiceId: string): Promise<void>;
}

export interface WebhookOutcome {
  status: 200 | 400;
  handled: boolean;
  /** One line for the log. */
  note: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function candidateIds(invoice: PayPalFetchedInvoice): string[] {
  const ids: string[] = [];
  for (const t of invoice.payments?.transactions ?? []) if (t.payment_id?.trim()) ids.push(t.payment_id.trim());
  for (const r of invoice.refunds?.transactions ?? []) if (r.refund_id?.trim()) ids.push(r.refund_id.trim());
  return ids;
}

/** A PayPal answer a retry will not change: anything 4xx except rate limiting. */
function isPermanent(error: unknown): error is PayPalApiError {
  return error instanceof PayPalApiError && error.status !== 429 && error.status < 500;
}

export async function handlePayPalWebhook(
  rawBody: string,
  headers: WebhookHeaders | null,
  deps: WebhookDeps,
  now: Date = new Date(),
): Promise<WebhookOutcome> {
  if (!headers) return { status: 400, handled: false, note: 'missing PayPal headers' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { status: 400, handled: false, note: 'unreadable body' };
  }
  const envelope = asRecord(parsed);
  const eventId = typeof envelope.id === 'string' ? envelope.id : null;
  const type = typeof envelope.event_type === 'string' ? envelope.event_type : '';
  const resourceId = asRecord(envelope.resource).id;
  const paypalInvoiceId = typeof resourceId === 'string' && resourceId.trim() ? resourceId.trim() : null;
  if (!paypalInvoiceId) return { status: 400, handled: false, note: 'no invoice id in event' };

  // An invoice the app did not create — one made in PayPal's own screens, or
  // a stray — is not this app's business. Answered 200 without a verify call,
  // so it is never retried and never costs an API call.
  const invoice = await deps.findInvoice(paypalInvoiceId);
  if (!invoice) {
    logger.info('paypal webhook: not ours', { eventId, type, paypalInvoiceId });
    return { status: 200, handled: false, note: 'not ours' };
  }
  if (!isPayPalEvent(type)) return { status: 200, handled: false, note: `ignored ${type}` };

  const conn = await deps.connectionFor(invoice.organizationId);
  if (!conn) {
    logger.warn('paypal webhook: no live connection for the invoice’s organization', {
      eventId,
      type,
      invoiceId: invoice.id,
    });
    return { status: 200, handled: false, note: 'no live connection' };
  }
  if (!conn.webhookId) {
    logger.warn('paypal webhook: no webhook id stored, cannot verify', { eventId, invoiceId: invoice.id });
    return { status: 200, handled: false, note: 'no webhook id' };
  }

  let fetched: PayPalFetchedInvoice;
  try {
    const verified = await conn.client.verifyWebhookSignature({
      headers,
      webhookId: conn.webhookId,
      rawBody,
    });
    if (!verified) {
      logger.warn('paypal webhook: signature rejected', { eventId, type, invoiceId: invoice.id });
      return { status: 400, handled: false, note: 'signature rejected' };
    }
    fetched = await conn.client.getInvoice(paypalInvoiceId);
  } catch (error) {
    if (isPermanent(error)) {
      logger.error('paypal webhook: PayPal refused', {
        eventId,
        type,
        invoiceId: invoice.id,
        operation: error.operation,
        status: error.status,
      });
      return { status: 200, handled: false, note: `permanent: ${error.status}` };
    }
    throw error;
  }

  if (type === 'INVOICING.INVOICE.CANCELLED') {
    // Clear the link so nobody texts a dead one. The Foreman invoice's own
    // status is untouched: a vendor event does not get to void the record.
    await deps.clearPayUrl(invoice.id);
    logger.info('paypal webhook: cancelled on PayPal', { eventId, invoiceId: invoice.id });
    return { status: 200, handled: true, note: 'pay link cleared' };
  }

  const known = await deps.knownExternalIds(invoice.organizationId, candidateIds(fetched));
  const ops = ledgerOpsFor(fetched, known, now);
  const result = await deps.applyOps(invoice, ops, now);
  logger.info('paypal webhook: applied', {
    eventId,
    type,
    invoiceId: invoice.id,
    paypalStatus: fetched.status,
    ...result,
  });
  return { status: 200, handled: true, note: `wrote ${result.written}, skipped ${result.skipped}` };
}
