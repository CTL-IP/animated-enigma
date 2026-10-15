import type Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { logger } from '@/lib/logger';
import {
  bookedContractValue,
  subscriptionByStripeId,
  subscriptionForOrg,
} from '@/lib/billing/queries';
import type { OrganizationSubscription } from '@/db/schema';
import { addInvoiceLine, isPermanentStripeError, retrieveSubscription, stripeEnv } from './client';
import {
  readPlanMetadata,
  subscriptionPatch,
  unixToDate,
  usageCharge,
  usageIdempotencyKey,
  usageWindow,
} from './stripe-core';

/**
 * What a Stripe event does to the app's records.
 *
 * Plain module, not `'use server'`: it checks no permission, because the
 * caller is Stripe, authenticated by the signature the route already verified.
 * It must never be reachable from a browser.
 *
 * Two rules hold throughout. The subscription is re-read from Stripe before
 * anything is written, so an event delivered late or out of order can't roll
 * the row back to a state Stripe has already left. And nothing here throws for
 * a reason a retry won't fix — those are logged and answered, so Stripe stops
 * resending — while a transient failure is thrown, so Stripe does resend.
 */

export interface WebhookOutcome {
  /** Whether the app recognises this event at all. */
  handled: boolean;
  /** One line for the log. */
  note: string;
}

export async function applyStripeEvent(event: Stripe.Event): Promise<WebhookOutcome> {
  switch (event.type) {
    case 'checkout.session.completed':
      return onCheckoutCompleted(event.data.object);

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'customer.subscription.paused':
    case 'customer.subscription.resumed':
      return syncSubscription(event.data.object.id, null);

    case 'invoice.created':
      return onInvoiceCreated(event.data.object);

    case 'invoice.paid':
    case 'invoice.payment_failed': {
      // The subscription's status moves on its own `customer.subscription.updated`
      // event; these are kept for the log, which is where a payment question
      // gets answered.
      const invoice = event.data.object;
      logger.info(`stripe: ${event.type}`, {
        invoice: invoice.id,
        customer: idOf(invoice.customer),
        amountDue: invoice.amount_due,
      });
      return { handled: true, note: 'logged' };
    }

    default:
      return { handled: false, note: `ignored ${event.type}` };
  }
}

function idOf(ref: string | { id: string } | null | undefined): string | null {
  if (!ref) return null;
  return typeof ref === 'string' ? ref : ref.id;
}

async function onCheckoutCompleted(session: Stripe.Checkout.Session): Promise<WebhookOutcome> {
  if (session.mode !== 'subscription')
    return { handled: false, note: 'not a subscription checkout' };
  const subscriptionId = idOf(session.subscription);
  if (!subscriptionId) return { handled: true, note: 'checkout completed with no subscription' };
  const organizationId =
    session.client_reference_id ?? readPlanMetadata(session.metadata).organizationId;
  return syncSubscription(subscriptionId, organizationId);
}

/**
 * Bring the organisation's row up to what Stripe says now.
 *
 * Found by the Stripe subscription id first. Failing that — the first event
 * for a subscription the app has only a `pending` row for — by the organisation
 * the checkout or the subscription's own metadata names. In that second case a
 * cancellation is ignored: it can only be an older subscription dying after the
 * organisation started a new one, and it must not take the new one down with it.
 */
async function syncSubscription(
  subscriptionId: string,
  organizationHint: string | null,
): Promise<WebhookOutcome> {
  const snapshot = await retrieveSubscription(subscriptionId);
  const patch = subscriptionPatch(snapshot, stripeEnv());
  const organizationId = organizationHint ?? readPlanMetadata(snapshot.metadata).organizationId;

  let row: OrganizationSubscription | null = await subscriptionByStripeId(subscriptionId);
  let foundByOrg = false;
  if (!row && organizationId) {
    row = await subscriptionForOrg(organizationId);
    foundByOrg = true;
  }
  if (!row) {
    logger.warn('stripe: subscription event for no known organisation', {
      subscription: subscriptionId,
      organizationId,
    });
    return { handled: true, note: 'no matching organisation' };
  }
  if (foundByOrg && patch.status === 'canceled') {
    return { handled: true, note: 'cancellation of a subscription the row no longer tracks' };
  }

  await getDb()
    .update(schema.organizationSubscriptions)
    .set({
      stripeSubscriptionId: patch.stripeSubscriptionId,
      stripeCustomerId: patch.stripeCustomerId ?? row.stripeCustomerId,
      status: patch.status,
      currentPeriodStart: patch.currentPeriodStart,
      currentPeriodEnd: patch.currentPeriodEnd,
      ...(patch.tier ? { tier: patch.tier } : {}),
    })
    .where(eq(schema.organizationSubscriptions.id, row.id));

  logger.info('stripe: subscription synced', {
    organizationId: row.organizationId,
    subscription: subscriptionId,
    status: patch.status,
    tier: patch.tier ?? row.tier,
  });
  return { handled: true, note: `status ${patch.status}` };
}

/**
 * A renewal invoice has just been created and is still a draft: this is where
 * the usage fee goes on. The window and the amount come from the core; the
 * signed work comes from the app's own contracts, not from anything Stripe
 * holds. Every number is logged, because the first real cycle is the test.
 */
async function onInvoiceCreated(invoice: Stripe.Invoice): Promise<WebhookOutcome> {
  if (invoice.billing_reason !== 'subscription_cycle') {
    return {
      handled: false,
      note: `invoice.created for ${invoice.billing_reason ?? 'unknown reason'}`,
    };
  }
  const subscriptionId = idOf(invoice.parent?.subscription_details?.subscription);
  const customerId = idOf(invoice.customer);
  if (!subscriptionId || !customerId) {
    return { handled: true, note: 'renewal invoice without a subscription or customer' };
  }

  const row = await subscriptionByStripeId(subscriptionId);
  if (!row) {
    logger.warn('stripe: renewal invoice for an unknown subscription', {
      subscription: subscriptionId,
    });
    return { handled: true, note: 'no matching organisation' };
  }

  const snapshot = await retrieveSubscription(subscriptionId);
  const subscriptionStart = unixToDate(snapshot.startDate);
  const periodStart = unixToDate(invoice.period_start);
  const periodEnd = unixToDate(invoice.period_end);
  if (!subscriptionStart || !periodStart || !periodEnd) {
    logger.warn('stripe: renewal invoice missing its period', { invoice: invoice.id });
    return { handled: true, note: 'renewal invoice without a period' };
  }

  const facts = { tier: row.tier, cadence: row.cadence, subscriptionStart, periodStart, periodEnd };
  const window = usageWindow(facts);
  if (!window) return { handled: true, note: 'no usage window on this invoice' };

  const booked = await bookedContractValue(row.organizationId, window.from, window.to);
  const charge = usageCharge(facts, booked);
  if (!charge) {
    logger.info('stripe: no usage fee this cycle', {
      organizationId: row.organizationId,
      invoice: invoice.id,
      from: window.from.toISOString(),
      to: window.to.toISOString(),
      bookedValue: booked,
    });
    return { handled: true, note: 'nothing signed in the window' };
  }

  try {
    const itemId = await addInvoiceLine({
      invoiceId: invoice.id,
      customerId,
      charge,
      idempotencyKey: usageIdempotencyKey(invoice.id),
    });
    logger.info('stripe: usage fee added to renewal invoice', {
      organizationId: row.organizationId,
      invoice: invoice.id,
      item: itemId,
      kind: charge.kind,
      from: charge.from.toISOString(),
      to: charge.to.toISOString(),
      bookedValue: charge.bookedValue,
      rate: charge.rate,
      amountCents: charge.amountCents,
    });
    return { handled: true, note: `usage ${charge.amountCents} cents` };
  } catch (error) {
    // The invoice finalised before this arrived, or Stripe refused the line for
    // a reason that won't change: say so and stop, rather than have Stripe
    // retry for three days. Anything else is thrown so that it does retry.
    if (isPermanentStripeError(error)) {
      logger.error('stripe: usage fee rejected — add it to the invoice by hand', {
        organizationId: row.organizationId,
        invoice: invoice.id,
        amountCents: charge.amountCents,
        description: charge.description,
        message: error instanceof Error ? error.message : String(error),
      });
      return { handled: true, note: 'usage fee rejected by Stripe; needs a hand' };
    }
    throw error;
  }
}
