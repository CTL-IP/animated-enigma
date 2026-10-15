import { CreditCard } from 'lucide-react';
import type { OrganizationSubscription } from '@/db/schema';
import {
  CADENCE_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
  SUBSCRIPTION_STATUS_STYLES,
  TIER_PRICING,
  formatMoney,
} from '@/lib/billing/billing-core';
import { dayLabel } from '@/lib/stripe/stripe-core';
import { openBillingPortal } from '@/lib/billing/actions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

/**
 * What the one-word `?checkout=` and `?billing=` results mean to a person.
 * Kept next to the card because it is the card's copy, not logic.
 */
const NOTICES: Record<string, { tone: 'ok' | 'warn'; text: string }> = {
  'checkout:success': {
    tone: 'ok',
    text: 'Payment is set up. Stripe confirms the subscription within a minute — refresh if it still says Not started.',
  },
  'checkout:cancelled': {
    tone: 'warn',
    text: 'Checkout was cancelled on Stripe’s page. Nothing was charged.',
  },
  'billing:nocustomer': {
    tone: 'warn',
    text: 'There is no Stripe customer for this organization yet. Pick a plan first.',
  },
  'billing:failed': {
    tone: 'warn',
    text: 'Stripe’s billing portal couldn’t open. Nothing was changed. Try again in a minute.',
  },
  'billing:forbidden': {
    tone: 'warn',
    text: 'Only an owner or administrator can manage billing.',
  },
};

export function SubscriptionCard({
  subscription,
  mayManage,
  checkoutNotice,
  billingNotice,
}: {
  subscription: OrganizationSubscription | null;
  mayManage: boolean;
  checkoutNotice?: string;
  billingNotice?: string;
}) {
  const flash =
    (checkoutNotice && NOTICES[`checkout:${checkoutNotice}`]) ||
    (billingNotice && NOTICES[`billing:${billingNotice}`]) ||
    undefined;
  const live = subscription && subscription.stripeSubscriptionId ? subscription : null;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Subscription</CardTitle>
        {subscription && (
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${SUBSCRIPTION_STATUS_STYLES[subscription.status]}`}
          >
            {SUBSCRIPTION_STATUS_LABELS[subscription.status]}
          </span>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {flash && (
          <p
            className={
              flash.tone === 'ok'
                ? 'rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm'
                : 'rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm'
            }
          >
            {flash.text}
          </p>
        )}

        {!subscription ? (
          <p className="text-sm text-muted-foreground">
            No plan chosen yet. Pick one below to start.
          </p>
        ) : (
          <>
            <p className="text-sm">
              <span className="font-medium">{TIER_PRICING[subscription.tier].label}</span> —{' '}
              {formatMoney(TIER_PRICING[subscription.tier].monthlyBase)} a month.{' '}
              {CADENCE_LABELS[subscription.cadence]}.
            </p>
            {live?.currentPeriodEnd ? (
              <p className="text-sm text-muted-foreground">
                {subscription.status === 'canceled'
                  ? `Ended ${dayLabel(live.currentPeriodEnd)}.`
                  : `Current period ends ${dayLabel(live.currentPeriodEnd)}.`}
              </p>
            ) : subscription.status === 'pending' ? (
              <p className="text-sm text-muted-foreground">
                Stripe has not collected anything yet. If you finished checkout, give it a minute
                and refresh; otherwise pick the plan again below.
              </p>
            ) : null}
            {subscription.status === 'past_due' ? (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
                The last payment did not go through. Open Manage billing and update the card —
                Stripe retries on its own once it has one that works.
              </p>
            ) : null}
            {mayManage && subscription.stripeCustomerId ? (
              <form action={openBillingPortal}>
                <Button type="submit" variant="outline" size="sm">
                  <CreditCard className="h-4 w-4" />
                  Manage billing
                </Button>
              </form>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
