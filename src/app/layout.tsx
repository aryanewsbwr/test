import type { Metadata, Viewport } from 'next';
import './globals.css';
import './desktop2-base.css';
import './desktop2.css';

export const metadata: Metadata = {
  title: 'Aryan News Agency Management System',
  description: 'Full Newspaper & Publication Management System (Mobile, Tablet & Desktop)',
  // The office website installs as its own app ("Aryan Office"); the staff app /m has its own
  manifest: '/app.webmanifest',
  appleWebApp: { capable: true, title: 'Aryan Office', statusBarStyle: 'default' },
  icons: { apple: '/app-icon-192.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Noto+Sans+Devanagari:wght@400;500;600;700&display=swap" rel="stylesheet" />
        {/* Turns the Desktop 2 look on before the first paint, so the loading screen already has it.
            Phones always get it: the classic look does not fit a phone. */}
        <script dangerouslySetInnerHTML={{ __html: "var p=location.pathname;if(p!=='/m'&&p.indexOf('/m/')!==0)document.documentElement.classList.add('desktop2')" }} />
      </head>
      <body className="antialiased min-h-screen bg-[#3A6EA5] flex flex-col justify-between">
        {children}
      </body>
    </html>
  );
}
