import { describe, expect, it } from 'vitest';
import {
  BILLING_PATH,
  PRICE_ENV_VARS,
  addUtcMonths,
  canStartCheckout,
  catalogDefinition,
  checkoutSessionParams,
  isAnniversary,
  keyMode,
  mapSubscriptionStatus,
  monthsBetween,
  parsePlanChoice,
  planMetadata,
  priceEnvLines,
  priceIdFor,
  providerStatus,
  readPlanMetadata,
  subscriptionPatch,
  tierForPriceId,
  unixToDate,
  usageCharge,
  usageIdempotencyKey,
  usageWindow,
  type StripeEnv,
  type UsagePeriodFacts,
} from './stripe-core';

const fullEnv: StripeEnv = {
  secretKey: 'sk_live_abc',
  webhookSecret: 'whsec_abc',
  priceIds: {
    starter: 'price_starter',
    established: 'price_established',
    growing: 'price_growing',
    enterprise: 'price_enterprise',
  },
};

const utc = (y: number, m: number, d: number, h = 0) => new Date(Date.UTC(y, m - 1, d, h));

describe('providerStatus', () => {
  it('is configured only when the key, the webhook secret and all four prices are set', () => {
    const status = providerStatus(fullEnv);
    expect(status.configured).toBe(true);
    expect(status.missing).toEqual([]);
    expect(status.mode).toBe('live');
    expect(status.message).toMatch(/card number never touches/);
  });

  it('names every missing variable so the fix is obvious', () => {
    const status = providerStatus({ priceIds: { starter: 'price_starter' } });
    expect(status.configured).toBe(false);
    expect(status.missing).toEqual([
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET',
      'STRIPE_PRICE_ESTABLISHED',
      'STRIPE_PRICE_GROWING',
      'STRIPE_PRICE_ENTERPRISE',
    ]);
    expect(status.message).toContain('STRIPE_PRICE_GROWING');
    expect(status.message).toMatch(/Nobody can subscribe/);
  });

  it('treats whitespace as absent', () => {
    const status = providerStatus({ ...fullEnv, webhookSecret: '   ' });
    expect(status.missing).toEqual(['STRIPE_WEBHOOK_SECRET']);
  });

  it('says so when the key is a test key', () => {
    const status = providerStatus({ ...fullEnv, secretKey: 'sk_test_abc' });
    expect(status.configured).toBe(true);
    expect(status.mode).toBe('test');
    expect(status.message).toMatch(/test mode/);
  });
});

describe('keyMode', () => {
  it('tells live from test by prefix, for secret and restricted keys alike', () => {
    expect(keyMode('sk_live_x')).toBe('live');
    expect(keyMode('rk_live_x')).toBe('live');
    expect(keyMode('sk_test_x')).toBe('test');
    expect(keyMode('rk_test_x')).toBe('test');
  });

  it('does not guess at anything else', () => {
    expect(keyMode('pk_live_x')).toBeNull();
    expect(keyMode('')).toBeNull();
    expect(keyMode(undefined)).toBeNull();
  });
});

describe('price ids', () => {
  it('maps a tier to its price and back', () => {
    expect(priceIdFor(fullEnv, 'growing')).toBe('price_growing');
    expect(tierForPriceId(fullEnv, 'price_growing')).toBe('growing');
  });

  it('returns null for a tier with no price and for a price that is not ours', () => {
    expect(priceIdFor({ priceIds: {} }, 'starter')).toBeNull();
    expect(priceIdFor({ priceIds: { starter: '  ' } }, 'starter')).toBeNull();
    expect(tierForPriceId(fullEnv, 'price_other')).toBeNull();
    expect(tierForPriceId(fullEnv, null)).toBeNull();
  });

  it('has one environment variable per tier', () => {
    expect(Object.keys(PRICE_ENV_VARS).sort()).toEqual([
      'enterprise',
      'established',
      'growing',
      'starter',
    ]);
  });
});

describe('mapSubscriptionStatus', () => {
  it('keeps the paying states', () => {
    expect(mapSubscriptionStatus('active')).toBe('active');
    expect(mapSubscriptionStatus('trialing')).toBe('trialing');
  });

  it('folds every "a person has to act" state into past_due', () => {
    expect(mapSubscriptionStatus('past_due')).toBe('past_due');
    expect(mapSubscriptionStatus('unpaid')).toBe('past_due');
    expect(mapSubscriptionStatus('paused')).toBe('past_due');
  });

  it('treats a dead checkout like a cancellation', () => {
    expect(mapSubscriptionStatus('canceled')).toBe('canceled');
    expect(mapSubscriptionStatus('incomplete_expired')).toBe('canceled');
  });

  it('never promotes a state it does not know', () => {
    expect(mapSubscriptionStatus('incomplete')).toBe('pending');
    expect(mapSubscriptionStatus('something_new')).toBe('pending');
  });
});

describe('subscriptionPatch', () => {
  it('turns Stripe seconds into dates and the price into a tier', () => {
    const patch = subscriptionPatch(
      {
        id: 'sub_1',
        customerId: 'cus_1',
        status: 'active',
        periodStart: 1_760_486_400, // 2025-10-15T00:00:00Z
        periodEnd: 1_763_164_800, // 2025-11-15T00:00:00Z
        startDate: 1_760_486_400,
        priceId: 'price_established',
        metadata: {},
      },
      fullEnv,
    );
    expect(patch).toEqual({
      stripeSubscriptionId: 'sub_1',
      stripeCustomerId: 'cus_1',
      status: 'active',
      currentPeriodStart: new Date('2025-10-15T00:00:00Z'),
      currentPeriodEnd: new Date('2025-11-15T00:00:00Z'),
      tier: 'established',
    });
  });

  it('leaves the tier alone when the price is not one of ours', () => {
    const patch = subscriptionPatch(
      {
        id: 'sub_1',
        customerId: null,
        status: 'canceled',
        periodStart: null,
        periodEnd: null,
        startDate: null,
        priceId: 'price_unknown',
        metadata: {},
      },
      fullEnv,
    );
    expect(patch.tier).toBeNull();
    expect(patch.currentPeriodStart).toBeNull();
    expect(patch.status).toBe('canceled');
  });

  it('unixToDate rejects nothing-values rather than making a 1970 date', () => {
    expect(unixToDate(null)).toBeNull();
    expect(unixToDate(undefined)).toBeNull();
    expect(unixToDate(Number.NaN)).toBeNull();
    expect(unixToDate(0)).toEqual(new Date(0));
  });
});

describe('plan metadata', () => {
  it('round-trips through Stripe metadata', () => {
    const meta = planMetadata('org-1', 'growing', 'annual');
    expect(meta).toEqual({ organization_id: 'org-1', tier: 'growing', cadence: 'annual' });
    expect(readPlanMetadata(meta)).toEqual({
      organizationId: 'org-1',
      tier: 'growing',
      cadence: 'annual',
    });
  });

  it('reads nothing from metadata it does not recognise', () => {
    expect(readPlanMetadata({ organization_id: ' ', tier: 'gold', cadence: 'weekly' })).toEqual({
      organizationId: null,
      tier: null,
      cadence: null,
    });
    expect(readPlanMetadata(null)).toEqual({ organizationId: null, tier: null, cadence: null });
  });
});

describe('parsePlanChoice', () => {
  it('accepts a real tier and cadence', () => {
    expect(parsePlanChoice('starter', 'monthly_forever')).toEqual({
      tier: 'starter',
      cadence: 'monthly_forever',
    });
  });

  it('rejects the plan first, then the cadence, in words a person can act on', () => {
    expect(parsePlanChoice('platinum', 'annual')).toEqual({ error: 'Pick a plan.' });
    expect(parsePlanChoice(null, 'annual')).toEqual({ error: 'Pick a plan.' });
    expect(parsePlanChoice('starter', 'weekly').error).toMatch(/once a year, or monthly/);
  });
});

describe('canStartCheckout', () => {
  it('lets a first-time or canceled organisation subscribe', () => {
    expect(canStartCheckout(null)).toEqual({ ok: true });
    expect(canStartCheckout({ status: 'pending', stripeSubscriptionId: null })).toEqual({
      ok: true,
    });
    expect(canStartCheckout({ status: 'canceled', stripeSubscriptionId: 'sub_old' })).toEqual({
      ok: true,
    });
  });

  it('refuses a second subscription while Stripe is collecting on one', () => {
    for (const status of ['active', 'trialing'] as const) {
      const result = canStartCheckout({ status, stripeSubscriptionId: 'sub_1' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(/Manage billing/);
    }
  });

  it('points an overdue subscription at the card, not a new plan', () => {
    const result = canStartCheckout({ status: 'past_due', stripeSubscriptionId: 'sub_1' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/payment overdue/);
  });
});

describe('checkoutSessionParams', () => {
  it('builds a one-line subscription checkout that leads back to the billing screen', () => {
    const params = checkoutSessionParams({
      appUrl: 'https://app.example.com/',
      customerId: 'cus_1',
      priceId: 'price_starter',
      organizationId: 'org-1',
      tier: 'starter',
      cadence: 'annual',
    });
    expect(params.mode).toBe('subscription');
    expect(params.customer).toBe('cus_1');
    expect(params.line_items).toEqual([{ price: 'price_starter', quantity: 1 }]);
    expect(params.success_url).toBe(`https://app.example.com${BILLING_PATH}?checkout=success`);
    expect(params.cancel_url).toBe(`https://app.example.com${BILLING_PATH}?checkout=cancelled`);
    expect(params.client_reference_id).toBe('org-1');
    expect(params.metadata).toEqual({
      organization_id: 'org-1',
      tier: 'starter',
      cadence: 'annual',
    });
    expect(params.subscription_data.metadata).toEqual(params.metadata);
  });
});

describe('month arithmetic', () => {
  it('counts calendar months by year and month alone', () => {
    expect(monthsBetween(utc(2026, 10, 15), utc(2026, 11, 15))).toBe(1);
    expect(monthsBetween(utc(2026, 10, 31), utc(2026, 11, 30))).toBe(1);
    expect(monthsBetween(utc(2026, 10, 15), utc(2027, 10, 15))).toBe(12);
    expect(monthsBetween(utc(2026, 10, 15), utc(2026, 10, 15))).toBe(0);
  });

  it('finds the anniversary of a subscription that started on the 31st', () => {
    const start = utc(2026, 1, 31);
    expect(isAnniversary(start, utc(2026, 2, 28))).toBe(false);
    expect(isAnniversary(start, utc(2026, 12, 31))).toBe(false);
    expect(isAnniversary(start, utc(2027, 1, 31))).toBe(true);
    expect(isAnniversary(start, utc(2028, 1, 31))).toBe(true);
    expect(isAnniversary(start, utc(2027, 7, 31))).toBe(false);
  });

  it('never calls the first invoice an anniversary', () => {
    expect(isAnniversary(utc(2026, 10, 15), utc(2026, 10, 15))).toBe(false);
  });

  it('shifts by months and clamps to the end of a short month', () => {
    expect(addUtcMonths(utc(2027, 3, 31), -1)).toEqual(utc(2027, 2, 28));
    expect(addUtcMonths(utc(2028, 2, 29), -12)).toEqual(utc(2027, 2, 28));
    expect(addUtcMonths(utc(2027, 10, 15, 13), -12)).toEqual(utc(2026, 10, 15, 13));
  });
});

const monthly: UsagePeriodFacts = {
  tier: 'starter',
  cadence: 'monthly_forever',
  subscriptionStart: utc(2026, 10, 15),
  periodStart: utc(2026, 10, 15),
  periodEnd: utc(2026, 11, 15),
};

describe('usageWindow', () => {
  it('is the period that just ended under the monthly cadence', () => {
    expect(usageWindow(monthly)).toEqual({
      kind: 'monthly',
      from: utc(2026, 10, 15),
      to: utc(2026, 11, 15),
    });
  });

  it('is nothing on the first invoice, where the period has no length', () => {
    expect(usageWindow({ ...monthly, periodEnd: monthly.periodStart })).toBeNull();
    expect(
      usageWindow({ ...monthly, cadence: 'annual', periodEnd: monthly.periodStart }),
    ).toBeNull();
  });

  it('is the trailing twelve months at an anniversary under the annual cadence, and nothing otherwise', () => {
    const annual: UsagePeriodFacts = { ...monthly, cadence: 'annual' };
    expect(usageWindow(annual)).toBeNull();
    expect(
      usageWindow({ ...annual, periodStart: utc(2027, 9, 15), periodEnd: utc(2027, 10, 15) }),
    ).toEqual({ kind: 'annual', from: utc(2026, 10, 15), to: utc(2027, 10, 15) });
    expect(
      usageWindow({ ...annual, periodStart: utc(2027, 10, 15), periodEnd: utc(2027, 11, 15) }),
    ).toBeNull();
  });
});

describe('usageCharge', () => {
  it('charges the monthly rate on the work signed in the period, in whole cents', () => {
    const charge = usageCharge(monthly, 42_000);
    expect(charge).not.toBeNull();
    expect(charge?.amountCents).toBe(126_000); // 3% of $42,000
    expect(charge?.rate).toBe(0.03);
    expect(charge?.bookedValue).toBe(42_000);
    expect(charge?.description).toBe(
      'Starter plan usage: 3% of $42,000.00 in work signed Oct 15, 2026 to Nov 15, 2026',
    );
  });

  it('charges the annual rate over the year at an anniversary', () => {
    const charge = usageCharge(
      {
        tier: 'growing',
        cadence: 'annual',
        subscriptionStart: utc(2026, 10, 15),
        periodStart: utc(2027, 9, 15),
        periodEnd: utc(2027, 10, 15),
      },
      250_000,
    );
    expect(charge?.kind).toBe('annual');
    expect(charge?.amountCents).toBe(3_000_000); // 12% of $250,000
    expect(charge?.description).toMatch(
      /^Growing plan usage: 12% of \$250,000\.00 in work signed Oct 15, 2026 to Oct 15, 2027$/,
    );
  });

  it('rounds the way the invoice will, not the way floats do', () => {
    // 7.37% of $1,234.56 = 90.987072 → $90.99
    expect(usageCharge({ ...monthly, tier: 'growing' }, 1234.56)?.amountCents).toBe(9_099);
  });

  it('adds no line when nothing was signed, or the net is a credit', () => {
    expect(usageCharge(monthly, 0)).toBeNull();
    expect(usageCharge(monthly, -500)).toBeNull();
  });

  it('adds no line off-anniversary under the annual cadence however much was signed', () => {
    expect(usageCharge({ ...monthly, cadence: 'annual' }, 1_000_000)).toBeNull();
  });

  it('keys idempotency to the invoice, so a redelivered event cannot bill twice', () => {
    expect(usageIdempotencyKey('in_123')).toBe('usage:in_123');
  });
});

describe('catalogDefinition', () => {
  it('describes the four monthly base prices from the owner’s numbers', () => {
    const prices = catalogDefinition();
    expect(prices.map((p) => p.tier)).toEqual(['starter', 'established', 'growing', 'enterprise']);
    expect(prices.map((p) => p.unitAmountCents)).toEqual([15_000, 120_000, 150_000, 275_000]);
    expect(prices.every((p) => p.interval === 'month' && p.currency === 'usd')).toBe(true);
    expect(prices[0]?.productName).toBe('Tactical Foreman — Starter');
    expect(prices[0]?.lookupKey).toBe('tactical_foreman_starter_base_monthly');
    expect(new Set(prices.map((p) => p.lookupKey)).size).toBe(4);
  });

  it('prints the environment lines in the variable names the app reads', () => {
    expect(
      priceEnvLines({ starter: 'p1', established: 'p2', growing: 'p3', enterprise: 'p4' }),
    ).toEqual([
      'STRIPE_PRICE_STARTER=p1',
      'STRIPE_PRICE_ESTABLISHED=p2',
      'STRIPE_PRICE_GROWING=p3',
      'STRIPE_PRICE_ENTERPRISE=p4',
    ]);
  });
});
