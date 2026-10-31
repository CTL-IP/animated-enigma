/**
 * Phone HUD: the field home screen. Pure so the tiles and install copy stay
 * testable without a browser or a database.
 */

export interface HudAction {
  id: string;
  label: string;
  href: string;
  /** One-word reason this is on the home screen. */
  hint: string;
}

export interface HudShift {
  id: string | null;
  projectId: string | null;
  projectName: string | null;
  projectNumber: string | null;
  clockIn: Date | string | null;
}

export interface HudShiftCopy {
  title: string;
  detail: string;
  href: string;
}

/** Four thumb-zone destinations. Clock always points at the live job when one exists. */
export function hudQuickActions(args: {
  openProjectId?: string | null;
}): HudAction[] {
  const clockHref = args.openProjectId ? `/projects/${args.openProjectId}` : '/projects';
  return [
    { id: 'clock', label: 'Clock', href: clockHref, hint: 'In and out' },
    { id: 'logs', label: 'Daily log', href: '/daily-logs', hint: 'What happened' },
    { id: 'schedule', label: 'Schedule', href: '/schedule', hint: 'Who is where' },
    { id: 'jobs', label: 'Jobs', href: '/projects', hint: 'Active work' },
  ];
}

export function shiftHudCopy(shift: HudShift | null): HudShiftCopy {
  if (!shift || !shift.projectId) {
    return {
      title: 'Not on the clock',
      detail: 'Open a job and clock in when you start.',
      href: '/projects',
    };
  }

  const name = shift.projectName?.trim() || shift.projectNumber?.trim() || 'This job';
  const started = formatClockTime(shift.clockIn);
  return {
    title: 'On the clock',
    detail: started ? `${name} · started ${started}` : name,
    href: `/projects/${shift.projectId}`,
  };
}

export function shouldShowInstallHint(flags: {
  standalone: boolean;
  displayModeStandalone: boolean;
}): boolean {
  return !flags.standalone && !flags.displayModeStandalone;
}

export const INSTALL_HINT = {
  title: 'Add Foreman to your Home Screen',
  steps: 'Safari → Share → Add to Home Screen. Name it Foreman.',
} as const;

function formatClockTime(value: Date | string | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}
