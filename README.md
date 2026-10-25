# PT's Tactical Foreman

AI-powered general contractor command system for PT's Tactical Renovations —
from first client conversation through intake, estimate, proposal, execution,
invoicing, and warranty. **Your Home, Our Mission.**

Built in controlled phases. See `docs/` for the product and technical basis:

| Doc | What it is |
|---|---|
| [`docs/PRD.md`](docs/PRD.md) | Product Requirements Document (Task 1) |
| [`docs/tech-stack.md`](docs/tech-stack.md) | Technical stack recommendation (Task 2) |
| [`docs/architecture.md`](docs/architecture.md) | System architecture (Task 3) |
| [`docs/database-schema.md`](docs/database-schema.md) | Database schema design (Task 4) |

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind CSS · Drizzle ORM ·
PostgreSQL/Supabase (Auth + Storage) · Zod · Anthropic Claude · Vitest.

## Getting started

Requirements: **Node 20+** and **pnpm**. (For the database and auth,
[Supabase CLI](https://supabase.com/docs/guides/cli) + Docker are used from
Task 6 onward.)

```bash
pnpm install
cp .env.example .env.local   # fill in as integrations come online
pnpm dev                     # http://localhost:3000
```

`/` is the sales page. A signed-in company goes to the dashboard. Database and
auth need a Supabase project. The placeholder values in `.env.example` make
sign-in look configured, and it fails until something is listening.

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Start the dev server |
| `pnpm build` | Production build |
| `pnpm start` | Serve the production build |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript, no emit |
| `pnpm format` / `format:check` | Prettier |
| `pnpm test` / `test:watch` | Vitest |
| `pnpm db:generate` / `db:migrate` / `db:studio` | Drizzle migrations & studio |
| `pnpm stripe:setup` | Create the four plan prices and print `STRIPE_PRICE_*` |

## Project structure

```
src/
  app/
    (app)/           # authenticated shell + the twelve sections
    globals.css
    layout.tsx       # root layout
    page.tsx         # sales page; a signed-in company goes to /dashboard
    global-error.tsx # root error boundary
    not-found.tsx
  components/
    layout/          # sidebar, mobile nav, header, nav config
    ui/              # button, card (shadcn-style, owned in-repo)
    section-placeholder.tsx
  db/                # Drizzle schema + connection
  lib/
    supabase/        # server/client/middleware auth helpers
    env.ts           # Zod-validated environment
    logger.ts        # structured logging foundation
    utils.ts         # cn()
  middleware.ts      # session refresh (route protection: Task 6)
legacy/              # archived ContractorAds demo (not part of this product)
```

## Selling it

Production deploys from `main` on the Vercel project `tactical-foreman`.
A pull request does not change production.

Billing stays off until Stripe can take a card. With a real secret key:

```bash
pnpm stripe:setup            # test key
pnpm stripe:setup --live     # live key, only when you mean it
```

Put the four `STRIPE_PRICE_*` lines it prints on the host, with
`STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. Register
`<app URL>/api/webhooks/stripe` in the Stripe Dashboard for
`checkout.session.completed`, `customer.subscription.*`, `invoice.created`,
`invoice.paid`, and `invoice.payment_failed`. Until those are set, nobody is
locked out and nobody can be charged.

Companies created before 2026-10-26 keep full use after the keys appear. A
company created on or after that date has 14 days, then writes stop and saved
work stays readable. A failed renewal warns for 14 days from the period end,
then the same stop. Canceling stops writes immediately. Terms and privacy
have not been reviewed by an attorney.

The usage fee is the percentage on work signed in the period, counted once.
Whether that basis stays is still an open owner decision in `docs/agent-log.md`.
