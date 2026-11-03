import type { Metadata, Viewport } from 'next';
import './globals.css';
import './desktop2-base.css';
import './desktop2.css';

export const metadata: Metadata = {
  title: 'Aryan News Agency Management System',
  description: 'Full Newspaper & Publication Management System (Mobile, Tablet & Desktop)',
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
    <html lang="en">
      <body className="antialiased min-h-screen bg-[#3A6EA5] flex flex-col justify-between">
        {children}
      </body>
    </html>
  );
}
