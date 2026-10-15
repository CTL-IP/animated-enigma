import 'server-only';
import Stripe from 'stripe';
import { serverEnv } from '@/lib/env';
import {
  type CheckoutSessionParams,
  type StripeEnv,
  type SubscriptionSnapshot,
  type UsageCharge,
} from './stripe-core';

/**
 * The only module that talks to Stripe. Everything above it works in the
 * core's plain values; everything Stripe-shaped stays below this line, so the
 * day the vendor changes a field name there is one file to open.
 */

/** The Stripe-relevant slice of the server environment, in the core's shape. */
export function stripeEnv(): StripeEnv {
  const env = serverEnv();
  return {
    secretKey: env.STRIPE_SECRET_KEY,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    priceIds: {
      starter: env.STRIPE_PRICE_STARTER,
      established: env.STRIPE_PRICE_ESTABLISHED,
      growing: env.STRIPE_PRICE_GROWING,
      enterprise: env.STRIPE_PRICE_ENTERPRISE,
    },
  };
}

let client: Stripe | null = null;

/**
 * One client per process. The SDK pins its own API version, so the field
 * shapes this module reads are the ones its types describe — passing a
 * version by hand would let the two drift.
 */
function stripe(): Stripe {
  if (client) return client;
  const key = stripeEnv().secretKey?.trim();
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set — see .env.example.');
  client = new Stripe(key, {
    appInfo: { name: "PT's Tactical Foreman" },
    // Stripe's own retry on network failure; every call here is idempotent
    // or carries an idempotency key, so a retry can't double anything.
    maxNetworkRetries: 2,
  });
  return client;
}

function idOf(ref: string | { id: string } | null | undefined): string | null {
  if (!ref) return null;
  return typeof ref === 'string' ? ref : ref.id;
}

/** The slice of a Stripe subscription the app acts on. */
export function snapshotOf(subscription: Stripe.Subscription): SubscriptionSnapshot {
  // The billing period lives on the item, not the subscription, in current
  // Stripe API versions; a subscription here has exactly one item (the base).
  const item = subscription.items.data[0];
  return {
    id: subscription.id,
    customerId: idOf(subscription.customer),
    status: subscription.status,
    periodStart: item?.current_period_start ?? null,
    periodEnd: item?.current_period_end ?? null,
    startDate: subscription.start_date ?? null,
    priceId: item?.price?.id ?? null,
    metadata: subscription.metadata ?? {},
  };
}

export async function retrieveSubscription(subscriptionId: string): Promise<SubscriptionSnapshot> {
  return snapshotOf(await stripe().subscriptions.retrieve(subscriptionId));
}

/** A Stripe customer for the organisation. Created once; the id lives on the subscription row. */
export async function createCustomer(input: {
  organizationId: string;
  name: string;
  email: string | null;
}): Promise<string> {
  const customer = await stripe().customers.create(
    {
      name: input.name,
      ...(input.email ? { email: input.email } : {}),
      metadata: { organization_id: input.organizationId },
    },
    // Keyed to the organisation: a double-tap on Subscribe makes one customer.
    { idempotencyKey: `customer:${input.organizationId}` },
  );
  return customer.id;
}

/** Hosted Checkout. Returns the URL to send the person to. */
export async function createCheckoutSession(params: CheckoutSessionParams): Promise<string> {
  const session = await stripe().checkout.sessions.create(params);
  if (!session.url) throw new Error('Stripe returned a Checkout session with no URL.');
  return session.url;
}

/** Stripe's billing portal: update the card, see invoices, cancel. */
export async function createPortalSession(customerId: string, returnUrl: string): Promise<string> {
  const session = await stripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
  return session.url;
}

/**
 * Add the usage line to a renewal invoice while it is still a draft. Stripe
 * holds a subscription's renewal invoice open for about an hour before
 * finalising it, which is the window this is meant to land in.
 */
export async function addInvoiceLine(input: {
  invoiceId: string;
  customerId: string;
  charge: UsageCharge;
  idempotencyKey: string;
}): Promise<string> {
  const item = await stripe().invoiceItems.create(
    {
      customer: input.customerId,
      invoice: input.invoiceId,
      amount: input.charge.amountCents,
      currency: 'usd',
      description: input.charge.description,
      metadata: {
        kind: `usage_${input.charge.kind}`,
        booked_value: input.charge.bookedValue.toFixed(2),
        window_from: input.charge.from.toISOString(),
        window_to: input.charge.to.toISOString(),
      },
    },
    { idempotencyKey: input.idempotencyKey },
  );
  return item.id;
}

/** Permanent Stripe rejections — a retry would fail the same way. */
export function isPermanentStripeError(error: unknown): boolean {
  return error instanceof Stripe.errors.StripeInvalidRequestError;
}

/**
 * Verify a webhook delivery and parse it. Throws on a bad or stale signature;
 * the route turns that into a 400 and nothing is applied.
 */
export function verifyWebhookEvent(rawBody: string, signature: string): Stripe.Event {
  const secret = stripeEnv().webhookSecret?.trim();
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not set — see .env.example.');
  return stripe().webhooks.constructEvent(rawBody, signature, secret);
}
