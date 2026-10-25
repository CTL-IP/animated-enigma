/**
 * Pure platform-billing logic: what PT's Tactical Foreman charges a
 * subscribing organization for running the product (not to be confused with
 * `financials-core.ts`, which is what a contractor charges *their* client).
 *
 * Four tiers, each a flat monthly base plus a usage fee tied to the
 * contract value the org runs through the platform — pricing that scales
 * with the subscriber's own business, the way they asked for it to. Every
 * tier offers the subscriber a choice of two usage cadences: a lower rate
 * billed once a year, or a smaller rate billed every month for as long as
 * they stay — "forever" meaning "ongoing", not a clause that survives after
 * they leave.
 *
 * No I/O, so all of it is unit-testable.
 */

export const BILLING_TIERS = ['starter', 'established', 'growing', 'enterprise'] as const;
export type BillingTier = (typeof BILLING_TIERS)[number];

export function isBillingTier(value: string): value is BillingTier {
  return (BILLING_TIERS as readonly string[]).includes(value);
}

export const BILLING_CADENCES = ['annual', 'monthly_forever'] as const;
export type BillingCadence = (typeof BILLING_CADENCES)[number];

export function isBillingCadence(value: string): value is BillingCadence {
  return (BILLING_CADENCES as readonly string[]).includes(value);
}

export interface TierPricing {
  tier: BillingTier;
  label: string;
  /** Flat charge every month, regardless of cadence. */
  monthlyBase: number;
  /** Fraction of contract value, billed once a year. */
  annualPct: number;
  /** Fraction of contract value, billed every month instead of annually. */
  monthlyForeverPct: number;
}

// Numbers as set by the owner — not derived, not guessed. Change here only on
// his word; nothing in this module infers a price from anything else.
export const TIER_PRICING: Record<BillingTier, TierPricing> = {
  starter: {
    tier: 'starter',
    label: 'Starter',
    monthlyBase: 150,
    annualPct: 0.06,
    monthlyForeverPct: 0.03,
  },
  established: {
    tier: 'established',
    label: 'Established',
    monthlyBase: 1200,
    annualPct: 0.085,
    monthlyForeverPct: 0.045,
  },
  growing: {
    tier: 'growing',
    label: 'Growing',
    monthlyBase: 1500,
    annualPct: 0.12,
    monthlyForeverPct: 0.0737,
  },
  enterprise: {
    tier: 'enterprise',
    label: 'Enterprise',
    monthlyBase: 2750,
    annualPct: 0.1515,
    monthlyForeverPct: 0.0915,
  },
};

export const TIER_ORDER: readonly BillingTier[] = [
  'starter',
  'established',
  'growing',
  'enterprise',
];

/** How each cadence reads on a screen — the tier label carries the rest. */
export const CADENCE_LABELS: Record<BillingCadence, string> = {
  annual: 'Usage billed once a year',
  monthly_forever: 'Usage billed monthly, ongoing',
};

/**
 * Where a subscription stands, as the app records it. `pending` is the row
 * before Stripe has collected anything; only a Stripe webhook moves it off
 * that — the app never promotes a subscription on its own say-so.
 */
export const SUBSCRIPTION_STATUSES = [
  'pending',
  'trialing',
  'active',
  'past_due',
  'canceled',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export function isSubscriptionStatus(value: string): value is SubscriptionStatus {
  return (SUBSCRIPTION_STATUSES as readonly string[]).includes(value);
}

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  pending: 'Not started',
  trialing: 'Trial',
  active: 'Active',
  past_due: 'Payment overdue',
  canceled: 'Canceled',
};

export const SUBSCRIPTION_STATUS_STYLES: Record<SubscriptionStatus, string> = {
  pending: 'bg-muted text-muted-foreground',
  trialing: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  active: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  past_due: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  canceled: 'bg-destructive/10 text-destructive',
};

export interface BillingCharges {
  /** Charged every month, every cadence. */
  monthlyBase: number;
  /** Charged every month on top of the base — only under `monthly_forever`. */
  monthlyUsage: number;
  /** Charged once a year on top of twelve months of base — only under `annual`. */
  annualUsage: number;
}

/**
 * What a subscriber owes under a tier and cadence, given the contract value
 * currently running through the platform. `contractValue` is the org-wide
 * active total — not per-job — because the price is meant to track the
 * subscriber's whole business, not one job at a time.
 */
export function computeCharges(
  contractValue: number,
  tier: BillingTier,
  cadence: BillingCadence,
): BillingCharges {
  const pricing = TIER_PRICING[tier];
  const value = Math.max(0, contractValue);
  if (cadence === 'annual') {
    return {
      monthlyBase: pricing.monthlyBase,
      monthlyUsage: 0,
      annualUsage: round2(value * pricing.annualPct),
    };
  }
  return {
    monthlyBase: pricing.monthlyBase,
    monthlyUsage: round2(value * pricing.monthlyForeverPct),
    annualUsage: 0,
  };
}

/** The usage rate that applies for a tier and cadence — for display, not billing math. */
export function usageRate(tier: BillingTier, cadence: BillingCadence): number {
  const pricing = TIER_PRICING[tier];
  return cadence === 'annual' ? pricing.annualPct : pricing.monthlyForeverPct;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function formatMoney(value: number | null | undefined): string {
  const n = value ?? 0;
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  });
}

export function formatPct(fraction: number): string {
  return `${Math.round((fraction * 100 + Number.EPSILON) * 100) / 100}%`;
}

// ── Who may keep working ─────────────────────────────────────────────────────
//
// Selling the product means a new company pays after a trial. Companies that
// already existed when selling started keep working without a subscription:
// locking the company that built this, on the day Stripe is switched on and
// before anyone has subscribed, would take the jobs offline to make a point.
//
// Nothing here runs until Stripe can actually take a card. A lock with no
// checkout is not a price — it is an outage.

/** Companies created before this instant are not put on a trial. */
export const SUBSCRIPTION_REQUIRED_FROM = new Date('2026-10-26T00:00:00.000Z');

/** How long a new company may write jobs before a plan is required. */
export const TRIAL_DAYS = 14;

/** How long a failed renewal may sit before writes stop. */
export const PAST_DUE_GRACE_DAYS = 14;

export function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatUtcDay(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export interface ProductAccessInput {
  /** Stripe can take a card. Until it can, the product stays open. */
  billingConnected: boolean;
  status: SubscriptionStatus | null;
  orgCreatedAt: Date;
  /** End of the period Stripe already billed, when there is one. */
  periodEnd: Date | null;
}

export type ProductAccess =
  | { level: 'open'; notice: null }
  | { level: 'notice'; notice: string }
  | { level: 'blocked'; notice: string };

/**
 * Whether this company may still change its work.
 *
 * `open` — subscribed, grandfathered, or billing isn't connected.
 * `notice` — still working, and the screen says when that ends.
 * `blocked` — saved work stays readable; writes wait on a plan or a card.
 *
 * A canceled or overdue subscription is not grandfathered. The exemption is
 * only for a company that has never been billed.
 */
export function productAccess(input: ProductAccessInput, now: Date = new Date()): ProductAccess {
  if (!input.billingConnected) return { level: 'open', notice: null };

  if (input.status === 'active' || input.status === 'trialing') {
    return { level: 'open', notice: null };
  }

  if (input.status === 'canceled') {
    return {
      level: 'blocked',
      notice:
        'This subscription is canceled. Choose a plan to keep writing jobs, estimates, and invoices. What’s already saved stays put.',
    };
  }

  if (input.status === 'past_due') {
    const until = addUtcDays(input.periodEnd ?? now, PAST_DUE_GRACE_DAYS);
    if (now.getTime() < until.getTime()) {
      return {
        level: 'notice',
        notice: `The last payment didn’t go through. Update the card by ${formatUtcDay(until)} to keep working.`,
      };
    }
    return {
      level: 'blocked',
      notice:
        'The payment is still overdue. Update the card to keep working. Saved jobs stay on the account.',
    };
  }

  if (input.orgCreatedAt.getTime() < SUBSCRIPTION_REQUIRED_FROM.getTime()) {
    return { level: 'open', notice: null };
  }

  const trialEnds = addUtcDays(input.orgCreatedAt, TRIAL_DAYS);
  if (now.getTime() < trialEnds.getTime()) {
    return {
      level: 'notice',
      notice: `Trial runs through ${formatUtcDay(trialEnds)}. Subscribe before then to keep writing estimates, contracts, and invoices.`,
    };
  }

  return {
    level: 'blocked',
    notice:
      'The trial has ended. Subscribe to keep writing estimates, contracts, and invoices. What’s already saved stays put.',
  };
}
