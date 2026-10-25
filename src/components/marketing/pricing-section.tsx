import Link from 'next/link';
import {
  CADENCE_LABELS,
  TIER_ORDER,
  TIER_PRICING,
  formatMoney,
  formatPct,
} from '@/lib/billing/billing-core';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * The four plans, read from the same numbers checkout charges. A second copy
 * of the prices on a marketing page is how a bid and a bill drift apart.
 */
export function PricingSection() {
  return (
    <section id="pricing" className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-xl font-bold tracking-tight">Plans</h2>
        <p className="text-sm text-muted-foreground">
          A flat amount every month, plus a share of the work you sign through it. Each dollar is
          counted once, in the month or year it was signed — a year-long job is not billed twelve
          times.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {TIER_ORDER.map((tier) => {
          const pricing = TIER_PRICING[tier];
          return (
            <article key={tier} className="flex flex-col rounded-lg border bg-card p-4">
              <h3 className="font-semibold">{pricing.label}</h3>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                {formatMoney(pricing.monthlyBase)}
                <span className="text-sm font-normal text-muted-foreground"> / month</span>
              </p>
              <ul className="mt-3 flex-1 space-y-1 text-sm text-muted-foreground">
                <li>
                  {formatPct(pricing.annualPct)} of signed work,{' '}
                  {CADENCE_LABELS.annual.toLowerCase()}
                </li>
                <li>
                  or {formatPct(pricing.monthlyForeverPct)}{' '}
                  {CADENCE_LABELS.monthly_forever.toLowerCase()}
                </li>
              </ul>
              <Link href="/register" className={cn(buttonVariants({ size: 'sm' }), 'mt-4 w-full')}>
                Start with {pricing.label}
              </Link>
            </article>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        The monthly amount is what you subscribe to. The usage share is added on the renewal
        invoice, after the period closes, from contracts activated and change orders approved in
        that window. Cancel from Billing — the card stays with the payment company, not in this app.
      </p>
    </section>
  );
}
