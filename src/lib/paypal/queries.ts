import { and, eq, inArray } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import type { InvoiceStatus } from '@/lib/invoices/invoices-core';
import { connectionSummary, type ConnectionSummary } from './paypal-core';
import type { InvoiceRef } from './webhook';

/**
 * The organization's connection, ciphertext included. This is the only query
 * that returns the ciphertext column, and only `connection.ts` calls it —
 * there is no path in this codebase that hands a secret to a screen, by
 * construction.
 */
export async function connectionRow(organizationId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.paypalConnections)
    .where(eq(schema.paypalConnections.organizationId, organizationId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * What the Settings card and the invoice screen need to know. Deliberately
 * never selects the ciphertext: row-level security decides who sees the row,
 * this query decides which columns. Both hold, independently.
 */
export async function connectionSummaryFor(organizationId: string): Promise<ConnectionSummary | null> {
  const db = getDb();
  const rows = await db
    .select({
      environment: schema.paypalConnections.environment,
      clientId: schema.paypalConnections.clientId,
      webhookId: schema.paypalConnections.webhookId,
      webhookUrl: schema.paypalConnections.webhookUrl,
      connectedAt: schema.paypalConnections.connectedAt,
      lastVerifiedAt: schema.paypalConnections.lastVerifiedAt,
      revokedAt: schema.paypalConnections.revokedAt,
    })
    .from(schema.paypalConnections)
    .where(eq(schema.paypalConnections.organizationId, organizationId))
    .limit(1);
  const row = rows[0];
  return row ? connectionSummary(row) : null;
}

/**
 * The Foreman invoice behind a PayPal invoice id — the one deliberately
 * cross-tenant read in this domain, the same way the Stripe webhook finds a
 * subscription by its Stripe id: PayPal does not know our organizations, so
 * the organization has to be learned from the invoice before anything else
 * can be checked. The app connects as a role that bypasses RLS; this is one
 * of the two places that is relied on, and the webhook route is the only
 * caller.
 */
export async function invoiceByPayPalId(paypalInvoiceId: string): Promise<InvoiceRef | null> {
  const db = getDb();
  const I = schema.invoices;
  const rows = await db
    .select({
      id: I.id,
      organizationId: I.organizationId,
      projectId: I.projectId,
      clientId: I.clientId,
      invoiceNumber: I.invoiceNumber,
      status: I.status,
    })
    .from(I)
    .where(eq(I.paypalInvoiceId, paypalInvoiceId))
    .limit(1);
  const row = rows[0];
  return row ? { ...row, status: row.status as InvoiceStatus } : null;
}

/** Which of these processor ids the organization's ledger already holds. */
export async function knownExternalIds(organizationId: string, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const db = getDb();
  const rows = await db
    .select({ externalId: schema.payments.externalId })
    .from(schema.payments)
    .where(
      and(eq(schema.payments.organizationId, organizationId), inArray(schema.payments.externalId, ids)),
    );
  return new Set(rows.map((r) => r.externalId).filter((id): id is string => typeof id === 'string'));
}
