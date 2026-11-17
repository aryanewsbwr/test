import type { Metadata, Viewport } from 'next';

// The staff mobile app: its own name, icon and colours, so "Add to Home screen" gives an app of its own
export const metadata: Metadata = {
  title: 'आर्यन न्यूज़',
  manifest: '/m.webmanifest',
  appleWebApp: { capable: true, title: 'आर्यन न्यूज़', statusBarStyle: 'default' },
  icons: { apple: '/m-icon-192.png' }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#13315c'
};

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Mukta:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      {children}
    </>
  );
}
