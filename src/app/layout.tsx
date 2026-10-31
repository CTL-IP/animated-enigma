import type { Metadata, Viewport } from 'next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: "PT's Tactical Foreman",
    template: "%s · PT's Tactical Foreman",
  },
  description: 'AI-powered general contractor command system for PT’s Tactical Renovations.',
  applicationName: "PT's Tactical Foreman",
  // Installed from Safari's share sheet, the app opens full-screen under its
  // own name; the manifest covers Android and desktop browsers.
  appleWebApp: { capable: true, title: 'Foreman', statusBarStyle: 'default' },
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#0f0e0c',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
