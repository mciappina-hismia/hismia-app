import type { Metadata } from 'next';
import type { ReactElement, ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hismia',
  description: 'Historia clínica personal con permisos profesionales revocables.',
};

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps): ReactElement {
  return (
    // Browser extensions (Live Translate, Czech Shortcut, others) mutate
    // `<html>` and `<body>` with their own attributes (`data-lt-installed`,
    // `cz-shortcut-listen`, etc.). The server-rendered tree cannot anticipate
    // these. `suppressHydrationWarning` on both tags makes React skip the
    // comparison for these two nodes only; the rest of the tree still
    // hydrates strictly. The fix does not weaken the hydration check on
    // user content.
    <html lang="es" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
