/**
 * Create the four base-plan products and their monthly prices in the connected
 * Stripe account, and print the environment lines the app needs.
 *
 *   pnpm stripe:setup            # with a test key
 *   pnpm stripe:setup --live     # required with a live key
 *
 * Reads STRIPE_SECRET_KEY from the environment, or from `.env.local` when that
 * file exists. Idempotent: each price is looked up by its lookup key before
 * anything is created, so running this twice creates nothing twice. A price
 * whose amount no longer matches the owner's numbers in `billing-core.ts` is
 * replaced — Stripe prices are immutable — and the lookup key moves to the new
 * one, so the printed id is always the right one. Nothing is ever deleted.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Stripe from 'stripe';
import type { BillingTier } from '../src/lib/billing/billing-core';
import { catalogDefinition, keyMode, priceEnvLines } from '../src/lib/stripe/stripe-core';

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function loadEnvFile(filename: string): void {
  let text: string;
  try {
    text = readFileSync(resolve(process.cwd(), filename), 'utf8');
  } catch {
    return;
  }
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

async function main(): Promise<void> {
  loadEnvFile('.env.local');

  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) fail('STRIPE_SECRET_KEY is not set. Put it in the environment or in .env.local.');
  const mode = keyMode(key);
  if (!mode)
    fail('STRIPE_SECRET_KEY does not look like a Stripe secret key (sk_live_…, sk_test_…).');
  if (mode === 'live' && !process.argv.includes('--live')) {
    fail(
      'That is a LIVE key: products and prices made with it are real and show to real customers.\nRun again with --live to confirm.',
    );
  }
  process.stdout.write(`Stripe ${mode} mode.\n`);

  const stripe = new Stripe(key, { appInfo: { name: "PT's Tactical Foreman setup" } });
  const catalog = catalogDefinition();

  const existing = await stripe.prices.list({
    lookup_keys: catalog.map((entry) => entry.lookupKey),
    active: true,
    limit: 100,
  });
  const byLookupKey = new Map(
    existing.data
      .filter((price) => price.lookup_key)
      .map((price) => [price.lookup_key as string, price]),
  );

  const ids = {} as Record<BillingTier, string>;
  for (const entry of catalog) {
    const found = byLookupKey.get(entry.lookupKey);
    if (
      found &&
      found.unit_amount === entry.unitAmountCents &&
      found.currency === entry.currency &&
      found.recurring?.interval === entry.interval
    ) {
      ids[entry.tier] = found.id;
      process.stdout.write(`kept     ${entry.productName}: ${found.id}\n`);
      continue;
    }

    const productId = found
      ? typeof found.product === 'string'
        ? found.product
        : found.product.id
      : (await stripe.products.create({ name: entry.productName, metadata: { tier: entry.tier } }))
          .id;

    const price = await stripe.prices.create({
      product: productId,
      currency: entry.currency,
      unit_amount: entry.unitAmountCents,
      recurring: { interval: entry.interval },
      lookup_key: entry.lookupKey,
      // Moves the key off the old price, so the next run finds this one.
      transfer_lookup_key: true,
      metadata: { tier: entry.tier },
    });
    ids[entry.tier] = price.id;
    process.stdout.write(
      `${found ? 'replaced' : 'created '} ${entry.productName}: ${price.id} (${entry.unitAmountCents / 100} ${entry.currency}/${entry.interval})${found ? ` — amount changed from ${(found.unit_amount ?? 0) / 100}` : ''}\n`,
    );
  }

  process.stdout.write(
    '\nSet these on the host (Vercel → Settings → Environment Variables), then redeploy:\n\n',
  );
  for (const line of priceEnvLines(ids)) process.stdout.write(`${line}\n`);
  process.stdout.write(
    '\nThen register the webhook endpoint in the Dashboard (see .env.example) and set STRIPE_WEBHOOK_SECRET.\n',
  );
}

main().catch((error: unknown) => {
  fail(`Stripe setup failed: ${error instanceof Error ? error.message : String(error)}`);
});
