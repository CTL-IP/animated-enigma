import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { connectionSummary, type ConnectionSummary } from './paypal-core';

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
