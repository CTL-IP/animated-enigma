import { describe, expect, it } from 'vitest';
import { auditDocuments, isAuditDocument, type AuditDocument } from './audit';

const commercialUntaxed: AuditDocument = {
  id: 'inv-1',
  kind: 'invoice',
  label: 'INV-2026-0003',
  organization: 'Org A',
  hasProperty: true,
  propertyType: 'Commercial',
  state: 'TX',
  taxRatePercent: '0',
  lines: [{ description: 'Storefront remodel', taxable: true, amount: '12000.00' }],
};

const homeLumpSum: AuditDocument = {
  id: 'est-1',
  kind: 'estimate',
  label: 'PRJ-2026-0007 · v2',
  hasProperty: true,
  propertyType: 'Single-family',
  state: 'Texas',
  taxRatePercent: 0,
  lines: [
    { description: 'Tile', taxable: true, amount: 800, lineType: 'material' },
    { description: 'Set tile', taxable: false, amount: 1200, lineType: 'labor' },
  ],
};

const clean: AuditDocument = {
  id: 'inv-2',
  kind: 'invoice',
  label: 'INV-2026-0004',
  hasProperty: true,
  propertyType: 'Commercial',
  state: 'OK',
  taxRatePercent: 0,
  lines: [{ description: 'Out-of-state job', taxable: true, amount: 5000 }],
};

describe('auditDocuments', () => {
  it('flags what the screens would flag, warnings first', () => {
    const result = auditDocuments([homeLumpSum, clean, commercialUntaxed]);
    expect(result).toMatchObject({ documents: 3, flagged: 2, warnings: 1 });
    expect(result.findings.map((f) => f.id)).toEqual(['inv-1', 'est-1']);
    expect(result.findings[0]).toMatchObject({ worst: 'warn', organization: 'Org A' });
    expect(result.byCheck).toEqual({
      'nonresidential-untaxed': 1,
      'residential-lump-sum-materials': 1,
    });
  });

  it('reads estimate labor from the line type and invoice labor from the words', () => {
    const taxedLabor: AuditDocument = {
      ...homeLumpSum,
      id: 'est-2',
      taxRatePercent: 8.25,
      lines: [{ description: 'Set tile', taxable: true, amount: 1200, lineType: 'labor' }],
    };
    expect(auditDocuments([taxedLabor]).byCheck).toEqual({ 'residential-labor-taxed': 1 });
  });

  it('treats amounts it can’t read as zero rather than failing the sweep', () => {
    const odd: AuditDocument = {
      ...commercialUntaxed,
      id: 'inv-3',
      lines: [{ description: 'Mystery', taxable: true, amount: 'n/a' }],
    };
    // Nothing priced means nothing to check — the same as a brand-new estimate.
    expect(auditDocuments([odd])).toMatchObject({ documents: 1, flagged: 0, byCheck: {} });
  });

  it('reads an untyped estimate line’s labor from its words', () => {
    const crew: AuditDocument = {
      ...homeLumpSum,
      id: 'est-3',
      taxRatePercent: 8.25,
      lines: [{ description: 'Demo crew', taxable: true, amount: 900, lineType: 'other' }],
    };
    expect(auditDocuments([crew]).byCheck).toEqual({ 'residential-labor-taxed': 1 });
  });

  it('handles an empty book', () => {
    expect(auditDocuments([])).toEqual({ documents: 0, flagged: 0, warnings: 0, byCheck: {}, findings: [] });
  });
});

describe('isAuditDocument', () => {
  it('accepts a well-formed row and rejects the rest', () => {
    expect(isAuditDocument(commercialUntaxed)).toBe(true);
    expect(isAuditDocument({ ...commercialUntaxed, kind: 'receipt' })).toBe(false);
    expect(isAuditDocument({ ...commercialUntaxed, lines: [{ description: 'x' }] })).toBe(false);
    expect(isAuditDocument(null)).toBe(false);
    expect(isAuditDocument('INV-1')).toBe(false);
  });
});
