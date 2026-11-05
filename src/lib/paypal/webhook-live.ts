import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { applyPaymentWithAllocations } from '@/lib/invoices/ledger';
import { connectionFor } from './connection';
import { invoiceByPayPalId, knownExternalIds } from './queries';
import type { WebhookDeps } from './webhook';

/**
 * The real dependencies behind the webhook handler. Kept apart from
 * `webhook.ts` so the handler's tests never load the database module.
 *
 * Every op of one event is written in one transaction: a payment and the
 * refund that followed it either both land or neither does.
 */
export function liveDeps(): WebhookDeps {
  return {
    findInvoice: invoiceByPayPalId,
    connectionFor,
    knownExternalIds,

    async applyOps(invoice, ops, now) {
      let written = 0;
      let skipped = 0;
      await getDb().transaction(async (tx) => {
        for (const op of ops) {
          if (op.kind === 'skip') {
            skipped += 1;
            continue;
          }
          const result = await applyPaymentWithAllocations(
            tx,
            {
              organizationId: invoice.organizationId,
              projectId: invoice.projectId,
              clientId: invoice.clientId,
              amount: op.amount,
              // A PayPal refund goes back to whatever paid; the ledger records it as PayPal money.
              method: op.kind === 'payment' ? op.method : 'paypal',
              paymentDate: op.paymentDate,
              referenceNumber: op.externalId,
              externalId: op.externalId,
              notes: op.notes,
              isRefund: op.kind === 'refund',
              createdBy: null,
              allocations: [{ invoiceId: invoice.id, amount: op.kind === 'refund' ? -op.amount : op.amount }],
            },
            now,
          );
          if ('duplicate' in result) skipped += 1;
          else written += 1;
        }
      });
      return { written, skipped };
    },

    async clearPayUrl(invoiceId) {
      await getDb()
        .update(schema.invoices)
        .set({ paypalPayUrl: null })
        .where(eq(schema.invoices.id, invoiceId));
    },
  };
}
