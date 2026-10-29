'use client';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cancelQueuedMessage } from '@/lib/actions/communication';

export function CancelMessageButton({ id }: { id: string }) {
  const router = useRouter();
  return <Button size="sm" variant="ghost" onClick={async () => { const r = await cancelQueuedMessage(id); if (r.ok) { toast.success('Envio cancelado.'); router.refresh(); } else toast.error(r.error); }}>Cancelar envio</Button>;
}
