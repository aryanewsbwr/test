import type { Metadata, Viewport } from 'next';

// The staff app for tablets (/t). It is the /m app with the "tablet" class on the page, which
// turns on the side bar, wider page and two-column screens whatever size the tablet reports.
export const metadata: Metadata = {
  title: 'आर्यन न्यूज़ टैबलेट',
  manifest: '/t.webmanifest',
  appleWebApp: { capable: true, title: 'आर्यन न्यूज़ टैबलेट', statusBarStyle: 'default' },
  icons: { apple: '/m-icon-192.png' }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#13315c'
};

export default function TabletLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('tablet')" }} />
      <link href="https://fonts.googleapis.com/css2?family=Mukta:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      {children}
    </>
  );
}
