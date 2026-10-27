import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { PhoneHud } from './phone-hud';
import { EMPTY_SIGNALS, buildAttentionList, buildKpis } from '@/lib/dashboard/dashboard-core';

afterEach(cleanup);

describe('PhoneHud', () => {
  it('renders the field home screen from existing dashboard data', () => {
    const attention = buildAttentionList(EMPTY_SIGNALS);
    const kpis = buildKpis({
      signals: EMPTY_SIGNALS,
      openProjects: 2,
      openTasks: 5,
      newLeads: 1,
      showMoney: false,
    });

    render(
      <PhoneHud
        orgName="PT's Tactical Renovations"
        headline="Nothing needs attention. Everything is on track."
        attention={attention}
        kpis={kpis}
        shift={null}
        mayClock={false}
      />,
    );

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      "PT's Tactical Renovations",
    );
    expect(screen.getByRole('heading', { name: 'Not on the clock' })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Field shortcuts' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Daily log/ })).toHaveAttribute('href', '/daily-logs');
    expect(screen.getByText('Active jobs')).toBeTruthy();
    expect(screen.getByText('Nothing outstanding.')).toBeTruthy();
  });

  it('clocks out against the live job, not a guessed one', () => {
    render(
      <PhoneHud
        orgName="PTTR"
        headline="One thing worth a look."
        attention={[]}
        kpis={[]}
        shift={{
          id: 'entry-1',
          projectId: 'job-4',
          projectName: 'Henderson kitchen',
          projectNumber: '26-014',
          clockIn: new Date('2026-10-27T13:05:00'),
        }}
        mayClock
      />,
    );

    expect(screen.getByRole('heading', { name: 'On the clock' })).toBeTruthy();
    expect(screen.getByText(/Henderson kitchen/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Clock out/ })).toBeTruthy();
  });
});
