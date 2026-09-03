import type { ReactNode } from 'react';
import 'fumadocs-ui/style.css';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
