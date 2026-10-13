import Link from 'next/link';
import { Calculator, Library, ArrowRight } from 'lucide-react';
import { getAuthContext } from '@/lib/auth/session';
import { can } from '@/lib/auth/rbac';
import { listEstimatesForOrg, type EstimateOverviewRow } from '@/lib/estimates/queries';
import { listProjects } from '@/lib/projects/queries';
import { formatMoney, formatMarginPct } from '@/lib/estimates/estimate-core';
import { createEstimate } from '@/lib/estimates/actions';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { EstimateStatusBadge } from '@/components/estimates/estimate-badges';

export const metadata = { title: 'Estimates' };

export default async function EstimatesPage() {
  const ctx = await getAuthContext();

  if (!ctx.configured || !ctx.dbAvailable || !ctx.activeOrg) {
    return <NotReady />;
  }

  const { activeOrg } = ctx;
  if (!can(activeOrg.roles, 'estimates:read', activeOrg.extraPermissions)) {
    return (
      <Empty title="Estimates">
        You don’t have permission to view estimates. Ask an administrator.
      </Empty>
    );
  }

  const orgId = activeOrg.organizationId;
  const mayWrite = can(activeOrg.roles, 'estimates:write', activeOrg.extraPermissions);
  // Margin exposes cost structure — gated tighter than the selling price
  // (estimates:read alone, which sales_rep holds without costs:read).
  const mayReadCosts = can(activeOrg.roles, 'costs:read', activeOrg.extraPermissions);

  const [estimates, projects] = await Promise.all([
    listEstimatesForOrg(orgId),
    mayWrite ? listProjects({ organizationId: orgId, status: 'open' }) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Estimates</h1>
        <p className="text-sm text-muted-foreground">
          Line-item estimating with versions, margins, and options.
        </p>
      </div>

      {/* The cost catalog (Task 15) is the foundation estimating builds on. */}
      {mayReadCosts ? (
        <Link href="/cost-catalog" className="block">
          <Card className="transition-colors hover:border-primary/50 hover:bg-accent/40">
            <CardContent className="flex items-center gap-4 py-5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Library className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium">Cost catalog</p>
                <p className="text-sm text-muted-foreground">
                  Manage your labor, material, and equipment costs — the building blocks estimates
                  pull from.
                </p>
              </div>
              <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      ) : null}

      {mayWrite ? <NewEstimatePicker projects={projects} /> : null}

      {estimates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Calculator className="h-6 w-6" />
            </div>
            <div className="max-w-sm">
              <p className="font-medium">No estimates yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {mayWrite
                  ? 'Pick a job above to start a line-item estimate from your cost catalog.'
                  : 'Line-item estimates that pull from your cost catalog and roll up to margins and client-ready prices will show up here once one exists.'}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Mobile: cards */}
          <ul className="space-y-2 md:hidden">
            {estimates.map((e) => (
              <li key={e.versionId}>
                <EstimateCard estimate={e} showMargin={mayReadCosts} />
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <div className="hidden overflow-hidden rounded-lg border md:block">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Project</th>
                  <th className="px-4 py-2.5 font-semibold">Estimate</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 font-semibold">Price</th>
                  {mayReadCosts ? <th className="px-4 py-2.5 font-semibold">Margin</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y">
                {estimates.map((e) => (
                  <tr key={e.versionId} className="hover:bg-accent/40">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/projects/${e.projectId}/estimate?v=${e.versionId}`}
                        className="font-medium hover:underline"
                      >
                        {e.projectName}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {e.projectNumber}
                        {e.clientName ? ` · ${e.clientName}` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      v{e.versionNumber}
                      {e.name ? ` · ${e.name}` : ''}
                    </td>
                    <td className="px-4 py-2.5">
                      <EstimateStatusBadge status={e.status} />
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">{formatMoney(e.finalPrice)}</td>
                    {mayReadCosts ? (
                      <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                        {formatMarginPct(e.grossMarginPct)}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function NewEstimatePicker({
  projects,
}: {
  projects: Awaited<ReturnType<typeof listProjects>>;
}) {
  if (projects.length === 0) return null;
  return (
    <Card>
      <CardContent className="py-4">
        <form action={createEstimate} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label htmlFor="projectId" className="text-sm font-medium sm:sr-only">
            Job
          </label>
          <Select id="projectId" name="projectId" className="sm:max-w-sm">
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.projectNumber} — {p.name}
              </option>
            ))}
          </Select>
          <Button type="submit" size="sm">
            <Calculator className="h-4 w-4" />
            Start estimate
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function EstimateCard({
  estimate,
  showMargin,
}: {
  estimate: EstimateOverviewRow;
  showMargin: boolean;
}) {
  return (
    <Link
      href={`/projects/${estimate.projectId}/estimate?v=${estimate.versionId}`}
      className="block rounded-lg border bg-card p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium">{estimate.projectName}</div>
          <div className="truncate text-xs text-muted-foreground">
            {estimate.projectNumber} · {estimate.clientName ?? 'No client'}
          </div>
        </div>
        <EstimateStatusBadge status={estimate.status} />
      </div>
      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
        <span>
          v{estimate.versionNumber}
          {estimate.name ? ` · ${estimate.name}` : ''}
        </span>
        <span className="tabular-nums">{formatMoney(estimate.finalPrice)}</span>
        {showMargin ? (
          <span className="tabular-nums">{formatMarginPct(estimate.grossMarginPct)}</span>
        ) : null}
      </div>
    </Link>
  );
}

function NotReady() {
  return (
    <Empty title="Estimates">
      Estimating activates once authentication and the database are configured and an
      organization exists.
    </Empty>
  );
}

function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  );
}
