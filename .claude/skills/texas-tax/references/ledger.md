<!-- Generated from src/lib/texas-tax by `pnpm texas-tax:render`. Do not edit by hand: a test fails when this file and the data disagree. -->

# The ledger: every rule, with its evidence

44 facts, checked 2026-09-26 and 2026-09-27: 38 confirmed, 5 partly confirmed, 1 not settled.

How they were checked matters. comptroller.texas.gov was blocked by the build environment’s network policy, so the pages were read through web-search excerpts, not opened in full. Where a fact is short of confirmed, the note says why. Code cites these by id — `src/lib/texas-tax/ledger.ts` — and a test fails if a cited id is missing.

## Contracting

### `residential-labor-not-taxable` — Confirmed

Labor to repair, remodel or restore residential real property is not taxable. Residential means family dwellings, including apartment complexes, nursing homes, condominiums and retirement homes.

- Sources: [Pub 94-116, Real Property Repair and Remodeling](https://comptroller.texas.gov/taxes/publications/94-116.php)
- How checked: Comptroller page read through a web-search excerpt; full text not opened (comptroller.texas.gov is blocked in the build environment).
- Note: A search excerpt of the same guidance lists homes, duplexes, apartments, nursing homes and retirement homes — "but not hotels". Treat hotels as nonresidential.

### `nonresidential-total-charge-taxable` — Confirmed

The total amount charged to remodel, repair or restore nonresidential real property is taxable — labor and materials. Examples: hospitals, office buildings, refineries, warehouses, parking garages, retail shops, restaurants and manufacturing facilities.

- Sources: [Pub 94-116, Real Property Repair and Remodeling](https://comptroller.texas.gov/taxes/publications/94-116.php); [Pub 94-157, Homebuilders and Real Property Services](https://comptroller.texas.gov/taxes/publications/94-157.php)
- How checked: Comptroller page read through a web-search excerpt; full text not opened (comptroller.texas.gov is blocked in the build environment).

### `new-construction-not-taxable` — Confirmed

No tax is due on labor to build new structures, residential or nonresidential.

- Sources: [Pub 94-116, Real Property Repair and Remodeling](https://comptroller.texas.gov/taxes/publications/94-116.php); [Pub 94-157, Homebuilders and Real Property Services](https://comptroller.texas.gov/taxes/publications/94-157.php)
- How checked: Comptroller page read through a web-search excerpt; full text not opened (comptroller.texas.gov is blocked in the build environment).

### `lump-sum-contractor-is-consumer` — Confirmed

Under a lump-sum contract — one price for labor and materials — the contractor pays tax on supplies, materials, equipment and taxable services when buying them, and charges the customer no tax. The contractor is the consumer of the materials.

- Sources: [Pub 94-116, Real Property Repair and Remodeling](https://comptroller.texas.gov/taxes/publications/94-116.php)
- How checked: Comptroller page read through a web-search excerpt; full text not opened (comptroller.texas.gov is blocked in the build environment).

### `separated-contract-contractor-is-retailer` — Confirmed

Under a separated contract the contractor gives suppliers resale certificates for materials incorporated into the customer’s property, then collects state and local tax from the customer on the materials charge, which must be at least what the contractor paid. Labor is not taxed. Surveying, landscaping, final cleanup and incorporated security systems can be bought the same way when separately identified to the customer.

- Sources: [Pub 94-116, Real Property Repair and Remodeling](https://comptroller.texas.gov/taxes/publications/94-116.php)
- How checked: Comptroller page read through a web-search excerpt; full text not opened (comptroller.texas.gov is blocked in the build environment).

### `nonresidential-resale-certificate` — Confirmed

On nonresidential repair and remodeling, the contractor may give suppliers resale certificates for materials that will be incorporated, and collects tax from the customer on the whole charge.

- Sources: [Pub 94-116, Real Property Repair and Remodeling](https://comptroller.texas.gov/taxes/publications/94-116.php)
- How checked: Comptroller page read through a web-search excerpt; full text not opened (comptroller.texas.gov is blocked in the build environment).

### `nonresidential-mixed-new-footage` — Confirmed

A single charge that both adds new square footage and remodels existing nonresidential space is presumed wholly taxable when the remodeling is more than 5% of the total, unless a reasonable charge for the taxable part is stated separately at the time. Contracts, bid sheets, tally sheets, schedules of values and blueprints can later establish the new-construction share.

- Sources: [Pub 94-116, Real Property Repair and Remodeling](https://comptroller.texas.gov/taxes/publications/94-116.php)
- How checked: Comptroller page read through a web-search excerpt; full text not opened (comptroller.texas.gov is blocked in the build environment).

### `multiple-use-property` — Confirmed

For property used both residentially and commercially, the Comptroller asks contractors to call for its multiple-use guidelines.

- Sources: [Pub 94-116, Real Property Repair and Remodeling](https://comptroller.texas.gov/taxes/publications/94-116.php)
- How checked: Comptroller page read through a web-search excerpt; full text not opened (comptroller.texas.gov is blocked in the build environment).

### `local-tax-job-site` — Confirmed

Local tax on nonresidential repair and remodeling is due based on the job site’s location, on the entire charge, whether it is billed separated or lump-sum.

- Sources: [Pub 94-105, Local Sales and Use Tax Collection](https://comptroller.texas.gov/taxes/publications/94-105.php); [Pub 94-116, Real Property Repair and Remodeling](https://comptroller.texas.gov/taxes/publications/94-116.php)
- How checked: Comptroller page read through a web-search excerpt; full text not opened (comptroller.texas.gov is blocked in the build environment).

### `debris-haul-off-taxable` — Confirmed

A charge to haul away debris is a taxable real property service, on homes as well as commercial property.

- Sources: [Pub 94-116, Real Property Repair and Remodeling](https://comptroller.texas.gov/taxes/publications/94-116.php); [Pub 94-157, Homebuilders and Real Property Services](https://comptroller.texas.gov/taxes/publications/94-157.php)
- How checked: Comptroller page read through a web-search excerpt; full text not opened (comptroller.texas.gov is blocked in the build environment).
- Note: The excerpts address a charge for haul-off. Whether debris removal folded into a lump-sum home price is separately taxable was not settled.

### `scheduled-maintenance` — Confirmed

Scheduled, periodic maintenance of nonresidential real property is not repair or remodeling and is not taxed as such, but it has to be proven with maintenance schedules, work orders or similar records. Adding new usable square footage is also not remodeling.

- Sources: [Pub 96-259, Taxable Services](https://comptroller.texas.gov/taxes/publications/96-259.php); [Pub 94-116, Real Property Repair and Remodeling](https://comptroller.texas.gov/taxes/publications/94-116.php)
- How checked: Comptroller page read through a web-search excerpt; full text not opened (comptroller.texas.gov is blocked in the build environment). The excerpt quotes 34 TAC §3.357.
- Note: Janitorial, landscaping and other listed real property services stay taxable whatever the schedule.

### `disaster-repair` — Confirmed

Labor to repair residential or nonresidential real property damaged in a declared disaster area is exempt; the materials are taxable. For nonresidential work the contractor must use a separated contract and take an exemption certificate from the customer for the labor, naming both parties, the items repaired and the reason (for example "Repair due to Hurricane Harvey in Galveston County"). On a lump-sum nonresidential contract the contractor collects tax on the whole charge.

- Sources: [Pub 94-182, Disasters and Texas Taxes](https://comptroller.texas.gov/taxes/publications/94-182.php)
- How checked: Comptroller page read through a web-search excerpt; full text not opened (comptroller.texas.gov is blocked in the build environment).

### `mold-remediation-split` — Confirmed

Mold remediation splits: containment set-up, protective equipment charges, and packing or storing contents are not taxable to the customer (the provider pays tax on the materials and equipment); cleaning furniture, clothing and drapes, and antimicrobial or deodorizing treatments of carpets and furniture, are taxable on homes and businesses alike.

- Sources: [Pub 94-187, Mold Remediation Services](https://comptroller.texas.gov/taxes/publications/94-187.php)
- How checked: Comptroller page read through a web-search excerpt; full text not opened (comptroller.texas.gov is blocked in the build environment).

### `government-customers` — Confirmed

No tax is charged on a job for a governmental agency — federal, the State of Texas, or Texas local government. Texas state and local governments, school districts and other political subdivisions are exempt by law and do not apply for exemption.

- Sources: [Pub 94-116, Real Property Repair and Remodeling](https://comptroller.texas.gov/taxes/publications/94-116.php); [Pub 96-1045, Guidelines to Texas Tax Exemptions](https://comptroller.texas.gov/taxes/publications/96-1045.php)
- How checked: Comptroller page read through a web-search excerpt; full text not opened (comptroller.texas.gov is blocked in the build environment).

### `exempt-organization-customers` — Confirmed

When the contract is with an exempt organization (holding the Comptroller’s exemption, with the work related to its exempt purpose), the contractor may give suppliers an exemption certificate for items completely consumed at the job site and for taxable services integral to the contract. The organization must give the contractor an exemption certificate.

- Sources: [Pub 94-116, Real Property Repair and Remodeling](https://comptroller.texas.gov/taxes/publications/94-116.php)
- How checked: Comptroller page read through a web-search excerpt; full text not opened (comptroller.texas.gov is blocked in the build environment).

### `exempt-lump-sum-materials` — Confirmed

On an exempt contract — an improvement to realty for a governmental entity (Tax Code §151.309) or an exempt organization (§151.310) — the contractor, lump-sum or not, may give suppliers exemption certificates for tangible personal property incorporated into the realty, for items necessary and essential to the contract that are consumed at the job site, and for taxable services performed there (§151.311). The customer documents the exempt contract by giving the contractor an exemption certificate.

- Sources: [STAR 202204001R, exemption certificates on an exempt contract](https://star.comptroller.texas.gov/view/202204001R); [Tax Code §151.311](https://statutes.capitol.texas.gov/Docs/TX/htm/TX.151.htm#151.311); [Pub 94-116, Real Property Repair and Remodeling](https://comptroller.texas.gov/taxes/publications/94-116.php)
- How checked: Comptroller STAR research documents and the Tax Code read through web-search excerpts on 2026-09-27, after the rest of this ledger; full text not opened.
- Note: Recorded as not settled until 2026-09-27: the first excerpts described only the separated route and consumables. The improvement must be for the exempt entity’s primary use and benefit; tools and equipment the contractor keeps are not covered.

### `resale-certificate-knowing-misuse` — Confirmed

A resale certificate issued knowing the item will be used rather than resold is invalid, and tax is due on the purchase. Depending on the amount, the offense ranges from a Class C misdemeanor to a second-degree felony.

- Sources: [Sales tax FAQ: resale certificates](https://comptroller.texas.gov/taxes/sales/faq/resale.php)
- How checked: Comptroller page read through a web-search excerpt; full text not opened (comptroller.texas.gov is blocked in the build environment).

### `taxable-purchases-use-tax` — Confirmed

Taxable items bought without paying tax — including items bought for resale or an exempt use and then used — are reported as taxable purchases on the sales and use tax return. When a buyer knows an item is not for resale, tax is paid at purchase.

- Sources: [Help: taxable purchases](https://comptroller.texas.gov/help/sales-tax/taxable-purchases.php); [Sales tax FAQ: resale certificates](https://comptroller.texas.gov/taxes/sales/faq/resale.php)
- How checked: Comptroller page read through a web-search excerpt; full text not opened (comptroller.texas.gov is blocked in the build environment).

### `online-purchases-use-tax` — Confirmed

A taxable item bought online from a seller that did not charge Texas tax owes use tax, shipping included, based on where it is first received, stored or used. A permit holder reports it under taxable purchases (Item 3) on the sales tax return.

- Sources: [Pub 94-171, Online Orders](https://comptroller.texas.gov/taxes/publications/94-171.php)
- How checked: Comptroller page read through a web-search excerpt; full text not opened (comptroller.texas.gov is blocked in the build environment).

### `rate-range` — Confirmed

The state rate is 6.25%. Cities, counties, special-purpose districts and transit authorities may add up to 2%, for a maximum combined rate of 8.25%. The Comptroller’s Sales Tax Rate Locator gives the rate for an address.

- Sources: [Sales tax FAQ: local tax](https://comptroller.texas.gov/taxes/sales/faq/local.php)
- How checked: Comptroller page read through a web-search excerpt; full text not opened (comptroller.texas.gov is blocked in the build environment).

### `manufactured-homes` — Not settled — check before relying on it

Whether repair labor on a manufactured or mobile home counts as residential real property work.

- Sources: [Pub 96-254, Manufactured housing and mobile homes](https://comptroller.texas.gov/taxes/publications/96-254/manufactured-mobile.php); [Pub 94-116, Real Property Repair and Remodeling](https://comptroller.texas.gov/taxes/publications/94-116.php)
- How checked: Comptroller page read through a web-search excerpt; full text not opened (comptroller.texas.gov is blocked in the build environment).
- Note: Manufactured housing built on or after March 1, 1982 is taxed on sale under the Manufactured Housing Sales and Use Tax Act; older mobile homes are motor vehicles. The excerpts point to how the home is classified and titled, and to asking the Comptroller.

## Filing, penalties and audits

### `sales-tax-due-dates` — Confirmed

Monthly returns are due the 20th of the following month. Quarterly returns are due April 20, July 20, October 20 and January 20. Yearly returns are due January 20. A due date on a Saturday, Sunday or legal holiday moves to the next working day. The Comptroller assigns the filing frequency by letter when the permit is approved.

- Sources: [Due dates for taxes and reports](https://comptroller.texas.gov/taxes/file-pay/due-dates.php); [Requirements for reporting and paying sales tax](https://comptroller.texas.gov/taxes/sales/filing-requirements.php)
- How checked: Comptroller page read through a web-search excerpt; full text not opened (comptroller.texas.gov is blocked in the build environment).

### `electronic-filing-thresholds` — Confirmed

Taxpayers who paid $100,000 or more must report electronically (Webfile or EDI); $500,000 or more in a specific tax must pay by TEXNET.

- Sources: [Requirements for reporting and paying sales tax](https://comptroller.texas.gov/taxes/sales/filing-requirements.php)
- How checked: Comptroller page read through a web-search excerpt; full text not opened (comptroller.texas.gov is blocked in the build environment).

### `late-penalties` — Confirmed

A $50 late filing penalty may be assessed on a return filed after the due date. Tax paid 1–30 days late carries a 5% penalty; more than 30 days, 10%; after the date on a Notice of Tax Due, another 10% (20% in all). Missing a required electronic filing adds 5%. Interest starts on the 61st day after the due date, at a rate reset every January 1.

- Sources: [Penalties for past due taxes](https://comptroller.texas.gov/taxes/file-pay/penalties.php); [Pub 98-918, Late Filing Penalties](https://comptroller.texas.gov/taxes/publications/98-918.pdf)
- How checked: Comptroller page read through a web-search excerpt; full text not opened (comptroller.texas.gov is blocked in the build environment).

### `timely-filing-discounts` — Confirmed

Filing and paying on time earns a discount of 0.5% of the tax collected. Monthly and quarterly filers who prepay a reasonable estimate — at least 90% of the period’s tax, or 100% of the same period last year — take a further 1.25%.

- Sources: [Sales tax FAQ: reporting and paying](https://comptroller.texas.gov/taxes/sales/faq/report-pay.php)
- How checked: Comptroller page read through a web-search excerpt; full text not opened (comptroller.texas.gov is blocked in the build environment).

### `voluntary-disclosure` — Confirmed

A voluntary disclosure agreement reports past unpaid or underpaid tax with penalties waived and, in most cases, interest too — except interest on tax that was collected and not remitted. The statute of limitations is generally four years.

- Sources: [Pub 96-576, Voluntary Disclosure Program](https://comptroller.texas.gov/taxes/publications/96-576.php)
- How checked: Comptroller page read through a web-search excerpt; full text not opened (comptroller.texas.gov is blocked in the build environment).

### `audit-redetermination` — Confirmed

After a Notice of Tax Due from an audit, a taxpayer normally has 30 days to request a redetermination hearing (20 days after a jeopardy determination). A refund hearing can be requested any time within the limitations period. Generally no tax may be assessed more than four years after it became due.

- Sources: [Pub 96-1253, Contesting Disagreed Audits](https://comptroller.texas.gov/taxes/publications/96-1253.pdf); [Auditing Fundamentals, chapter 8](https://comptroller.texas.gov/taxes/audit/manuals/fundamentals/ch8.php)
- How checked: Comptroller page read through a web-search excerpt; full text not opened (comptroller.texas.gov is blocked in the build environment).

### `records-four-years` — Confirmed

Keep tax records for at least four years.

- Sources: [Auditing Fundamentals, chapter 8](https://comptroller.texas.gov/taxes/audit/manuals/fundamentals/ch8.php)
- How checked: Comptroller page read through a web-search excerpt; full text not opened (comptroller.texas.gov is blocked in the build environment).

### `successor-liability` — Confirmed

A buyer of a business is liable for the seller’s unpaid taxes up to the purchase price unless a Certificate of No Tax Due is obtained before closing, and should withhold enough of the price to cover them until the seller produces one. Buyer and seller request it jointly on Form 86-114; it takes about 10 business days, or up to 90 when an audit is needed.

- Sources: [Pub 98-117, Buying an Existing Business](https://comptroller.texas.gov/taxes/publications/98-117.php)
- How checked: Comptroller page read through a web-search excerpt; full text not opened (comptroller.texas.gov is blocked in the build environment).

## Franchise tax

### `franchise-no-tax-due-threshold` — Confirmed

The no-tax-due threshold is $2.47 million of annualized total revenue for 2024 and 2025 reports, and $2.65 million for 2026 reports.

- Sources: [Franchise tax report forms for 2026](https://comptroller.texas.gov/taxes/franchise/forms/2026-franchise.php); [No tax due reporting for 2024 and later](https://comptroller.texas.gov/taxes/franchise/ntd-rpt-updates-2024.php); [Pub 98-806, Franchise Tax Overview](https://comptroller.texas.gov/taxes/publications/98-806.php)
- How checked: Comptroller page read through a web-search excerpt; full text not opened (comptroller.texas.gov is blocked in the build environment).
- Note: The 2027 figure is its own entry, franchise-no-tax-due-2027: it is derived, not read.

### `franchise-no-tax-due-2027` — Partly confirmed

For 2027 reports the no-tax-due threshold stays at $2.65 million: Tax Code §171.006 adjusts it on January 1 of each even-numbered year, so the figure set for 2026 carries to 2027 reports until the 2028 adjustment.

- Sources: [Franchise tax report forms for 2026](https://comptroller.texas.gov/taxes/franchise/forms/2026-franchise.php); [Tax Code §171.006](https://statutes.capitol.texas.gov/Docs/TX/htm/TX.171.htm#171.006)
- How checked: Derived on 2026-09-27 from two web-search excerpts — the Comptroller’s 2026 figure and Tax Code §171.006’s adjustment schedule. No page stating the figure itself was read; full text not opened.
- Note: The $2.47 million set for 2024 applied to both 2024 and 2025 reports, which fits the same schedule. Check the Comptroller’s 2027 report forms when they publish.

### `franchise-due-may-15` — Confirmed

Annual franchise tax reports are due May 15, or the next business day when May 15 falls on a weekend or legal holiday.

- Sources: [Pub 98-806, Franchise Tax Overview](https://comptroller.texas.gov/taxes/publications/98-806.php)
- How checked: Comptroller page read through a web-search excerpt; full text not opened (comptroller.texas.gov is blocked in the build environment).

### `franchise-information-report` — Confirmed

For reports due on or after January 1, 2024, an entity at or below the threshold files no No Tax Due Report, but must still file a Public Information Report (Form 05-102) or an Ownership Information Report (Form 05-167). The OIR is confidential.

- Sources: [No tax due reporting for 2024 and later](https://comptroller.texas.gov/taxes/franchise/ntd-rpt-updates-2024.php); [PIR and OIR filing requirements](https://comptroller.texas.gov/taxes/franchise/pir-oir-filing-req.php); [Pub 98-806, Franchise Tax Overview](https://comptroller.texas.gov/taxes/publications/98-806.php)
- How checked: Comptroller page read through a web-search excerpt; full text not opened (comptroller.texas.gov is blocked in the build environment).

### `franchise-llcs-taxable` — Confirmed

Franchise tax applies to each taxable entity formed or doing business in Texas, including single-member and multi-member LLCs.

- Sources: [Pub 98-806, Franchise Tax Overview](https://comptroller.texas.gov/taxes/publications/98-806.php)
- How checked: Comptroller page read through a web-search excerpt; full text not opened (comptroller.texas.gov is blocked in the build environment).

### `franchise-combined-group` — Confirmed

Taxable entities in an affiliated group engaged in a unitary business file one combined report. The common owner holds more than 50% of each member, directly or indirectly; members use the same margin method; and the no-tax-due threshold applies to the group as a whole.

- Sources: [Franchise tax FAQ: combined groups](https://comptroller.texas.gov/taxes/franchise/faq/combined.php)
- How checked: Comptroller page read through a web-search excerpt; full text not opened (comptroller.texas.gov is blocked in the build environment).

### `veteran-owned-exemption` — Partly confirmed

A new veteran-owned business is exempt from franchise tax for its first five years. It must be 100% owned by one or more natural persons, each an honorably discharged veteran, with a Texas Veterans Commission verification letter for each owner. HB 346 (2025, effective September 1, 2025) made the exemption and the matching filing-fee waiver permanent.

- Sources: [New veteran-owned businesses and franchise tax](https://comptroller.texas.gov/taxes/franchise/veteran-business.php); [2025 Legislative Update](https://comptroller.texas.gov/taxes/tax-policy-news/2025-august.php); [HB 346 (89th Leg., 2025) on LegiScan](https://legiscan.com/TX/bill/HB346/2025)
- How checked: Comptroller search excerpt plus third-party bill summaries; the Comptroller page itself was not opened.
- Note: Formation window: the Comptroller page excerpt says an entity formed on or after January 1, 2020 cannot qualify, while a bill summary says businesses formed on or after January 1, 2022 can under SB 938 (2021). Both can be true (a 2020–2021 gap), but confirm on the Comptroller page before relying on it. Any owner that is an entity, or any non-veteran member, disqualifies it.

## Motor vehicles

### `vehicle-rental-tax-rates` — Confirmed

Companies that rent motor vehicles — cars, trucks, trailers, semi-trailers, motor homes and more — collect gross rental receipts tax: 10% of gross receipts on contracts of 1–30 days, less discounts and separately stated fees for insurance, fuel and damage assessments; 6.25% on contracts of 31–180 days.

- Sources: [Motor vehicle gross rental receipts tax](https://comptroller.texas.gov/taxes/motor-vehicle/gross-rental.php); [Pub 96-143, Motor Vehicle Rental Tax Guide](https://comptroller.texas.gov/taxes/publications/96-143/)
- How checked: Comptroller page read through a web-search excerpt; full text not opened (comptroller.texas.gov is blocked in the build environment).
- Note: The excerpt states the deductions with the 1–30 day rate only. Whether the same deductions apply at 31–180 days was not settled (flagged by the 2026-09-27 refresh run).

### `rental-versus-lease` — Confirmed

A rental gives exclusive use for 180 days or less (or any period for re-rental). More than 180 days is an operating lease: no tax on the lease payments, and motor vehicle tax is due on the leasing company’s purchase price when it titles and registers the vehicle.

- Sources: [Pub 96-143, Motor Vehicle Rental Tax Guide](https://comptroller.texas.gov/taxes/publications/96-143/); [Pub 96-254, Leases](https://comptroller.texas.gov/taxes/publications/96-254/leases.php)
- How checked: Comptroller page read through a web-search excerpt; full text not opened (comptroller.texas.gov is blocked in the build environment).

### `rental-permit-qualified` — Confirmed

A rental permit is "qualified" when the holder is the title owner of at least five different motor vehicles held for rental within a 12-month period (or is a licensed Texas dealer); it can then defer its minimum rental tax at titling. A non-qualified holder pays motor vehicle sales tax when it titles or registers a vehicle bought to rent.

- Sources: [Pub 96-254, Purchases for rental](https://comptroller.texas.gov/taxes/publications/96-254/purchase-for-rent.php)
- How checked: Comptroller page read through a web-search excerpt; full text not opened (comptroller.texas.gov is blocked in the build environment).

### `vehicle-transfers-entities` — Confirmed

Transfers between an unincorporated company and its sole owner are not taxable. Transfers between a corporation and a stockholder are taxable whether or not consideration is paid. A partnership incorporating for stock alone, or converting to another entity type, owes no tax on its vehicles; a partner contributing a vehicle to an existing partnership does.

- Sources: [Pub 96-254, Sole owners](https://comptroller.texas.gov/taxes/publications/96-254/sole-owners.php); [Pub 96-254, Corporations and LLCs](https://comptroller.texas.gov/taxes/publications/96-254/corporations-llcs.php); [Pub 96-254, Partnerships](https://comptroller.texas.gov/taxes/publications/96-254/partnerships.php)
- How checked: Comptroller page read through a web-search excerpt; full text not opened (comptroller.texas.gov is blocked in the build environment).
- Note: Pub 96-254 edition 3/2026. How an LLC-to-LLC transfer inside a holding structure lands is a question for the entity-structuring skill and a CPA, not this list.

## Other

### `ifta-qualified-vehicle` — Partly confirmed

IFTA returns cover "qualified motor vehicles" only; a two-axle vehicle with a registered gross weight over 26,000 pounds is one qualifying case.

- Sources: [Fuels taxes FAQ](https://comptroller.texas.gov/taxes/fuels/faq.php)
- How checked: Comptroller page read through a web-search excerpt; full text not opened (comptroller.texas.gov is blocked in the build environment).
- Note: Read the full definition in the IFTA Texas Guidebook (96-336) before an interstate trip.

### `data-processing-80-percent` — Confirmed

Data processing services — including software as a service — are taxable, with 20% of the charge exempt, so 80% is taxed.

- Sources: [Pub 94-127, Data Processing Services are Taxable](https://comptroller.texas.gov/taxes/publications/94-127.php)
- How checked: Comptroller page read through a web-search excerpt; full text not opened (comptroller.texas.gov is blocked in the build environment).

### `real-property-rent-not-taxable` — Partly confirmed

Renting an entire real property facility is not subject to sales tax; motor vehicle parking and storage, including leasing a parking facility, is.

- Sources: [STAR letter ruling on renting real property](https://star.comptroller.texas.gov/view/201807006L)
- How checked: Summarised from Comptroller STAR letter rulings seen in search results; the rulings were not opened.
- Note: Letter rulings answer one taxpayer’s facts. Read the ruling, and check that no short-stay or parking element applies, before relying on it for a lease.

### `informant-recovery-program` — Partly confirmed

The Comptroller pays for information that leads to the recovery of state resources.

- Sources: [Pub 96-266, Informant's Recovery Program](https://comptroller.texas.gov/taxes/publications/96-266.pdf)
- How checked: Comptroller page read through a web-search excerpt; full text not opened (comptroller.texas.gov is blocked in the build environment).
- Note: The payment percentage was not found.
