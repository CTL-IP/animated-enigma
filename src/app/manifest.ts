import type { MetadataRoute } from 'next';

/**
 * The web app manifest: what lets a phone or a desktop browser install the app
 * to the home screen or the dock with its own icon and no browser chrome.
 *
 * `start_url` is the dashboard, which is where a signed-in person lands; a
 * signed-out one is bounced to login by the middleware and comes back. No
 * service worker, deliberately: every screen is server-rendered behind a
 * session, so there is nothing honest to show offline — a cached page would be
 * a stale page presented as current.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PT's Tactical Foreman",
    short_name: 'Foreman',
    description:
      'The command system for PT’s Tactical Renovations: jobs, crews, estimates, invoices.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: '#0f0e0c',
    theme_color: '#0f0e0c',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
