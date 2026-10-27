import { describe, it, expect } from 'vitest';
import {
  INSTALL_HINT,
  hudQuickActions,
  shiftHudCopy,
  shouldShowInstallHint,
} from './hud-core';

describe('hudQuickActions', () => {
  it('keeps four thumb-zone destinations', () => {
    const actions = hudQuickActions({});
    expect(actions).toHaveLength(4);
    expect(actions.map((a) => a.id)).toEqual(['clock', 'logs', 'schedule', 'jobs']);
  });

  it('sends Clock to the open job when there is one', () => {
    const [clock] = hudQuickActions({ openProjectId: 'job-9' });
    expect(clock!.href).toBe('/projects/job-9');
  });

  it('sends Clock to the job list when nobody is clocked in', () => {
    const [clock] = hudQuickActions({ openProjectId: null });
    expect(clock!.href).toBe('/projects');
  });
});

describe('shiftHudCopy', () => {
  it('does not invent a job when there is no open shift', () => {
    const copy = shiftHudCopy(null);
    expect(copy.title).toBe('Not on the clock');
    expect(copy.href).toBe('/projects');
    expect(copy.detail).not.toMatch(/started/);
  });

  it('names the live job and the start time', () => {
    const copy = shiftHudCopy({
      id: 'e1',
      projectId: 'p1',
      projectName: 'Henderson kitchen',
      projectNumber: '26-014',
      clockIn: new Date('2026-10-27T13:05:00'),
    });
    expect(copy.title).toBe('On the clock');
    expect(copy.href).toBe('/projects/p1');
    expect(copy.detail).toContain('Henderson kitchen');
    expect(copy.detail).toContain('started');
  });

  it('falls back to the job number when the name is missing', () => {
    const copy = shiftHudCopy({
      id: 'e2',
      projectId: 'p2',
      projectName: null,
      projectNumber: '26-014',
      clockIn: null,
    });
    expect(copy.detail).toBe('26-014');
  });
});

describe('shouldShowInstallHint', () => {
  it('hides once the app is already on the home screen', () => {
    expect(shouldShowInstallHint({ standalone: true, displayModeStandalone: false })).toBe(false);
    expect(shouldShowInstallHint({ standalone: false, displayModeStandalone: true })).toBe(false);
  });

  it('shows in a browser tab', () => {
    expect(shouldShowInstallHint({ standalone: false, displayModeStandalone: false })).toBe(true);
  });
});

describe('INSTALL_HINT', () => {
  it('tells someone to use Safari Share, not a store', () => {
    expect(INSTALL_HINT.title).toContain('Home Screen');
    expect(INSTALL_HINT.steps).toContain('Safari');
    expect(INSTALL_HINT.steps).not.toMatch(/App Store|Play Store/i);
  });
});
