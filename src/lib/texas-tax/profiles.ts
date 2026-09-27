/**
 * Who a Texas tax rule lands on, by kind of business.
 *
 * Deliberately by *profile* — contractor, vehicle rental company, holding
 * company — and never by named company. The application is multi-tenant, and
 * this repository is public: which of a particular owner's companies rents
 * vehicles to which is that owner's business, kept with that owner. A group of
 * companies maps itself onto these profiles; the rules don't change.
 *
 * Two kinds of obligation:
 *  - `rule` — a thing to do, backed by ledger facts (a test enforces the ids).
 *  - `read-first` — a pointer to publications, claiming nothing beyond "read
 *    this before doing X". Used where the rule itself hasn't been verified;
 *    saying "read 94-142 first" is honest, paraphrasing it from memory isn't.
 */

import { weakestStatus, type LedgerStatus } from './ledger';

export const BUSINESS_PROFILES = [
  'every-entity',
  'contractor',
  'government-work',
  'vehicle-rental',
  'holding-real-estate',
  'logistics-carrier',
  'insurance-agency',
  'software-and-data',
] as const;
export type BusinessProfile = (typeof BUSINESS_PROFILES)[number];

export function isBusinessProfile(value: string): value is BusinessProfile {
  return (BUSINESS_PROFILES as readonly string[]).includes(value);
}

export const PROFILE_LABELS: Record<BusinessProfile, string> = {
  'every-entity': 'Every Texas entity',
  contractor: 'Contractor — repair, remodeling and new construction',
  'government-work': 'Work for government and exempt customers',
  'vehicle-rental': 'Vehicle rental company',
  'holding-real-estate': 'Holding company and real estate owner',
  'logistics-carrier': 'Logistics and trucking',
  'insurance-agency': 'Insurance agency',
  'software-and-data': 'Buying or selling software and data services',
};

export interface Obligation {
  kind: 'rule' | 'read-first';
  title: string;
  detail: string;
  /** Ledger fact ids. Required (non-empty) for rules; empty for read-first. */
  ledger: readonly string[];
  /** Publication keys from `publications.ts`. */
  publications: readonly string[];
}

export const PROFILE_OBLIGATIONS: Record<BusinessProfile, readonly Obligation[]> = {
  'every-entity': [
    {
      kind: 'rule',
      title: 'File the franchise tax information report by May 15',
      detail:
        'Every LLC files a Public Information Report or Ownership Information Report by May 15, even in a year no tax is due. A franchise tax report with tax is due only above the no-tax-due threshold — $2.65 million of annualized revenue for 2026 reports.',
      ledger: [
        'franchise-llcs-taxable',
        'franchise-information-report',
        'franchise-no-tax-due-threshold',
        'franchise-due-may-15',
      ],
      publications: ['98-806'],
    },
    {
      kind: 'rule',
      title: 'Check whether affiliated companies report as one combined group',
      detail:
        'Companies under more than 50% common ownership that run a unitary business file one combined report, and the no-tax-due threshold then applies to their combined revenue. Whether a group is unitary is a judgement to make with a CPA.',
      ledger: ['franchise-combined-group'],
      publications: ['98-862'],
    },
    {
      kind: 'rule',
      title: 'Report use tax on untaxed purchases',
      detail:
        'Anything taxable bought online without Texas tax, and anything bought tax-free and then used rather than resold, goes on the sales tax return as taxable purchases.',
      ledger: ['online-purchases-use-tax', 'taxable-purchases-use-tax'],
      publications: ['94-171'],
    },
    {
      kind: 'rule',
      title: 'File and pay on time',
      detail:
        'On-time filing earns 0.5% of the tax collected. Late payment costs 5% (1–30 days) or 10% (over 30), a $50 late-filing penalty may be added, and interest starts on day 61.',
      ledger: ['sales-tax-due-dates', 'timely-filing-discounts', 'late-penalties'],
      publications: ['98-918', '98-304'],
    },
    {
      kind: 'rule',
      title: 'Keep records for four years',
      detail:
        'Four years is the general limit on assessments, so it is the minimum retention. If an audit goes against you, there are 30 days from the Notice of Tax Due to request a redetermination.',
      ledger: ['records-four-years', 'audit-redetermination'],
      publications: ['96-1253', '96-146'],
    },
    {
      kind: 'rule',
      title: 'Before buying a business, get a Certificate of No Tax Due',
      detail:
        'Without one, the buyer inherits the seller’s unpaid tax up to the purchase price. Request it jointly on Form 86-114 before closing and hold back enough of the price until it arrives.',
      ledger: ['successor-liability'],
      publications: ['98-117'],
    },
    {
      kind: 'rule',
      title: 'Put past under-reporting right through voluntary disclosure',
      detail:
        'A voluntary disclosure agreement waives penalties and usually interest on past periods, generally reaching back four years.',
      ledger: ['voluntary-disclosure'],
      publications: ['96-576'],
    },
  ],
  contractor: [
    {
      kind: 'rule',
      title: 'Settle the tax treatment before pricing the job',
      detail:
        'Two questions decide it: is the property residential or nonresidential, and is the contract lump-sum or separated? Home repair and all new construction carry no tax on labor; nonresidential remodeling is taxed on the whole charge.',
      ledger: [
        'residential-labor-not-taxable',
        'nonresidential-total-charge-taxable',
        'new-construction-not-taxable',
        'lump-sum-contractor-is-consumer',
        'separated-contract-contractor-is-retailer',
      ],
      publications: ['94-116', '94-157'],
    },
    {
      kind: 'rule',
      title: 'Use a resale certificate only for materials you resell',
      detail:
        'On a separated contract or a nonresidential job you resell the incorporated materials, so a resale certificate is right. On a lump-sum home job you are the consumer: pay the tax at the register, or, if it was bought tax-free, report it as taxable purchases on the return. Issuing a resale certificate for materials you know you will consume is an offense.',
      ledger: [
        'separated-contract-contractor-is-retailer',
        'nonresidential-resale-certificate',
        'lump-sum-contractor-is-consumer',
        'taxable-purchases-use-tax',
        'resale-certificate-knowing-misuse',
      ],
      publications: ['94-116'],
    },
    {
      kind: 'rule',
      title: 'Charge the job site’s rate on nonresidential work',
      detail:
        'Local tax on nonresidential remodeling follows the job site, not your office. Look up the address: 6.25% state plus up to 2% local.',
      ledger: ['local-tax-job-site', 'rate-range'],
      publications: ['94-105', 'sales-tax-rates'],
    },
    {
      kind: 'rule',
      title: 'Tax a separate debris haul-off charge',
      detail: 'Haul-off is a taxable real property service, on a home job too.',
      ledger: ['debris-haul-off-taxable'],
      publications: ['94-157'],
    },
    {
      kind: 'rule',
      title: 'Split new footage from remodeling on commercial jobs',
      detail:
        'When one price covers both and the remodeling is more than 5% of it, the whole price is presumed taxable. State a reasonable charge for the remodeling separately, at the time.',
      ledger: ['nonresidential-mixed-new-footage'],
      publications: ['94-116'],
    },
    {
      kind: 'rule',
      title: 'Keep the schedule for commercial maintenance work',
      detail:
        'Scheduled, periodic maintenance is not taxed as remodeling, but only with maintenance schedules or work orders to prove it.',
      ledger: ['scheduled-maintenance'],
      publications: ['94-116'],
    },
    {
      kind: 'rule',
      title: 'Disaster-area repairs: separate the labor',
      detail:
        'Repair labor in a declared disaster area is exempt and materials are not. On a commercial job that takes a separated contract and the customer’s exemption certificate — a lump-sum price is taxed in full.',
      ledger: ['disaster-repair'],
      publications: ['94-182'],
    },
    {
      kind: 'rule',
      title: 'Water and mold jobs: price the taxable pieces separately',
      detail:
        'Containment and storage aren’t taxable to the customer; cleaning contents and antimicrobial treatments are.',
      ledger: ['mold-remediation-split'],
      publications: ['94-187'],
    },
    {
      kind: 'rule',
      title: 'Mixed-use buildings and manufactured homes: ask before pricing',
      detail:
        'The Comptroller asks contractors to call for its multiple-use guidelines, and whether a manufactured home is residential real property depends on how it is classified.',
      ledger: ['multiple-use-property', 'manufactured-homes'],
      publications: ['94-116', '96-254'],
    },
  ],
  'government-work': [
    {
      kind: 'rule',
      title: 'No tax to government customers',
      detail:
        'Federal, State of Texas and Texas local government jobs carry no tax. Texas governments and school districts are exempt by law without applying.',
      ledger: ['government-customers'],
      publications: ['94-116', '96-1045'],
    },
    {
      kind: 'rule',
      title: 'Collect the exemption certificate from exempt organizations',
      detail:
        'A church, school or charity must give you an exemption certificate, and the work has to relate to its exempt purpose. You can then give suppliers an exemption certificate for items used up on the job.',
      ledger: ['exempt-organization-customers'],
      publications: ['96-122', '96-1045'],
    },
    {
      kind: 'rule',
      title: 'Bid exempt and government work as a separated contract',
      detail:
        'The separated contract is the documented route to buying the incorporated materials without tax. Whether a lump-sum contractor can do the same was not settled — confirm in 94-116 before bidding lump-sum.',
      ledger: ['separated-contract-contractor-is-retailer', 'exempt-lump-sum-materials'],
      publications: ['94-116'],
    },
  ],
  'vehicle-rental': [
    {
      kind: 'rule',
      title: 'Collect rental tax on every rental',
      detail:
        'Hold a motor vehicle rental tax permit and collect 10% on contracts of 1–30 days, 6.25% on 31–180 days. Trailers count. Check the exemptions in 96-143 before treating any rental as untaxed.',
      ledger: ['vehicle-rental-tax-rates'],
      publications: ['96-143'],
    },
    {
      kind: 'rule',
      title: 'Over 180 days is a lease, not a rental',
      detail:
        'A lease carries no tax on the payments; tax is paid on the vehicle’s purchase price when it is titled. Contract length decides which regime applies.',
      ledger: ['rental-versus-lease'],
      publications: ['96-143', '96-254'],
    },
    {
      kind: 'rule',
      title: 'Under five rental vehicles, pay the sales tax at titling',
      detail:
        'A qualified permit needs at least five vehicles titled for rental in 12 months. Below that the permit is non-qualified and motor vehicle sales tax is paid when each vehicle is titled.',
      ledger: ['rental-permit-qualified'],
      publications: ['96-254'],
    },
    {
      kind: 'rule',
      title: 'Moving a vehicle into or between companies can be taxable',
      detail:
        'Only a few transfers are tax-free: between a sole owner and their own unincorporated company, or a partnership incorporating or converting. A transfer between a corporation and its stockholder is taxable either way. Plan the transfer before titling, and take LLC-to-LLC moves to a CPA.',
      ledger: ['vehicle-transfers-entities'],
      publications: ['96-254'],
    },
  ],
  'holding-real-estate': [
    {
      kind: 'rule',
      title: 'Decide the combined-group question with a CPA',
      detail:
        'A holding company is a taxable entity itself, and with companies it controls more than 50% of in a unitary business it may have to file one combined report.',
      ledger: ['franchise-llcs-taxable', 'franchise-combined-group'],
      publications: ['98-806', '98-862'],
    },
    {
      kind: 'rule',
      title: 'Rent from real property isn’t taxed; parking is',
      detail:
        'Renting out a whole property carries no sales tax; charging for vehicle parking or storage does.',
      ledger: ['real-property-rent-not-taxable'],
      publications: [],
    },
    {
      kind: 'rule',
      title: 'Expect tax on commercial remodeling of property you own',
      detail:
        'A contractor remodeling a commercial building you own charges tax on the whole job; new construction and work on residential rentals carry no tax on labor.',
      ledger: ['nonresidential-total-charge-taxable', 'new-construction-not-taxable', 'residential-labor-not-taxable'],
      publications: ['94-116'],
    },
    {
      kind: 'rule',
      title: 'Buying a business or its assets',
      detail:
        'Get the Certificate of No Tax Due before closing, or the buyer inherits the seller’s tax up to the price.',
      ledger: ['successor-liability'],
      publications: ['98-117'],
    },
    {
      kind: 'read-first',
      title: 'Before renting any property by the night',
      detail: 'Read the hotel occupancy tax publications first.',
      ledger: [],
      publications: ['96-224'],
    },
  ],
  'logistics-carrier': [
    {
      kind: 'rule',
      title: 'Heavy vehicles crossing state lines need IFTA',
      detail:
        'IFTA covers qualified motor vehicles — a two-axle vehicle registered over 26,000 pounds is one case. Read the full definition before the first interstate run.',
      ledger: ['ifta-qualified-vehicle'],
      publications: ['96-336'],
    },
    {
      kind: 'rule',
      title: 'Decide which company titles a truck before buying it',
      detail:
        'Few vehicle transfers are tax-free, and a later move between companies can be taxed as a transfer of its own.',
      ledger: ['vehicle-transfers-entities'],
      publications: ['96-254'],
    },
    {
      kind: 'read-first',
      title: 'Before using dyed diesel',
      detail: 'Read the dyed diesel publications before buying or using it in any vehicle.',
      ledger: [],
      publications: ['98-823', '98-723'],
    },
  ],
  'insurance-agency': [
    {
      kind: 'read-first',
      title: 'Before placing surplus lines or independently procured coverage',
      detail:
        'Premium, surplus-lines and maintenance taxes are set out in the insurance publications. Read them before an agency places anything outside admitted carriers.',
      ledger: [],
      publications: ['94-142', '94-431', '98-376', '94-130'],
    },
  ],
  'software-and-data': [
    {
      kind: 'rule',
      title: 'Software as a service is taxed on 80% of the charge',
      detail:
        'Check that SaaS and data-processing vendors charge Texas tax; when one doesn’t, report it as a taxable purchase. Selling such a service means collecting tax on 80% of the charge.',
      ledger: ['data-processing-80-percent', 'taxable-purchases-use-tax'],
      publications: ['94-127', '94-109'],
    },
  ],
};

export type RelevanceLevel = 'core' | 'situational';

export interface PublicationRelevance {
  profiles: readonly { profile: BusinessProfile; level: RelevanceLevel }[];
  /** Why it matters, at the level of topic — never a rule the ledger doesn't hold. */
  why: string;
}

const core = (profile: BusinessProfile) => ({ profile, level: 'core' as const });
const sit = (profile: BusinessProfile) => ({ profile, level: 'situational' as const });

/** Keyed by publication key. Publications absent here touch none of the profiles. */
export const PUBLICATION_RELEVANCE: Record<string, PublicationRelevance> = {
  '94-116': {
    profiles: [core('contractor'), core('government-work'), sit('holding-real-estate')],
    why: 'The rulebook for contract jobs: residential or nonresidential, lump-sum or separated, and who pays tax on materials.',
  },
  '94-157': {
    profiles: [core('contractor'), sit('holding-real-estate')],
    why: 'New construction, and real property services such as debris haul-off, landscaping and cleanup.',
  },
  '94-105': {
    profiles: [core('contractor')],
    why: 'Which local rate applies — nonresidential repair uses the job site’s.',
  },
  'sales-tax-rates': {
    profiles: [core('contractor'), sit('every-entity')],
    why: 'The combined rate for an address: 6.25% state plus up to 2% local.',
  },
  'rate-charts': { profiles: [sit('contractor')], why: 'Local rates, as a chart.' },
  '96-259': {
    profiles: [sit('contractor'), sit('software-and-data')],
    why: 'The list of taxable services — check it before selling a new kind of service.',
  },
  '94-112': {
    profiles: [sit('contractor'), sit('holding-real-estate')],
    why: 'Landscaping and lawn care services.',
  },
  '94-111': {
    profiles: [sit('contractor'), sit('holding-real-estate')],
    why: 'Cleaning and janitorial services, including final cleanup.',
  },
  '94-114': { profiles: [sit('holding-real-estate')], why: 'Pest control services bought for property.' },
  '94-119': { profiles: [sit('holding-real-estate')], why: 'Security services such as monitoring.' },
  '94-187': { profiles: [sit('contractor')], why: 'Mold remediation: which pieces are taxable.' },
  '94-182': {
    profiles: [core('contractor'), sit('every-entity')],
    why: 'Disaster-area repairs, and relief after a declared disaster.',
  },
  '94-164': { profiles: [sit('contractor')], why: 'Ready-mix concrete delivery and pumping charges.' },
  '94-143': { profiles: [sit('contractor')], why: 'Design and drafting services.' },
  '94-107': {
    profiles: [sit('contractor')],
    why: 'Debt collection services — read before hiring a collection agency.',
  },
  '96-1331': {
    profiles: [sit('contractor')],
    why: 'The ENERGY STAR holiday — check its item list and dates against appliance purchases.',
  },
  '98-1018': {
    profiles: [sit('contractor')],
    why: 'The water-efficient products holiday — check its item list and dates against fixture purchases.',
  },
  '94-171': {
    profiles: [core('every-entity'), core('contractor')],
    why: 'Use tax on anything bought online without Texas tax.',
  },
  '96-1045': {
    profiles: [core('government-work')],
    why: 'Which customers are exempt, and what they must give you.',
  },
  '96-122': {
    profiles: [sit('government-work')],
    why: 'Purchases and sales by nonprofit and exempt organizations.',
  },
  '98-806': {
    profiles: [core('every-entity'), core('holding-real-estate')],
    why: 'Franchise tax, and the information report every LLC files.',
  },
  '98-862': {
    profiles: [sit('every-entity'), core('holding-real-estate')],
    why: 'When affiliated companies report as one combined group.',
  },
  '98-117': {
    profiles: [core('holding-real-estate'), sit('every-entity')],
    why: 'Buying a business: the Certificate of No Tax Due that protects the buyer.',
  },
  '98-304': { profiles: [sit('every-entity')], why: 'Interest on late tax, and on refunds.' },
  '98-918': { profiles: [core('every-entity')], why: 'Late filing penalties.' },
  '96-145': { profiles: [sit('every-entity')], why: 'Rules for hearings and disputes.' },
  '96-1789': { profiles: [sit('every-entity')], why: 'Motions for rehearing after a decision.' },
  '96-385': {
    profiles: [sit('every-entity')],
    why: 'Monthly policy changes — the quarterly refresh reads it.',
  },
  '96-265': { profiles: [sit('every-entity')], why: 'Your rights in dealing with the Comptroller.' },
  '96-1774': {
    profiles: [sit('every-entity')],
    why: 'A tour of every Texas tax — start here before a new venture.',
  },
  '2021-legislative-update': { profiles: [sit('every-entity')], why: 'What the 2021 session changed.' },
  '2023-legislative-update': { profiles: [sit('every-entity')], why: 'What the 2023 session changed.' },
  '2025-legislative-update': {
    profiles: [sit('every-entity')],
    why: 'What the 2025 session changed, including the veteran-owned business exemption.',
  },
  '96-1253': {
    profiles: [sit('every-entity')],
    why: 'Disagreeing with an audit: 30 days to request a redetermination.',
  },
  '96-146': { profiles: [sit('every-entity')], why: 'What a routine audit notice means.' },
  '96-576': {
    profiles: [core('every-entity')],
    why: 'Coming forward about past under-reporting, with penalties waived.',
  },
  '98-849': { profiles: [sit('every-entity')], why: 'Filing and paying electronically.' },
  '96-254': {
    profiles: [
      core('vehicle-rental'),
      core('logistics-carrier'),
      sit('holding-real-estate'),
      sit('contractor'),
    ],
    why: 'Buying, titling and transferring vehicles — including between companies.',
  },
  '96-143': {
    profiles: [core('vehicle-rental')],
    why: 'The permit, rates and returns for renting vehicles out.',
  },
  '96-141': { profiles: [sit('vehicle-rental')], why: 'Read with 96-254 when valuing a vehicle sale.' },
  '94-113': { profiles: [sit('vehicle-rental')], why: 'Repairs and maintenance on vehicles.' },
  '96-336': {
    profiles: [core('logistics-carrier')],
    why: 'Fuel tax licensing for qualified vehicles crossing state lines.',
  },
  '98-723': {
    profiles: [sit('logistics-carrier'), sit('contractor')],
    why: 'Recordkeeping for bonded dyed diesel users.',
  },
  '98-823': {
    profiles: [sit('logistics-carrier'), sit('contractor')],
    why: 'Dyed diesel fuel sales.',
  },
  '94-127': {
    profiles: [core('software-and-data')],
    why: 'Software as a service and data processing — taxed on 80% of the charge.',
  },
  '94-109': { profiles: [sit('software-and-data')], why: 'Information services.' },
  '94-142': { profiles: [sit('insurance-agency')], why: 'Surplus lines tax exemptions.' },
  '94-431': {
    profiles: [sit('insurance-agency')],
    why: 'Premium tax compliance for nonadmitted insurance.',
  },
  '98-376': { profiles: [sit('insurance-agency')], why: 'Tax on independently procured insurance.' },
  '94-130': {
    profiles: [sit('insurance-agency')],
    why: 'Maintenance taxes, surcharges and fees on insurers.',
  },
  '96-224': {
    profiles: [sit('holding-real-estate')],
    why: 'Hotel occupancy tax exemptions — only if property is ever rented by the night.',
  },
};

/** How firmly an obligation stands, from its evidence. A pointer claims nothing. */
export function obligationStatus(obligation: Obligation): LedgerStatus | 'pointer' {
  if (obligation.kind === 'read-first') return 'pointer';
  return weakestStatus(obligation.ledger);
}
