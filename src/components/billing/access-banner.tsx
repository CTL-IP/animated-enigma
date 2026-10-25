import Link from 'next/link';
import type { ProductAccess } from '@/lib/billing/billing-core';

/** The one line a company sees when a trial or a payment is running out. */
export function AccessBanner({ access }: { access: ProductAccess }) {
  if (!access.notice) return null;
  const blocked = access.level === 'blocked';
  return (
    <div
      className={
        blocked
          ? 'mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm'
          : 'mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm'
      }
    >
      <p>{access.notice}</p>
      <Link href="/settings/billing" className="mt-1 inline-block font-medium underline">
        Open billing
      </Link>
    </div>
  );
}
