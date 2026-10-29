'use client';
import * as React from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

/** Botão "Instalar aplicativo" (PWA) — aparece quando o navegador permite instalar. */
export function InstallButton({ className, compact }: { className?: string; compact?: boolean }) {
  const [evt, setEvt] = React.useState<BIPEvent | null>(null);
  const [installed, setInstalled] = React.useState(false);
  React.useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as BIPEvent); };
    const onInstalled = () => { setInstalled(true); setEvt(null); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    if (window.matchMedia('(display-mode: standalone)').matches) setInstalled(true);
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled); };
  }, []);
  if (installed || !evt) return null;
  return (
    <Button variant="soft" size={compact ? 'sm' : 'default'} className={className} onClick={async () => { await evt.prompt(); await evt.userChoice; setEvt(null); }}>
      <Download /> Instalar aplicativo
    </Button>
  );
}
