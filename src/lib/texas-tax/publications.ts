/**
 * The Texas Comptroller's tax publication index, transcribed as published.
 *
 * This file is the index and nothing else — no judgement about who a
 * publication matters to (that lives in `profiles.ts`) and no rules drawn from
 * it (those live in `ledger.ts`, each with its evidence). Keeping the three
 * apart means a new edition of the index can be diffed against this file line
 * for line, without an opinion getting in the way.
 *
 * URLs: `urlChecked` is true only where that exact address was seen live on
 * comptroller.texas.gov while this was built. Every other address follows the
 * Comptroller's own pattern (`/taxes/publications/<number>.php`, or `.pdf`
 * where the index marks the entry PDF) and is labelled as such rather than
 * presented as known-good. A dead link is a small cost; a confident wrong one
 * teaches people to stop checking.
 */

export const TX_SUBJECTS = [
  '9-1-1 Emergency Communications',
  'Audit',
  'Cigarette, E-Cigarettes and Tobacco Products Tax',
  'Coin Operated Machines Tax',
  'Electronic Tax Reporting',
  'Exempt Organizations',
  'Fireworks Tax',
  'Franchise Tax',
  'Fuels Tax',
  'General',
  'Hotel Occupancy Tax',
  'Insurance Tax',
  'International Fuel Tax Agreement (IFTA)',
  'Local Government Assistance',
  'Local Sales and Use Tax',
  'Miscellaneous Gross Receipts Tax',
  'Mixed Beverage Taxes',
  'Motor Vehicle Sales Tax',
  'Oil Well Servicing',
  'Sales and Use Tax',
  'Voluntary Disclosure',
] as const;
export type TxSubject = (typeof TX_SUBJECTS)[number];

export function isTxSubject(value: string): value is TxSubject {
  return (TX_SUBJECTS as readonly string[]).includes(value);
}

export const PUBLICATIONS_INDEX_URL = 'https://comptroller.texas.gov/taxes/publications/';

export interface SpanishEdition {
  number: string;
  title: string;
  pdf: boolean;
  url: string;
  urlChecked: boolean;
}

export interface TxPublication {
  /**
   * Stable key: the publication number, or a slug for the index's handful of
   * unnumbered entries (legislative updates, the rate pages, a pointer).
   */
  key: string;
  /** Comptroller number, e.g. `94-116`. Null for unnumbered entries. */
  number: string | null;
  /** What the index shows in the number column when there is no number. */
  numberLabel?: string;
  title: string;
  /** Some publications are listed under more than one subject. */
  subjects: readonly TxSubject[];
  /** The index marks the entry "(PDF)". */
  pdf: boolean;
  /** Where to read it. Null only for the Local Government pointer. */
  url: string | null;
  urlChecked: boolean;
  spanish?: SpanishEdition;
  note?: string;
}

const BASE = 'https://comptroller.texas.gov/taxes/publications/';

/**
 * Addresses seen live on comptroller.texas.gov while this was built. Anything
 * not listed here is built from the pattern and marked unchecked.
 */
const CHECKED_URLS = new Set([
  `${BASE}94-116.php`,
  `${BASE}94-116s.php`,
  `${BASE}96-259.php`,
  `${BASE}94-124.php`,
  `${BASE}94-111.php`,
  `${BASE}94-157.php`,
  `${BASE}94-113.php`,
  `${BASE}94-112.php`,
  `${BASE}98-1018.php`,
  `${BASE}96-1331.php`,
  `${BASE}94-187.php`,
  `${BASE}98-709.php`,
  `${BASE}94-114.php`,
  `${BASE}94-182.php`,
  `${BASE}96-1045.php`,
  `${BASE}96-122.php`,
  `${BASE}94-105.php`,
  `${BASE}98-778.php`,
  `${BASE}96-211.php`,
  `${BASE}94-171.php`,
  `${BASE}94-108.php`,
  `${BASE}98-806.php`,
  `${BASE}98-117.php`,
  `${BASE}96-576.php`,
  `${BASE}94-166.php`,
  `${BASE}94-127.php`,
  `${BASE}94-109.php`,
  `${BASE}96-141.php`,
  `${BASE}98-862.pdf`,
  `${BASE}98-918.pdf`,
  `${BASE}96-1253.pdf`,
  `${BASE}96-145.pdf`,
  `${BASE}96-266.pdf`,
  `${BASE}96-336.pdf`,
  `${BASE}96-256.pdf`,
  `${BASE}96-143/`,
  `${BASE}96-254/`,
  'https://comptroller.texas.gov/taxes/tax-policy-news/2021-august.php',
  'https://comptroller.texas.gov/taxes/tax-policy-news/2025-august.php',
  'https://comptroller.texas.gov/taxes/sales/',
  'https://comptroller.texas.gov/taxes/sales/docs/city-rates.pdf',
]);

function located(url: string): { url: string; urlChecked: boolean } {
  return { url, urlChecked: CHECKED_URLS.has(url) };
}

/** Pattern address for a numbered publication. */
function patternUrl(number: string, pdf: boolean): string {
  return `${BASE}${number}${pdf ? '.pdf' : '.php'}`;
}

interface Entry {
  number: string;
  title: string;
  subjects: TxSubject[];
  pdf?: boolean;
  /** Multi-page guides live at `<number>/` rather than `<number>.php`. */
  guide?: boolean;
  es?: { title: string; pdf?: boolean };
}

function numbered(e: Entry): TxPublication {
  const pdf = e.pdf ?? false;
  const address = e.guide ? `${BASE}${e.number}/` : patternUrl(e.number, pdf);
  const pub: TxPublication = {
    key: e.number,
    number: e.number,
    title: e.title,
    subjects: e.subjects,
    pdf,
    ...located(address),
  };
  if (e.es) {
    const esNumber = `${e.number}s`;
    const esPdf = e.es.pdf ?? false;
    pub.spanish = {
      number: esNumber,
      title: e.es.title,
      pdf: esPdf,
      ...located(patternUrl(esNumber, esPdf)),
    };
  }
  return pub;
}

const TAX_POLICY_NEWS = 'https://comptroller.texas.gov/taxes/tax-policy-news/';

export const TX_PUBLICATIONS: readonly TxPublication[] = [
  numbered({
    number: '94-167',
    title: 'Texas 9-1-1 Emergency Service Fee and 9-1-1 Equalization Surcharge',
    subjects: ['9-1-1 Emergency Communications'],
  }),
  numbered({
    number: '96-1253',
    title: 'Contesting Disagreed Audits, Examinations and Refund Denials',
    subjects: ['Audit'],
    pdf: true,
    es: { title: 'Disputando el Desacuerdo de Auditorías, Examinaciones y Reembolsos Denegados' },
  }),
  numbered({
    number: '96-266',
    title: "Informant's Recovery Program",
    subjects: ['Audit'],
    pdf: true,
  }),
  numbered({ number: '96-146', title: 'Notice of Routine Audit', subjects: ['Audit'], pdf: true }),
  numbered({
    number: '98-630',
    title: "Cigarette and Tobacco Products Manufacturers' Responsibilities",
    subjects: ['Cigarette, E-Cigarettes and Tobacco Products Tax'],
  }),
  numbered({
    number: '96-256',
    title: 'Coin-Operated Amusement Machine Regulation and Taxation',
    subjects: ['Coin Operated Machines Tax'],
    pdf: true,
    es: { title: 'Reglamentación e Impuestos Sobre Máquinas Tragamonedas' },
  }),
  numbered({
    number: '98-849',
    title: 'Filing and Paying Your Texas Taxes Electronically',
    subjects: ['Electronic Tax Reporting'],
    pdf: true,
  }),
  numbered({
    number: '96-590',
    title: 'TEXNET Payment Instructions Booklet',
    subjects: ['Electronic Tax Reporting'],
    pdf: true,
  }),
  numbered({
    number: '96-1045',
    title: 'Guidelines to Texas Tax Exemptions',
    subjects: ['Exempt Organizations'],
  }),
  numbered({
    number: '96-224',
    title: 'Hotel Occupancy Tax Exemptions',
    subjects: ['Exempt Organizations', 'Hotel Occupancy Tax'],
    es: { title: 'Exenciones de Impuestos para la Ocupación de Hoteles' },
  }),
  numbered({
    number: '96-122',
    title: 'Nonprofit and Exempt Organizations – Purchases and Sales',
    subjects: ['Exempt Organizations'],
  }),
  numbered({
    number: '94-166',
    title: 'Property Tax Exemption for Organizations Engaged in Charitable Activities',
    subjects: ['Exempt Organizations'],
  }),
  numbered({
    number: '94-183',
    title: 'School Fundraisers',
    subjects: ['Exempt Organizations', 'Sales and Use Tax'],
  }),
  numbered({
    number: '94-162',
    title: 'Fireworks and Texas Taxes',
    subjects: ['Fireworks Tax'],
    es: { title: 'Fuegos Artificiales e Impuestos de Texas' },
  }),
  numbered({ number: '98-806', title: 'Franchise Tax Overview', subjects: ['Franchise Tax'] }),
  numbered({
    number: '98-862',
    title: 'Franchise Tax Reporting Tips for Combined Groups',
    subjects: ['Franchise Tax'],
    pdf: true,
  }),
  numbered({
    number: '98-723',
    title: 'Reminder to Dyed Diesel Fuel Bonded Users Recordkeeping Requirements',
    subjects: ['Fuels Tax'],
  }),
  numbered({ number: '98-823', title: 'Sale of Dyed Diesel Fuel', subjects: ['Fuels Tax'], pdf: true }),
  numbered({
    number: '96-1202',
    title: 'State of Texas Motor Fuel Tax Requirements for Motor Carriers Domiciled in Mexico',
    subjects: ['Fuels Tax'],
    pdf: true,
    es: { title: 'Transportista Domiciliado en Mexico', pdf: true },
  }),
  {
    key: '2021-legislative-update',
    number: null,
    title: '2021 Legislative Update',
    subjects: ['General'],
    pdf: false,
    ...located(`${TAX_POLICY_NEWS}2021-august.php`),
  },
  {
    key: '2023-legislative-update',
    number: null,
    title: '2023 Legislative Update',
    subjects: ['General'],
    pdf: false,
    ...located(TAX_POLICY_NEWS),
    note: 'Its own page was not seen; this points at Tax Policy News, where the update is published.',
  },
  {
    key: '2025-legislative-update',
    number: null,
    title: '2025 Legislative Update',
    subjects: ['General'],
    pdf: false,
    ...located(`${TAX_POLICY_NEWS}2025-august.php`),
  },
  numbered({
    number: '96-1774',
    title: 'A Field Guide to the Taxes of Texas',
    subjects: ['General'],
    pdf: true,
  }),
  numbered({
    number: '98-117',
    title: 'Buying An Existing Business',
    subjects: ['General'],
    es: { title: 'Comprando un Negocio Existente' },
  }),
  numbered({
    number: '94-182',
    title: 'Disasters and Texas Taxes',
    subjects: ['General'],
    es: { title: 'Desastres e Impuestos de Texas' },
  }),
  numbered({
    number: '96-1789',
    title: 'Frequently Asked Questions Related to Motions for Rehearing',
    subjects: ['General'],
    pdf: true,
  }),
  numbered({ number: '98-304', title: 'Interest Owed and Earned', subjects: ['General'] }),
  numbered({ number: '98-918', title: 'Late Filing Penalties', subjects: ['General'], pdf: true }),
  numbered({
    number: '96-145',
    title: 'Rules of Practice and Procedure',
    subjects: ['General'],
    pdf: true,
  }),
  {
    ...numbered({ number: '96-385', title: 'Tax Policy News', subjects: ['General'] }),
    ...located(TAX_POLICY_NEWS),
    note: 'A monthly newsletter; this points at its index rather than a single issue.',
  },
  numbered({ number: '96-265', title: 'Taxpayer Bill of Rights', subjects: ['General'] }),
  numbered({
    number: '96-667',
    title: 'Motor Vehicle Crime Prevention Authority (MVCPA) Fee',
    subjects: ['Insurance Tax'],
  }),
  numbered({
    number: '94-431',
    title:
      'Guidelines for Premium Tax Compliance with the Nonadmitted and Reinsurance Reform Act',
    subjects: ['Insurance Tax'],
  }),
  numbered({
    number: '94-130',
    title: 'Insurance Maintenance Tax Rates, Surcharges, Fees and Assessments',
    subjects: ['Insurance Tax'],
  }),
  numbered({ number: '94-142', title: 'Surplus Lines Tax Exemptions', subjects: ['Insurance Tax'] }),
  numbered({
    number: '98-376',
    title: 'Tax on Independently Procured Insurance',
    subjects: ['Insurance Tax'],
    pdf: true,
  }),
  numbered({
    number: '94-169',
    title: 'Volunteer Fire Department Assistance Fund Assessment',
    subjects: ['Insurance Tax'],
  }),
  numbered({
    number: '96-336',
    title: 'IFTA Texas Guidebook',
    subjects: ['International Fuel Tax Agreement (IFTA)'],
    pdf: true,
    es: { title: 'IFTA Guía de Texas', pdf: true },
  }),
  {
    key: 'local-government-assistance',
    number: null,
    title:
      'For publications related to Local Government Assistance, see Local Government under Economy.',
    subjects: ['Local Government Assistance'],
    pdf: false,
    url: null,
    urlChecked: false,
    note: 'A pointer in the index, not a publication.',
  },
  numbered({
    number: '94-105',
    title: 'Local Sales and Use Tax Collection – A Guide for Sellers',
    subjects: ['Local Sales and Use Tax'],
    es: {
      title:
        'Recaudación de Impuestos Locales Sobre las Ventas y el Uso – Una Guía para Vendedores',
    },
  }),
  numbered({
    number: '96-339',
    title: 'Jurisdictions That Impose Local Sales Tax on Telecommunications Services',
    subjects: ['Local Sales and Use Tax', 'Sales and Use Tax'],
  }),
  numbered({
    number: '96-1309',
    title: 'Texas Tax Information for Retail Sellers of Electricity',
    subjects: ['Miscellaneous Gross Receipts Tax'],
    pdf: true,
  }),
  numbered({
    number: '96-1780',
    title: 'Mixed Beverage Taxes: What You Can Expect',
    subjects: ['Mixed Beverage Taxes'],
    pdf: true,
  }),
  numbered({
    number: '96-141',
    title: 'Fair Market Value Deduction',
    subjects: ['Motor Vehicle Sales Tax'],
  }),
  numbered({
    number: '98-805',
    title: 'Motorcycles, Autocycles, and Off-Highway Vehicles - Which Texas Tax is Due?',
    subjects: ['Motor Vehicle Sales Tax'],
  }),
  numbered({
    number: '96-143',
    title: 'Motor Vehicle Rental Tax Guide',
    subjects: ['Motor Vehicle Sales Tax'],
    guide: true,
  }),
  numbered({
    number: '98-298',
    title: 'Motor Vehicle Sales Tax Warning Poster',
    subjects: ['Motor Vehicle Sales Tax'],
    pdf: true,
    es: {
      title: 'Cartel de Advertencia de Impuestos Sobre las Ventas de Vehículos de Motor',
      pdf: true,
    },
  }),
  numbered({
    number: '96-254',
    title: 'Motor Vehicle Tax Guide',
    subjects: ['Motor Vehicle Sales Tax'],
    guide: true,
  }),
  numbered({
    number: '98-820',
    title: 'Related Finance Companies and Seller-Financed Sales',
    subjects: ['Motor Vehicle Sales Tax'],
  }),
  numbered({
    number: '96-199',
    title: 'Texas Occupation Tax for Oil and Gas Well Services',
    subjects: ['Oil Well Servicing'],
  }),
  numbered({
    number: '94-168',
    title: 'Aircraft and Texas Sales and Use Tax',
    subjects: ['Sales and Use Tax'],
  }),
  numbered({ number: '94-139', title: 'Bottlers', subjects: ['Sales and Use Tax'] }),
  numbered({
    number: '98-709',
    title: 'Carpet Cleaning and Related Services',
    subjects: ['Sales and Use Tax'],
  }),
  numbered({
    number: '94-111',
    title: 'Cleaning and Janitorial Services',
    subjects: ['Sales and Use Tax'],
    es: { title: 'Servicios de Limpieza' },
  }),
  numbered({ number: '94-106', title: 'Credit Reporting Services', subjects: ['Sales and Use Tax'] }),
  numbered({
    number: '94-127',
    title: 'Data Processing Services are Taxable',
    subjects: ['Sales and Use Tax'],
  }),
  numbered({ number: '94-107', title: 'Debt Collection Services', subjects: ['Sales and Use Tax'] }),
  numbered({ number: '94-143', title: 'Draftsmen and Designers', subjects: ['Sales and Use Tax'] }),
  numbered({
    number: '98-1017',
    title: 'Emergency Preparation Supplies Sales Tax Holiday',
    subjects: ['Sales and Use Tax'],
    es: { title: 'Compras Libres de Impuestos en Provisiones de Emergencia' },
  }),
  numbered({
    number: '96-1331',
    title: 'Energy Star Sales Tax Holiday',
    subjects: ['Sales and Use Tax'],
    es: { title: 'ENERGY STAR Fin de Semana Libre de Impuestos Sobre Las Ventas' },
  }),
  numbered({
    number: '94-108',
    title: 'Engaged in Business',
    subjects: ['Sales and Use Tax'],
    es: { title: 'Involucrado en Actividad Comercial' },
  }),
  numbered({
    number: '96-211',
    title: 'Fairs, Festivals, Markets and Shows',
    subjects: ['Sales and Use Tax'],
    es: { title: 'Ferias, Festivales, Mercados y Espectáculos' },
  }),
  numbered({
    number: '94-104',
    title: 'Film, Video and Audio Production Companies and Broadcasting Companies',
    subjects: ['Sales and Use Tax'],
  }),
  numbered({
    number: '94-437',
    title: 'Garage Sales and Occasional Sales',
    subjects: ['Sales and Use Tax'],
    es: { title: 'Ventas de Garaje y Ventas Ocasionales' },
  }),
  numbered({
    number: '96-280',
    title: 'Grocery and Convenience Stores',
    subjects: ['Sales and Use Tax'],
    es: { title: 'Supermercados y Tiendas de Conveniencia' },
  }),
  numbered({
    number: '94-157',
    title: 'Homebuilders and Real Property Services',
    subjects: ['Sales and Use Tax'],
    es: { title: 'Constructores de Viviendas y Servicios de Bienes Raíces' },
  }),
  numbered({ number: '94-109', title: 'Information Services', subjects: ['Sales and Use Tax'] }),
  numbered({
    number: '94-112',
    title: 'Landscaping and Lawn Care Services',
    subjects: ['Sales and Use Tax'],
    es: { title: 'Servicios de Ajardinar y Mantenimiento del Césped' },
  }),
  numbered({ number: '94-124', title: 'Manufacturing Exemptions', subjects: ['Sales and Use Tax'] }),
  numbered({ number: '94-187', title: 'Mold Remediation Services', subjects: ['Sales and Use Tax'] }),
  numbered({
    number: '94-113',
    title: 'Motor Vehicle Repairs, Remodels and Maintenance',
    subjects: ['Sales and Use Tax'],
    es: { title: 'Reparaciones, Mantenimiento y Remodelaciones de Vehículos de Motor' },
  }),
  numbered({
    number: '98-778',
    title: 'Motor Vehicle Dealers – Business Expenses',
    subjects: ['Sales and Use Tax'],
  }),
  numbered({ number: '94-438', title: 'Off-Highway Vehicles', subjects: ['Sales and Use Tax'] }),
  numbered({
    number: '94-171',
    title: 'Online Orders – Texas Purchasers and Sellers',
    subjects: ['Sales and Use Tax'],
  }),
  numbered({ number: '94-179', title: 'Out-of-State Wineries', subjects: ['Sales and Use Tax'] }),
  numbered({ number: '94-114', title: 'Pest Control Services', subjects: ['Sales and Use Tax'] }),
  numbered({
    number: '94-164',
    title: 'Ready-Mix Concrete Sales, Delivery and Pumping Services',
    subjects: ['Sales and Use Tax'],
  }),
  numbered({
    number: '94-116',
    title: 'Real Property Repair and Remodeling',
    subjects: ['Sales and Use Tax'],
    es: { title: 'Reparación y Remodelación de Bienes Raíces' },
  }),
  numbered({
    number: '94-117',
    title: 'Restaurants and the Texas Sales Tax',
    subjects: ['Sales and Use Tax'],
    es: { title: 'Restaurantes y el Impuesto Sobre la Venta en Texas' },
  }),
  {
    key: 'rate-charts',
    number: null,
    numberLabel: 'Charts',
    title: 'Sales & Use Tax Rate Charts',
    subjects: ['Sales and Use Tax'],
    pdf: false,
    ...located('https://comptroller.texas.gov/taxes/sales/docs/city-rates.pdf'),
    note: 'Mapped to the Comptroller rate chart seen live; the index link itself was not visible.',
  },
  numbered({
    number: '94-155',
    title: 'Sales Tax Exemptions for Healthcare Items',
    subjects: ['Sales and Use Tax'],
  }),
  numbered({
    number: '98-490',
    title: 'Sales Tax Holiday',
    subjects: ['Sales and Use Tax'],
    es: { title: 'Fin de Semana Libre de Impuestos Sobre las Ventas' },
  }),
  numbered({
    number: '94-132',
    title: 'Sales Tax on Telecommunications Services',
    subjects: ['Sales and Use Tax'],
  }),
  numbered({ number: '94-119', title: 'Security Services', subjects: ['Sales and Use Tax'] }),
  numbered({
    number: '96-273',
    title: 'Tax Exemptions for People with Disabilities',
    subjects: ['Sales and Use Tax'],
    es: { title: 'Exenciones de Impuestos para Personas con Discapacidades' },
  }),
  numbered({
    number: '96-259',
    title: 'Taxable Services',
    subjects: ['Sales and Use Tax'],
    es: { title: 'Servicios Imponibles' },
  }),
  numbered({
    number: '96-1112',
    title: 'Texas Agricultural Tax Exemptions',
    subjects: ['Sales and Use Tax'],
    pdf: true,
  }),
  {
    key: 'sales-tax-rates',
    number: null,
    title: 'Texas Sales Tax Rates',
    subjects: ['Sales and Use Tax'],
    pdf: false,
    ...located('https://comptroller.texas.gov/taxes/sales/'),
    note: 'Mapped to the Comptroller sales tax page (rates and the address rate locator).',
  },
  numbered({
    number: '98-924',
    title: 'Texas Timber Sales Tax Exemptions',
    subjects: ['Sales and Use Tax'],
    pdf: true,
  }),
  numbered({
    number: '94-123',
    title: 'Water and Wastewater Systems',
    subjects: ['Sales and Use Tax'],
    pdf: true,
  }),
  numbered({
    number: '98-1018',
    title: 'Water-Efficient Products Sales Tax Holiday',
    subjects: ['Sales and Use Tax'],
    es: { title: 'Fin de Semana Libre del Impuestos Sobre las Ventas para Productos Eficientes de Agua' },
  }),
  numbered({
    number: '96-576',
    title: 'Voluntary Disclosure Program',
    subjects: ['Voluntary Disclosure'],
  }),
];
