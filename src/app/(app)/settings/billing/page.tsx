import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth/session';
import { can } from '@/lib/auth/rbac';
import { bookedContractValue, subscriptionForOrg } from '@/lib/billing/queries';
import { stripeEnv } from '@/lib/stripe/client';
import { addUtcMonths, canStartCheckout, providerStatus } from '@/lib/stripe/stripe-core';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PlanPicker } from '@/components/billing/plan-picker';
import { SubscriptionCard } from '@/components/billing/subscription-card';

export const metadata = { title: 'Billing' };

interface SearchParams {
  checkout?: string;
  billing?: string;
}

/**
 * What the organisation pays to run Tactical Foreman. Owner-only, because the
 * card on file is the company's. Stripe holds the card and the invoices; this
 * screen holds the choice and shows where things stand.
 */
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await getAuthContext();
  if (ctx.configured && !ctx.userId) redirect('/login?next=/settings/billing');
  if (!ctx.configured || !ctx.dbAvailable || !ctx.activeOrg) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground">
          Billing activates once authentication and the database are configured and an organization
          exists.
        </p>
      </div>
    );
  }

  const { activeOrg } = ctx;
  const mayManage = can(activeOrg.roles, 'org:manage', activeOrg.extraPermissions);
  if (!mayManage) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground">
          Only an owner or administrator can see or change the company’s subscription.
        </p>
      </div>
    );
  }

  const sp = await searchParams;
  const now = new Date();
  const status = providerStatus(stripeEnv());
  const [subscription, bookedLastMonth, bookedLastYear] = await Promise.all([
    subscriptionForOrg(activeOrg.organizationId),
    bookedContractValue(activeOrg.organizationId, addUtcMonths(now, -1), now),
    bookedContractValue(activeOrg.organizationId, addUtcMonths(now, -12), now),
  ]);
  const mayPick = canStartCheckout(subscription);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <p className="text-xs text-muted-foreground">
          <Link href="/settings" className="hover:underline">
            Settings
          </Link>{' '}
          / Billing
        </p>
        <h1 className="text-2xl font-bold tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground">
          What {activeOrg.organizationName} pays to run Tactical Foreman. A flat monthly base plus a
          share of the work you sign through it.
        </p>
      </div>

      <SubscriptionCard
        subscription={subscription}
        mayManage={mayManage}
        checkoutNotice={sp.checkout}
        billingNotice={sp.billing}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {subscription && subscription.status !== 'pending' && subscription.status !== 'canceled'
              ? 'Change plan'
              : 'Choose a plan'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!status.configured ? (
            <p className="text-sm text-muted-foreground">{status.message}</p>
          ) : !mayPick.ok ? (
            <p className="text-sm text-muted-foreground">{mayPick.reason}</p>
          ) : (
            <>
              {status.mode === 'test' ? (
                <p className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
                  {status.message}
                </p>
              ) : null}
              <PlanPicker
                bookedLastMonth={bookedLastMonth}
                bookedLastYear={bookedLastYear}
                defaultTier={subscription?.tier ?? 'starter'}
                defaultCadence={subscription?.cadence ?? 'annual'}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
