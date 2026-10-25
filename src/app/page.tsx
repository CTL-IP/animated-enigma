import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth/session';
import { PricingSection } from '@/components/marketing/pricing-section';
import { SiteFooter, SiteHeader } from '@/components/marketing/site-header';
import { buttonVariants } from '@/components/ui/button';

export const metadata = {
  title: 'Tactical Foreman',
  description:
    'The command system a general contractor runs the company on — leads, estimates, crews, and invoices.',
};

const STEPS = [
  {
    title: 'From the first call',
    body: 'A lead, a property, and a scope land in one job instead of a text thread.',
  },
  {
    title: 'A price you can stand behind',
    body: 'Estimates, proposals, contracts, and change orders keep the number that was signed.',
  },
  {
    title: 'The day on the job',
    body: 'Schedule, tasks, and the daily log — written on a phone, one-handed.',
  },
  {
    title: 'What you’re owed',
    body: 'Invoices and what’s past due, with the margin computed from finished jobs only.',
  },
];

/**
 * The front door. Signed-in companies go to their work; everyone else sees
 * what the product is and what it costs, from the same prices checkout uses.
 */
export default async function Home() {
  const ctx = await getAuthContext();
  if (ctx.configured && ctx.userId && ctx.activeOrg) redirect('/dashboard');
  if (ctx.configured && ctx.userId && !ctx.activeOrg) redirect('/onboarding');

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-10 px-4 py-6 md:py-10">
      <SiteHeader signedIn={Boolean(ctx.userId)} />

      <section className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Run the company from the truck.
        </h1>
        <p className="text-base text-muted-foreground">
          Tactical Foreman is the system of record for a general contractor: who the client is, what
          you signed, who’s on site today, and what you’re still owed. One login per person. Their
          jobs never show up in somebody else’s account.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href="/register" className={buttonVariants({ size: 'lg' })}>
            Start a company
          </Link>
          <Link href="/#pricing" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
            See the plans
          </Link>
        </div>
        <p className="text-sm text-muted-foreground">
          A new company gets 14 days. After that, writing estimates, contracts, and invoices waits
          on a plan. Work you already saved stays where it is.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        {STEPS.map((step) => (
          <article key={step.title} className="rounded-lg border bg-card p-4">
            <h2 className="font-semibold">{step.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
          </article>
        ))}
      </section>

      <PricingSection />
      <SiteFooter />
    </div>
  );
}
