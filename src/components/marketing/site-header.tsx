import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="flex items-center justify-between gap-3">
      <Link href="/" className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded bg-primary text-sm font-black text-primary-foreground">
          PT
        </span>
        <span className="leading-tight">
          <span className="block font-bold">Tactical Foreman</span>
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-primary">
            Your Home, Our Mission.
          </span>
        </span>
      </Link>
      <nav className="flex items-center gap-2">
        <Link
          href="/#pricing"
          className="hidden text-sm text-muted-foreground hover:underline sm:inline"
        >
          Plans
        </Link>
        {signedIn ? (
          <Link href="/dashboard" className={buttonVariants({ size: 'sm' })}>
            Open the app
          </Link>
        ) : (
          <>
            <Link href="/login" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
              Sign in
            </Link>
            <Link href="/register" className={buttonVariants({ size: 'sm' })}>
              Start
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="flex flex-wrap gap-x-4 gap-y-2 border-t pt-4 text-xs text-muted-foreground">
      <Link href="/terms" className="hover:underline">
        Terms
      </Link>
      <Link href="/privacy" className="hover:underline">
        Privacy
      </Link>
      <span>An attorney has not reviewed the terms. Read them before you subscribe.</span>
    </footer>
  );
}
