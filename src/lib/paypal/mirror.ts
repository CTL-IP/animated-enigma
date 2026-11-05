import { after } from 'next/server';
import { logger } from '@/lib/logger';
import { connectionFor } from './connection';

/**
 * When a Foreman invoice is voided after it went to PayPal, the PayPal copy
 * should stop being payable too — best effort, one way, after the response.
 * A slow PayPal never slows the tap that voided the invoice, and a failure
 * here is logged, not surfaced: the app's record is already correct, and
 * the dashboard can cancel the PayPal copy by hand.
 *
 * Plain module, not `'use server'`: it checks no permission, so it must not
 * be callable from a browser. The action that calls it already did.
 */
export function cancelPayPalInvoiceLater(
  organizationId: string,
  paypalInvoiceId: string,
  wasSent: boolean,
): void {
  const task = () =>
    run(organizationId, paypalInvoiceId, wasSent).then(
      () => undefined,
      () => undefined,
    );
  try {
    after(task);
  } catch {
    void task();
  }
}

async function run(organizationId: string, paypalInvoiceId: string, wasSent: boolean): Promise<void> {
  try {
    const conn = await connectionFor(organizationId);
    if (!conn) {
      logger.warn('paypal: void not mirrored — no live connection', { organizationId, paypalInvoiceId });
      return;
    }
    // A sent invoice is cancelled (PayPal keeps it for audit); a draft that
    // was created but never sent is simply deleted.
    if (wasSent) await conn.client.cancelInvoice(paypalInvoiceId);
    else await conn.client.deleteInvoice(paypalInvoiceId);
    logger.info('paypal: void mirrored', { organizationId, paypalInvoiceId, wasSent });
  } catch (error) {
    logger.error('paypal: void not mirrored', {
      organizationId,
      paypalInvoiceId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
