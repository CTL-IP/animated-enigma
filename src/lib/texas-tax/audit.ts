/**
 * The estimate and invoice checks, run across a whole book of jobs at once —
 * what the `texas-tax-job-audit` workflow calls, so a portfolio sweep applies
 * exactly the rules the screens do instead of an agent re-deriving them.
 *
 * Input is plain rows (from `scripts/texas-tax-audit.sql`); output is the
 * flagged documents plus counts. Pure.
 */

import { jobTaxChecks, laborFromLineType, type CheckLevel, type TaxCheck } from './job-checks';

export interface AuditLine {
  description: string;
  taxable: boolean;
  amount: number | string;
  /** Estimate lines carry a type; invoice lines don't. */
  lineType?: string | null;
}

export interface AuditDocument {
  id: string;
  kind: 'estimate' | 'invoice';
  /** What a person recognizes: invoice number, or project and estimate version. */
  label: string;
  organization?: string | null;
  hasProperty: boolean;
  propertyType: string | null;
  state: string | null;
  /** Percent — 8.25 means 8.25%. */
  taxRatePercent: number | string;
  lines: AuditLine[];
}

export interface AuditFinding {
  id: string;
  kind: 'estimate' | 'invoice';
  label: string;
  organization: string | null;
  checks: TaxCheck[];
  worst: CheckLevel;
}

export interface AuditResult {
  documents: number;
  flagged: number;
  warnings: number;
  /** How many documents raised each check, by check id. */
  byCheck: Record<string, number>;
  /** Warnings first, then by label. */
  findings: AuditFinding[];
}

function num(value: number | string): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function auditDocuments(docs: readonly AuditDocument[]): AuditResult {
  const byCheck: Record<string, number> = {};
  const findings: AuditFinding[] = [];

  for (const doc of docs) {
    const checks = jobTaxChecks({
      document: doc.kind,
      hasProperty: doc.hasProperty,
      propertyType: doc.propertyType,
      state: doc.state,
      taxRatePercent: num(doc.taxRatePercent),
      lines: doc.lines.map((l) => ({
        description: l.description,
        taxable: l.taxable,
        amount: num(l.amount),
        isLabor: doc.kind === 'estimate' ? laborFromLineType(l.lineType) : null,
      })),
    });
    if (checks.length === 0) continue;
    for (const check of checks) byCheck[check.id] = (byCheck[check.id] ?? 0) + 1;
    findings.push({
      id: doc.id,
      kind: doc.kind,
      label: doc.label,
      organization: doc.organization ?? null,
      checks,
      worst: checks.some((c) => c.level === 'warn') ? 'warn' : 'info',
    });
  }

  findings.sort((a, b) =>
    a.worst === b.worst ? a.label.localeCompare(b.label) : a.worst === 'warn' ? -1 : 1,
  );

  return {
    documents: docs.length,
    flagged: findings.length,
    warnings: findings.filter((f) => f.worst === 'warn').length,
    byCheck,
    findings,
  };
}

/** Runtime guard for rows arriving as JSON from outside the type system. */
export function isAuditDocument(value: unknown): value is AuditDocument {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    (v.kind === 'estimate' || v.kind === 'invoice') &&
    typeof v.label === 'string' &&
    typeof v.hasProperty === 'boolean' &&
    Array.isArray(v.lines) &&
    v.lines.every(
      (l) =>
        !!l &&
        typeof l === 'object' &&
        typeof (l as Record<string, unknown>).description === 'string' &&
        typeof (l as Record<string, unknown>).taxable === 'boolean',
    )
  );
}
