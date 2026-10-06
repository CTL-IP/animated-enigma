<!-- Generated from src/lib/texas-tax by `pnpm texas-tax:render`. Do not edit by hand: a test fails when this file and the data disagree. -->

# Obligations by kind of business

What each kind of business does under the Texas rules in the ledger. **Rule** items are backed by ledger facts and carry the weakest status among them; **Read first** items claim nothing beyond pointing at the publications to read before acting. A group of companies maps each company onto one or more of these profiles.

## Every Texas entity

Profile id: `every-entity`

### File the franchise tax information report by May 15

*Rule — Confirmed.* Every LLC files a Public Information Report or Ownership Information Report by May 15, even in a year no tax is due. A franchise tax report with tax is due only above the no-tax-due threshold — $2.65 million of annualized revenue for 2026 reports.

Publications: [98-806](https://comptroller.texas.gov/taxes/publications/98-806.php)

Ledger: `franchise-llcs-taxable`, `franchise-information-report`, `franchise-no-tax-due-threshold`, `franchise-due-may-15`

### Check whether affiliated companies report as one combined group

*Rule — Confirmed.* Companies under more than 50% common ownership that run a unitary business file one combined report, and the no-tax-due threshold then applies to their combined revenue. Whether a group is unitary is a judgement to make with a CPA.

Publications: [98-862](https://comptroller.texas.gov/taxes/publications/98-862.pdf)

Ledger: `franchise-combined-group`

### Report use tax on untaxed purchases

*Rule — Confirmed.* Anything taxable bought online without Texas tax, and anything bought tax-free and then used rather than resold, goes on the sales tax return as taxable purchases.

Publications: [94-171](https://comptroller.texas.gov/taxes/publications/94-171.php)

Ledger: `online-purchases-use-tax`, `taxable-purchases-use-tax`

### File and pay on time

*Rule — Confirmed.* On-time filing earns 0.5% of the tax collected. Late payment costs 5% (1–30 days) or 10% (over 30), a $50 late-filing penalty may be added, and interest starts on day 61.

Publications: [98-918](https://comptroller.texas.gov/taxes/publications/98-918.pdf), [98-304](https://comptroller.texas.gov/taxes/publications/98-304.php)

Ledger: `sales-tax-due-dates`, `timely-filing-discounts`, `late-penalties`

### Keep records for four years

*Rule — Confirmed.* Four years is the general limit on assessments, so it is the minimum retention. If an audit goes against you, there are 30 days from the Notice of Tax Due to request a redetermination.

Publications: [96-1253](https://comptroller.texas.gov/taxes/publications/96-1253.pdf), [96-146](https://comptroller.texas.gov/taxes/publications/96-146.pdf)

Ledger: `records-four-years`, `audit-redetermination`

### Before buying a business, get a Certificate of No Tax Due

*Rule — Confirmed.* Without one, the buyer inherits the seller’s unpaid tax up to the purchase price. Request it jointly on Form 86-114 before closing and hold back enough of the price until it arrives.

Publications: [98-117](https://comptroller.texas.gov/taxes/publications/98-117.php)

Ledger: `successor-liability`

### Put past under-reporting right through voluntary disclosure

*Rule — Confirmed.* A voluntary disclosure agreement waives penalties and usually interest on past periods, generally reaching back four years.

Publications: [96-576](https://comptroller.texas.gov/taxes/publications/96-576.php)

Ledger: `voluntary-disclosure`

## Contractor — repair, remodeling and new construction

Profile id: `contractor`

### Settle the tax treatment before pricing the job

*Rule — Confirmed.* Two questions decide it: is the property residential or nonresidential, and is the contract lump-sum or separated? Home repair and all new construction carry no tax on labor; nonresidential remodeling is taxed on the whole charge.

Publications: [94-116](https://comptroller.texas.gov/taxes/publications/94-116.php), [94-157](https://comptroller.texas.gov/taxes/publications/94-157.php)

Ledger: `residential-labor-not-taxable`, `nonresidential-total-charge-taxable`, `new-construction-not-taxable`, `lump-sum-contractor-is-consumer`, `separated-contract-contractor-is-retailer`

### Use a resale certificate only for materials you resell

*Rule — Confirmed.* On a separated contract or a nonresidential job you resell the incorporated materials, so a resale certificate is right. On a lump-sum home job you are the consumer: pay the tax at the register, or, if it was bought tax-free, report it as taxable purchases on the return. Issuing a resale certificate for materials you know you will consume is an offense.

Publications: [94-116](https://comptroller.texas.gov/taxes/publications/94-116.php)

Ledger: `separated-contract-contractor-is-retailer`, `nonresidential-resale-certificate`, `lump-sum-contractor-is-consumer`, `taxable-purchases-use-tax`, `resale-certificate-knowing-misuse`

### Charge the job site’s rate on nonresidential work

*Rule — Confirmed.* Local tax on nonresidential remodeling follows the job site, not your office. Look up the address: 6.25% state plus up to 2% local.

Publications: [94-105](https://comptroller.texas.gov/taxes/publications/94-105.php), [Texas Sales Tax Rates](https://comptroller.texas.gov/taxes/sales/)

Ledger: `local-tax-job-site`, `rate-range`

### Tax a separate debris haul-off charge

*Rule — Confirmed.* Haul-off is a taxable real property service, on a home job too.

Publications: [94-157](https://comptroller.texas.gov/taxes/publications/94-157.php)

Ledger: `debris-haul-off-taxable`

### Split new footage from remodeling on commercial jobs

*Rule — Confirmed.* When one price covers both and the remodeling is more than 5% of it, the whole price is presumed taxable. State a reasonable charge for the remodeling separately, at the time.

Publications: [94-116](https://comptroller.texas.gov/taxes/publications/94-116.php)

Ledger: `nonresidential-mixed-new-footage`

### Keep the schedule for commercial maintenance work

*Rule — Confirmed.* Scheduled, periodic maintenance is not taxed as remodeling, but only with maintenance schedules or work orders to prove it.

Publications: [94-116](https://comptroller.texas.gov/taxes/publications/94-116.php)

Ledger: `scheduled-maintenance`

### Disaster-area repairs: separate the labor

*Rule — Confirmed.* Repair labor in a declared disaster area is exempt and materials are not. On a commercial job that takes a separated contract and the customer’s exemption certificate — a lump-sum price is taxed in full.

Publications: [94-182](https://comptroller.texas.gov/taxes/publications/94-182.php)

Ledger: `disaster-repair`

### Water and mold jobs: price the taxable pieces separately

*Rule — Confirmed.* Containment and storage aren’t taxable to the customer; cleaning contents and antimicrobial treatments are.

Publications: [94-187](https://comptroller.texas.gov/taxes/publications/94-187.php)

Ledger: `mold-remediation-split`

### Mixed-use buildings and manufactured homes: ask before pricing

*Rule — Not settled — check before relying on it.* The Comptroller asks contractors to call for its multiple-use guidelines, and whether a manufactured home is residential real property depends on how it is classified.

Publications: [94-116](https://comptroller.texas.gov/taxes/publications/94-116.php), [96-254](https://comptroller.texas.gov/taxes/publications/96-254/)

Ledger: `multiple-use-property`, `manufactured-homes`

## Work for government and exempt customers

Profile id: `government-work`

### No tax to government customers

*Rule — Confirmed.* Federal, State of Texas and Texas local government jobs carry no tax. Texas governments and school districts are exempt by law without applying.

Publications: [94-116](https://comptroller.texas.gov/taxes/publications/94-116.php), [96-1045](https://comptroller.texas.gov/taxes/publications/96-1045.php)

Ledger: `government-customers`

### Collect the exemption certificate from exempt organizations

*Rule — Confirmed.* A church, school or charity must give you an exemption certificate, and the work has to relate to its exempt purpose. You can then give suppliers an exemption certificate for items used up on the job.

Publications: [96-122](https://comptroller.texas.gov/taxes/publications/96-122.php), [96-1045](https://comptroller.texas.gov/taxes/publications/96-1045.php)

Ledger: `exempt-organization-customers`

### Exempt and government work: buy the materials without tax

*Rule — Confirmed.* On an exempt contract the incorporated materials go untaxed either way — lump-sum, on an exemption certificate to your suppliers (Tax Code §151.311); separated, on a resale certificate. Get the customer’s certificate documenting the exempt contract, and don’t price tax into the materials.

Publications: [94-116](https://comptroller.texas.gov/taxes/publications/94-116.php)

Ledger: `separated-contract-contractor-is-retailer`, `exempt-lump-sum-materials`

## Vehicle rental company

Profile id: `vehicle-rental`

### Collect rental tax on every rental

*Rule — Confirmed.* Hold a motor vehicle rental tax permit and collect 10% on contracts of 1–30 days, 6.25% on 31–180 days. Trailers count. Check the exemptions in 96-143 before treating any rental as untaxed.

Publications: [96-143](https://comptroller.texas.gov/taxes/publications/96-143/)

Ledger: `vehicle-rental-tax-rates`

### Over 180 days is a lease, not a rental

*Rule — Confirmed.* A lease carries no tax on the payments; tax is paid on the vehicle’s purchase price when it is titled. Contract length decides which regime applies.

Publications: [96-143](https://comptroller.texas.gov/taxes/publications/96-143/), [96-254](https://comptroller.texas.gov/taxes/publications/96-254/)

Ledger: `rental-versus-lease`

### Under five rental vehicles, pay the sales tax at titling

*Rule — Confirmed.* A qualified permit needs at least five vehicles titled for rental in 12 months. Below that the permit is non-qualified and motor vehicle sales tax is paid when each vehicle is titled.

Publications: [96-254](https://comptroller.texas.gov/taxes/publications/96-254/)

Ledger: `rental-permit-qualified`

### Moving a vehicle into or between companies can be taxable

*Rule — Confirmed.* Only a few transfers are tax-free: between a sole owner and their own unincorporated company, or a partnership incorporating or converting. A transfer between a corporation and its stockholder is taxable either way. Plan the transfer before titling, and take LLC-to-LLC moves to a CPA.

Publications: [96-254](https://comptroller.texas.gov/taxes/publications/96-254/)

Ledger: `vehicle-transfers-entities`

## Holding company and real estate owner

Profile id: `holding-real-estate`

### Decide the combined-group question with a CPA

*Rule — Confirmed.* A holding company is a taxable entity itself, and with companies it controls more than 50% of in a unitary business it may have to file one combined report.

Publications: [98-806](https://comptroller.texas.gov/taxes/publications/98-806.php), [98-862](https://comptroller.texas.gov/taxes/publications/98-862.pdf)

Ledger: `franchise-llcs-taxable`, `franchise-combined-group`

### Rent from real property isn’t taxed; parking is

*Rule — Partly confirmed.* Renting out a whole property carries no sales tax; charging for vehicle parking or storage does.

Ledger: `real-property-rent-not-taxable`

### Expect tax on commercial remodeling of property you own

*Rule — Confirmed.* A contractor remodeling a commercial building you own charges tax on the whole job; new construction and work on residential rentals carry no tax on labor.

Publications: [94-116](https://comptroller.texas.gov/taxes/publications/94-116.php)

Ledger: `nonresidential-total-charge-taxable`, `new-construction-not-taxable`, `residential-labor-not-taxable`

### Buying a business or its assets

*Rule — Confirmed.* Get the Certificate of No Tax Due before closing, or the buyer inherits the seller’s tax up to the price.

Publications: [98-117](https://comptroller.texas.gov/taxes/publications/98-117.php)

Ledger: `successor-liability`

### Before renting any property by the night

*Read first.* Read the hotel occupancy tax publications first.

Publications: [96-224](https://comptroller.texas.gov/taxes/publications/96-224.php)

## Logistics and trucking

Profile id: `logistics-carrier`

### Heavy vehicles crossing state lines need IFTA

*Rule — Partly confirmed.* IFTA covers qualified motor vehicles — a two-axle vehicle registered over 26,000 pounds is one case. Read the full definition before the first interstate run.

Publications: [96-336](https://comptroller.texas.gov/taxes/publications/96-336.pdf)

Ledger: `ifta-qualified-vehicle`

### Decide which company titles a truck before buying it

*Rule — Confirmed.* Few vehicle transfers are tax-free, and a later move between companies can be taxed as a transfer of its own.

Publications: [96-254](https://comptroller.texas.gov/taxes/publications/96-254/)

Ledger: `vehicle-transfers-entities`

### Before using dyed diesel

*Read first.* Read the dyed diesel publications before buying or using it in any vehicle.

Publications: [98-823](https://comptroller.texas.gov/taxes/publications/98-823.pdf), [98-723](https://comptroller.texas.gov/taxes/publications/98-723.php)

## Insurance agency

Profile id: `insurance-agency`

### Before placing surplus lines or independently procured coverage

*Read first.* Premium, surplus-lines and maintenance taxes are set out in the insurance publications. Read them before an agency places anything outside admitted carriers.

Publications: [94-142](https://comptroller.texas.gov/taxes/publications/94-142.php), [94-431](https://comptroller.texas.gov/taxes/publications/94-431.php), [98-376](https://comptroller.texas.gov/taxes/publications/98-376.pdf), [94-130](https://comptroller.texas.gov/taxes/publications/94-130.php)

## Buying or selling software and data services

Profile id: `software-and-data`

### Software as a service is taxed on 80% of the charge

*Rule — Confirmed.* Check that SaaS and data-processing vendors charge Texas tax; when one doesn’t, report it as a taxable purchase. Selling such a service means collecting tax on 80% of the charge.

Publications: [94-127](https://comptroller.texas.gov/taxes/publications/94-127.php), [94-109](https://comptroller.texas.gov/taxes/publications/94-109.php)

Ledger: `data-processing-80-percent`, `taxable-purchases-use-tax`
