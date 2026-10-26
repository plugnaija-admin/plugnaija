import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'PlugNaija Pro Admin', description: 'Marketplace operations dashboard' };
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) { return <html lang="en"><body>{children}</body></html>; }
