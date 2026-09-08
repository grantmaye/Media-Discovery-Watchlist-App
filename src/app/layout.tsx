import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Frame / A place for your next film',
  description: 'An independent film discovery and watchlist demo.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
