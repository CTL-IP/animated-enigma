import { describe, expect, it } from 'vitest';
import {
  checkCombinedRate,
  classifyContract,
  findPublication,
  franchisePosition,
  franchiseReportDue,
  latePayment,
  nextSalesTaxDue,
  possibleLegalHoliday,
  queryPublications,
  rentalPermitStatus,
  salesTaxDue,
  vehicleRentalTax,
  type ContractFacts,
  type DueDate,
} from './texas-tax-core';
import { weakestStatus } from './ledger';

function due(result: DueDate | { error: string }): DueDate {
  if ('error' in result) throw new Error(result.error);
  return result;
}

describe('queryPublications', () => {
  it('lists by subject the way the index does — cross-listed entries under each subject', () => {
    const rows = queryPublications();
    expect(rows).toHaveLength(95);
    expect(rows[0]).toMatchObject({ subject: '9-1-1 Emergency Communications' });
    expect(rows[0]!.publication.number).toBe('94-167');
    expect(rows.filter((r) => r.publication.key === '96-224').map((r) => r.subject)).toEqual([
      'Exempt Organizations',
      'Hotel Occupancy Tax',
    ]);
    expect(rows.at(-1)!.publication.key).toBe('96-576');
  });

  it('orders a subject’s publications by title', () => {
    const titles = queryPublications({ subject: 'Audit' }).map((r) => r.publication.title);
    expect(titles).toEqual([
      'Contesting Disagreed Audits, Examinations and Refund Denials',
      "Informant's Recovery Program",
      'Notice of Routine Audit',
    ]);
    expect(queryPublications({ subject: 'Sales and Use Tax' })).toHaveLength(43);
  });

  it('sorts by number numerically, with unnumbered entries last', () => {
    const rows = queryPublications({ sort: 'number' });
    expect(rows).toHaveLength(92);
    expect(rows.every((r) => r.subject === null)).toBe(true);
    const numbers = rows.map((r) => r.publication.number);
    expect(numbers[0]).toBe('94-104');
    expect(numbers.indexOf('94-105')).toBe(1);
    // 98-1018 comes after 98-924: numeric, not alphabetical.
    expect(numbers.indexOf('98-1018')).toBeGreaterThan(numbers.indexOf('98-924'));
    expect(numbers[85]).toBe('98-1018');
    expect(numbers.slice(86)).toEqual([null, null, null, null, null, null]);
  });

  it('sorts by title, digits first', () => {
    const titles = queryPublications({ sort: 'title' }).map((r) => r.publication.title);
    expect(titles.slice(0, 5)).toEqual([
      '2021 Legislative Update',
      '2023 Legislative Update',
      '2025 Legislative Update',
      'A Field Guide to the Taxes of Texas',
      'Aircraft and Texas Sales and Use Tax',
    ]);
  });

  it('searches numbers, titles, Spanish titles and relevance, ignoring case and accents', () => {
    const keys = (text: string) => queryPublications({ text, sort: 'number' }).map((r) => r.publication.key);
    expect(keys('Reparación y Remodelación')).toEqual(['94-116']);
    // A bare stem also finds the vehicle-repair guide ("Reparaciones … de Vehículos").
    expect(keys('reparacion')).toEqual(['94-113', '94-116']);
    expect(keys('94-116S')).toEqual(['94-116']);
    expect(keys('debris')).toContain('94-157');
    expect(keys('DYED DIESEL')).toEqual(['98-723', '98-823']);
    expect(keys('   ')).toHaveLength(92);
    expect(keys('no such publication anywhere')).toEqual([]);
  });

  it('filters to what a kind of business needs', () => {
    const contractorCore = queryPublications({ profile: 'contractor', level: 'core', sort: 'number' }).map(
      (r) => r.publication.key,
    );
    expect(contractorCore).toEqual(
      expect.arrayContaining(['94-116', '94-157', '94-105', '94-182', '94-171', 'sales-tax-rates']),
    );
    expect(contractorCore).not.toContain('96-143');
    expect(contractorCore).not.toContain('94-187'); // situational, not core

    const rental = queryPublications({ profile: 'vehicle-rental', sort: 'number' }).map((r) => r.publication.key);
    expect(rental).toEqual(['94-113', '96-141', '96-143', '96-254']);
  });

  it('combines a subject filter with another sort', () => {
    const rows = queryPublications({ subject: 'Franchise Tax', sort: 'number' });
    expect(rows.map((r) => r.publication.number)).toEqual(['98-806', '98-862']);
  });
});

describe('findPublication', () => {
  it('finds by number, Spanish number or key, forgivingly', () => {
    expect(findPublication('94-116')?.title).toBe('Real Property Repair and Remodeling');
    expect(findPublication(' 94-116s ')?.key).toBe('94-116');
    expect(findPublication('2025-legislative-update')?.title).toBe('2025 Legislative Update');
  });

  it('returns null rather than a near miss', () => {
    expect(findPublication('')).toBeNull();
    expect(findPublication('99-999')).toBeNull();
    expect(findPublication('94-11')).toBeNull();
  });
});

describe('classifyContract', () => {
  const job = (over: Partial<ContractFacts>): ContractFacts => ({
    propertyUse: 'residential',
    workKind: 'repair-remodel',
    contractForm: 'lump-sum',
    customer: 'taxable',
    ...over,
  });

  it('lump-sum home remodel: no tax to the customer, tax paid on materials at purchase', () => {
    const t = classifyContract(job({}));
    expect(t).toMatchObject({
      customerTaxBase: 'none',
      laborTaxable: false,
      materials: 'pay-tax-at-purchase',
      status: 'confirmed',
    });
    expect(t.ledger).toEqual(
      expect.arrayContaining(['residential-labor-not-taxable', 'lump-sum-contractor-is-consumer']),
    );
    expect(t.steps.join(' ')).toMatch(/taxable purchases/);
  });

  it('separated home remodel: tax on materials only, bought on a resale certificate', () => {
    expect(classifyContract(job({ contractForm: 'separated' }))).toMatchObject({
      customerTaxBase: 'materials',
      laborTaxable: false,
      materials: 'resale-certificate',
      status: 'confirmed',
    });
  });

  it('commercial remodel: the whole charge, however the contract is written', () => {
    for (const contractForm of ['lump-sum', 'separated'] as const) {
      const t = classifyContract(job({ propertyUse: 'nonresidential', contractForm }));
      expect(t).toMatchObject({
        customerTaxBase: 'total',
        laborTaxable: true,
        materials: 'resale-certificate',
        status: 'confirmed',
      });
      expect(t.ledger).toContain('local-tax-job-site');
      expect(t.steps.join(' ')).toMatch(/5%/);
    }
  });

  it('new construction is untaxed labor even where the property type is unknown', () => {
    expect(
      classifyContract(job({ propertyUse: 'nonresidential', workKind: 'new-construction' })),
    ).toMatchObject({ customerTaxBase: 'none', materials: 'pay-tax-at-purchase' });
    expect(
      classifyContract(
        job({ propertyUse: 'unknown', workKind: 'new-construction', contractForm: 'separated' }),
      ),
    ).toMatchObject({ customerTaxBase: 'materials', status: 'confirmed' });
  });

  it('commercial maintenance: untaxed if documented, with the materials question left open', () => {
    const t = classifyContract(job({ propertyUse: 'nonresidential', workKind: 'scheduled-maintenance' }));
    expect(t).toMatchObject({ customerTaxBase: 'none', materials: 'undetermined', status: 'partial' });
    expect(t.steps.join(' ')).toMatch(/schedule or work orders/);
  });

  it('home maintenance is treated as home repair', () => {
    expect(classifyContract(job({ workKind: 'scheduled-maintenance' })).customerTaxBase).toBe('none');
  });

  it('real property services are taxable on homes too', () => {
    const t = classifyContract(job({ workKind: 'real-property-service' }));
    expect(t).toMatchObject({ customerTaxBase: 'total', laborTaxable: true, status: 'partial' });
  });

  it('disaster repair: home labor exempt; commercial needs a separated contract to exempt it', () => {
    const home = classifyContract(job({ workKind: 'disaster-repair' }));
    expect(home).toMatchObject({ customerTaxBase: 'none', materials: 'pay-tax-at-purchase' });
    expect(home.ledger).toContain('disaster-repair');

    const separated = classifyContract(
      job({ propertyUse: 'nonresidential', workKind: 'disaster-repair', contractForm: 'separated' }),
    );
    expect(separated).toMatchObject({ customerTaxBase: 'materials', laborTaxable: false });
    expect(separated.steps.join(' ')).toMatch(/exemption certificate/);

    const lumpSum = classifyContract(job({ propertyUse: 'nonresidential', workKind: 'disaster-repair' }));
    expect(lumpSum).toMatchObject({ customerTaxBase: 'total', laborTaxable: true });
  });

  it('refuses to guess the property type', () => {
    expect(classifyContract(job({ propertyUse: 'unknown' }))).toMatchObject({
      customerTaxBase: 'undetermined',
      laborTaxable: null,
      status: 'unresolved',
    });
    const mixed = classifyContract(job({ propertyUse: 'multiple-use' }));
    expect(mixed).toMatchObject({ customerTaxBase: 'undetermined', status: 'unresolved' });
    expect(mixed.ledger).toEqual(['multiple-use-property']);
  });

  it('government and exempt customers: no tax on the job', () => {
    const gov = classifyContract(job({ customer: 'government', contractForm: 'separated' }));
    expect(gov).toMatchObject({ customerTaxBase: 'none', materials: 'resale-certificate', status: 'confirmed' });

    const church = classifyContract(job({ customer: 'exempt-organization', contractForm: 'separated' }));
    expect(church.steps.join(' ')).toMatch(/exemption certificate/);
    expect(church.ledger).toContain('exempt-organization-customers');
  });

  it('an exempt contract lets a lump-sum contractor buy materials on an exemption certificate (§151.311)', () => {
    const govLump = classifyContract(job({ customer: 'government', propertyUse: 'nonresidential' }));
    expect(govLump).toMatchObject({ customerTaxBase: 'none', materials: 'exemption-certificate', status: 'confirmed' });
    expect(govLump.headline).toMatch(/don’t price tax into them/);
    expect(govLump.steps.join(' ')).toMatch(/Ask the agency for an exemption certificate/);
    expect(govLump.steps.join(' ')).toMatch(/Tools and equipment you keep aren’t covered/);
    expect(govLump.ledger).toEqual(['government-customers', 'exempt-lump-sum-materials']);

    const churchLump = classifyContract(job({ customer: 'exempt-organization' }));
    expect(churchLump).toMatchObject({ materials: 'exemption-certificate', status: 'confirmed' });
    // The organization's own certificate is already the first step; no agency.
    expect(churchLump.steps.join(' ')).not.toMatch(/agency/);
  });

  it('always says something a person can act on', () => {
    for (const propertyUse of ['residential', 'nonresidential', 'multiple-use', 'unknown'] as const)
      for (const workKind of [
        'repair-remodel',
        'new-construction',
        'scheduled-maintenance',
        'real-property-service',
        'disaster-repair',
      ] as const)
        for (const contractForm of ['lump-sum', 'separated'] as const)
          for (const customer of ['taxable', 'government', 'exempt-organization'] as const) {
            const t = classifyContract({ propertyUse, workKind, contractForm, customer });
            expect(t.headline.length).toBeGreaterThan(20);
            expect(t.steps.length).toBeGreaterThan(0);
            expect(t.publications.length).toBeGreaterThan(0);
          }
  });
});

describe('checkCombinedRate', () => {
  it('accepts the Texas range, inclusive', () => {
    expect(checkCombinedRate(6.25).ok).toBe(true);
    expect(checkCombinedRate(8.25).ok).toBe(true);
    expect(checkCombinedRate('8.25%').ok).toBe(true);
    expect(checkCombinedRate(8.2500001).ok).toBe(true);
  });

  it('accepts zero — plenty of jobs carry no tax', () => {
    expect(checkCombinedRate(0)).toMatchObject({ ok: true, message: 'No tax charged.' });
  });

  it('rejects rates outside it, saying which way and why', () => {
    expect(checkCombinedRate(8.26).message).toMatch(/Above the 8.25%/);
    expect(checkCombinedRate(6.24).message).toMatch(/Below the 6.25%/);
    expect(checkCombinedRate(0.5).message).toMatch(/Below the 6.25%/);
    expect(checkCombinedRate(-1)).toMatchObject({ ok: false, message: 'A tax rate can’t be negative.' });
  });

  it('catches a rate typed as a fraction', () => {
    expect(checkCombinedRate(0.0825)).toMatchObject({
      ok: false,
      message: 'That looks like a fraction. Enter 8.25 for 8.25%.',
    });
  });

  it('asks for a number rather than reading garbage as zero', () => {
    for (const bad of ['abc', '', null, undefined, Number.NaN]) {
      expect(checkCombinedRate(bad).ok).toBe(false);
      expect(checkCombinedRate(bad).message).toMatch(/Enter the rate as a percent/);
    }
  });
});

describe('salesTaxDue', () => {
  it('monthly: the 20th of the next month, moved off a weekend', () => {
    // 2026-09-20 is a Sunday.
    expect(due(salesTaxDue({ frequency: 'monthly', year: 2026, index: 8 }))).toMatchObject({
      period: 'August 2026',
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      nominal: '2026-09-20',
      due: '2026-09-21',
      movedForWeekend: true,
      possibleHoliday: null,
    });
  });

  it('monthly December rolls into January of the next year', () => {
    expect(due(salesTaxDue({ frequency: 'monthly', year: 2026, index: 12 }))).toMatchObject({
      due: '2027-01-20',
      movedForWeekend: false,
    });
  });

  it('flags a holiday without moving past it — filing early is never late', () => {
    // 2025-01-20 was Martin Luther King Jr. Day, a Monday.
    expect(due(salesTaxDue({ frequency: 'monthly', year: 2024, index: 12 }))).toMatchObject({
      due: '2025-01-20',
      movedForWeekend: false,
      possibleHoliday: 'Martin Luther King Jr. Day',
    });
    // 2025-04-20 was a Sunday; the Monday after is San Jacinto Day.
    expect(due(salesTaxDue({ frequency: 'quarterly', year: 2025, index: 1 }))).toMatchObject({
      due: '2025-04-21',
      movedForWeekend: true,
      possibleHoliday: 'San Jacinto Day (Texas)',
    });
  });

  it('quarterly: April, July, October and January 20', () => {
    const q = (index: number) => due(salesTaxDue({ frequency: 'quarterly', year: 2026, index })).nominal;
    expect([q(1), q(2), q(3), q(4)]).toEqual(['2026-04-20', '2026-07-20', '2026-10-20', '2027-01-20']);
    expect(due(salesTaxDue({ frequency: 'quarterly', year: 2026, index: 3 }))).toMatchObject({
      period: 'Q3 2026 (Jul–Sep)',
      periodStart: '2026-07-01',
      periodEnd: '2026-09-30',
    });
  });

  it('yearly: January 20 of the following year', () => {
    expect(due(salesTaxDue({ frequency: 'yearly', year: 2026 }))).toMatchObject({
      period: '2026',
      due: '2027-01-20',
    });
  });

  it('rejects a period that doesn’t exist', () => {
    expect(salesTaxDue({ frequency: 'monthly', year: 2026, index: 13 })).toEqual({
      error: 'Give the month as 1–12.',
    });
    expect(salesTaxDue({ frequency: 'monthly', year: 2026 })).toHaveProperty('error');
    expect(salesTaxDue({ frequency: 'quarterly', year: 2026, index: 0 })).toHaveProperty('error');
    expect(salesTaxDue({ frequency: 'yearly', year: 26 })).toEqual({ error: 'Give a four-digit year.' });
  });
});

describe('nextSalesTaxDue', () => {
  it('finds the return still open on a given day', () => {
    expect(due(nextSalesTaxDue('monthly', '2026-09-26'))).toMatchObject({
      period: 'September 2026',
      due: '2026-10-20',
    });
    expect(due(nextSalesTaxDue('monthly', '2026-09-10'))).toMatchObject({
      period: 'August 2026',
      due: '2026-09-21',
    });
  });

  it('counts a return due today as still open', () => {
    expect(due(nextSalesTaxDue('monthly', '2026-09-21')).period).toBe('August 2026');
  });

  it('works across a year boundary', () => {
    expect(due(nextSalesTaxDue('quarterly', '2026-09-26')).period).toBe('Q3 2026 (Jul–Sep)');
    expect(due(nextSalesTaxDue('quarterly', '2026-12-30')).due).toBe('2027-01-20');
    expect(due(nextSalesTaxDue('yearly', '2026-01-05'))).toMatchObject({ period: '2025', due: '2026-01-20' });
    expect(due(nextSalesTaxDue('yearly', '2026-09-26'))).toMatchObject({ period: '2026', due: '2027-01-20' });
  });

  it('rejects a malformed day', () => {
    expect(nextSalesTaxDue('monthly', '2026-02-30')).toEqual({ error: 'Give today as YYYY-MM-DD.' });
  });
});

describe('franchiseReportDue', () => {
  it('is May 15, or the Monday after when that is a weekend', () => {
    expect(due(franchiseReportDue(2026))).toMatchObject({ due: '2026-05-15', movedForWeekend: false });
    // 2027-05-15 is a Saturday.
    expect(due(franchiseReportDue(2027))).toMatchObject({ due: '2027-05-17', movedForWeekend: true });
  });

  it('claims no accounting period', () => {
    expect(due(franchiseReportDue(2026))).toMatchObject({ periodStart: null, periodEnd: null });
    expect(franchiseReportDue(20260)).toHaveProperty('error');
  });
});

describe('possibleLegalHoliday', () => {
  it('knows the fixed and floating federal and Texas holidays', () => {
    expect(possibleLegalHoliday('2026-11-26')).toBe('Thanksgiving Day');
    expect(possibleLegalHoliday('2026-11-27')).toBe('Day after Thanksgiving (Texas)');
    expect(possibleLegalHoliday('2026-05-25')).toBe('Memorial Day');
    expect(possibleLegalHoliday('2026-09-07')).toBe('Labor Day');
    expect(possibleLegalHoliday('2026-10-12')).toBe('Columbus Day (federal)');
    expect(possibleLegalHoliday('2023-02-20')).toBe('Presidents’ Day');
    expect(possibleLegalHoliday('2026-03-02')).toBe('Texas Independence Day');
    expect(possibleLegalHoliday('2026-07-04')).toBe('Independence Day');
  });

  it('says nothing about an ordinary day or a malformed one', () => {
    expect(possibleLegalHoliday('2026-09-26')).toBeNull();
    expect(possibleLegalHoliday('not a day')).toBeNull();
  });
});

describe('latePayment', () => {
  const base = { taxDue: 1000, dueDate: '2026-01-20' };

  it('on time: no penalty, and the timely-filing discount stands', () => {
    const r = latePayment({ ...base, paidDate: '2026-01-20' });
    expect(r).toMatchObject({ daysLate: 0, penalty: 0, lateFilingPenalty: 0, totalBeforeInterest: 0 });
    expect('summary' in r && r.summary).toMatch(/\$5\.00/);
  });

  it('1–30 days late is 5%, plus the $50 that may be assessed', () => {
    for (const paidDate of ['2026-01-21', '2026-02-19']) {
      expect(latePayment({ ...base, paidDate })).toMatchObject({
        penaltyPct: 5,
        penalty: 50,
        lateFilingPenalty: 50,
        totalBeforeInterest: 100,
        discountForfeited: 5,
      });
    }
  });

  it('day 31 steps up to 10%', () => {
    expect(latePayment({ ...base, paidDate: '2026-02-20' })).toMatchObject({
      daysLate: 31,
      penaltyPct: 10,
      penalty: 100,
    });
  });

  it('after the Notice of Tax Due date, another 10%', () => {
    expect(
      latePayment({ ...base, paidDate: '2026-03-10', noticeDate: '2026-03-01' }),
    ).toMatchObject({ penaltyPct: 20, penalty: 200 });
    // Paid on the notice date itself: not after it.
    expect(
      latePayment({ ...base, paidDate: '2026-03-01', noticeDate: '2026-03-01' }),
    ).toMatchObject({ penaltyPct: 10 });
  });

  it('the notice tier is 20% in all — never 5% plus 10%', () => {
    // Five days late, paid after a notice: the Comptroller's schedule has no 15%.
    const r = latePayment({ ...base, paidDate: '2026-01-25', noticeDate: '2026-01-22' });
    expect(r).toMatchObject({ daysLate: 5, penaltyPct: 20, penalty: 200 });
    expect('summary' in r && r.summary).toMatch(/^5 days late, after the Notice of Tax Due date: 20% penalty/);
  });

  it('refuses a notice dated before the tax was due', () => {
    expect(latePayment({ ...base, paidDate: '2026-02-01', noticeDate: '2026-01-10' })).toHaveProperty('error');
  });

  it('interest starts on day 61', () => {
    expect(latePayment({ ...base, paidDate: '2026-03-21' })).toMatchObject({
      interestStartsOn: '2026-03-22',
      interestApplies: false,
    });
    expect(latePayment({ ...base, paidDate: '2026-03-22' })).toMatchObject({ interestApplies: true });
  });

  it('leaves the $50 off when only the payment was late', () => {
    expect(latePayment({ ...base, paidDate: '2026-01-25', filedLate: false })).toMatchObject({
      lateFilingPenalty: 0,
      totalBeforeInterest: 50,
    });
  });

  it('rejects inputs it can’t read', () => {
    expect(latePayment({ ...base, taxDue: 'lots', paidDate: '2026-02-01' })).toHaveProperty('error');
    expect(latePayment({ ...base, taxDue: -5, paidDate: '2026-02-01' })).toHaveProperty('error');
    expect(latePayment({ ...base, paidDate: '2026-02-31' })).toHaveProperty('error');
    expect(latePayment({ ...base, dueDate: 'soon', paidDate: '2026-02-01' })).toHaveProperty('error');
    expect(latePayment({ ...base, paidDate: '2026-02-01', noticeDate: 'x' })).toHaveProperty('error');
  });
});

describe('franchisePosition', () => {
  it('at or below the threshold: no tax, but the information report is due', () => {
    const r = franchisePosition(2026, 1_000_000);
    expect(r).toMatchObject({ threshold: 2_650_000, atOrBelowThreshold: true });
    expect('steps' in r && r.steps[0]).toMatch(/Public Information Report.*2026-05-15/);
    expect(franchisePosition(2026, '2,650,000')).toMatchObject({ atOrBelowThreshold: true });
  });

  it('a cent over is over', () => {
    expect(franchisePosition(2026, 2_650_000.01)).toMatchObject({ atOrBelowThreshold: false });
    expect(franchisePosition(2025, 2_500_000)).toMatchObject({ threshold: 2_470_000, atOrBelowThreshold: false });
  });

  it('says unknown, not no, for a year without a recorded threshold', () => {
    const r = franchisePosition(2028, 100);
    expect(r).toMatchObject({ threshold: null, atOrBelowThreshold: null });
    expect('message' in r && r.message).toMatch(/No threshold is recorded/);
  });

  it('answers the May 2027 report, and cites the weaker evidence it rests on', () => {
    const r = franchisePosition(2027, 2_000_000);
    expect(r).toMatchObject({ threshold: 2_650_000, atOrBelowThreshold: true });
    expect('ledger' in r && r.ledger).toContain('franchise-no-tax-due-2027');
    expect('ledger' in r && weakestStatus(r.ledger)).toBe('partial');
    // 2026 answers still rest on the confirmed fact alone.
    const r2026 = franchisePosition(2026, 2_000_000);
    expect('ledger' in r2026 && r2026.ledger).not.toContain('franchise-no-tax-due-2027');
  });

  it('reminds a combined group to test the group’s revenue', () => {
    const r = franchisePosition(2026, 100, { combinedGroup: true });
    expect('ledger' in r && r.ledger).toContain('franchise-combined-group');
    expect('steps' in r && r.steps.join(' ')).toMatch(/whole group/);
  });

  it('rejects unreadable revenue or years', () => {
    expect(franchisePosition(2026, 'plenty')).toHaveProperty('error');
    expect(franchisePosition(2026, -1)).toHaveProperty('error');
    expect(franchisePosition(99, 100)).toHaveProperty('error');
  });
});

describe('vehicle rental', () => {
  it('10% to 30 days, 6.25% to 180, a lease after', () => {
    expect(vehicleRentalTax(1)).toMatchObject({ kind: 'rental', ratePct: 10 });
    expect(vehicleRentalTax(30)).toMatchObject({ ratePct: 10 });
    expect(vehicleRentalTax(31)).toMatchObject({ ratePct: 6.25 });
    expect(vehicleRentalTax(180)).toMatchObject({ ratePct: 6.25 });
    expect(vehicleRentalTax(181)).toMatchObject({ kind: 'lease', ratePct: null });
  });

  it('wants whole days', () => {
    expect(vehicleRentalTax(0)).toHaveProperty('error');
    expect(vehicleRentalTax(1.5)).toHaveProperty('error');
  });

  it('needs five vehicles for a qualified permit', () => {
    expect(rentalPermitStatus(4)).toMatchObject({ qualified: false });
    expect(rentalPermitStatus(5)).toMatchObject({ qualified: true });
    expect('message' in rentalPermitStatus(1) && rentalPermitStatus(1)).toMatchObject({
      message: expect.stringMatching(/^1 vehicle held/),
    });
    expect(rentalPermitStatus(-1)).toHaveProperty('error');
    expect(rentalPermitStatus(2.5)).toHaveProperty('error');
  });
});
