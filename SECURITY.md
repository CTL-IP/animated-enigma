# Security Policy

PT's Tactical Foreman holds contractors' client lists, contract values, job
photos, signatures, and — once billing is live — payment records. A security
problem here is a problem for every company running on it, so reports are
taken seriously and handled privately.

## Reporting a vulnerability

**Please do not open a public GitHub issue for a security problem.**

Report it privately through GitHub's vulnerability reporting for this
repository: the **Security** tab → **Report a vulnerability**. That opens a
private advisory only the maintainers can see.

Include what you can of:

- what you found and where (URL, screen, or file path)
- steps to reproduce it
- what an attacker could do with it — read another company's data, change a
  record they shouldn't, act as someone else
- any proof-of-concept, kept to the minimum needed to show the problem

You will get an acknowledgement within three business days, and an honest
status update at least weekly until it is resolved or declined. If it is
accepted, you will be told when a fix is deployed. If it is declined, you will
be told why.

Please give us a reasonable window to fix a confirmed problem before
disclosing it publicly.

## What is in scope

- The deployed application and everything in this repository.
- Anything that lets one organization see or change another organization's
  data. This is the boundary the whole system is built around, and a hole in
  it is the most serious report we can receive.
- Authentication and session handling, invitation and password-reset links,
  client-facing proposal / change-order / invoice links.
- Stored credentials: connected Google accounts, and payment-processor
  identifiers once billing is live.

## What is out of scope

- Denial-of-service, rate-limit, or volumetric findings.
- Reports that require a compromised device or a stolen account to start from.
- Findings against third-party services the app runs on (Vercel, Supabase,
  Google, Stripe) — please report those to the vendor.
- The absence of a security header, cookie flag, or best-practice setting on
  its own, without a demonstrated impact.

## How the application is built to hold the line

For context when writing a report — these are the controls a finding would be
measured against:

- **Tenant isolation is enforced in the database, not only in code.** Every
  tenant table has row-level security both enabled and *forced*, so it applies
  even to the privileged role the application connects as. A query that
  forgets to scope by organization still cannot cross the boundary.
- **Evidence is append-only.** Signatures and daily-log revisions reject
  updates and deletes for every database role, including the application's.
- **Credentials that outlive a request are encrypted before they reach the
  database.** A connected Google account's refresh token is stored as
  ciphertext under a key that lives only in the host environment.
- **Links sent to clients carry a one-time token.** Only its hash is stored;
  the raw token exists in the URL alone.
- **Cost and margin are gated at the query, not the screen.** A role without
  permission never has the figures fetched, so a rendering mistake cannot leak
  them.

## Supported version

This is a continuously deployed application, not a versioned package. The
only supported version is what is currently deployed from the default branch.
There are no maintained older release lines.
