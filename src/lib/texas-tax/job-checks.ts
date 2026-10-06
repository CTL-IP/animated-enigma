/**
 * Texas tax checks for an estimate or an invoice, from what the app already
 * knows: the property type, the job site's state, the rate, and which lines
 * are marked taxable. Pure; the screens pass plain values in.
 *
 * These are checks, not a tax engine. They catch the two mistakes that cost a
 * contractor real money — no tax on a commercial remodel (an auditor collects
 * it from you, not the client) and tax on home-repair labor (the client paid
 * tax nobody owed) — and they say which rule and publication each one rests on.
 *
 * Silent outside Texas. The app serves more than one contractor, and a Texas
 * rule shown on an Oklahoma job is worse than no rule at all. A job with no
 * state recorded gets one line asking for it, because that's the only way the
 * checks can ever run.
 */

import { checkCombinedRate } from './texas-tax-core';

export type CheckLevel = 'warn' | 'info';

export interface TaxCheck {
  /** Stable, for keys and tests. */
  id: string;
  level: CheckLevel;
  title: string;
  body: string;
  publications: string[];
  ledger: string[];
}

/** How the app's property types sort under the Texas rules. */
export type TaxPropertyClass = 'residential' | 'nonresidential' | 'manufactured' | 'other' | 'unset';

/**
 * Keyed to `PROPERTY_TYPES` in clients-core. A mobile home is kept apart:
 * whether its repair counts as residential real property work wasn't settled,
 * so it gets its own message rather than a confident residential answer.
 */
export function taxPropertyClass(propertyType: string | null | undefined): TaxPropertyClass {
  switch ((propertyType ?? '').trim()) {
    case 'Single-family':
    case 'Townhouse':
    case 'Condo':
    case 'Duplex / Multi-family':
      return 'residential';
    case 'Commercial':
      return 'nonresidential';
    case 'Mobile home':
      return 'manufactured';
    case '':
      return 'unset';
    default:
      return 'other';
  }
}

/** The state from a stored address (`{ line1, city, state, zip }`), or null. */
export function stateFromAddress(address: unknown): string | null {
  if (!address || typeof address !== 'object') return null;
  const state = (address as { state?: unknown }).state;
  if (typeof state !== 'string') return null;
  return state.trim() || null;
}

/** "TX", "tx", "Tex.", "Texas". Null for a blank state. */
export function isTexas(state: string | null | undefined): boolean | null {
  const s = (state ?? '').trim().replace(/\./g, '').toLowerCase();
  if (!s) return null;
  return s === 'tx' || s === 'tex' || s === 'texas';
}

const DEBRIS = /\b(debris|dumpsters?|haul[- ]?(off|away)|junk removal|trash (removal|out)|dump (fees?|runs?))\b/i;
const LABOR =
  /\b(labor|labour|install(ation|ing|ed)?|demo(lition)?|framing|carpentry|man[- ]?hours?|crew|hours?|hourly|painting|painters?|handyman|electrician|plumber|roofers?|rough[- ]?in|trim[- ]?out|tear[- ]?out|tape (and|&) (float|bed|mud))\b/i;
/**
 * A line that opens with a work verb and its object — "Hang doors", "Set
 * toilet", "Paint interior walls" — describes work, not a product. Paint is
 * the trap: as a noun it's the product, so it counts only when a surface
 * follows, and "Paint, 5 gal" stays a material.
 */
const WORK_VERB =
  /^\s*(?:(?:hang|lay|patch|repair|replace|remove|build|frame|pour|prep|refinish|resurface|prime|rewire|replumb|remodel|renovate)\s+[a-z]|set\s+(?!of\b)[a-z]|paint\s+(?:the\s+)?(?:interior|exterior|walls?|ceilings?|trim|doors?|cabinets?|rooms?|house|siding|fence|deck))/i;

/**
 * Invoice lines carry no type; a description that reads like labor is treated
 * as labor. Debris haul-off never is — it's a taxable service even on a home
 * job, so taxing it is right, not a labor mistake.
 */
export function looksLikeLabor(description: string): boolean {
  if (looksLikeDebrisHaulOff(description)) return false;
  return LABOR.test(description) || WORK_VERB.test(description);
}

/**
 * An estimate line's type says labor or materials outright; subcontractor,
 * equipment and "other" lines could be either, so those fall back to reading
 * the description (null).
 */
export function laborFromLineType(lineType: string | null | undefined): boolean | null {
  if (lineType === 'labor') return true;
  if (lineType === 'material') return false;
  return null;
}

export function looksLikeDebrisHaulOff(description: string): boolean {
  return DEBRIS.test(description);
}

export interface CheckLine {
  description: string;
  taxable: boolean;
  /** Cost (estimate) or billed amount (invoice); zero-value lines are ignored. */
  amount: number;
  /** True for a labor line; null when the line type isn't known. */
  isLabor: boolean | null;
}

export interface JobCheckInput {
  document: 'estimate' | 'invoice';
  hasProperty: boolean;
  propertyType: string | null;
  state: string | null;
  /** Percent — 8.25 means 8.25%. */
  taxRatePercent: number;
  lines: CheckLine[];
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function jobTaxChecks(input: JobCheckInput): TaxCheck[] {
  const checks: TaxCheck[] = [];

  if (!input.hasProperty) {
    return [
      {
        id: 'no-property',
        level: 'info',
        title: 'No property on this job',
        body: 'Attach the job’s property, with its address, and this can check the tax against the Texas rules for homes and commercial buildings.',
        publications: [],
        ledger: [],
      },
    ];
  }

  const texas = isTexas(input.state);
  if (texas === false) return [];
  if (texas === null) {
    return [
      {
        id: 'no-state',
        level: 'info',
        title: 'No state on the property’s address',
        body: 'Add the state to the job site’s address to check this against Texas tax rules.',
        publications: [],
        ledger: [],
      },
    ];
  }

  const priced = input.lines.filter((l) => l.amount > 0);
  // Estimates store 0.0825 and the page multiplies by 100; without rounding a
  // title would read "8.250000000000002%".
  const rate = Math.round(input.taxRatePercent * 10_000) / 10_000;
  const taxCharged = rate > 0 && priced.some((l) => l.taxable);

  if (rate > 0) {
    const rateCheck = checkCombinedRate(rate);
    if (!rateCheck.ok) {
      checks.push({
        id: 'rate',
        level: 'warn',
        title: `${rate}% isn’t a Texas rate`,
        body: rateCheck.message,
        publications: ['sales-tax-rates'],
        ledger: rateCheck.ledger,
      });
    }
  }

  const propertyClass = taxPropertyClass(input.propertyType);
  // Nothing priced yet: a brand-new estimate would otherwise be told a
  // commercial job carries no tax. Only the setup gaps are worth saying.
  const nothingPriced = priced.length === 0;

  if (propertyClass === 'unset') {
    checks.push({
      id: 'property-type-unset',
      level: 'info',
      title: 'Set the property type',
      body: 'Home or commercial decides the Texas tax on this job. Set it on the client’s property.',
      publications: ['94-116'],
      ledger: ['residential-labor-not-taxable', 'nonresidential-total-charge-taxable'],
    });
  } else if (propertyClass === 'other') {
    checks.push({
      id: 'property-type-other',
      level: 'info',
      title: 'Property type is “Other”',
      body: 'Settle whether this is a home or a business before pricing — Texas taxes them differently. A building used as both needs the Comptroller’s multiple-use guidelines.',
      publications: ['94-116'],
      ledger: ['multiple-use-property'],
    });
  } else if (propertyClass === 'manufactured') {
    checks.push({
      id: 'manufactured-home',
      level: 'info',
      title: 'Mobile or manufactured home',
      body: 'Whether repair labor here counts as residential real property work depends on how the home is classified and titled. Confirm with the Comptroller before treating the labor as untaxed.',
      publications: ['94-116', '96-254'],
      ledger: ['manufactured-homes'],
    });
  } else if (nothingPriced) {
    // Residential or commercial, but nothing to check yet.
  } else if (propertyClass === 'residential') {
    checks.push(...residentialChecks(priced, taxCharged));
  } else {
    checks.push(...nonresidentialChecks(priced, taxCharged));
  }

  const debris = priced.filter((l) => looksLikeDebrisHaulOff(l.description) && !(taxCharged && l.taxable));
  if (debris.length > 0) {
    checks.push({
      id: 'debris',
      level: 'info',
      title: 'Debris haul-off is a taxable service',
      body: `A charge to haul away debris is taxable in Texas, on a home job too. If “${debris[0]!.description}” is billed as its own charge, it should carry tax.`,
      publications: ['94-157'],
      ledger: ['debris-haul-off-taxable'],
    });
  }

  return checks;
}

/**
 * What a line is, for the home-job rules. A line type the estimator chose is
 * trusted; an untyped line is labor only when its words say so. Anything else
 * is "unclear" — never quietly materials, because calling an unrecognised
 * labor line materials is exactly how a taxed paint job read as a correctly
 * separated contract.
 */
type LineKind = 'labor' | 'material' | 'taxable-service' | 'unclear';

function lineKind(line: CheckLine): LineKind {
  if (looksLikeDebrisHaulOff(line.description)) return 'taxable-service';
  if (line.isLabor === true) return 'labor';
  if (line.isLabor === false) return 'material';
  return looksLikeLabor(line.description) ? 'labor' : 'unclear';
}

function residentialChecks(priced: CheckLine[], taxCharged: boolean): TaxCheck[] {
  // Taxed haul-off is right on a home job and says nothing about the contract,
  // so it doesn't count as the job charging tax.
  const taxedWork = taxCharged ? priced.filter((l) => l.taxable && lineKind(l) !== 'taxable-service') : [];

  if (taxedWork.length === 0) {
    return [
      {
        id: 'residential-lump-sum-materials',
        level: 'info',
        title: 'No tax charged on this home job',
        body: 'On a lump-sum contract you are the consumer of the materials: the tax is paid when you buy them, and anything bought tax-free for this job — on a resale certificate, or online without Texas tax — goes on your sales tax return as taxable purchases. If the contract states materials separately, the tax belongs on the materials charge instead.',
        publications: ['94-116', '94-171'],
        ledger: [
          'lump-sum-contractor-is-consumer',
          'taxable-purchases-use-tax',
          'separated-contract-contractor-is-retailer',
        ],
      },
    ];
  }

  const taxedLabor = taxedWork.filter((l) => lineKind(l) === 'labor');
  if (taxedLabor.length > 0) {
    const which = taxedLabor.length === 1 ? 'the labor line' : `the ${taxedLabor.length} labor lines`;
    return [
      {
        id: 'residential-labor-taxed',
        level: 'warn',
        title: 'Labor is being taxed on a home job',
        body: `Labor to repair or remodel a home isn’t taxable in Texas. Mark ${which} not taxable, or the client is charged tax they don’t owe.`,
        publications: ['94-116'],
        ledger: ['residential-labor-not-taxable'],
      },
    ];
  }

  const unclear = taxedWork.filter((l) => lineKind(l) === 'unclear');
  if (unclear.length > 0 && priced.every((l) => l.taxable)) {
    return [
      {
        id: 'residential-all-taxed',
        level: 'info',
        title: 'Every line is taxed on a home job',
        body: 'On a home repair or remodel only a separately stated materials charge is taxable — labor isn’t. Check that each taxed line is materials.',
        publications: ['94-116'],
        ledger: ['residential-labor-not-taxable', 'separated-contract-contractor-is-retailer'],
      },
    ];
  }
  if (unclear.length > 0) {
    const more = unclear.length > 1 ? ` and ${plural(unclear.length - 1, 'other line', 'other lines')}` : '';
    return [
      {
        id: 'residential-taxed-unclear',
        level: 'info',
        title: 'Check the taxed lines are materials',
        body: `On a home repair or remodel only a separately stated materials charge is taxable. “${unclear[0]!.description}”${more} ${unclear.length === 1 ? 'is' : 'are'} taxed without being marked as materials — if it’s labor or a subcontractor’s work, mark it not taxable.`,
        publications: ['94-116'],
        ledger: ['residential-labor-not-taxable', 'separated-contract-contractor-is-retailer'],
      },
    ];
  }

  // Every taxed line is a known material: a separated contract.
  return [
    {
      id: 'residential-separated',
      level: 'info',
      title: 'Taxing materials only — a separated contract',
      body: 'State labor and materials as separate charges in the contract and on the invoice, and keep the materials charge at or above what you paid for them.',
      publications: ['94-116'],
      ledger: ['separated-contract-contractor-is-retailer'],
    },
  ];
}

function nonresidentialChecks(priced: CheckLine[], taxCharged: boolean): TaxCheck[] {
  if (!taxCharged) {
    return [
      {
        id: 'nonresidential-untaxed',
        level: 'warn',
        title: 'No tax on a commercial job',
        body: 'Texas taxes the whole charge for repairing or remodeling a commercial building — labor and materials — at the job site’s rate. If this is new construction, or scheduled maintenance you can document, no tax is right; otherwise an audit collects it from you, not the client.',
        publications: ['94-116'],
        ledger: [
          'nonresidential-total-charge-taxable',
          'new-construction-not-taxable',
          'scheduled-maintenance',
        ],
      },
    ];
  }

  const untaxed = priced.filter((l) => !l.taxable);
  if (untaxed.length > 0) {
    return [
      {
        id: 'nonresidential-lines-untaxed',
        level: 'warn',
        title: `${plural(untaxed.length, 'line isn’t', 'lines aren’t')} taxed on a commercial job`,
        body: 'On a commercial remodel the entire charge is taxable, labor included, itemized or not. Tax every line — unless part of the job is new square footage, which should then be priced separately.',
        publications: ['94-116'],
        ledger: ['nonresidential-total-charge-taxable', 'nonresidential-mixed-new-footage'],
      },
    ];
  }

  return [
    {
      id: 'nonresidential-rate',
      level: 'info',
      title: 'Commercial job: the job site’s rate applies',
      body: 'Local tax on commercial remodeling follows the job site’s address, not your office’s.',
      publications: ['94-105'],
      ledger: ['local-tax-job-site'],
    },
  ];
}
