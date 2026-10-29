'use client';
import * as React from 'react';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import { ConfirmProvider } from '@/components/ui/confirm';

export function Providers({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
  }, []);
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <ConfirmProvider>{children}</ConfirmProvider>
      <Toaster richColors closeButton position="top-right" toastOptions={{ duration: 4500 }} />
    </ThemeProvider>
  );
}
