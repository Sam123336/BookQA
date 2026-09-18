import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'BookQA — Book-Grounded Question Answering with Page Citations',
  description: 'Grounded question answering system for 300+ page books with verified page-level citations.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${inter.variable}`}>
      <body className="min-h-dvh bg-surface-base font-sans text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
