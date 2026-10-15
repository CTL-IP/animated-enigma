/**
 * Pure Stripe logic: every decision the app makes about platform billing that
 * can be made without talking to Stripe. What is configured and what is
 * missing, which price a tier maps to, what a Stripe subscription status means
 * in the app's own terms, what goes on a Checkout session, and — the part that
 * carries the pricing model — what usage line belongs on a renewal invoice.
 *
 * Stripe is the payment rail, not the pricing engine. Each tier's monthly base
 * is a recurring price in Stripe because that is what Stripe does well. The
 * percentage of signed work is computed here, from the app's own contract
 * records, and added to the renewal invoice as a line. The obvious alternative
 * — Stripe metered billing with usage reports — would put the pricing model in
 * two places and have the app report a number it would then have to trust back.
 *
 * No I/O, so all of it is unit-testable.
 */

import {
  BILLING_TIERS,
  TIER_PRICING,
  computeCharges,
  formatMoney,
  formatPct,
  isBillingCadence,
  isBillingTier,
  usageRate,
  type BillingCadence,
  type BillingTier,
  type SubscriptionStatus,
} from '@/lib/billing/billing-core';

// ── Provider status ──────────────────────────────────────────────────────────

/** The environment variable that names each tier's monthly base price in Stripe. */
export const PRICE_ENV_VARS: Record<BillingTier, string> = {
  starter: 'STRIPE_PRICE_STARTER',
  established: 'STRIPE_PRICE_ESTABLISHED',
  growing: 'STRIPE_PRICE_GROWING',
  enterprise: 'STRIPE_PRICE_ENTERPRISE',
};

export interface StripeEnv {
  secretKey?: string | null;
  webhookSecret?: string | null;
  priceIds: Partial<Record<BillingTier, string | null | undefined>>;
}

export type StripeKeyMode = 'live' | 'test';

export interface ProviderStatus {
  configured: boolean;
  /** Which variables are absent, by name — so the fix is obvious. */
  missing: string[];
  /** One sentence for the screen. */
  message: string;
  /** Which Stripe environment the secret key belongs to, when one is set. */
  mode: StripeKeyMode | null;
}

/** Live and test keys are told apart by their prefix; restricted keys share it. */
export function keyMode(secretKey: string | null | undefined): StripeKeyMode | null {
  const key = secretKey?.trim() ?? '';
  if (/^(sk|rk)_live_/.test(key)) return 'live';
  if (/^(sk|rk)_test_/.test(key)) return 'test';
  return null;
}

/**
 * Whether anyone can subscribe at all.
 *
 * Same rule as the Google card and the AI Foreman: a Subscribe button that
 * quietly does nothing teaches people the feature is broken. Names the
 * variables, because "not configured" sends someone hunting and a name sends
 * them to the right line.
 */
export function providerStatus(env: StripeEnv): ProviderStatus {
  const missing: string[] = [];
  if (!env.secretKey?.trim()) missing.push('STRIPE_SECRET_KEY');
  if (!env.webhookSecret?.trim()) missing.push('STRIPE_WEBHOOK_SECRET');
  for (const tier of BILLING_TIERS) {
    if (!env.priceIds[tier]?.trim()) missing.push(PRICE_ENV_VARS[tier]);
  }
  const mode = keyMode(env.secretKey);

  if (missing.length === 0) {
    return {
      configured: true,
      missing,
      mode,
      message:
        mode === 'test'
          ? 'Stripe is set up in test mode. Subscriptions started here are rehearsals, not money.'
          : 'Stripe is set up. Stripe collects the payment; a card number never touches this app.',
    };
  }
  return {
    configured: false,
    missing,
    mode,
    message: `Billing isn't connected yet. Missing: ${missing.join(', ')}. Nobody can subscribe until these are set.`,
  };
}

export function priceIdFor(env: StripeEnv, tier: BillingTier): string | null {
  const id = env.priceIds[tier]?.trim();
  return id ? id : null;
}

/** The tier a Stripe price belongs to, or null when the price isn't one of ours. */
export function tierForPriceId(
  env: StripeEnv,
  priceId: string | null | undefined,
): BillingTier | null {
  if (!priceId) return null;
  for (const tier of BILLING_TIERS) {
    if (priceIdFor(env, tier) === priceId) return tier;
  }
  return null;
}

// ── Subscription state ───────────────────────────────────────────────────────

/**
 * Stripe has eight subscription states; the app keeps five, because the screen
 * only has to answer "are they paying, and if not, what should they do".
 *
 * `incomplete` is a checkout that hasn't collected yet — still `pending` from
 * here. `paused` and `unpaid` both mean Stripe has stopped collecting and a
 * person has to act, which is exactly what `past_due` tells them.
 * `incomplete_expired` is a checkout that died, which for the row is a
 * cancellation. Anything Stripe adds later lands on `pending` rather than
 * guessing at a paying state it hasn't earned.
 */
export function mapSubscriptionStatus(stripeStatus: string): SubscriptionStatus {
  switch (stripeStatus) {
    case 'active':
      return 'active';
    case 'trialing':
      return 'trialing';
    case 'past_due':
    case 'unpaid':
    case 'paused':
      return 'past_due';
    case 'canceled':
    case 'incomplete_expired':
      return 'canceled';
    default:
      return 'pending';
  }
}

/** The slice of a Stripe subscription the app acts on, in plain values. */
export interface SubscriptionSnapshot {
  id: string;
  customerId: string | null;
  status: string;
  /** The current billing period of the subscription's first item, unix seconds. */
  periodStart: number | null;
  periodEnd: number | null;
  /** When the subscription began, unix seconds. */
  startDate: number | null;
  /** The recurring price on the subscription's first item. */
  priceId: string | null;
  metadata: Record<string, string | undefined>;
}

export interface SubscriptionPatch {
  stripeSubscriptionId: string;
  stripeCustomerId: string | null;
  status: SubscriptionStatus;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  /** The tier Stripe is actually charging for, or null to leave the row's tier alone. */
  tier: BillingTier | null;
}

export function unixToDate(seconds: number | null | undefined): Date | null {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000);
}

/**
 * What to write on the organisation's subscription row from what Stripe says.
 *
 * The tier comes from the price Stripe is charging, not from the row: if the
 * owner switches plans in Stripe's billing portal, the row follows. A price
 * that isn't one of ours leaves the tier untouched rather than blanking it.
 */
export function subscriptionPatch(
  snapshot: SubscriptionSnapshot,
  env: StripeEnv,
): SubscriptionPatch {
  return {
    stripeSubscriptionId: snapshot.id,
    stripeCustomerId: snapshot.customerId,
    status: mapSubscriptionStatus(snapshot.status),
    currentPeriodStart: unixToDate(snapshot.periodStart),
    currentPeriodEnd: unixToDate(snapshot.periodEnd),
    tier: tierForPriceId(env, snapshot.priceId),
  };
}

// ── Metadata ─────────────────────────────────────────────────────────────────
// What the app stamps on every Stripe object it creates, so a webhook can find
// its way back to the organisation without trusting anything but its own ids.

export const METADATA_KEYS = {
  organizationId: 'organization_id',
  tier: 'tier',
  cadence: 'cadence',
} as const;

export function planMetadata(
  organizationId: string,
  tier: BillingTier,
  cadence: BillingCadence,
): Record<string, string> {
  return {
    [METADATA_KEYS.organizationId]: organizationId,
    [METADATA_KEYS.tier]: tier,
    [METADATA_KEYS.cadence]: cadence,
  };
}

export interface PlanMetadata {
  organizationId: string | null;
  tier: BillingTier | null;
  cadence: BillingCadence | null;
}

export function readPlanMetadata(
  metadata: Record<string, string | undefined> | null | undefined,
): PlanMetadata {
  const org = metadata?.[METADATA_KEYS.organizationId]?.trim();
  const tier = metadata?.[METADATA_KEYS.tier]?.trim() ?? '';
  const cadence = metadata?.[METADATA_KEYS.cadence]?.trim() ?? '';
  return {
    organizationId: org ? org : null,
    tier: isBillingTier(tier) ? tier : null,
    cadence: isBillingCadence(cadence) ? cadence : null,
  };
}

// ── Plan choice ──────────────────────────────────────────────────────────────

export const BILLING_PATH = '/settings/billing';

export type PlanChoice =
  | { tier: BillingTier; cadence: BillingCadence; error?: undefined }
  | { error: string };

/** The two picks the subscribe form sends — a form field is untrusted. */
export function parsePlanChoice(tier: unknown, cadence: unknown): PlanChoice {
  if (typeof tier !== 'string' || !isBillingTier(tier)) return { error: 'Pick a plan.' };
  if (typeof cadence !== 'string' || !isBillingCadence(cadence)) {
    return { error: 'Pick how the usage fee is billed — once a year, or monthly.' };
  }
  return { tier, cadence };
}

export interface ExistingSubscription {
  status: SubscriptionStatus;
  stripeSubscriptionId: string | null;
}

/**
 * Whether a new checkout makes sense. A subscription Stripe is already
 * collecting on — live, in trial, or behind on payment — is changed through
 * Stripe's billing portal, not by starting a second one; two subscriptions for
 * one organisation would bill twice. A canceled or never-started row is free
 * to begin again.
 */
export function canStartCheckout(
  existing: ExistingSubscription | null,
): { ok: true } | { ok: false; reason: string } {
  if (!existing || !existing.stripeSubscriptionId) return { ok: true };
  if (existing.status === 'canceled' || existing.status === 'pending') return { ok: true };
  return {
    ok: false,
    reason:
      existing.status === 'past_due'
        ? 'This organization already has a subscription with a payment overdue. Use Manage billing to update the card.'
        : 'This organization already has a subscription. Use Manage billing to change or cancel it.',
  };
}

// ── Checkout ─────────────────────────────────────────────────────────────────

export interface CheckoutSessionInput {
  appUrl: string;
  customerId: string;
  priceId: string;
  organizationId: string;
  tier: BillingTier;
  cadence: BillingCadence;
}

/** The subset of Stripe's Checkout Session parameters the app sends — in Stripe's own field names. */
export interface CheckoutSessionParams {
  mode: 'subscription';
  customer: string;
  line_items: { price: string; quantity: number }[];
  success_url: string;
  cancel_url: string;
  client_reference_id: string;
  metadata: Record<string, string>;
  subscription_data: { metadata: Record<string, string> };
}

/**
 * Hosted Checkout, subscription mode, one line: the tier's monthly base. The
 * usage fee is never a Checkout line because it isn't known until a period
 * ends; it arrives on the renewal invoice. The organisation id rides along
 * twice — as the session's reference and in the subscription's metadata — so
 * either object on its own leads back here.
 */
export function checkoutSessionParams(input: CheckoutSessionInput): CheckoutSessionParams {
  const base = input.appUrl.replace(/\/+$/, '');
  const metadata = planMetadata(input.organizationId, input.tier, input.cadence);
  return {
    mode: 'subscription',
    customer: input.customerId,
    line_items: [{ price: input.priceId, quantity: 1 }],
    success_url: `${base}${BILLING_PATH}?checkout=success`,
    cancel_url: `${base}${BILLING_PATH}?checkout=cancelled`,
    client_reference_id: input.organizationId,
    metadata,
    subscription_data: { metadata },
  };
}

// ── Usage on the renewal invoice ─────────────────────────────────────────────

export interface UsagePeriodFacts {
  tier: BillingTier;
  cadence: BillingCadence;
  /** When the subscription began. */
  subscriptionStart: Date;
  /**
   * The billing period a renewal invoice closes out — Stripe's `period_start`
   * and `period_end` on a `subscription_cycle` invoice. On the very first
   * invoice they are equal: nothing has been used yet.
   */
  periodStart: Date;
  periodEnd: Date;
}

export interface UsageWindow {
  kind: 'monthly' | 'annual';
  /** Inclusive. */
  from: Date;
  /** Exclusive. */
  to: Date;
}

/**
 * Whole calendar months between two instants, by year and month alone. A
 * renewal falls once a month on Stripe's anchor day — clamped to a short
 * month's end, so the 31st renews on the 28th in February — which is why the
 * day of the month is deliberately ignored here: counting it would miss the
 * anniversary of a subscription that started on the 29th, 30th or 31st.
 */
export function monthsBetween(start: Date, end: Date): number {
  return (
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth())
  );
}

/** A renewal in the twelfth month after the start — and every twelve after that. */
export function isAnniversary(subscriptionStart: Date, renewal: Date): boolean {
  const months = monthsBetween(subscriptionStart, renewal);
  return months > 0 && months % 12 === 0;
}

/** Shift by whole months, clamping the day to the target month the way Stripe anchors do. */
export function addUtcMonths(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(date.getUTCDate(), lastDay);
  return new Date(
    Date.UTC(
      year,
      month,
      day,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}

/**
 * Which stretch of signed work a renewal invoice charges usage on, or null when
 * this invoice carries none.
 *
 * The basis is work *signed in the window*, counted once: a contract that
 * becomes active in March is charged on March's renewal under the monthly
 * cadence, or on the next anniversary under the annual one, and never again.
 * The alternative — a percentage of everything currently active, every month —
 * would charge a year-long job twelve times over, which is not what "3% a
 * month, or 6% a year" says to anyone who hears it.
 *
 * Monthly: the period that just ended. Annual: the twelve months ending at an
 * anniversary renewal; every other renewal under that cadence carries only the
 * base.
 */
export function usageWindow(facts: UsagePeriodFacts): UsageWindow | null {
  if (facts.periodEnd.getTime() <= facts.periodStart.getTime()) return null;
  if (facts.cadence === 'monthly_forever') {
    return { kind: 'monthly', from: facts.periodStart, to: facts.periodEnd };
  }
  if (!isAnniversary(facts.subscriptionStart, facts.periodEnd)) return null;
  return { kind: 'annual', from: addUtcMonths(facts.periodEnd, -12), to: facts.periodEnd };
}

export interface UsageCharge extends UsageWindow {
  /** What Stripe is told, in cents — its invoice items take integers. */
  amountCents: number;
  bookedValue: number;
  rate: number;
  /** The line as the subscriber reads it on the invoice. */
  description: string;
}

export function dayLabel(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * The usage line for a renewal invoice, or null when there is nothing to add:
 * no window for this invoice, or nothing signed in it. Nothing is ever added
 * for zero — a $0.00 line on an invoice reads like a mistake.
 */
export function usageCharge(facts: UsagePeriodFacts, bookedValue: number): UsageCharge | null {
  const window = usageWindow(facts);
  if (!window) return null;
  const charges = computeCharges(bookedValue, facts.tier, facts.cadence);
  const amount = facts.cadence === 'annual' ? charges.annualUsage : charges.monthlyUsage;
  if (amount <= 0) return null;
  const rate = usageRate(facts.tier, facts.cadence);
  return {
    ...window,
    amountCents: Math.round(amount * 100),
    bookedValue,
    rate,
    description: `${TIER_PRICING[facts.tier].label} plan usage: ${formatPct(rate)} of ${formatMoney(bookedValue)} in work signed ${dayLabel(window.from)} to ${dayLabel(window.to)}`,
  };
}

/**
 * One usage line per renewal invoice, however many times Stripe delivers the
 * event. Stripe keeps an idempotency key for a day, which outlasts its retry
 * schedule for a webhook the app answered late.
 */
export function usageIdempotencyKey(invoiceId: string): string {
  return `usage:${invoiceId}`;
}

// ── The catalogue Stripe has to hold ─────────────────────────────────────────

export const PRODUCT_NAME_PREFIX = 'Tactical Foreman';

export interface CatalogPrice {
  tier: BillingTier;
  productName: string;
  /** Stable handle for the price in Stripe, so setup can find what it made before. */
  lookupKey: string;
  unitAmountCents: number;
  currency: 'usd';
  interval: 'month';
}

/** The four monthly base prices, as Stripe needs them. The usage fee is not a price. */
export function catalogDefinition(): CatalogPrice[] {
  return BILLING_TIERS.map((tier) => ({
    tier,
    productName: `${PRODUCT_NAME_PREFIX} — ${TIER_PRICING[tier].label}`,
    lookupKey: `tactical_foreman_${tier}_base_monthly`,
    unitAmountCents: Math.round(TIER_PRICING[tier].monthlyBase * 100),
    currency: 'usd',
    interval: 'month',
  }));
}

/** The lines to paste into the host's environment once the prices exist. */
export function priceEnvLines(priceIds: Record<BillingTier, string>): string[] {
  return BILLING_TIERS.map((tier) => `${PRICE_ENV_VARS[tier]}=${priceIds[tier]}`);
}
