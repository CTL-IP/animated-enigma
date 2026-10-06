import { describe, it, expect } from 'vitest';
import {
  TIER_PRICING,
  computeCharges,
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
