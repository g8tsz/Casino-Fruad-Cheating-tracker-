import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Casino Fraud & Cheating Tracker',
  description: 'Track fraud, cheating, odd %, and bad requests for online and land-based casinos',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">{children}</body>
    </html>
  );
}
