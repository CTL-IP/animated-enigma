/**
 * The estimate's Pricing form has to hold a Texas tax rate as entered. It used
 * to show a stored 8.25% as 8.3 and refuse 8.25 outright (a 0.1 step), so
 * saving overhead or profit quietly rewrote the tax rate to 8.3%.
 *
 * Each case renders the real form, does what a person would, then reads the
 * form the way `updateRates` does — `Object.fromEntries(formData)` through
 * `ratesSchema` — so it checks the fractions the action would write. The
 * action's database write is not exercised here.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { RateControls } from '@/app/(app)/projects/[id]/estimate/estimate-controls';
import type { EstimateVersionRow } from './queries';
import { ratesSchema } from './schema';

// What the form posts is under test, not where.
vi.mock('@/lib/estimates/actions', () => ({
  updateRates: vi.fn(async () => ({})),
  changeEstimateStatus: vi.fn(),
  createNewEstimateVersion: vi.fn(),
}));

afterEach(cleanup);

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const VERSION_ID = '22222222-2222-4222-8222-222222222222';

function version(overrides: Partial<EstimateVersionRow> = {}): EstimateVersionRow {
  return {
    id: VERSION_ID,
    versionNumber: 1,
    name: null,
    status: 'draft',
    finalPrice: '0',
    directCost: '0',
    grossMarginPct: null,
    overheadPct: '0.1500',
    profitPct: '0.1000',
    taxRate: '0.0825',
    lockedAt: null,
    createdAt: new Date('2026-10-14T00:00:00Z'),
    createdByName: null,
    ...overrides,
  };
}

function renderRates(v: EstimateVersionRow = version()) {
  const { container } = render(<RateControls projectId={PROJECT_ID} version={v} editable />);
  return container.querySelector('form') as HTMLFormElement;
}

const field = (name: string) =>
  document.querySelector(`input[name="${name}"]`) as HTMLInputElement;

/** What `updateRates` would store from the form as it stands. */
function submitted(form: HTMLFormElement) {
  return ratesSchema.safeParse(Object.fromEntries(new FormData(form)));
}

describe('Pricing form: what it shows', () => {
  it('shows a stored 8.25% tax rate as 8.25', () => {
    renderRates();
    expect(field('taxRate').value).toBe('8.25');
  });

  it('takes hundredths, so the browser accepts 8.25 and refuses 8.125', () => {
    renderRates();
    const tax = field('taxRate');
    expect(tax.step).toBe('0.01');
    fireEvent.change(tax, { target: { value: '8.25' } });
    expect(tax.validity.stepMismatch).toBe(false);
    fireEvent.change(tax, { target: { value: '8.125' } });
    expect(tax.validity.stepMismatch).toBe(true);
  });

  it('shows the same rates read-only once the estimate is locked', () => {
    render(<RateControls projectId={PROJECT_ID} version={version()} editable={false} />);
    expect(screen.getByText('8.25%')).toBeTruthy();
    expect(screen.getByText('15%')).toBeTruthy();
  });
});

describe('Pricing form: what a save stores', () => {
  // Texas combined rates run from the 6.25% state rate to the 8.25% cap.
  it.each(['0.0625', '0.0675', '0.0700', '0.0725', '0.0775', '0.0800', '0.0820', '0.0825'])(
    'saving untouched keeps a stored tax rate of %s',
    (stored) => {
      const parsed = submitted(renderRates(version({ taxRate: stored })));
      expect(parsed.success).toBe(true);
      if (parsed.success) expect(parsed.data.taxRate).toBe(Number(stored));
    },
  );

  it('changing only overhead leaves the tax rate alone', () => {
    const form = renderRates();
    fireEvent.change(field('overheadPct'), { target: { value: '10' } });
    const parsed = submitted(form);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.overheadPct).toBe(0.1);
    expect(parsed.data.profitPct).toBe(0.1);
    expect(parsed.data.taxRate).toBe(0.0825);
  });

  it('stores a typed 8.25 as 0.0825, and 8.15 without float noise', () => {
    const form = renderRates(version({ taxRate: '0' }));
    fireEvent.change(field('taxRate'), { target: { value: '8.25' } });
    let parsed = submitted(form);
    expect(parsed.success && parsed.data.taxRate).toBe(0.0825);
    fireEvent.change(field('taxRate'), { target: { value: '8.15' } });
    parsed = submitted(form);
    expect(parsed.success && String(parsed.data.taxRate)).toBe('0.0815');
  });
});

describe('ratesSchema: precision', () => {
  const base = { estimateVersionId: VERSION_ID, overheadPct: '0', profitPct: '0' };

  it('refuses a rate finer than the column keeps, rather than rounding it', () => {
    const parsed = ratesSchema.safeParse({ ...base, taxRate: '8.125' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toBe(
        'Tax % takes two decimal places at most — 8.25, not 8.125.',
      );
    }
  });

  it('names the field it refuses', () => {
    const parsed = ratesSchema.safeParse({ ...base, overheadPct: '12.345', taxRate: '8.25' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0]?.message).toMatch(/^Overhead %/);
  });

  it('accepts trailing zeros and blanks', () => {
    const parsed = ratesSchema.safeParse({ ...base, taxRate: '8.250', profitPct: '' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.taxRate).toBe(0.0825);
      expect(parsed.data.profitPct).toBe(0);
    }
  });
});
