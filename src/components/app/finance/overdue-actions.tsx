'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Send, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { sendOverdueReminder } from '@/lib/actions/communication';

export function OverdueActions({ receivableId, whatsappHref, canSend }: { receivableId: string; whatsappHref: string | null; canSend: boolean }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  return (
    <div className="flex justify-end gap-1">
      {whatsappHref && <a href={whatsappHref} target="_blank" rel="noopener noreferrer"><Button size="sm" variant="ghost"><MessageCircle /> WhatsApp</Button></a>}
      {canSend && <Button size="sm" variant="outline" loading={pending} onClick={async () => {
        setPending(true);
        const r = await sendOverdueReminder(receivableId);
        setPending(false);
        if (r.ok) { (r.data?.message?.includes('não enviada') ? toast.warning : toast.success)(r.data?.message ?? 'Ok'); router.refresh(); } else toast.error(r.error);
      }}><Send /> Enviar cobrança</Button>}
    </div>
  );
}
