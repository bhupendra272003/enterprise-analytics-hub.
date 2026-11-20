import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: "BHUPENDRA'S VYRON | Enterprise Intelligence Platform",
  description: 'A secure enterprise intelligence workspace for teams, data and decisions.'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}