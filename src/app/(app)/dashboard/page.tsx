import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth/session';
import { can } from '@/lib/auth/rbac';
import { dashboardCounts, dashboardSignals } from '@/lib/dashboard/queries';
import { buildAttentionList, buildKpis, headline } from '@/lib/dashboard/dashboard-core';
import { openShiftFor } from '@/lib/costing/queries';
import { PhoneHud } from '@/components/hud/phone-hud';
import type { HudShift } from '@/lib/hud/hud-core';

export const metadata = { title: 'Dashboard' };

/**
 * Field home screen. The desktop command centre and the phone HUD share the
 * same numbers: attention first, then clock, then the four jobsite shortcuts.
 */
export default async function DashboardPage() {
  const ctx = await getAuthContext();
  if (ctx.configured && !ctx.userId) redirect('/login');

  if (!ctx.configured || !ctx.dbAvailable || !ctx.activeOrg) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          The dashboard activates once authentication and the database are configured and an
          organization exists.
        </p>
      </div>
    );
  }

  const { activeOrg } = ctx;
  const showMoney = can(activeOrg.roles, 'financials:read', activeOrg.extraPermissions);
  const mayClock = can(activeOrg.roles, 'tasks:write', activeOrg.extraPermissions);
  const orgId = activeOrg.organizationId;

  const [signals, counts, openShift] = await Promise.all([
    dashboardSignals(orgId, showMoney),
    dashboardCounts(orgId),
    mayClock && ctx.userId ? openShiftFor(orgId, ctx.userId) : Promise.resolve(null),
  ]);

  const attention = buildAttentionList(signals);
  const kpis = buildKpis({ signals, ...counts, showMoney });
  const shift: HudShift | null = openShift
    ? {
        id: openShift.id,
        projectId: openShift.projectId,
        projectName: openShift.projectName,
        projectNumber: openShift.projectNumber,
        clockIn: openShift.clockIn,
      }
    : null;

  return (
    <PhoneHud
      orgName={activeOrg.organizationName}
      headline={headline(attention)}
      attention={attention}
      kpis={kpis}
      shift={shift}
      mayClock={mayClock}
    />
  );
}
