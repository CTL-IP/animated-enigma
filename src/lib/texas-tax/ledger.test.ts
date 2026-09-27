import { describe, expect, it } from 'vitest';
import { LEDGER, LEDGER_STATUSES, LEDGER_TOPICS, ledgerFact, weakestStatus } from './ledger';
import {
  BUSINESS_PROFILES,
  PROFILE_OBLIGATIONS,
  PUBLICATION_RELEVANCE,
  obligationStatus,
} from './profiles';
import { TX_PUBLICATIONS } from './publications';
import {
  CONTRACT_FORMS,
  CUSTOMER_KINDS,
  PROPERTY_USES,
  WORK_KINDS,
  checkCombinedRate,
  classifyContract,
  franchisePosition,
  latePayment,
  rentalPermitStatus,
  salesTaxDue,
  vehicleRentalTax,
} from './texas-tax-core';
import { jobTaxChecks, type JobCheckInput } from './job-checks';

const PUBLICATION_KEYS = new Set(TX_PUBLICATIONS.map((pub) => pub.key));

function everyTreatment() {
  const out = [];
  for (const propertyUse of PROPERTY_USES)
    for (const workKind of WORK_KINDS)
      for (const contractForm of CONTRACT_FORMS)
        for (const customer of CUSTOMER_KINDS)
          out.push(classifyContract({ propertyUse, workKind, contractForm, customer }));
  return out;
}

function sampleChecks() {
  const base: JobCheckInput = {
    document: 'estimate',
    hasProperty: true,
    propertyType: 'Single-family',
    state: 'TX',
    taxRatePercent: 0,
    lines: [
      { description: 'Drywall', taxable: true, amount: 400, isLabor: false },
      { description: 'Labor', taxable: true, amount: 900, isLabor: true },
      { description: 'Dumpster haul-off', taxable: false, amount: 350, isLabor: false },
    ],
  };
  const types = ['Single-family', 'Commercial', 'Mobile home', 'Other', null];
  const rates = [0, 8.25, 9, 0.0825];
  return types.flatMap((propertyType) =>
    rates.flatMap((taxRatePercent) =>
      (['estimate', 'invoice'] as const).flatMap((document) =>
        jobTaxChecks({ ...base, propertyType, taxRatePercent, document }),
      ),
    ),
  );
}

describe('the ledger', () => {
  it('keeps ids unique and readable', () => {
    const ids = LEDGER.map((fact) => fact.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('gives every fact a source, a method, and a valid topic and status', () => {
    for (const fact of LEDGER) {
      expect(fact.sources.length).toBeGreaterThan(0);
      for (const source of fact.sources) expect(source.url).toMatch(/^https:\/\//);
      expect(fact.method.length).toBeGreaterThan(20);
      expect(LEDGER_TOPICS).toContain(fact.topic);
      expect(LEDGER_STATUSES).toContain(fact.status);
    }
  });

  it('explains why every fact short of confirmed is short', () => {
    for (const fact of LEDGER.filter((f) => f.status !== 'confirmed')) {
      expect(fact.note, fact.id).toBeTruthy();
    }
  });

  it('says plainly how the pages were read', () => {
    for (const fact of LEDGER) expect(fact.method).toMatch(/not opened|excerpt|summar/i);
  });

  it('lets the weakest input decide a conclusion', () => {
    expect(weakestStatus([])).toBe('confirmed');
    expect(weakestStatus(['rate-range'])).toBe('confirmed');
    expect(weakestStatus(['rate-range', 'veteran-owned-exemption'])).toBe('partial');
    expect(weakestStatus(['veteran-owned-exemption', 'exempt-lump-sum-materials'])).toBe('unresolved');
    expect(weakestStatus(['no-such-fact'])).toBe('unresolved');
    expect(ledgerFact('rate-range')?.topic).toBe('contracting');
    expect(ledgerFact('no-such-fact')).toBeUndefined();
  });
});

describe('everything that cites the ledger', () => {
  it('cites only facts that exist — from every contract treatment', () => {
    for (const t of everyTreatment()) {
      for (const id of t.ledger) expect(ledgerFact(id), id).toBeDefined();
      for (const key of t.publications) expect(PUBLICATION_KEYS.has(key), key).toBe(true);
    }
  });

  it('cites only facts that exist — from every job check', () => {
    for (const check of sampleChecks()) {
      for (const id of check.ledger) expect(ledgerFact(id), `${check.id}: ${id}`).toBeDefined();
      for (const key of check.publications) expect(PUBLICATION_KEYS.has(key), key).toBe(true);
    }
  });

  it('cites only facts that exist — from the calculators', () => {
    const results = [
      checkCombinedRate(8.25),
      salesTaxDue({ frequency: 'monthly', year: 2026, index: 8 }),
      latePayment({ taxDue: 100, dueDate: '2026-01-20', paidDate: '2026-02-01' }),
      franchisePosition(2026, 1000, { combinedGroup: true }),
      vehicleRentalTax(10),
      vehicleRentalTax(200),
      rentalPermitStatus(3),
    ];
    for (const result of results) {
      expect('error' in result).toBe(false);
      for (const id of (result as { ledger: string[] }).ledger) expect(ledgerFact(id), id).toBeDefined();
    }
  });

  it('backs every profile rule with facts, and every pointer with a publication', () => {
    for (const profile of BUSINESS_PROFILES) {
      expect(PROFILE_OBLIGATIONS[profile].length, profile).toBeGreaterThan(0);
      for (const o of PROFILE_OBLIGATIONS[profile]) {
        if (o.kind === 'rule') {
          expect(o.ledger.length, o.title).toBeGreaterThan(0);
          for (const id of o.ledger) expect(ledgerFact(id), `${o.title}: ${id}`).toBeDefined();
        } else {
          expect(o.ledger).toHaveLength(0);
          expect(o.publications.length).toBeGreaterThan(0);
          expect(obligationStatus(o)).toBe('pointer');
        }
        for (const key of o.publications) expect(PUBLICATION_KEYS.has(key), key).toBe(true);
      }
    }
  });

  it('only rates the relevance of publications that exist', () => {
    for (const key of Object.keys(PUBLICATION_RELEVANCE)) {
      expect(PUBLICATION_KEYS.has(key), key).toBe(true);
      expect(PUBLICATION_RELEVANCE[key]!.profiles.length).toBeGreaterThan(0);
    }
  });
});
