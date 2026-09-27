/**
 * Texas tax decisions that can be made without a network: which publication to
 * read, how a contract job is taxed, whether a rate is plausible, when a return
 * is due and what lateness costs. Pure — no database, no `next/*`, no fetch —
 * so the app, the MCP server and the tests all run exactly the same code.
 *
 * Every conclusion carries the ledger ids it rests on and the weakest status
 * among them. A treatment built partly on an unresolved fact says so, instead
 * of reading as settled because most of it is.
 */

import { addDays, dayDiff, isDay, isWeekend } from '@/lib/schedule/schedule-core';
import { parseAmount } from '@/lib/costing/costing-core';
import { formatMoney } from '@/lib/invoices/invoices-core';
import { weakestStatus, type LedgerStatus } from './ledger';
import {
  PUBLICATION_RELEVANCE,
  type BusinessProfile,
  type PublicationRelevance,
  type RelevanceLevel,
} from './profiles';
import { TX_PUBLICATIONS, TX_SUBJECTS, type TxPublication, type TxSubject } from './publications';

// ── The publication index ────────────────────────────────────────────────────

export const PUBLICATION_SORTS = ['subject', 'number', 'title'] as const;
export type PublicationSort = (typeof PUBLICATION_SORTS)[number];

export function isPublicationSort(value: string): value is PublicationSort {
  return (PUBLICATION_SORTS as readonly string[]).includes(value);
}

export interface PublicationRow {
  /** Set when sorted by subject: a publication listed under two subjects appears twice. */
  subject: TxSubject | null;
  publication: TxPublication;
  relevance: PublicationRelevance | null;
}

export interface PublicationQuery {
  text?: string;
  subject?: TxSubject;
  profile?: BusinessProfile;
  /** With `profile`: only publications at this level for it. */
  level?: RelevanceLevel;
  sort?: PublicationSort;
}

/** Case- and accent-insensitive, so "reparacion" finds "Reparación". */
function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function haystack(pub: TxPublication, relevance: PublicationRelevance | null): string {
  return fold(
    [
      pub.number ?? '',
      pub.numberLabel ?? '',
      pub.title,
      pub.spanish?.number ?? '',
      pub.spanish?.title ?? '',
      pub.subjects.join(' '),
      relevance?.why ?? '',
    ].join(' '),
  );
}

/** `94-116` → [94, 116]. Unnumbered entries sort after every number. */
function numberKey(pub: TxPublication): [number, number] {
  const match = pub.number?.match(/^(\d+)-(\d+)$/);
  if (!match) return [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  return [Number(match[1]), Number(match[2])];
}

function byTitle(a: TxPublication, b: TxPublication): number {
  return a.title.localeCompare(b.title, 'en', { sensitivity: 'base', numeric: true });
}

function byNumber(a: TxPublication, b: TxPublication): number {
  const [a1, a2] = numberKey(a);
  const [b1, b2] = numberKey(b);
  if (a1 !== b1) return a1 - b1;
  if (a2 !== b2) return a2 - b2;
  return byTitle(a, b);
}

/**
 * The index, filtered and sorted the three ways the Comptroller offers. By
 * subject it lists a publication under every subject it belongs to, as the
 * index does; by number or title each publication appears once.
 */
export function queryPublications(query: PublicationQuery = {}): PublicationRow[] {
  const sort = query.sort ?? 'subject';
  const needle = query.text?.trim() ? fold(query.text.trim()) : null;

  const matches = TX_PUBLICATIONS.filter((pub) => {
    const relevance = PUBLICATION_RELEVANCE[pub.key] ?? null;
    if (query.subject && !pub.subjects.includes(query.subject)) return false;
    if (query.profile) {
      const hit = relevance?.profiles.find((p) => p.profile === query.profile);
      if (!hit) return false;
      if (query.level && hit.level !== query.level) return false;
    }
    if (needle && !haystack(pub, relevance).includes(needle)) return false;
    return true;
  });

  if (sort === 'subject') {
    const rows: PublicationRow[] = [];
    for (const subject of TX_SUBJECTS) {
      if (query.subject && subject !== query.subject) continue;
      const inSubject = matches.filter((pub) => pub.subjects.includes(subject)).sort(byTitle);
      for (const publication of inSubject) {
        rows.push({ subject, publication, relevance: PUBLICATION_RELEVANCE[publication.key] ?? null });
      }
    }
    return rows;
  }

  const ordered = [...matches].sort(sort === 'number' ? byNumber : byTitle);
  return ordered.map((publication) => ({
    subject: null,
    publication,
    relevance: PUBLICATION_RELEVANCE[publication.key] ?? null,
  }));
}

/** Look up by number (`94-116`), Spanish number (`94-116s`) or key. */
export function findPublication(numberOrKey: string): TxPublication | null {
  const wanted = numberOrKey.trim().toLowerCase();
  if (!wanted) return null;
  return (
    TX_PUBLICATIONS.find(
      (pub) =>
        pub.key.toLowerCase() === wanted ||
        pub.number?.toLowerCase() === wanted ||
        pub.spanish?.number.toLowerCase() === wanted,
    ) ?? null
  );
}

// ── Contract jobs ────────────────────────────────────────────────────────────

export const PROPERTY_USES = ['residential', 'nonresidential', 'multiple-use', 'unknown'] as const;
export type PropertyUse = (typeof PROPERTY_USES)[number];

export const WORK_KINDS = [
  'repair-remodel',
  'new-construction',
  'scheduled-maintenance',
  'real-property-service',
  'disaster-repair',
] as const;
export type WorkKind = (typeof WORK_KINDS)[number];

export const CONTRACT_FORMS = ['lump-sum', 'separated'] as const;
export type ContractForm = (typeof CONTRACT_FORMS)[number];

export const CUSTOMER_KINDS = ['taxable', 'government', 'exempt-organization'] as const;
export type CustomerKind = (typeof CUSTOMER_KINDS)[number];

export const WORK_KIND_LABELS: Record<WorkKind, string> = {
  'repair-remodel': 'Repair or remodeling',
  'new-construction': 'New construction',
  'scheduled-maintenance': 'Scheduled, periodic maintenance',
  'real-property-service': 'Real property service (haul-off, landscaping, cleanup…)',
  'disaster-repair': 'Repair in a declared disaster area',
};

export interface ContractFacts {
  propertyUse: PropertyUse;
  workKind: WorkKind;
  contractForm: ContractForm;
  customer: CustomerKind;
}

/** What the customer is charged tax on. */
export type CustomerTaxBase = 'none' | 'materials' | 'total' | 'undetermined';
/** How the contractor buys the materials that go into the job. */
export type MaterialsRoute = 'pay-tax-at-purchase' | 'resale-certificate' | 'exemption-certificate' | 'undetermined';

export interface ContractTreatment {
  customerTaxBase: CustomerTaxBase;
  laborTaxable: boolean | null;
  materials: MaterialsRoute;
  headline: string;
  steps: string[];
  ledger: string[];
  publications: string[];
  status: LedgerStatus;
}

/**
 * A treatment is never firmer than its evidence, and never firmer than its
 * own gaps: an undetermined piece caps it at partial, an undetermined tax
 * base (the part the customer sees) at unresolved.
 */
function finish(t: Omit<ContractTreatment, 'status'>): ContractTreatment {
  let status = weakestStatus(t.ledger);
  if (t.customerTaxBase === 'undetermined') status = 'unresolved';
  else if (t.materials === 'undetermined' && status === 'confirmed') status = 'partial';
  return { ...t, status };
}

function byContractForm(
  form: ContractForm,
  label: string,
  basis: string[],
  publications: string[],
): ContractTreatment {
  if (form === 'lump-sum') {
    return finish({
      customerTaxBase: 'none',
      laborTaxable: false,
      materials: 'pay-tax-at-purchase',
      headline: `Lump-sum ${label}: charge the customer no tax. You are the consumer of the materials — the tax is paid when you buy them.`,
      steps: [
        'Pay sales tax to the supplier on the materials, supplies and equipment for this job.',
        'Anything for it bought tax-free — on a resale certificate, or online with no Texas tax — goes on your sales tax return as taxable purchases.',
        'Put no sales tax line on the estimate or invoice.',
      ],
      ledger: [...basis, 'lump-sum-contractor-is-consumer', 'taxable-purchases-use-tax'],
      publications,
    });
  }
  return finish({
    customerTaxBase: 'materials',
    laborTaxable: false,
    materials: 'resale-certificate',
    headline: `Separated ${label}: tax the materials charge, not the labor.`,
    steps: [
      'State labor and materials as separate charges in the contract and on the invoice.',
      'Buy the incorporated materials on a resale certificate.',
      'Collect state and local tax on the materials charge, which must be at least what you paid for them.',
    ],
    ledger: [...basis, 'separated-contract-contractor-is-retailer'],
    publications,
  });
}

function exemptCustomer(facts: ContractFacts): ContractTreatment {
  const government = facts.customer === 'government';
  const who = government ? 'Government customer' : 'Exempt organization';
  const first = government
    ? 'Charge no sales tax — federal, State of Texas and Texas local government jobs are exempt. Keep the contract or purchase order that shows it.'
    : 'Get the organization’s exemption certificate before starting; the work must relate to its exempt purpose. Then charge no sales tax.';
  const basis = government ? ['government-customers'] : ['exempt-organization-customers'];
  const consumables = government
    ? []
    : ['Items used up on the job, and taxable services integral to it, can be bought on an exemption certificate.'];

  if (facts.contractForm === 'separated') {
    return finish({
      customerTaxBase: 'none',
      laborTaxable: false,
      materials: 'resale-certificate',
      headline: `${who}: no tax on the job. On a separated contract the incorporated materials are bought on a resale certificate.`,
      steps: [first, 'Buy the incorporated materials on a resale certificate.', ...consumables],
      ledger: [...basis, 'separated-contract-contractor-is-retailer'],
      publications: ['94-116', '96-1045'],
    });
  }
  // Lump-sum is where a contractor is normally the consumer of the materials.
  // An exempt contract is the exception (Tax Code §151.311): pricing in tax
  // that nobody owes would lose the bid.
  return finish({
    customerTaxBase: 'none',
    laborTaxable: false,
    materials: 'exemption-certificate',
    headline: `${who}: no tax on the job. On an exempt contract you buy the incorporated materials on an exemption certificate — lump-sum or not — so don’t price tax into them.`,
    steps: [
      first,
      ...(government
        ? ['Ask the agency for an exemption certificate documenting the exempt contract; the improvement must be for its own use.']
        : []),
      'Give your suppliers an exemption certificate for materials incorporated into the job, items used up at the site, and taxable services performed there.',
      'Tools and equipment you keep aren’t covered — tax is paid on them as usual.',
    ],
    ledger: [...basis, 'exempt-lump-sum-materials'],
    publications: ['94-116', '96-1045'],
  });
}

function nonresidentialRemodel(): ContractTreatment {
  return finish({
    customerTaxBase: 'total',
    laborTaxable: true,
    materials: 'resale-certificate',
    headline:
      'Nonresidential repair or remodeling: tax the whole charge — labor and materials — at the job site’s rate.',
    steps: [
      'Charge tax on the entire price, itemized or not.',
      'Use the combined rate for the job site’s address, not your office’s.',
      'Buy the incorporated materials on a resale certificate.',
      'Adding new square footage in the same price? If the remodeling is more than 5% of it, state a reasonable charge for the remodeling separately, or the whole price is presumed taxable.',
    ],
    ledger: [
      'nonresidential-total-charge-taxable',
      'local-tax-job-site',
      'nonresidential-resale-certificate',
      'nonresidential-mixed-new-footage',
    ],
    publications: ['94-116', '94-105'],
  });
}

function nonresidentialMaintenance(): ContractTreatment {
  return finish({
    customerTaxBase: 'none',
    laborTaxable: false,
    materials: 'undetermined',
    headline:
      'Scheduled, periodic maintenance of nonresidential property isn’t taxed as remodeling — provided the schedule can be proven.',
    steps: [
      'Keep the maintenance schedule or work orders showing the work was planned and recurring.',
      'Janitorial, landscaping and other listed services stay taxable whatever the schedule.',
      'How materials for maintenance work are bought wasn’t settled here — check Pub 94-116 before using a resale certificate.',
    ],
    ledger: ['scheduled-maintenance'],
    publications: ['94-116'],
  });
}

function disasterRepair(use: 'residential' | 'nonresidential', form: ContractForm): ContractTreatment {
  if (use === 'residential') {
    const base = byContractForm(form, 'disaster-area home repair', ['disaster-repair', 'residential-labor-not-taxable'], [
      '94-182',
      '94-116',
    ]);
    return base;
  }
  if (form === 'separated') {
    return finish({
      customerTaxBase: 'materials',
      laborTaxable: false,
      materials: 'resale-certificate',
      headline:
        'Disaster-area repair of nonresidential property on a separated contract: the labor is exempt, the materials are taxed.',
      steps: [
        'Price labor and materials separately in the contract and on the invoice.',
        'Take the customer’s exemption certificate for the labor, naming both of you, the items repaired and the disaster (for example “Repair due to Hurricane Harvey in Galveston County”).',
        'Collect tax on the materials charge.',
      ],
      ledger: ['disaster-repair', 'separated-contract-contractor-is-retailer'],
      publications: ['94-182'],
    });
  }
  return finish({
    customerTaxBase: 'total',
    laborTaxable: true,
    materials: 'resale-certificate',
    headline:
      'Disaster-area repair of nonresidential property on a lump-sum price: the whole charge is taxable. A separated contract would make the labor exempt.',
    steps: [
      'Collect tax on the full lump-sum charge.',
      'To exempt the labor instead, re-paper it as a separated contract with the customer’s exemption certificate.',
    ],
    ledger: ['disaster-repair', 'nonresidential-resale-certificate'],
    publications: ['94-182'],
  });
}

function realPropertyService(): ContractTreatment {
  return finish({
    customerTaxBase: 'total',
    laborTaxable: true,
    materials: 'undetermined',
    headline:
      'Real property services such as debris haul-off are taxable, on homes as well as businesses.',
    steps: [
      'Charge tax on the service.',
      'Check Pub 94-157 for the full list of real property services and how supplies are treated.',
    ],
    ledger: ['debris-haul-off-taxable'],
    publications: ['94-157', '96-259'],
  });
}

function undetermined(headline: string, steps: string[], ledger: string[]): ContractTreatment {
  return finish({
    customerTaxBase: 'undetermined',
    laborTaxable: null,
    materials: 'undetermined',
    headline,
    steps,
    ledger,
    publications: ['94-116'],
  });
}

/**
 * How a Texas contract job is taxed. The order of the checks is the order of
 * the questions: who the customer is beats everything, then what kind of work,
 * then what kind of property, then how the contract is written.
 */
export function classifyContract(facts: ContractFacts): ContractTreatment {
  if (facts.customer !== 'taxable') return exemptCustomer(facts);
  if (facts.workKind === 'real-property-service') return realPropertyService();
  if (facts.workKind === 'new-construction') {
    return byContractForm(facts.contractForm, 'new construction', ['new-construction-not-taxable'], [
      '94-116',
      '94-157',
    ]);
  }
  if (facts.propertyUse === 'unknown') {
    return undetermined(
      'Residential or nonresidential? That decides the tax, so settle it before pricing.',
      ['Record the property type on the client’s property.'],
      [],
    );
  }
  if (facts.propertyUse === 'multiple-use') {
    return undetermined(
      'Property used both as a home and commercially: the Comptroller asks contractors to call for its multiple-use guidelines before pricing.',
      ['Call the Comptroller for the multiple-use guidelines, and keep a note of what you were told.'],
      ['multiple-use-property'],
    );
  }
  if (facts.workKind === 'disaster-repair') return disasterRepair(facts.propertyUse, facts.contractForm);
  if (facts.propertyUse === 'residential') {
    return byContractForm(facts.contractForm, 'home repair or remodeling', ['residential-labor-not-taxable'], [
      '94-116',
    ]);
  }
  if (facts.workKind === 'scheduled-maintenance') return nonresidentialMaintenance();
  return nonresidentialRemodel();
}

// ── Rates ────────────────────────────────────────────────────────────────────

export const TX_STATE_RATE_PCT = 6.25;
export const TX_MAX_LOCAL_RATE_PCT = 2;
export const TX_MAX_COMBINED_RATE_PCT = 8.25;

export interface RateCheck {
  ok: boolean;
  message: string;
  ledger: string[];
}

function round4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10_000) / 10_000;
}

/**
 * Is this a plausible Texas combined rate, entered as a percent? Zero is
 * allowed — plenty of jobs carry no tax — so this checks plausibility, not
 * whether tax belongs on the job (that's `classifyContract`).
 */
export function checkCombinedRate(ratePercent: number | string | null | undefined): RateCheck {
  const ledger = ['rate-range'];
  // "8.25%" is how people type a rate; accept it rather than scold.
  const parsed = parseAmount(
    typeof ratePercent === 'string' ? ratePercent.trim().replace(/%$/, '') : ratePercent,
  );
  if (parsed === null) {
    return { ok: false, message: 'Enter the rate as a percent — 8.25 for 8.25%.', ledger };
  }
  const rate = round4(parsed);
  if (rate < 0) return { ok: false, message: 'A tax rate can’t be negative.', ledger };
  if (rate === 0) return { ok: true, message: 'No tax charged.', ledger };

  const asPercent = round4(rate * 100);
  if (rate < 1 && asPercent >= TX_STATE_RATE_PCT && asPercent <= TX_MAX_COMBINED_RATE_PCT) {
    return {
      ok: false,
      message: `That looks like a fraction. Enter ${asPercent} for ${asPercent}%.`,
      ledger,
    };
  }
  if (rate < TX_STATE_RATE_PCT) {
    return {
      ok: false,
      message:
        'Below the 6.25% state rate. Every taxable sale in Texas owes at least that — check the job site’s rate.',
      ledger,
    };
  }
  if (rate > TX_MAX_COMBINED_RATE_PCT) {
    return {
      ok: false,
      message:
        'Above the 8.25% Texas maximum — 6.25% state plus at most 2% local. Check the job site’s rate.',
      ledger,
    };
  }
  return {
    ok: true,
    message:
      'Within the Texas range. Confirm the exact rate for the job site’s address with the Comptroller’s rate locator.',
    ledger,
  };
}

// ── Due dates ────────────────────────────────────────────────────────────────

export const FILING_FREQUENCIES = ['monthly', 'quarterly', 'yearly'] as const;
export type FilingFrequency = (typeof FILING_FREQUENCIES)[number];

export function isFilingFrequency(value: string): value is FilingFrequency {
  return (FILING_FREQUENCIES as readonly string[]).includes(value);
}

export interface FilingPeriod {
  frequency: FilingFrequency;
  year: number;
  /** Month 1–12 for monthly, quarter 1–4 for quarterly; ignored for yearly. */
  index?: number;
}

export interface DueDate {
  period: string;
  /** Null where the ledger doesn't establish the period (the franchise report). */
  periodStart: string | null;
  periodEnd: string | null;
  /** The date the rule names, before any weekend move. */
  nominal: string;
  /** The date to file by. */
  due: string;
  movedForWeekend: boolean;
  /**
   * The due date lands on a federal or Texas state holiday. Not moved: filing
   * by `due` is never late, and whether that holiday moves Comptroller
   * deadlines wasn't verified. Say so; don't guess later.
   */
  possibleHoliday: string | null;
  ledger: string[];
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function ymd(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Day of week, 0 = Sunday, for a valid `YYYY-MM-DD`. */
function weekday(day: string): number {
  return new Date(`${day}T12:00:00Z`).getUTCDay();
}

/** The n-th given weekday of a month (n = -1 for the last). */
function nthWeekday(year: number, month: number, dow: number, n: number): string {
  if (n > 0) {
    const firstDow = weekday(ymd(year, month, 1));
    const day = 1 + ((dow - firstDow + 7) % 7) + (n - 1) * 7;
    return ymd(year, month, day);
  }
  const last = lastDayOfMonth(year, month);
  const lastDow = weekday(ymd(year, month, last));
  return ymd(year, month, last - ((lastDow - dow + 7) % 7));
}

/**
 * Federal and Texas state holidays on a given day, by name. Drawn from the
 * federal and Texas holiday calendars — not checked against the Comptroller's
 * own due-date calendar, which is why callers only flag a match.
 */
export function possibleLegalHoliday(day: string): string | null {
  if (!isDay(day)) return null;
  const year = Number(day.slice(0, 4));
  const md = day.slice(5);
  const fixed: Record<string, string> = {
    '01-01': 'New Year’s Day',
    '01-19': 'Confederate Heroes Day (Texas)',
    '03-02': 'Texas Independence Day',
    '04-21': 'San Jacinto Day (Texas)',
    '06-19': 'Emancipation Day / Juneteenth',
    '07-04': 'Independence Day',
    '08-27': 'Lyndon Baines Johnson Day (Texas)',
    '11-11': 'Veterans Day',
    '12-24': 'Christmas Eve (Texas)',
    '12-25': 'Christmas Day',
    '12-26': 'Day after Christmas (Texas)',
  };
  if (fixed[md]) return fixed[md]!;
  const thanksgiving = nthWeekday(year, 11, 4, 4);
  const floating: Record<string, string> = {
    [nthWeekday(year, 1, 1, 3)]: 'Martin Luther King Jr. Day',
    [nthWeekday(year, 2, 1, 3)]: 'Presidents’ Day',
    [nthWeekday(year, 5, 1, -1)]: 'Memorial Day',
    [nthWeekday(year, 9, 1, 1)]: 'Labor Day',
    [nthWeekday(year, 10, 1, 2)]: 'Columbus Day (federal)',
    [thanksgiving]: 'Thanksgiving Day',
    [addDays(thanksgiving, 1) ?? '']: 'Day after Thanksgiving (Texas)',
  };
  return floating[day] ?? null;
}

/** Saturday or Sunday moves to Monday. */
function rollPastWeekend(day: string): string {
  let d = day;
  while (isWeekend(d)) d = addDays(d, 1)!;
  return d;
}

function buildDueDate(
  period: string,
  periodStart: string | null,
  periodEnd: string | null,
  nominal: string,
  ledger: string[],
): DueDate {
  const due = rollPastWeekend(nominal);
  return {
    period,
    periodStart,
    periodEnd,
    nominal,
    due,
    movedForWeekend: due !== nominal,
    possibleHoliday: possibleLegalHoliday(due),
    ledger,
  };
}

/** When a sales and use tax return for a period is due. */
export function salesTaxDue(period: FilingPeriod): DueDate | { error: string } {
  const { frequency, year } = period;
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return { error: 'Give a four-digit year.' };
  }
  const ledger = ['sales-tax-due-dates'];

  if (frequency === 'monthly') {
    const month = period.index;
    if (!month || !Number.isInteger(month) || month < 1 || month > 12) {
      return { error: 'Give the month as 1–12.' };
    }
    const dueYear = month === 12 ? year + 1 : year;
    const dueMonth = month === 12 ? 1 : month + 1;
    return buildDueDate(
      `${MONTHS[month - 1]} ${year}`,
      ymd(year, month, 1),
      ymd(year, month, lastDayOfMonth(year, month)),
      ymd(dueYear, dueMonth, 20),
      ledger,
    );
  }

  if (frequency === 'quarterly') {
    const quarter = period.index;
    if (!quarter || !Number.isInteger(quarter) || quarter < 1 || quarter > 4) {
      return { error: 'Give the quarter as 1–4.' };
    }
    const startMonth = (quarter - 1) * 3 + 1;
    const endMonth = startMonth + 2;
    const dueYear = quarter === 4 ? year + 1 : year;
    const dueMonth = quarter === 4 ? 1 : endMonth + 1;
    return buildDueDate(
      `Q${quarter} ${year} (${MONTHS[startMonth - 1]!.slice(0, 3)}–${MONTHS[endMonth - 1]!.slice(0, 3)})`,
      ymd(year, startMonth, 1),
      ymd(year, endMonth, lastDayOfMonth(year, endMonth)),
      ymd(dueYear, dueMonth, 20),
      ledger,
    );
  }

  return buildDueDate(`${year}`, ymd(year, 1, 1), ymd(year, 12, 31), ymd(year + 1, 1, 20), ledger);
}

/** The first return of this frequency still due on or after `today`. */
export function nextSalesTaxDue(frequency: FilingFrequency, today: string): DueDate | { error: string } {
  if (!isDay(today)) return { error: 'Give today as YYYY-MM-DD.' };
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));

  // Walk forward from the earliest period whose return could still be open.
  const candidates: FilingPeriod[] = [];
  if (frequency === 'monthly') {
    for (let i = -2; i <= 1; i++) {
      const m = month + i;
      const y = m < 1 ? year - 1 : m > 12 ? year + 1 : year;
      candidates.push({ frequency, year: y, index: ((m - 1 + 12) % 12) + 1 });
    }
  } else if (frequency === 'quarterly') {
    for (let y = year - 1; y <= year; y++) {
      for (let q = 1; q <= 4; q++) candidates.push({ frequency, year: y, index: q });
    }
  } else {
    candidates.push({ frequency, year: year - 1 }, { frequency, year });
  }

  for (const period of candidates) {
    const result = salesTaxDue(period);
    if ('error' in result) continue;
    if ((dayDiff(today, result.due) ?? -1) >= 0) return result;
  }
  return { error: 'No upcoming due date found.' };
}

/** Annual franchise tax report: May 15 of the report year. */
export function franchiseReportDue(reportYear: number): DueDate | { error: string } {
  if (!Number.isInteger(reportYear) || reportYear < 2000 || reportYear > 2100) {
    return { error: 'Give a four-digit report year.' };
  }
  // No accounting period is attached: which months a report year covers
  // depends on the entity's fiscal year, and the ledger doesn't hold that rule.
  return buildDueDate(`${reportYear} report`, null, null, ymd(reportYear, 5, 15), [
    'franchise-due-may-15',
  ]);
}

// ── Lateness ─────────────────────────────────────────────────────────────────

export const LATE_FILING_PENALTY = 50;

export interface LatePaymentInput {
  taxDue: number | string;
  dueDate: string;
  paidDate: string;
  /** The return itself went in late. Defaults to "paid late". */
  filedLate?: boolean;
  /** Date referenced on a Notice of Tax Due, if one was issued. */
  noticeDate?: string | null;
}

export interface LatePaymentResult {
  daysLate: number;
  penaltyPct: number;
  penalty: number;
  /** "May be assessed" — the Comptroller's words — on a late return. */
  lateFilingPenalty: number;
  /** The timely-filing discount (0.5% of the tax) a late filer gives up. */
  discountForfeited: number;
  interestStartsOn: string;
  interestApplies: boolean;
  /** Penalty and filing penalty; interest excluded — its rate resets every January 1. */
  totalBeforeInterest: number;
  summary: string;
  ledger: string[];
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function latePayment(input: LatePaymentInput): LatePaymentResult | { error: string } {
  const tax = parseAmount(input.taxDue);
  if (tax === null || tax < 0) return { error: 'Enter the tax due as an amount, e.g. 1234.56.' };
  if (!isDay(input.dueDate)) return { error: 'Give the due date as YYYY-MM-DD.' };
  if (!isDay(input.paidDate)) return { error: 'Give the payment date as YYYY-MM-DD.' };
  if (input.noticeDate && !isDay(input.noticeDate)) {
    return { error: 'Give the notice date as YYYY-MM-DD, or leave it out.' };
  }
  if (input.noticeDate && (dayDiff(input.dueDate, input.noticeDate) ?? 0) < 0) {
    return { error: 'A Notice of Tax Due comes after the due date. Check the dates.' };
  }

  const ledger = ['late-penalties', 'timely-filing-discounts'];
  const daysLate = Math.max(0, dayDiff(input.dueDate, input.paidDate) ?? 0);
  const interestStartsOn = addDays(input.dueDate, 61)!;

  if (daysLate === 0) {
    return {
      daysLate,
      penaltyPct: 0,
      penalty: 0,
      lateFilingPenalty: 0,
      discountForfeited: 0,
      interestStartsOn,
      interestApplies: false,
      totalBeforeInterest: 0,
      summary: `On time. The 0.5% timely-filing discount (${formatMoney(round2(tax * 0.005))}) applies.`,
      ledger,
    };
  }

  // The Comptroller states the notice tier as a total — "an additional 10%
  // (for a total of 20%)" — not as 10 points on top of whichever tier the
  // payment was in. Adding it to the 1–30 day 5% would print a 15% that no
  // Comptroller schedule contains.
  const afterNotice =
    !!input.noticeDate && (dayDiff(input.noticeDate, input.paidDate) ?? 0) > 0;
  const penaltyPct = afterNotice ? 20 : daysLate <= 30 ? 5 : 10;

  const penalty = round2((tax * penaltyPct) / 100);
  const filedLate = input.filedLate ?? true;
  const lateFilingPenalty = filedLate ? LATE_FILING_PENALTY : 0;
  const interestApplies = (dayDiff(interestStartsOn, input.paidDate) ?? -1) >= 0;
  const totalBeforeInterest = round2(penalty + lateFilingPenalty);

  const when = `${daysLate} ${daysLate === 1 ? 'day' : 'days'} late${afterNotice ? ', after the Notice of Tax Due date' : ''}`;
  const parts = [`${when}: ${penaltyPct}% penalty (${formatMoney(penalty)})`];
  if (filedLate) parts.push(`a ${formatMoney(LATE_FILING_PENALTY)} late-filing penalty may be added`);
  parts.push(
    interestApplies
      ? `interest runs from ${interestStartsOn} at the rate set for the year`
      : `interest would start on ${interestStartsOn}`,
  );

  return {
    daysLate,
    penaltyPct,
    penalty,
    lateFilingPenalty,
    discountForfeited: round2(tax * 0.005),
    interestStartsOn,
    interestApplies,
    totalBeforeInterest,
    summary: `${parts.join('; ')}.`,
    ledger,
  };
}

// ── Franchise tax ────────────────────────────────────────────────────────────

/** No-tax-due threshold by report year — only years the ledger records. */
export const NO_TAX_DUE_THRESHOLDS: Readonly<Record<number, number>> = {
  2024: 2_470_000,
  2025: 2_470_000,
  2026: 2_650_000,
  2027: 2_650_000,
};

/**
 * A year whose threshold rests on more than the confirmed fact. 2027 is
 * derived from the statute's schedule rather than read, so an answer that uses
 * it says "partly confirmed" instead of borrowing 2026's certainty.
 */
const THRESHOLD_EVIDENCE: Readonly<Record<number, string>> = {
  2027: 'franchise-no-tax-due-2027',
};

export interface FranchisePosition {
  reportYear: number;
  threshold: number | null;
  revenue: number;
  /** Null when no threshold is recorded for the year — unknown, not "no". */
  atOrBelowThreshold: boolean | null;
  due: DueDate;
  message: string;
  steps: string[];
  ledger: string[];
}

export function franchisePosition(
  reportYear: number,
  annualizedRevenue: number | string,
  options: { combinedGroup?: boolean } = {},
): FranchisePosition | { error: string } {
  const due = franchiseReportDue(reportYear);
  if ('error' in due) return due;
  const revenue = parseAmount(annualizedRevenue);
  if (revenue === null || revenue < 0) {
    return { error: 'Enter annualized total revenue as an amount.' };
  }

  const yearEvidence = THRESHOLD_EVIDENCE[reportYear];
  const ledger = [
    'franchise-no-tax-due-threshold',
    ...(yearEvidence ? [yearEvidence] : []),
    'franchise-information-report',
    'franchise-due-may-15',
    ...(options.combinedGroup ? ['franchise-combined-group'] : []),
  ];
  const groupStep = options.combinedGroup
    ? ['For a combined group, test the threshold against the whole group’s revenue, not each company’s.']
    : [];
  const threshold = NO_TAX_DUE_THRESHOLDS[reportYear] ?? null;

  if (threshold === null) {
    return {
      reportYear,
      threshold,
      revenue,
      atOrBelowThreshold: null,
      due,
      message: `No threshold is recorded here for ${reportYear} reports — check the Comptroller’s franchise tax page before deciding what to file.`,
      steps: groupStep,
      ledger,
    };
  }

  if (revenue <= threshold) {
    return {
      reportYear,
      threshold,
      revenue,
      atOrBelowThreshold: true,
      due,
      message: `At or below the ${formatMoney(threshold)} no-tax-due threshold: no franchise tax and no No Tax Due Report.`,
      steps: [
        `File the Public Information Report (Form 05-102) or Ownership Information Report (Form 05-167) by ${due.due}.`,
        ...groupStep,
      ],
      ledger,
    };
  }

  return {
    reportYear,
    threshold,
    revenue,
    atOrBelowThreshold: false,
    due,
    message: `Above the ${formatMoney(threshold)} no-tax-due threshold: a franchise tax report computing the tax is due ${due.due}.`,
    steps: ['Work the report with your preparer.', ...groupStep],
    ledger,
  };
}

// ── Motor vehicle rental ─────────────────────────────────────────────────────

export interface VehicleRentalTax {
  kind: 'rental' | 'lease';
  ratePct: number | null;
  message: string;
  ledger: string[];
}

export function vehicleRentalTax(contractDays: number): VehicleRentalTax | { error: string } {
  if (!Number.isInteger(contractDays) || contractDays < 1) {
    return { error: 'Give the contract length in whole days.' };
  }
  if (contractDays <= 30) {
    return {
      kind: 'rental',
      ratePct: 10,
      message: 'A rental of 1–30 days: collect 10% gross rental receipts tax.',
      ledger: ['vehicle-rental-tax-rates'],
    };
  }
  if (contractDays <= 180) {
    return {
      kind: 'rental',
      ratePct: 6.25,
      message: 'A rental of 31–180 days: collect 6.25% gross rental receipts tax.',
      ledger: ['vehicle-rental-tax-rates'],
    };
  }
  return {
    kind: 'lease',
    ratePct: null,
    message:
      'Over 180 days is an operating lease: no tax on the payments. Motor vehicle tax is due on the lessor’s purchase price when it titles the vehicle.',
    ledger: ['rental-versus-lease'],
  };
}

export interface RentalPermitStatus {
  qualified: boolean;
  message: string;
  ledger: string[];
}

export function rentalPermitStatus(
  vehiclesTitledForRentalIn12Months: number,
): RentalPermitStatus | { error: string } {
  const n = vehiclesTitledForRentalIn12Months;
  if (!Number.isInteger(n) || n < 0) return { error: 'Give the number of vehicles as a whole number.' };
  if (n >= 5) {
    return {
      qualified: true,
      message: `${n} vehicles held for rental: the permit can be qualified, deferring the minimum rental tax at titling.`,
      ledger: ['rental-permit-qualified'],
    };
  }
  return {
    qualified: false,
    message: `${n} ${n === 1 ? 'vehicle' : 'vehicles'} held for rental: a qualified permit needs five. With a non-qualified permit, motor vehicle sales tax is paid when each rental vehicle is titled.`,
    ledger: ['rental-permit-qualified'],
  };
}
