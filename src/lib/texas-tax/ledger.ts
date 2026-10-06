/**
 * Every Texas tax rule this codebase acts on, with the evidence behind it.
 *
 * The rules in `texas-tax-core.ts` and `job-checks.ts` cite these by id, and a
 * test fails if a cited id is missing. So a rule can't be added without saying
 * where it came from, and a reader can always get from an on-screen warning
 * back to the Comptroller page that justifies it.
 *
 * How these were checked matters as much as what they say. comptroller.texas.gov
 * is blocked by the network policy of the environment this was built in, so the
 * pages were read through web-search excerpts rather than opened in full. That
 * is weaker than reading the page, and every entry says so. `unresolved` means
 * the excerpts didn't settle it — the tools then say "check this" rather than
 * guess. The refresh workflow in `.claude/workflows/` re-checks the whole list.
 */

export const LEDGER_CHECKED_ON = '2026-09-26';

export const LEDGER_TOPICS = ['contracting', 'filing', 'franchise', 'motor-vehicle', 'other'] as const;
export type LedgerTopic = (typeof LEDGER_TOPICS)[number];

export const LEDGER_STATUSES = ['confirmed', 'partial', 'unresolved'] as const;
export type LedgerStatus = (typeof LEDGER_STATUSES)[number];

export const LEDGER_STATUS_LABELS: Record<LedgerStatus, string> = {
  confirmed: 'Confirmed',
  partial: 'Partly confirmed',
  unresolved: 'Not settled — check before relying on it',
};

export interface LedgerSource {
  label: string;
  url: string;
}

export interface LedgerFact {
  id: string;
  topic: LedgerTopic;
  /** The rule in plain words, no stronger than the evidence. */
  statement: string;
  sources: readonly LedgerSource[];
  status: LedgerStatus;
  method: string;
  note?: string;
  /** Set when this fact was checked after LEDGER_CHECKED_ON, so no answer borrows an older date. */
  checkedOn?: string;
}

const EXCERPT =
  'Comptroller page read through a web-search excerpt; full text not opened (comptroller.texas.gov is blocked in the build environment).';
const THIRD_PARTY =
  'Comptroller search excerpt plus third-party bill summaries; the Comptroller page itself was not opened.';
const STAR_EXCERPT =
  'Comptroller STAR research documents and the Tax Code read through web-search excerpts on 2026-09-27, after the rest of this ledger; full text not opened.';
const DERIVED =
  'Derived on 2026-09-27 from two web-search excerpts — the Comptroller’s 2026 figure and Tax Code §171.006’s adjustment schedule. No page stating the figure itself was read; full text not opened.';

const CPA = 'https://comptroller.texas.gov';
const PUB = `${CPA}/taxes/publications`;

const src = {
  p94116: { label: 'Pub 94-116, Real Property Repair and Remodeling', url: `${PUB}/94-116.php` },
  p94157: { label: 'Pub 94-157, Homebuilders and Real Property Services', url: `${PUB}/94-157.php` },
  p94105: { label: 'Pub 94-105, Local Sales and Use Tax Collection', url: `${PUB}/94-105.php` },
  p94182: { label: 'Pub 94-182, Disasters and Texas Taxes', url: `${PUB}/94-182.php` },
  p94187: { label: 'Pub 94-187, Mold Remediation Services', url: `${PUB}/94-187.php` },
  p94171: { label: 'Pub 94-171, Online Orders', url: `${PUB}/94-171.php` },
  p94127: { label: 'Pub 94-127, Data Processing Services are Taxable', url: `${PUB}/94-127.php` },
  p96259: { label: 'Pub 96-259, Taxable Services', url: `${PUB}/96-259.php` },
  p961045: { label: 'Pub 96-1045, Guidelines to Texas Tax Exemptions', url: `${PUB}/96-1045.php` },
  p961253: {
    label: 'Pub 96-1253, Contesting Disagreed Audits',
    url: `${PUB}/96-1253.pdf`,
  },
  p96576: { label: 'Pub 96-576, Voluntary Disclosure Program', url: `${PUB}/96-576.php` },
  p98117: { label: 'Pub 98-117, Buying an Existing Business', url: `${PUB}/98-117.php` },
  p98806: { label: 'Pub 98-806, Franchise Tax Overview', url: `${PUB}/98-806.php` },
  p98918: { label: 'Pub 98-918, Late Filing Penalties', url: `${PUB}/98-918.pdf` },
  p96143: { label: 'Pub 96-143, Motor Vehicle Rental Tax Guide', url: `${PUB}/96-143/` },
  p96254leases: { label: 'Pub 96-254, Leases', url: `${PUB}/96-254/leases.php` },
  p96254rent: {
    label: 'Pub 96-254, Purchases for rental',
    url: `${PUB}/96-254/purchase-for-rent.php`,
  },
  p96254entities: {
    label: 'Pub 96-254, Corporations and LLCs',
    url: `${PUB}/96-254/corporations-llcs.php`,
  },
  p96254partners: { label: 'Pub 96-254, Partnerships', url: `${PUB}/96-254/partnerships.php` },
  p96254sole: { label: 'Pub 96-254, Sole owners', url: `${PUB}/96-254/sole-owners.php` },
  p96254mfg: {
    label: 'Pub 96-254, Manufactured housing and mobile homes',
    url: `${PUB}/96-254/manufactured-mobile.php`,
  },
  resaleFaq: { label: 'Sales tax FAQ: resale certificates', url: `${CPA}/taxes/sales/faq/resale.php` },
  taxablePurchases: {
    label: 'Help: taxable purchases',
    url: `${CPA}/help/sales-tax/taxable-purchases.php`,
  },
  localFaq: { label: 'Sales tax FAQ: local tax', url: `${CPA}/taxes/sales/faq/local.php` },
  reportPayFaq: {
    label: 'Sales tax FAQ: reporting and paying',
    url: `${CPA}/taxes/sales/faq/report-pay.php`,
  },
  dueDates: { label: 'Due dates for taxes and reports', url: `${CPA}/taxes/file-pay/due-dates.php` },
  filingReqs: {
    label: 'Requirements for reporting and paying sales tax',
    url: `${CPA}/taxes/sales/filing-requirements.php`,
  },
  penalties: { label: 'Penalties for past due taxes', url: `${CPA}/taxes/file-pay/penalties.php` },
  auditManual: {
    label: 'Auditing Fundamentals, chapter 8',
    url: `${CPA}/taxes/audit/manuals/fundamentals/ch8.php`,
  },
  franchise2026: {
    label: 'Franchise tax report forms for 2026',
    url: `${CPA}/taxes/franchise/forms/2026-franchise.php`,
  },
  ntd2024: {
    label: 'No tax due reporting for 2024 and later',
    url: `${CPA}/taxes/franchise/ntd-rpt-updates-2024.php`,
  },
  pirOir: {
    label: 'PIR and OIR filing requirements',
    url: `${CPA}/taxes/franchise/pir-oir-filing-req.php`,
  },
  combinedFaq: { label: 'Franchise tax FAQ: combined groups', url: `${CPA}/taxes/franchise/faq/combined.php` },
  veteran: {
    label: 'New veteran-owned businesses and franchise tax',
    url: `${CPA}/taxes/franchise/veteran-business.php`,
  },
  legis2025: {
    label: '2025 Legislative Update',
    url: `${CPA}/taxes/tax-policy-news/2025-august.php`,
  },
  hb346: { label: 'HB 346 (89th Leg., 2025) on LegiScan', url: 'https://legiscan.com/TX/bill/HB346/2025' },
  grossRental: {
    label: 'Motor vehicle gross rental receipts tax',
    url: `${CPA}/taxes/motor-vehicle/gross-rental.php`,
  },
  fuelsFaq: { label: 'Fuels taxes FAQ', url: `${CPA}/taxes/fuels/faq.php` },
  starRent: {
    label: 'STAR letter ruling on renting real property',
    url: 'https://star.comptroller.texas.gov/view/201807006L',
  },
  starExemptContract: {
    label: 'STAR 202204001R, exemption certificates on an exempt contract',
    url: 'https://star.comptroller.texas.gov/view/202204001R',
  },
  taxCode151311: {
    label: 'Tax Code §151.311',
    url: 'https://statutes.capitol.texas.gov/Docs/TX/htm/TX.151.htm#151.311',
  },
  taxCode171006: {
    label: 'Tax Code §171.006',
    url: 'https://statutes.capitol.texas.gov/Docs/TX/htm/TX.171.htm#171.006',
  },
  informant: { label: "Pub 96-266, Informant's Recovery Program", url: `${PUB}/96-266.pdf` },
} satisfies Record<string, LedgerSource>;

export const LEDGER: readonly LedgerFact[] = [
  // ── Contracting ────────────────────────────────────────────────────────────
  {
    id: 'residential-labor-not-taxable',
    topic: 'contracting',
    statement:
      'Labor to repair, remodel or restore residential real property is not taxable. Residential means family dwellings, including apartment complexes, nursing homes, condominiums and retirement homes.',
    sources: [src.p94116],
    status: 'confirmed',
    method: EXCERPT,
    note: 'A search excerpt of the same guidance lists homes, duplexes, apartments, nursing homes and retirement homes — "but not hotels". Treat hotels as nonresidential.',
  },
  {
    id: 'nonresidential-total-charge-taxable',
    topic: 'contracting',
    statement:
      'The total amount charged to remodel, repair or restore nonresidential real property is taxable — labor and materials. Examples: hospitals, office buildings, refineries, warehouses, parking garages, retail shops, restaurants and manufacturing facilities.',
    sources: [src.p94116, src.p94157],
    status: 'confirmed',
    method: EXCERPT,
  },
  {
    id: 'new-construction-not-taxable',
    topic: 'contracting',
    statement:
      'No tax is due on labor to build new structures, residential or nonresidential.',
    sources: [src.p94116, src.p94157],
    status: 'confirmed',
    method: EXCERPT,
  },
  {
    id: 'lump-sum-contractor-is-consumer',
    topic: 'contracting',
    statement:
      'Under a lump-sum contract — one price for labor and materials — the contractor pays tax on supplies, materials, equipment and taxable services when buying them, and charges the customer no tax. The contractor is the consumer of the materials.',
    sources: [src.p94116],
    status: 'confirmed',
    method: EXCERPT,
  },
  {
    id: 'separated-contract-contractor-is-retailer',
    topic: 'contracting',
    statement:
      'Under a separated contract the contractor gives suppliers resale certificates for materials incorporated into the customer’s property, then collects state and local tax from the customer on the materials charge, which must be at least what the contractor paid. Labor is not taxed. Surveying, landscaping, final cleanup and incorporated security systems can be bought the same way when separately identified to the customer.',
    sources: [src.p94116],
    status: 'confirmed',
    method: EXCERPT,
  },
  {
    id: 'nonresidential-resale-certificate',
    topic: 'contracting',
    statement:
      'On nonresidential repair and remodeling, the contractor may give suppliers resale certificates for materials that will be incorporated, and collects tax from the customer on the whole charge.',
    sources: [src.p94116],
    status: 'confirmed',
    method: EXCERPT,
  },
  {
    id: 'nonresidential-mixed-new-footage',
    topic: 'contracting',
    statement:
      'A single charge that both adds new square footage and remodels existing nonresidential space is presumed wholly taxable when the remodeling is more than 5% of the total, unless a reasonable charge for the taxable part is stated separately at the time. Contracts, bid sheets, tally sheets, schedules of values and blueprints can later establish the new-construction share.',
    sources: [src.p94116],
    status: 'confirmed',
    method: EXCERPT,
  },
  {
    id: 'multiple-use-property',
    topic: 'contracting',
    statement:
      'For property used both residentially and commercially, the Comptroller asks contractors to call for its multiple-use guidelines.',
    sources: [src.p94116],
    status: 'confirmed',
    method: EXCERPT,
  },
  {
    id: 'local-tax-job-site',
    topic: 'contracting',
    statement:
      'Local tax on nonresidential repair and remodeling is due based on the job site’s location, on the entire charge, whether it is billed separated or lump-sum.',
    sources: [src.p94105, src.p94116],
    status: 'confirmed',
    method: EXCERPT,
  },
  {
    id: 'debris-haul-off-taxable',
    topic: 'contracting',
    statement:
      'A charge to haul away debris is a taxable real property service, on homes as well as commercial property.',
    sources: [src.p94116, src.p94157],
    status: 'confirmed',
    method: EXCERPT,
    note: 'The excerpts address a charge for haul-off. Whether debris removal folded into a lump-sum home price is separately taxable was not settled.',
  },
  {
    id: 'scheduled-maintenance',
    topic: 'contracting',
    statement:
      'Scheduled, periodic maintenance of nonresidential real property is not repair or remodeling and is not taxed as such, but it has to be proven with maintenance schedules, work orders or similar records. Adding new usable square footage is also not remodeling.',
    sources: [src.p96259, src.p94116],
    status: 'confirmed',
    method: `${EXCERPT} The excerpt quotes 34 TAC §3.357.`,
    note: 'Janitorial, landscaping and other listed real property services stay taxable whatever the schedule.',
  },
  {
    id: 'disaster-repair',
    topic: 'contracting',
    statement:
      'Labor to repair residential or nonresidential real property damaged in a declared disaster area is exempt; the materials are taxable. For nonresidential work the contractor must use a separated contract and take an exemption certificate from the customer for the labor, naming both parties, the items repaired and the reason (for example "Repair due to Hurricane Harvey in Galveston County"). On a lump-sum nonresidential contract the contractor collects tax on the whole charge.',
    sources: [src.p94182],
    status: 'confirmed',
    method: EXCERPT,
  },
  {
    id: 'mold-remediation-split',
    topic: 'contracting',
    statement:
      'Mold remediation splits: containment set-up, protective equipment charges, and packing or storing contents are not taxable to the customer (the provider pays tax on the materials and equipment); cleaning furniture, clothing and drapes, and antimicrobial or deodorizing treatments of carpets and furniture, are taxable on homes and businesses alike.',
    sources: [src.p94187],
    status: 'confirmed',
    method: EXCERPT,
  },
  {
    id: 'government-customers',
    topic: 'contracting',
    statement:
      'No tax is charged on a job for a governmental agency — federal, the State of Texas, or Texas local government. Texas state and local governments, school districts and other political subdivisions are exempt by law and do not apply for exemption.',
    sources: [src.p94116, src.p961045],
    status: 'confirmed',
    method: EXCERPT,
  },
  {
    id: 'exempt-organization-customers',
    topic: 'contracting',
    statement:
      'When the contract is with an exempt organization (holding the Comptroller’s exemption, with the work related to its exempt purpose), the contractor may give suppliers an exemption certificate for items completely consumed at the job site and for taxable services integral to the contract. The organization must give the contractor an exemption certificate.',
    sources: [src.p94116],
    status: 'confirmed',
    method: EXCERPT,
  },
  {
    id: 'exempt-lump-sum-materials',
    topic: 'contracting',
    statement:
      'On an exempt contract — an improvement to realty for a governmental entity (Tax Code §151.309) or an exempt organization (§151.310) — the contractor, lump-sum or not, may give suppliers exemption certificates for tangible personal property incorporated into the realty, for items necessary and essential to the contract that are consumed at the job site, and for taxable services performed there (§151.311). The customer documents the exempt contract by giving the contractor an exemption certificate.',
    sources: [src.starExemptContract, src.taxCode151311, src.p94116],
    status: 'confirmed',
    method: STAR_EXCERPT,
    checkedOn: '2026-09-27',
    note: 'Recorded as not settled until 2026-09-27: the first excerpts described only the separated route and consumables. The improvement must be for the exempt entity’s primary use and benefit; tools and equipment the contractor keeps are not covered.',
  },
  {
    id: 'resale-certificate-knowing-misuse',
    topic: 'contracting',
    statement:
      'A resale certificate issued knowing the item will be used rather than resold is invalid, and tax is due on the purchase. Depending on the amount, the offense ranges from a Class C misdemeanor to a second-degree felony.',
    sources: [src.resaleFaq],
    status: 'confirmed',
    method: EXCERPT,
  },
  {
    id: 'taxable-purchases-use-tax',
    topic: 'contracting',
    statement:
      'Taxable items bought without paying tax — including items bought for resale or an exempt use and then used — are reported as taxable purchases on the sales and use tax return. When a buyer knows an item is not for resale, tax is paid at purchase.',
    sources: [src.taxablePurchases, src.resaleFaq],
    status: 'confirmed',
    method: EXCERPT,
  },
  {
    id: 'online-purchases-use-tax',
    topic: 'contracting',
    statement:
      'A taxable item bought online from a seller that did not charge Texas tax owes use tax, shipping included, based on where it is first received, stored or used. A permit holder reports it under taxable purchases (Item 3) on the sales tax return.',
    sources: [src.p94171],
    status: 'confirmed',
    method: EXCERPT,
  },
  {
    id: 'rate-range',
    topic: 'contracting',
    statement:
      'The state rate is 6.25%. Cities, counties, special-purpose districts and transit authorities may add up to 2%, for a maximum combined rate of 8.25%. The Comptroller’s Sales Tax Rate Locator gives the rate for an address.',
    sources: [src.localFaq],
    status: 'confirmed',
    method: EXCERPT,
  },
  {
    id: 'manufactured-homes',
    topic: 'contracting',
    statement:
      'Whether repair labor on a manufactured or mobile home counts as residential real property work.',
    sources: [src.p96254mfg, src.p94116],
    status: 'unresolved',
    method: EXCERPT,
    note: 'Manufactured housing built on or after March 1, 1982 is taxed on sale under the Manufactured Housing Sales and Use Tax Act; older mobile homes are motor vehicles. The excerpts point to how the home is classified and titled, and to asking the Comptroller.',
  },

  // ── Filing, penalties, audits ───────────────────────────────────────────────
  {
    id: 'sales-tax-due-dates',
    topic: 'filing',
    statement:
      'Monthly returns are due the 20th of the following month. Quarterly returns are due April 20, July 20, October 20 and January 20. Yearly returns are due January 20. A due date on a Saturday, Sunday or legal holiday moves to the next working day. The Comptroller assigns the filing frequency by letter when the permit is approved.',
    sources: [src.dueDates, src.filingReqs],
    status: 'confirmed',
    method: EXCERPT,
  },
  {
    id: 'electronic-filing-thresholds',
    topic: 'filing',
    statement:
      'Taxpayers who paid $100,000 or more must report electronically (Webfile or EDI); $500,000 or more in a specific tax must pay by TEXNET.',
    sources: [src.filingReqs],
    status: 'confirmed',
    method: EXCERPT,
  },
  {
    id: 'late-penalties',
    topic: 'filing',
    statement:
      'A $50 late filing penalty may be assessed on a return filed after the due date. Tax paid 1–30 days late carries a 5% penalty; more than 30 days, 10%; after the date on a Notice of Tax Due, another 10% (20% in all). Missing a required electronic filing adds 5%. Interest starts on the 61st day after the due date, at a rate reset every January 1.',
    sources: [src.penalties, src.p98918],
    status: 'confirmed',
    method: EXCERPT,
  },
  {
    id: 'timely-filing-discounts',
    topic: 'filing',
    statement:
      'Filing and paying on time earns a discount of 0.5% of the tax collected. Monthly and quarterly filers who prepay a reasonable estimate — at least 90% of the period’s tax, or 100% of the same period last year — take a further 1.25%.',
    sources: [src.reportPayFaq],
    status: 'confirmed',
    method: EXCERPT,
  },
  {
    id: 'voluntary-disclosure',
    topic: 'filing',
    statement:
      'A voluntary disclosure agreement reports past unpaid or underpaid tax with penalties waived and, in most cases, interest too — except interest on tax that was collected and not remitted. The statute of limitations is generally four years.',
    sources: [src.p96576],
    status: 'confirmed',
    method: EXCERPT,
  },
  {
    id: 'audit-redetermination',
    topic: 'filing',
    statement:
      'After a Notice of Tax Due from an audit, a taxpayer normally has 30 days to request a redetermination hearing (20 days after a jeopardy determination). A refund hearing can be requested any time within the limitations period. Generally no tax may be assessed more than four years after it became due.',
    sources: [src.p961253, src.auditManual],
    status: 'confirmed',
    method: EXCERPT,
  },
  {
    id: 'records-four-years',
    topic: 'filing',
    statement: 'Keep tax records for at least four years.',
    sources: [src.auditManual],
    status: 'confirmed',
    method: EXCERPT,
  },
  {
    id: 'successor-liability',
    topic: 'filing',
    statement:
      'A buyer of a business is liable for the seller’s unpaid taxes up to the purchase price unless a Certificate of No Tax Due is obtained before closing, and should withhold enough of the price to cover them until the seller produces one. Buyer and seller request it jointly on Form 86-114; it takes about 10 business days, or up to 90 when an audit is needed.',
    sources: [src.p98117],
    status: 'confirmed',
    method: EXCERPT,
  },

  // ── Franchise tax ──────────────────────────────────────────────────────────
  {
    id: 'franchise-no-tax-due-threshold',
    topic: 'franchise',
    statement:
      'The no-tax-due threshold is $2.47 million of annualized total revenue for 2024 and 2025 reports, and $2.65 million for 2026 reports.',
    sources: [src.franchise2026, src.ntd2024, src.p98806],
    status: 'confirmed',
    method: EXCERPT,
    note: 'The 2027 figure is its own entry, franchise-no-tax-due-2027: it is derived, not read.',
  },
  {
    id: 'franchise-no-tax-due-2027',
    topic: 'franchise',
    statement:
      'For 2027 reports the no-tax-due threshold stays at $2.65 million: Tax Code §171.006 adjusts it on January 1 of each even-numbered year, so the figure set for 2026 carries to 2027 reports until the 2028 adjustment.',
    sources: [src.franchise2026, src.taxCode171006],
    status: 'partial',
    method: DERIVED,
    checkedOn: '2026-09-27',
    note: 'The $2.47 million set for 2024 applied to both 2024 and 2025 reports, which fits the same schedule. Check the Comptroller’s 2027 report forms when they publish.',
  },
  {
    id: 'franchise-due-may-15',
    topic: 'franchise',
    statement:
      'Annual franchise tax reports are due May 15, or the next business day when May 15 falls on a weekend or legal holiday.',
    sources: [src.p98806],
    status: 'confirmed',
    method: EXCERPT,
  },
  {
    id: 'franchise-information-report',
    topic: 'franchise',
    statement:
      'For reports due on or after January 1, 2024, an entity at or below the threshold files no No Tax Due Report, but must still file a Public Information Report (Form 05-102) or an Ownership Information Report (Form 05-167). The OIR is confidential.',
    sources: [src.ntd2024, src.pirOir, src.p98806],
    status: 'confirmed',
    method: EXCERPT,
  },
  {
    id: 'franchise-llcs-taxable',
    topic: 'franchise',
    statement:
      'Franchise tax applies to each taxable entity formed or doing business in Texas, including single-member and multi-member LLCs.',
    sources: [src.p98806],
    status: 'confirmed',
    method: EXCERPT,
  },
  {
    id: 'franchise-combined-group',
    topic: 'franchise',
    statement:
      'Taxable entities in an affiliated group engaged in a unitary business file one combined report. The common owner holds more than 50% of each member, directly or indirectly; members use the same margin method; and the no-tax-due threshold applies to the group as a whole.',
    sources: [src.combinedFaq],
    status: 'confirmed',
    method: EXCERPT,
  },
  {
    id: 'veteran-owned-exemption',
    topic: 'franchise',
    statement:
      'A new veteran-owned business is exempt from franchise tax for its first five years. It must be 100% owned by one or more natural persons, each an honorably discharged veteran, with a Texas Veterans Commission verification letter for each owner. HB 346 (2025, effective September 1, 2025) made the exemption and the matching filing-fee waiver permanent.',
    sources: [src.veteran, src.legis2025, src.hb346],
    status: 'partial',
    method: THIRD_PARTY,
    note: 'Formation window: the Comptroller page excerpt says an entity formed on or after January 1, 2020 cannot qualify, while a bill summary says businesses formed on or after January 1, 2022 can under SB 938 (2021). Both can be true (a 2020–2021 gap), but confirm on the Comptroller page before relying on it. Any owner that is an entity, or any non-veteran member, disqualifies it.',
  },

  // ── Motor vehicles ─────────────────────────────────────────────────────────
  {
    id: 'vehicle-rental-tax-rates',
    topic: 'motor-vehicle',
    statement:
      'Companies that rent motor vehicles — cars, trucks, trailers, semi-trailers, motor homes and more — collect gross rental receipts tax: 10% of gross receipts on contracts of 1–30 days, less discounts and separately stated fees for insurance, fuel and damage assessments; 6.25% on contracts of 31–180 days.',
    sources: [src.grossRental, src.p96143],
    status: 'confirmed',
    method: EXCERPT,
    note: 'The excerpt states the deductions with the 1–30 day rate only. Whether the same deductions apply at 31–180 days was not settled (flagged by the 2026-09-27 refresh run).',
  },
  {
    id: 'rental-versus-lease',
    topic: 'motor-vehicle',
    statement:
      'A rental gives exclusive use for 180 days or less (or any period for re-rental). More than 180 days is an operating lease: no tax on the lease payments, and motor vehicle tax is due on the leasing company’s purchase price when it titles and registers the vehicle.',
    sources: [src.p96143, src.p96254leases],
    status: 'confirmed',
    method: EXCERPT,
  },
  {
    id: 'rental-permit-qualified',
    topic: 'motor-vehicle',
    statement:
      'A rental permit is "qualified" when the holder is the title owner of at least five different motor vehicles held for rental within a 12-month period (or is a licensed Texas dealer); it can then defer its minimum rental tax at titling. A non-qualified holder pays motor vehicle sales tax when it titles or registers a vehicle bought to rent.',
    sources: [src.p96254rent],
    status: 'confirmed',
    method: EXCERPT,
  },
  {
    id: 'vehicle-transfers-entities',
    topic: 'motor-vehicle',
    statement:
      'Transfers between an unincorporated company and its sole owner are not taxable. Transfers between a corporation and a stockholder are taxable whether or not consideration is paid. A partnership incorporating for stock alone, or converting to another entity type, owes no tax on its vehicles; a partner contributing a vehicle to an existing partnership does.',
    sources: [src.p96254sole, src.p96254entities, src.p96254partners],
    status: 'confirmed',
    method: EXCERPT,
    note: 'Pub 96-254 edition 3/2026. How an LLC-to-LLC transfer inside a holding structure lands is a question for the entity-structuring skill and a CPA, not this list.',
  },

  // ── Other ──────────────────────────────────────────────────────────────────
  {
    id: 'ifta-qualified-vehicle',
    topic: 'other',
    statement:
      'IFTA returns cover "qualified motor vehicles" only; a two-axle vehicle with a registered gross weight over 26,000 pounds is one qualifying case.',
    sources: [src.fuelsFaq],
    status: 'partial',
    method: EXCERPT,
    note: 'Read the full definition in the IFTA Texas Guidebook (96-336) before an interstate trip.',
  },
  {
    id: 'data-processing-80-percent',
    topic: 'other',
    statement:
      'Data processing services — including software as a service — are taxable, with 20% of the charge exempt, so 80% is taxed.',
    sources: [src.p94127],
    status: 'confirmed',
    method: EXCERPT,
  },
  {
    id: 'real-property-rent-not-taxable',
    topic: 'other',
    statement:
      'Renting an entire real property facility is not subject to sales tax; motor vehicle parking and storage, including leasing a parking facility, is.',
    sources: [src.starRent],
    status: 'partial',
    method: 'Summarised from Comptroller STAR letter rulings seen in search results; the rulings were not opened.',
    note: 'Letter rulings answer one taxpayer’s facts. Read the ruling, and check that no short-stay or parking element applies, before relying on it for a lease.',
  },
  {
    id: 'informant-recovery-program',
    topic: 'other',
    statement:
      'The Comptroller pays for information that leads to the recovery of state resources.',
    sources: [src.informant],
    status: 'partial',
    method: EXCERPT,
    note: 'The payment percentage was not found.',
  },
];

const BY_ID = new Map(LEDGER.map((fact) => [fact.id, fact]));

export function ledgerFact(id: string): LedgerFact | undefined {
  return BY_ID.get(id);
}

/**
 * When the given facts were checked, oldest first — usually just
 * LEDGER_CHECKED_ON. An answer quotes these rather than the one global date,
 * so a rule rechecked later never reads as older than it is, nor the reverse.
 */
export function checkedOnDates(ids: readonly string[]): string[] {
  const dates = new Set<string>();
  for (const id of ids) {
    const fact = BY_ID.get(id);
    if (fact) dates.add(fact.checkedOn ?? LEDGER_CHECKED_ON);
  }
  if (dates.size === 0) dates.add(LEDGER_CHECKED_ON);
  return [...dates].sort();
}

/** The weakest status among a set of facts — a conclusion is only as good as its worst input. */
export function weakestStatus(ids: readonly string[]): LedgerStatus {
  let worst: LedgerStatus = 'confirmed';
  for (const id of ids) {
    const status = BY_ID.get(id)?.status ?? 'unresolved';
    if (status === 'unresolved') return 'unresolved';
    if (status === 'partial') worst = 'partial';
  }
  return worst;
}
