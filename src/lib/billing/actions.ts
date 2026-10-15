'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getDb, schema } from '@/db';
import { publicEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { getAuthContext } from '@/lib/auth/session';
import { can } from '@/lib/auth/rbac';
import type { FormState } from '@/lib/auth/actions';
import {
  createCheckoutSession,
  createCustomer,
  createPortalSession,
  stripeEnv,
} from '@/lib/stripe/client';
import {
  BILLING_PATH,
  canStartCheckout,
  checkoutSessionParams,
  parsePlanChoice,
  priceIdFor,
  providerStatus,
} from '@/lib/stripe/stripe-core';
import { subscriptionForOrg } from './queries';

type Gate =
  | { ok: true; orgId: string; orgName: string; userId: string; email: string | null }
  | { ok: false; error: string };

/**
 * Billing is `org:manage` — the owner's permission. The person who can change
 * the company's legal text is the person who can put its card on file.
 */
async function requireBillingManager(): Promise<Gate> {
  const ctx = await getAuthContext();
  if (!ctx.userId) redirect(`/login?next=${BILLING_PATH}`);
  if (!ctx.dbAvailable || !ctx.activeOrg) {
    return { ok: false, error: 'Database or organization is not configured yet.' };
  }
  if (!can(ctx.activeOrg.roles, 'org:manage', ctx.activeOrg.extraPermissions)) {
    return { ok: false, error: 'Only an owner or administrator can manage billing.' };
  }
  return {
    ok: true,
    orgId: ctx.activeOrg.organizationId,
    orgName: ctx.activeOrg.organizationName,
    userId: ctx.userId,
    email: ctx.email,
  };
}

/**
 * Pick a plan and go to Stripe to pay for it.
 *
 * The row is written before Stripe is asked for anything, as `pending`: it
 * records what the organisation chose, and it is what the webhook will update
 * once Stripe has collected. Nothing here marks a subscription paid — the app
 * never promotes a subscription on its own say-so.
 */
export async function startCheckout(_prev: FormState, formData: FormData): Promise<FormState> {
  const gate = await requireBillingManager();
  if (!gate.ok) return { error: gate.error };

  const env = stripeEnv();
  const status = providerStatus(env);
  if (!status.configured) return { error: status.message };

  const choice = parsePlanChoice(formData.get('tier'), formData.get('cadence'));
  if (choice.error !== undefined) return { error: choice.error };
  const { tier, cadence } = choice;

  const priceId = priceIdFor(env, tier);
  if (!priceId) return { error: status.message };

  const existing = await subscriptionForOrg(gate.orgId);
  const allowed = canStartCheckout(existing);
  if (!allowed.ok) return { error: allowed.reason };

  let checkoutUrl: string;
  try {
    const customerId =
      existing?.stripeCustomerId ??
      (await createCustomer({ organizationId: gate.orgId, name: gate.orgName, email: gate.email }));

    // One row per organisation: a new choice replaces the old one. The old
    // subscription id is cleared because it is finished — the webhook that
    // ends it is told apart from this new one by the id it carries.
    await getDb()
      .insert(schema.organizationSubscriptions)
      .values({
        organizationId: gate.orgId,
        tier,
        cadence,
        status: 'pending',
        stripeCustomerId: customerId,
        createdBy: gate.userId,
      })
      .onConflictDoUpdate({
        target: schema.organizationSubscriptions.organizationId,
        set: {
          tier,
          cadence,
          status: 'pending',
          stripeCustomerId: customerId,
          stripeSubscriptionId: null,
          currentPeriodStart: null,
          currentPeriodEnd: null,
        },
      });

    checkoutUrl = await createCheckoutSession(
      checkoutSessionParams({
        appUrl: publicEnv.appUrl,
        customerId,
        priceId,
        organizationId: gate.orgId,
        tier,
        cadence,
      }),
    );
  } catch (error) {
    logger.error('billing: checkout could not start', {
      organizationId: gate.orgId,
      message: error instanceof Error ? error.message : String(error),
    });
    return {
      error: 'Could not start checkout with Stripe. Nothing was charged. Try again in a minute.',
    };
  }

  revalidatePath(BILLING_PATH);
  redirect(checkoutUrl);
}

/**
 * Stripe's billing portal: the card, the invoices, and cancelling. One tap, no
 * arguments. Stripe owns that screen so that this app never holds a card.
 */
export async function openBillingPortal(): Promise<void> {
  const gate = await requireBillingManager();
  if (!gate.ok) redirect(`${BILLING_PATH}?billing=forbidden`);

  const row = await subscriptionForOrg(gate.orgId);
  if (!row?.stripeCustomerId) redirect(`${BILLING_PATH}?billing=nocustomer`);

  let portalUrl: string;
  try {
    portalUrl = await createPortalSession(
      row.stripeCustomerId,
      `${publicEnv.appUrl}${BILLING_PATH}`,
    );
  } catch (error) {
    logger.error('billing: portal could not open', {
      organizationId: gate.orgId,
      message: error instanceof Error ? error.message : String(error),
    });
    redirect(`${BILLING_PATH}?billing=failed`);
  }
  redirect(portalUrl);
}
