import { describe, expect, it } from 'vitest';
import { PROPERTY_TYPES } from '@/lib/clients/clients-core';
import {
  isTexas,
  jobTaxChecks,
  laborFromLineType,
  looksLikeDebrisHaulOff,
  looksLikeLabor,
  stateFromAddress,
  taxPropertyClass,
  type CheckLine,
  type JobCheckInput,
} from './job-checks';

const material: CheckLine = { description: 'Drywall and mud', taxable: true, amount: 400, isLabor: false };
const labor: CheckLine = { description: 'Hang and finish', taxable: false, amount: 900, isLabor: true };

function checks(over: Partial<JobCheckInput>) {
  return jobTaxChecks({
    document: 'estimate',
    hasProperty: true,
    propertyType: 'Single-family',
    state: 'TX',
    taxRatePercent: 0,
    lines: [material, labor],
    ...over,
  });
}

const ids = (list: ReturnType<typeof jobTaxChecks>) => list.map((c) => c.id);

describe('taxPropertyClass', () => {
  it('places every property type the app offers', () => {
    const classes = Object.fromEntries(PROPERTY_TYPES.map((t) => [t, taxPropertyClass(t)]));
    expect(classes).toEqual({
      'Single-family': 'residential',
      Townhouse: 'residential',
      Condo: 'residential',
      'Duplex / Multi-family': 'residential',
      'Mobile home': 'manufactured',
      Commercial: 'nonresidential',
      Other: 'other',
    });
  });

  it('treats a blank type as unset, not residential', () => {
    expect(taxPropertyClass(null)).toBe('unset');
    expect(taxPropertyClass('  ')).toBe('unset');
  });
});

describe('stateFromAddress', () => {
  it('reads the state from a stored address', () => {
    expect(stateFromAddress({ line1: '1 Main', city: 'Dallas', state: ' TX ', zip: '75201' })).toBe('TX');
  });

  it('returns null for anything else', () => {
    expect(stateFromAddress({ state: '  ' })).toBeNull();
    expect(stateFromAddress({ state: 48 })).toBeNull();
    expect(stateFromAddress('Dallas, TX')).toBeNull();
    expect(stateFromAddress(null)).toBeNull();
  });
});

describe('isTexas', () => {
  it('reads the ways people write it', () => {
    for (const s of ['TX', 'tx', ' Tex. ', 'Texas', 'TEXAS']) expect(isTexas(s)).toBe(true);
    for (const s of ['OK', 'Ohio', 'T X']) expect(isTexas(s)).toBe(false);
    expect(isTexas('')).toBeNull();
    expect(isTexas(null)).toBeNull();
  });
});

describe('line heuristics', () => {
  it('spots haul-off without catching material deliveries', () => {
    expect(looksLikeDebrisHaulOff('Dumpster and haul-off')).toBe(true);
    expect(looksLikeDebrisHaulOff('Debris removal')).toBe(true);
    expect(looksLikeDebrisHaulOff('Haul away old cabinets')).toBe(true);
    expect(looksLikeDebrisHaulOff('Haul lumber to site')).toBe(false);
    expect(looksLikeDebrisHaulOff('Trash can install')).toBe(false);
  });

  it('spots labor lines on an invoice', () => {
    expect(looksLikeLabor('Installation labor')).toBe(true);
    expect(looksLikeLabor('Demolition')).toBe(true);
    expect(looksLikeLabor('Crew — 2 days')).toBe(true);
    expect(looksLikeLabor('LVP flooring, 400 sq ft')).toBe(false);
  });
});

describe('jobTaxChecks — whether the checks can run at all', () => {
  it('asks for a property when there is none', () => {
    expect(ids(checks({ hasProperty: false }))).toEqual(['no-property']);
  });

  it('asks for the state when the address has none', () => {
    expect(ids(checks({ state: null }))).toEqual(['no-state']);
  });

  it('says nothing about a job outside Texas', () => {
    expect(checks({ state: 'OK', propertyType: 'Commercial' })).toEqual([]);
  });
});

describe('jobTaxChecks — homes', () => {
  it('no tax charged: the materials tax is yours, bought tax-free means taxable purchases', () => {
    const list = checks({});
    expect(ids(list)).toEqual(['residential-lump-sum-materials']);
    expect(list[0]!.body).toMatch(/taxable purchases/);
    expect(list[0]!.level).toBe('info');
  });

  it('warns when labor is taxed', () => {
    const list = checks({ taxRatePercent: 8.25, lines: [material, { ...labor, taxable: true }] });
    expect(ids(list)).toEqual(['residential-labor-taxed']);
    expect(list[0]).toMatchObject({ level: 'warn' });
    expect(list[0]!.body).toMatch(/Mark the labor line not taxable/);
  });

  it('counts several taxed labor lines', () => {
    const list = checks({
      taxRatePercent: 8.25,
      lines: [{ ...labor, taxable: true }, { ...labor, taxable: true, description: 'Tile set' }],
    });
    expect(list[0]!.body).toMatch(/the 2 labor lines/);
  });

  it('taxing materials only reads as a separated contract', () => {
    expect(ids(checks({ taxRatePercent: 8.25 }))).toEqual(['residential-separated']);
  });

  it('an invoice with every line taxed gets asked to check the lines are materials', () => {
    const list = checks({
      document: 'invoice',
      taxRatePercent: 8.25,
      lines: [
        { description: 'Cabinets', taxable: true, amount: 5000, isLabor: null },
        { description: 'Quartz counters', taxable: true, amount: 3000, isLabor: null },
      ],
    });
    expect(ids(list)).toEqual(['residential-all-taxed']);
  });

  it('an invoice line that reads as labor, taxed, is a warning', () => {
    const list = checks({
      document: 'invoice',
      taxRatePercent: 8.25,
      lines: [
        { description: 'Cabinets', taxable: true, amount: 5000, isLabor: null },
        { description: 'Installation labor', taxable: true, amount: 2000, isLabor: null },
      ],
    });
    expect(ids(list)).toEqual(['residential-labor-taxed']);
  });

  it('ignores zero-value lines', () => {
    const list = checks({
      taxRatePercent: 8.25,
      lines: [material, { ...labor, taxable: true, amount: 0 }],
    });
    expect(ids(list)).toEqual(['residential-separated']);
  });
});

describe('jobTaxChecks — commercial', () => {
  it('warns when a commercial job carries no tax', () => {
    const list = checks({ propertyType: 'Commercial' });
    expect(ids(list)).toEqual(['nonresidential-untaxed']);
    expect(list[0]).toMatchObject({ level: 'warn' });
    expect(list[0]!.body).toMatch(/audit collects it from you/);
  });

  it('warns about untaxed lines on a taxed commercial job', () => {
    const list = checks({ propertyType: 'Commercial', taxRatePercent: 8.25 });
    expect(ids(list)).toEqual(['nonresidential-lines-untaxed']);
    expect(list[0]!.title).toBe('1 line isn’t taxed on a commercial job');
  });

  it('confirms the job site’s rate when every line is taxed', () => {
    const list = checks({
      propertyType: 'Commercial',
      taxRatePercent: 8.25,
      lines: [material, { ...labor, taxable: true }],
    });
    expect(ids(list)).toEqual(['nonresidential-rate']);
    expect(list[0]!.level).toBe('info');
  });
});

describe('jobTaxChecks — nothing priced yet', () => {
  it('says nothing about a brand-new commercial estimate', () => {
    expect(checks({ propertyType: 'Commercial', lines: [] })).toEqual([]);
    expect(checks({ propertyType: 'Single-family', lines: [{ ...material, amount: 0 }] })).toEqual([]);
  });

  it('still asks for a missing property type, so it can be set before pricing', () => {
    expect(ids(checks({ propertyType: null, lines: [] }))).toEqual(['property-type-unset']);
  });

  it('still flags an impossible rate', () => {
    expect(ids(checks({ propertyType: 'Commercial', taxRatePercent: 12, lines: [] }))).toEqual(['rate']);
  });
});

describe('laborFromLineType', () => {
  it('trusts labor and material types, and leaves the rest to the description', () => {
    expect(laborFromLineType('labor')).toBe(true);
    expect(laborFromLineType('material')).toBe(false);
    for (const t of ['subcontractor', 'equipment', 'allowance', 'other', null, undefined]) {
      expect(laborFromLineType(t)).toBeNull();
    }
  });
});

describe('jobTaxChecks — rates, odd property types, haul-off', () => {
  it('flags a rate no Texas address has', () => {
    const list = checks({ propertyType: 'Commercial', taxRatePercent: 9, lines: [material] });
    expect(ids(list)).toEqual(['rate', 'nonresidential-rate']);
    expect(list[0]!.title).toBe('9% isn’t a Texas rate');
  });

  it('rounds an estimate’s fraction-to-percent rate before it reaches a title', () => {
    const list = checks({ propertyType: 'Commercial', taxRatePercent: 0.0925 * 100, lines: [material] });
    expect(list[0]!.title).toBe('9.25% isn’t a Texas rate');
  });

  it('flags a rate typed as a fraction on an invoice', () => {
    const list = checks({ document: 'invoice', taxRatePercent: 0.0825, lines: [material] });
    expect(list[0]).toMatchObject({ id: 'rate', body: 'That looks like a fraction. Enter 8.25 for 8.25%.' });
  });

  it('asks for a property type rather than assuming one', () => {
    expect(ids(checks({ propertyType: null }))).toEqual(['property-type-unset']);
    expect(ids(checks({ propertyType: 'Other' }))).toEqual(['property-type-other']);
    expect(ids(checks({ propertyType: 'Mobile home' }))).toEqual(['manufactured-home']);
  });

  it('points out an untaxed haul-off charge', () => {
    const haul: CheckLine = { description: 'Dumpster haul-off', taxable: false, amount: 350, isLabor: false };
    const list = checks({ lines: [material, labor, haul] });
    expect(ids(list)).toEqual(['residential-lump-sum-materials', 'debris']);
    expect(list[1]!.body).toMatch(/“Dumpster haul-off”/);
  });

  it('stays quiet about haul-off that is already taxed', () => {
    const haul: CheckLine = { description: 'Debris removal', taxable: true, amount: 350, isLabor: false };
    const list = checks({ propertyType: 'Commercial', taxRatePercent: 8.25, lines: [material, haul] });
    expect(ids(list)).not.toContain('debris');
  });
});
