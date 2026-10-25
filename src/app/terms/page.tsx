import Link from 'next/link';
import { SiteFooter, SiteHeader } from '@/components/marketing/site-header';

export const metadata = { title: 'Terms' };

/**
 * How the subscription works, in the same words as the billing code.
 * Not a negotiated contract and not attorney-reviewed — the page says so.
 */
export default function TermsPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-4 py-6 md:py-10">
      <SiteHeader signedIn={false} />
      <article className="space-y-4 text-sm leading-relaxed">
        <h1 className="text-2xl font-bold tracking-tight">Terms</h1>
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2">
          An attorney has not reviewed this page. It describes how the product behaves today. It is
          not legal advice, and it is not a substitute for the contract you sign with your own
          clients.
        </p>
        <p>
          Tactical Foreman is software a contracting company subscribes to. You create one
          organization, invite your own people, and the records you put in stay on that
          organization. Another subscriber’s jobs are not yours to see.
        </p>
        <p>
          The price is a flat monthly amount for the plan you pick, plus a usage share of work
          signed through the product. Signed means a contract that became active, or a change order
          that was approved, in that billing window — each dollar once. The usage share is added on
          the renewal invoice after the window closes. You choose once a year or every month. The
          figures are the ones on the{' '}
          <Link href="/#pricing" className="text-primary hover:underline">
            plans
          </Link>
          .
        </p>
        <p>
          A company created on or after October 26, 2026 may use the product for 14 days without a
          plan. After that, new writes wait until a subscription is active. Companies created before
          that date are not put on that trial. A payment that fails has 14 days to be fixed, counted
          from the end of the period already billed. Canceling stops new writes. Saved records stay
          on the account either way.
        </p>
        <p>
          Payment is collected by Stripe. This app does not store the card. You can change the card,
          read invoices, or cancel from Billing, which opens Stripe’s own screen. A subscription
          becomes active only when Stripe says it has — not when checkout starts.
        </p>
        <p>
          You are responsible for the clients, prices, and tax you enter. The product can show a
          Texas tax check when it knows the property type and the state; an unsettled rule is shown
          as unsettled. It does not file a return and it does not sign a bid.
        </p>
        <p>
          Questions about your own subscription go to the owner of the organization, from Billing.
        </p>
      </article>
      <SiteFooter />
    </div>
  );
}
