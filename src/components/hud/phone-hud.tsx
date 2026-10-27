import Link from 'next/link';
import { ArrowRight, CheckCircle2, Clock3 } from 'lucide-react';
import { ClockControls } from '@/components/costing/cost-forms';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  SEVERITY_STYLES,
  SEVERITY_TEXT_STYLES,
  type AttentionItem,
  type KpiTile,
} from '@/lib/dashboard/dashboard-core';
import { hudQuickActions, shiftHudCopy, type HudShift } from '@/lib/hud/hud-core';
import { cn } from '@/lib/utils';

export function PhoneHud({
  orgName,
  headline,
  attention,
  kpis,
  shift,
  mayClock,
}: {
  orgName: string | null;
  headline: string;
  attention: AttentionItem[];
  kpis: KpiTile[];
  shift: HudShift | null;
  mayClock: boolean;
}) {
  const shiftCopy = shiftHudCopy(shift);
  const actions = hudQuickActions({ openProjectId: shift?.projectId });

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          Foreman
        </p>
        <h1 className="text-2xl font-bold tracking-tight">
          {orgName?.trim() || 'Command'}
        </h1>
        <p className="text-sm text-muted-foreground">{headline}</p>
      </header>

      <section
        aria-labelledby="hud-clock-heading"
        className="rounded-xl border border-primary/30 bg-card p-4 shadow-sm"
      >
        <div className="flex items-start gap-3">
          <Clock3 className="mt-0.5 h-5 w-5 flex-none text-primary" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h2 id="hud-clock-heading" className="text-base font-semibold">
              {shiftCopy.title}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{shiftCopy.detail}</p>
            {mayClock && shift?.projectId ? (
              <div className="mt-3">
                <ClockControls projectId={shift.projectId} openShiftId={shift.id} compact />
              </div>
            ) : (
              <Link
                href={shiftCopy.href}
                className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
              >
                {shift?.projectId ? 'Open this job' : 'Open jobs to clock in'}
                <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
              </Link>
            )}
          </div>
        </div>
      </section>

      <nav aria-label="Field shortcuts">
        <ul className="grid grid-cols-2 gap-2">
          {actions.map((action) => (
            <li key={action.id}>
              <Link
                href={action.href}
                className="flex min-h-[4.5rem] flex-col justify-center rounded-xl border bg-card px-4 py-3 transition-colors hover:border-primary/50 hover:bg-accent/40"
              >
                <span className="text-sm font-semibold">{action.label}</span>
                <span className="text-xs text-muted-foreground">{action.hint}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div
        className={cn(
          'grid gap-2',
          kpis.length === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3',
        )}
      >
        {kpis.map((tile) => {
          const body = (
            <>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                {tile.label}
              </div>
              <div
                className={cn(
                  'text-xl font-bold tabular-nums',
                  tile.tone === 'bad' && 'text-red-600 dark:text-red-400',
                )}
              >
                {tile.value}
              </div>
              {tile.note ? (
                <div
                  className={cn(
                    'text-[11px]',
                    tile.tone === 'bad'
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-muted-foreground',
                  )}
                >
                  {tile.note}
                </div>
              ) : null}
            </>
          );
          return tile.href ? (
            <Link
              key={tile.label}
              href={tile.href}
              className="rounded-xl border bg-card p-3 transition-colors hover:border-primary/50 hover:bg-accent/40"
            >
              {body}
            </Link>
          ) : (
            <div key={tile.label} className="rounded-xl border bg-card p-3">
              {body}
            </div>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Needs attention</CardTitle>
        </CardHeader>
        <CardContent>
          {attention.length === 0 ? (
            <div className="flex items-center gap-3 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-4">
              <CheckCircle2 className="h-5 w-5 flex-none text-emerald-600 dark:text-emerald-400" />
              <div>
                <p className="text-sm font-medium">Nothing outstanding.</p>
                <p className="text-xs text-muted-foreground">
                  No overdue money, no crew clashes, no late work, and today’s logs are in.
                </p>
              </div>
            </div>
          ) : (
            <ul className="space-y-2">
              {attention.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className={cn(
                      'flex min-h-11 items-start justify-between gap-3 rounded-md border p-3 transition-colors hover:brightness-105',
                      SEVERITY_STYLES[item.severity],
                    )}
                  >
                    <div className="min-w-0">
                      <p
                        className={cn(
                          'text-sm font-semibold',
                          SEVERITY_TEXT_STYLES[item.severity],
                        )}
                      >
                        {item.title}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{item.detail}</p>
                    </div>
                    <ArrowRight className="mt-0.5 h-4 w-4 flex-none text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
