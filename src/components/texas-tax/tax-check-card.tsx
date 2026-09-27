import { AlertTriangle, Info } from 'lucide-react';
import type { TaxCheck } from '@/lib/texas-tax/job-checks';
import { checkedOnDates } from '@/lib/texas-tax/ledger';
import { findPublication } from '@/lib/texas-tax/texas-tax-core';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * Texas tax checks on an estimate or invoice. Renders nothing when there is
 * nothing to say: a card that always reads "all clear" stops being read, and
 * then the one time it matters it's scrolled past.
 */
export function TaxCheckCard({ checks }: { checks: TaxCheck[] }) {
  if (checks.length === 0) return null;
  const checkedOn = checkedOnDates(checks.flatMap((c) => c.ledger)).join(' and ');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Texas tax check</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <ul className="space-y-2">
          {checks.map((check) => (
            <TaxCheckItem key={check.id} check={check} />
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          Checked against the Comptroller’s publications as read on {checkedOn}. A check,
          not tax advice.
        </p>
      </CardContent>
    </Card>
  );
}

function TaxCheckItem({ check }: { check: TaxCheck }) {
  const warn = check.level === 'warn';
  const Icon = warn ? AlertTriangle : Info;
  const sources = check.publications.flatMap((key) => {
    const pub = findPublication(key);
    return pub?.url ? [{ key, label: pub.number ? `Pub ${pub.number}` : pub.title, url: pub.url }] : [];
  });

  return (
    <li
      className={cn(
        'rounded-md border p-3',
        warn ? 'border-amber-500/40 bg-amber-500/10' : 'bg-secondary/40',
      )}
    >
      <p className="flex items-start gap-1.5 text-sm font-medium">
        <Icon
          aria-hidden
          className={cn(
            'mt-0.5 h-4 w-4 shrink-0',
            warn ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
          )}
        />
        {check.title}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{check.body}</p>
      {sources.length > 0 ? (
        <p className="mt-1.5 flex flex-wrap gap-x-3 text-xs">
          {sources.map((s) => (
            <a
              key={s.key}
              href={s.url}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              {s.label}
            </a>
          ))}
        </p>
      ) : null}
    </li>
  );
}
