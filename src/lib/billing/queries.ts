import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import type { OrganizationSubscription } from '@/db/schema';

/** The organisation's one subscription row, or null before it has chosen a plan. */
export async function subscriptionForOrg(
  organizationId: string,
): Promise<OrganizationSubscription | null> {
  const [row] = await getDb()
    .select()
    .from(schema.organizationSubscriptions)
    .where(eq(schema.organizationSubscriptions.organizationId, organizationId))
    .limit(1);
  return row ?? null;
}

/**
 * The row a Stripe subscription belongs to. The one read in this domain that
 * is not scoped by organisation, because a webhook arrives holding nothing but
 * Stripe's ids: the subscription id is unique across the table, so it is the
 * tenant key here, and the organisation comes out of the row rather than in.
 */
export async function subscriptionByStripeId(
  stripeSubscriptionId: string,
): Promise<OrganizationSubscription | null> {
  const [row] = await getDb()
    .select()
    .from(schema.organizationSubscriptions)
    .where(eq(schema.organizationSubscriptions.stripeSubscriptionId, stripeSubscriptionId))
    .limit(1);
  return row ?? null;
}

/**
 * The value of work the organisation signed in a window: contracts that became
 * active in it, plus change orders approved in it. This is the basis the usage
 * fee is charged on — each dollar counted once, in the period it was signed.
 *
 * `from` is inclusive and `to` exclusive, so back-to-back windows never share a
 * day. A cancelled contract drops out: if the job never happened, neither did
 * the fee. A declined change order was never money. A credit change order
 * reduces the total, which is right — the client is paying less — and the
 * caller floors the result at zero rather than ever issuing a negative fee.
 *
 * Two queries, not a join: a contract and its change orders are different
 * rows and a join would multiply the contract value by its change-order count.
 */
export async function bookedContractValue(
  organizationId: string,
  from: Date,
  to: Date,
): Promise<number> {
  const db = getDb();
  const C = schema.contracts;
  const CO = schema.changeOrders;

  const [[contracts], [changes]] = await Promise.all([
    db
      .select({ total: sql<string>`coalesce(sum(${C.contractValue}), 0)` })
      .from(C)
      .where(
        and(
          eq(C.organizationId, organizationId),
          inArray(C.status, ['active', 'completed']),
          gte(C.activatedAt, from),
          lt(C.activatedAt, to),
        ),
      ),
    db
      .select({ total: sql<string>`coalesce(sum(${CO.costChange}), 0)` })
      .from(CO)
      .where(
        and(
          eq(CO.organizationId, organizationId),
          inArray(CO.status, ['approved', 'incorporated']),
          gte(CO.approvedAt, from),
          lt(CO.approvedAt, to),
        ),
      ),
  ]);

  return Number(contracts?.total ?? 0) + Number(changes?.total ?? 0);
}
