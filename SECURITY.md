# Security Policy

PT's Tactical Foreman is the operations system for PT's Tactical Renovations LLC. It stores client contact details, project records, estimates, and invoices, so we take security reports seriously and appreciate responsible disclosure.

## Supported Versions

This project does not publish numbered releases. Security fixes are made only to the current code.

| Version | Supported |
| ------- | --------- |
| `main` branch / current production deployment | :white_check_mark: |
| Preview deployments and other branches | :x: |
| `legacy/contractor-ads` (archived demo) | :x: |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues, pull requests, or discussions.**

Report privately using either option:

1. **GitHub (preferred):** open this repository's **Security** tab and select **Report a vulnerability**.
2. **Email:** patthompson@thompsonstacticalrepair.com with the subject line `SECURITY: <short summary>`.

Please include:

- The type of issue (for example: authentication bypass, data exposure, injection, cross-site scripting)
- The affected URL, route, file path, or component (web app, API, database, browser extension)
- Step-by-step instructions to reproduce it
- Proof of concept, screenshots, or logs (remove any real client data)
- The impact: what an attacker could do with it

### What to Expect

| Stage | Target |
| ----- | ------ |
| Acknowledgment of your report | Within 3 business days |
| Initial assessment and severity rating | Within 7 business days |
| Status updates | At least every 14 days until resolved |
| Fix for Critical issues | Within 7 days of confirmation |
| Fix for High issues | Within 30 days of confirmation |
| Fix for Medium and Low issues | Within 90 days of confirmation |

If we accept your report, we will work on a fix, tell you when it ships, and credit you once it is resolved (if you want credit). If we decline it, we will explain why.

Please give us reasonable time to fix the issue before sharing it publicly. We will agree on a disclosure date with you. This is not a paid bug bounty program.

## Scope

**In scope**

- The PT's Tactical Foreman web application and its API routes (`src/`)
- Authentication, sessions, and access controls (Supabase Auth and row-level security)
- Database schema and migrations (`drizzle/`)
- The browser extension (`browser-extension/`)
- Build and deployment configuration (`vercel.json`, `next.config.mjs`, GitHub workflows)
- Secrets or credentials accidentally committed to this repository

**Out of scope**

- `legacy/contractor-ads` (archived and not part of this product)
- Vulnerabilities in third-party services such as GitHub, Vercel, or Supabase (report those to the vendor)
- Denial-of-service, load or stress testing, and spam
- Social engineering, phishing, or physical attacks against PT's Tactical Renovations staff, clients, or property
- Automated scanner results without a demonstrated, reproducible impact
- Missing best-practice headers or settings with no demonstrated security impact

## Rules for Testing

- Only test with accounts and data you own or have permission to use.
- Do not access, change, delete, or keep data that is not yours. If you come across client or personal information, stop and report it right away.
- Do not disrupt the service for other users.
- Do not use a vulnerability beyond what is needed to confirm it.

## Safe Harbor

If you make a good-faith effort to follow this policy, we will consider your research authorized, will not pursue legal action against you for it, and will work with you to understand and fix the issue quickly.

## For Contributors

- Never commit secrets, API keys, `.env` files, or real client data. Use `.env.example` for placeholders.
- If a secret is committed by mistake, revoke and rotate it with the provider right away. Removing it from Git history is not enough. Then notify the maintainer.
- Review Dependabot alerts and security updates promptly.

## Contact

Patrick Thompson Jr., PT's Tactical Renovations LLC
patthompson@thompsonstacticalrepair.com

_Last updated: October 13, 2026_
