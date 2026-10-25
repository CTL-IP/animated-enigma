import { describe, it, expect } from 'vitest';
import {
  TIER_PRICING,
  SUBSCRIPTION_REQUIRED_FROM,
  TRIAL_DAYS,
  PAST_DUE_GRACE_DAYS,
  addUtcDays,
  computeCharges,
  productAccess,
  usageRate,
  formatMoney,
  formatPct,
  isBillingTier,
  isBillingCadence,
} from './billing-core';

describe('TIER_PRICING', () => {
  it('holds the four tiers set by the owner, unchanged', () => {
    expect(TIER_PRICING.starter).toEqual({
      tier: 'starter',
      label: 'Starter',
      monthlyBase: 150,
      annualPct: 0.06,
      monthlyForeverPct: 0.03,
    });
    expect(TIER_PRICING.established).toEqual({
      tier: 'established',
      label: 'Established',
      monthlyBase: 1200,
      annualPct: 0.085,
      monthlyForeverPct: 0.045,
    });
    expect(TIER_PRICING.growing).toEqual({
      tier: 'growing',
      label: 'Growing',
      monthlyBase: 1500,
      annualPct: 0.12,
      monthlyForeverPct: 0.0737,
    });
    expect(TIER_PRICING.enterprise).toEqual({
      tier: 'enterprise',
      label: 'Enterprise',
      monthlyBase: 2750,
      annualPct: 0.1515,
      monthlyForeverPct: 0.0915,
    });
  });
});

describe('computeCharges', () => {
  it('charges only the base plus an annual usage fee under the annual cadence', () => {
    const charges = computeCharges(100_000, 'starter', 'annual');
    expect(charges).toEqual({ monthlyBase: 150, monthlyUsage: 0, annualUsage: 6000 });
  });

  it('charges only the base plus a monthly usage fee under monthly-forever', () => {
    const charges = computeCharges(100_000, 'starter', 'monthly_forever');
    expect(charges).toEqual({ monthlyBase: 150, monthlyUsage: 3000, annualUsage: 0 });
  });

  it('computes each tier’s usage fee from its own rate', () => {
    expect(computeCharges(1_000_000, 'established', 'annual').annualUsage).toBeCloseTo(85_000, 2);
    expect(computeCharges(1_000_000, 'growing', 'annual').annualUsage).toBeCloseTo(120_000, 2);
    expect(computeCharges(1_000_000, 'enterprise', 'annual').annualUsage).toBeCloseTo(151_500, 2);
  });

  it('charges zero usage on zero contract value — base still applies', () => {
    expect(computeCharges(0, 'growing', 'annual')).toEqual({
      monthlyBase: 1500,
      monthlyUsage: 0,
      annualUsage: 0,
    });
  });

  it('never charges usage on a negative contract value', () => {
    expect(computeCharges(-50_000, 'starter', 'monthly_forever').monthlyUsage).toBe(0);
  });

  it('rounds usage to the cent', () => {
    const charges = computeCharges(33.33, 'established', 'monthly_forever');
    expect(charges.monthlyUsage).toBe(1.5); // 33.33 * 0.045 = 1.49985 -> 1.50
  });
});

describe('usageRate', () => {
  it('reports the annual rate for the annual cadence', () => {
    expect(usageRate('growing', 'annual')).toBe(0.12);
  });

  it('reports the monthly-forever rate for that cadence', () => {
    expect(usageRate('growing', 'monthly_forever')).toBe(0.0737);
  });
});

describe('formatMoney', () => {
  it('formats a positive amount as USD', () => {
    expect(formatMoney(1234.5)).toBe('$1,234.50');
  });

  it('treats null and undefined as zero', () => {
    expect(formatMoney(null)).toBe('$0.00');
    expect(formatMoney(undefined)).toBe('$0.00');
  });
});

describe('formatPct', () => {
  it('renders a fraction as a percent, trimmed of float noise', () => {
    expect(formatPct(0.06)).toBe('6%');
    expect(formatPct(0.0737)).toBe('7.37%');
    expect(formatPct(0.1515)).toBe('15.15%');
  });
});

const beforeSell = new Date(SUBSCRIPTION_REQUIRED_FROM.getTime() - 1);
const atSell = new Date(SUBSCRIPTION_REQUIRED_FROM.getTime());

describe('productAccess', () => {
  const connected = {
    billingConnected: true,
    periodEnd: null as Date | null,
  };

  it('stays open when Stripe cannot take a card, even if the subscription is canceled', () => {
    expect(
      productAccess(
        { ...connected, billingConnected: false, status: 'canceled', orgCreatedAt: atSell },
        atSell,
      ),
    ).toEqual({ level: 'open', notice: null });
  });

  it('stays open for an active or trialing subscription', () => {
    for (const status of ['active', 'trialing'] as const) {
      expect(productAccess({ ...connected, status, orgCreatedAt: atSell }, atSell).level).toBe(
        'open',
      );
    }
  });

  it('leaves a company that existed before selling started alone until it subscribes', () => {
    const yearsLater = new Date('2030-01-01T00:00:00.000Z');
    expect(
      productAccess(
        { ...connected, status: null, orgCreatedAt: beforeSell, periodEnd: null },
        yearsLater,
      ),
    ).toEqual({ level: 'open', notice: null });
    expect(
      productAccess(
        { ...connected, status: 'pending', orgCreatedAt: beforeSell, periodEnd: null },
        yearsLater,
      ).level,
    ).toBe('open');
  });

  it('gives a new company a trial and names the last day', () => {
    const now = new Date(atSell.getTime() + 60_000);
    const access = productAccess({ ...connected, status: null, orgCreatedAt: atSell }, now);
    expect(access.level).toBe('notice');
    expect(access.notice).toContain('November 9, 2026');
  });

  it('blocks a new company once the trial day has arrived', () => {
    const trialEnds = addUtcDays(atSell, TRIAL_DAYS);
    expect(
      productAccess({ ...connected, status: 'pending', orgCreatedAt: atSell }, trialEnds).level,
    ).toBe('blocked');
    expect(
      productAccess(
        { ...connected, status: null, orgCreatedAt: atSell },
        new Date(trialEnds.getTime() - 1),
      ).level,
    ).toBe('notice');
  });

  it('warns through the grace window after a failed renewal, then blocks', () => {
    const periodEnd = new Date('2026-11-01T00:00:00.000Z');
    const during = new Date(periodEnd.getTime() + 86_400_000);
    const graceEnds = addUtcDays(periodEnd, PAST_DUE_GRACE_DAYS);
    expect(
      productAccess(
        { ...connected, status: 'past_due', orgCreatedAt: beforeSell, periodEnd },
        during,
      ).level,
    ).toBe('notice');
    expect(
      productAccess(
        { ...connected, status: 'past_due', orgCreatedAt: beforeSell, periodEnd },
        graceEnds,
      ).level,
    ).toBe('blocked');
  });

  it('blocks a canceled subscription even for a company that predates selling', () => {
    expect(
      productAccess({ ...connected, status: 'canceled', orgCreatedAt: beforeSell }, atSell).level,
    ).toBe('blocked');
  });
});

describe('isBillingTier / isBillingCadence', () => {
  it('accepts only the known tiers', () => {
    expect(isBillingTier('growing')).toBe(true);
    expect(isBillingTier('premium')).toBe(false);
  });

  it('accepts only the known cadences', () => {
    expect(isBillingCadence('annual')).toBe(true);
    expect(isBillingCadence('quarterly')).toBe(false);
  });
});
