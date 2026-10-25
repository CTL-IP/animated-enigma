import { cache } from 'react';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { stripeEnv } from '@/lib/stripe/client';
import { providerStatus } from '@/lib/stripe/stripe-core';
import { productAccess, type ProductAccess } from './billing-core';

/**
 * The company's right to keep changing its work, for this request.
 *
 * Stripe-off is decided before any query: an unconnected deployment must not
 * pay for a lookup whose only answer is "open". Two reads when it is
 * connected, not a join — the organisation and its subscription are different
 * rows, and a missing subscription is a normal company, not a missing join.
 */
export const loadProductAccess = cache(async (organizationId: string): Promise<ProductAccess> => {
  const billingConnected = providerStatus(stripeEnv()).configured;
  if (!billingConnected) return { level: 'open', notice: null };

  const db = getDb();
  const [org] = await db
    .select({ createdAt: schema.organizations.createdAt })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, organizationId))
    .limit(1);
  if (!org) return { level: 'open', notice: null };

  const [sub] = await db
    .select({
      status: schema.organizationSubscriptions.status,
      periodEnd: schema.organizationSubscriptions.currentPeriodEnd,
    })
    .from(schema.organizationSubscriptions)
    .where(eq(schema.organizationSubscriptions.organizationId, organizationId))
    .limit(1);

  return productAccess({
    billingConnected,
    status: sub?.status ?? null,
    orgCreatedAt: org.createdAt,
    periodEnd: sub?.periodEnd ?? null,
  });
});

/** The sentence a write should return when the company may only read. */
export async function blockedProductWrite(organizationId: string): Promise<string | null> {
  const access = await loadProductAccess(organizationId);
  return access.level === 'blocked' ? access.notice : null;
}
