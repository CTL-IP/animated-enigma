import { and, eq, sql } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { toNum } from '@/lib/catalog/catalog-core';
import {
  balanceOf,
  nextInvoiceStatus,
  type InvoiceStatus,
  type PaymentMethod,
} from './invoices-core';

/**
 * The one place a payment is written and applied to invoices.
 *
 * Deliberately NOT a server action. This module has no `'use server'`
 * directive, so nothing here is reachable from a browser. It checks no
 * permission of its own — `recordPayment` has already checked the person's,
 * and the PayPal webhook has already checked PayPal's signature — and a
 * function like that must never be an endpoint.
 *
 * Two callers, one path, because the alternative is two recompute blocks that
 * drift: a form-recorded check and a webhook-recorded card payment have to
 * leave an invoice's `amount_paid`, `balance` and `status` in exactly the same
 * state for the same money.
 */

export type Tx = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];

export interface LedgerPaymentInput {
  organizationId: string;
  projectId: string | null;
  clientId: string | null;
  /** Always positive; `isRefund` carries the sign. */
  amount: number;
  method: PaymentMethod;
  /** `YYYY-MM-DD`. */
  paymentDate: string;
  referenceNumber: string | null;
  /**
   * A processor's own id for this transaction, when one exists. Unique per
   * organization in the database, which is what makes a redelivered webhook a
   * no-op rather than a second payment.
   */
  externalId: string | null;
  notes: string | null;
  isRefund: boolean;
  createdBy: string | null;
  /** A refund allocates a negative amount, so the invoice's paid total nets off. */
  allocations: { invoiceId: string; amount: number }[];
}

/**
 * Insert the payment and its allocations, then recompute every touched
 * invoice's paid total from its allocations — never by incrementing, so the
 * cache cannot drift — and its status through `nextInvoiceStatus`.
 *
 * Returns `{ duplicate: true }` without writing when `externalId` is already
 * recorded for this organization: the unique index is the backstop for a
 * race, this check is the ordinary path.
 */
export async function applyPaymentWithAllocations(
  tx: Tx,
  input: LedgerPaymentInput,
  now: Date = new Date(),
): Promise<{ paymentId: string } | { duplicate: true }> {
  if (input.externalId) {
    const [existing] = await tx
      .select({ id: schema.payments.id })
      .from(schema.payments)
      .where(
        and(
          eq(schema.payments.organizationId, input.organizationId),
          eq(schema.payments.externalId, input.externalId),
        ),
      )
      .limit(1);
    if (existing) return { duplicate: true };
  }

  const [payment] = await tx
    .insert(schema.payments)
    .values({
      organizationId: input.organizationId,
      projectId: input.projectId,
      clientId: input.clientId,
      amount: String(toNum(input.amount)),
      paymentDate: input.paymentDate,
      method: input.method,
      referenceNumber: input.referenceNumber,
      externalId: input.externalId,
      isRefund: input.isRefund,
      notes: input.notes,
      lockedAt: now,
      createdBy: input.createdBy,
    })
    .returning({ id: schema.payments.id });
  if (!payment) throw new Error('payment insert failed');

  for (const allocation of input.allocations) {
    await tx.insert(schema.paymentAllocations).values({
      organizationId: input.organizationId,
      paymentId: payment.id,
      invoiceId: allocation.invoiceId,
      amount: String(toNum(allocation.amount)),
      lockedAt: now,
    });
    await recomputeInvoice(tx, allocation.invoiceId);
  }

  return { paymentId: payment.id };
}

async function recomputeInvoice(tx: Tx, invoiceId: string): Promise<void> {
  const [{ paid }] = (await tx
    .select({ paid: sql<string>`coalesce(sum(amount), 0)::text` })
    .from(schema.paymentAllocations)
    .where(eq(schema.paymentAllocations.invoiceId, invoiceId))) as [{ paid: string }];

  const [invoice] = await tx
    .select({ total: schema.invoices.total, status: schema.invoices.status })
    .from(schema.invoices)
    .where(eq(schema.invoices.id, invoiceId));
  if (!invoice) return;

  const total = toNum(invoice.total);
  const amountPaid = toNum(paid);
  const balance = balanceOf(total, amountPaid);

  await tx
    .update(schema.invoices)
    .set({
      amountPaid: String(amountPaid),
      balance: String(balance),
      status: nextInvoiceStatus(invoice.status as InvoiceStatus, total, amountPaid),
    })
    .where(eq(schema.invoices.id, invoiceId));
}
