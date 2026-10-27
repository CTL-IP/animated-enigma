'use client';

import { useSyncExternalStore } from 'react';
import { INSTALL_HINT, shouldShowInstallHint } from '@/lib/hud/hud-core';

function displayModeStandalone() {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia('(display-mode: standalone)')
    : { matches: false, addEventListener() {}, removeEventListener() {} };
}

function subscribe(onStoreChange: () => void) {
  const media = displayModeStandalone();
  media.addEventListener('change', onStoreChange);
  return () => media.removeEventListener('change', onStoreChange);
}

function standaloneSnapshot() {
  const media = displayModeStandalone();
  const safariStandalone =
    'standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return shouldShowInstallHint({
    standalone: safariStandalone,
    displayModeStandalone: media.matches,
  })
    ? 'browser'
    : 'standalone';
}

/** Shown in Safari. Hidden once the app is already on the Home Screen. */
export function InstallHint() {
  const mode = useSyncExternalStore(subscribe, standaloneSnapshot, () => 'browser');
  if (mode !== 'browser') return null;

  return (
    <aside
      className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm"
      aria-label="Install Foreman on this phone"
    >
      <p className="font-semibold">{INSTALL_HINT.title}</p>
      <p className="mt-1 text-muted-foreground">{INSTALL_HINT.steps}</p>
    </aside>
  );
}