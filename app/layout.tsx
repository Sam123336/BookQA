import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BookQA — Book-Grounded Question Answering with Page Citations',
  description: 'Grounded question answering system for 300+ page books with verified page-level citations.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-navy-950 text-slate-100 antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
