import { redirect } from 'next/navigation';
import { Hammer, Users, Calculator } from 'lucide-react';
import { getAuthContext } from '@/lib/auth/session';
import { OnboardingForm } from './onboarding-form';

export const metadata = { title: 'Set up your company' };

export default async function OnboardingPage() {
  const ctx = await getAuthContext();
  if (ctx.configured && !ctx.userId) redirect('/login?next=/onboarding');
  if (ctx.activeOrg) redirect('/dashboard');

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-secondary/40 p-4">
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded bg-primary text-sm font-black text-primary-foreground">
          PT
        </div>
        <span className="font-bold">Tactical Foreman</span>
      </div>

      <div className="w-full max-w-md space-y-6 rounded-lg border bg-card p-6 shadow-sm sm:p-8">
        <div className="space-y-1.5 text-center">
          <h1 className="text-xl font-bold tracking-tight">Set up your company</h1>
          <p className="text-sm text-muted-foreground">
            One organization to run your jobs, your team, and your clients from — on a phone,
            on a laptop, from the truck.
          </p>
        </div>

        <ul className="grid grid-cols-3 gap-2 text-center text-xs text-muted-foreground">
          <li className="flex flex-col items-center gap-1.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Hammer className="h-4 w-4" />
            </span>
            Projects, scheduling, daily logs
          </li>
          <li className="flex flex-col items-center gap-1.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Calculator className="h-4 w-4" />
            </span>
            Estimates, invoices, change orders
          </li>
          <li className="flex flex-col items-center gap-1.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Users className="h-4 w-4" />
            </span>
            Your crew, one login each
          </li>
        </ul>

        <div className="border-t pt-5">
          <OnboardingForm />
        </div>
      </div>

      <p className="max-w-sm text-center text-xs text-muted-foreground">
        Already have an account on a different company?{' '}
        <a href="/login" className="font-medium text-foreground hover:underline">
          Sign in there instead
        </a>{' '}
        and switch organizations from the sidebar.
      </p>
    </div>
  );
}
