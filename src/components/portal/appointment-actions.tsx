'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useConfirm } from '@/components/ui/confirm';
import { portalCancel, portalConfirm } from '@/lib/actions/portal';
import { participantStatus } from '@/lib/labels';
import { dateTime } from '@/lib/format';

export function PortalAppointmentActions({ a }: { a: { participant_id: string; status: string; can_cancel: boolean; cancel_with_credit_until: string; starts_at: string } }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = React.useState(false);
  const withCredit = new Date(a.cancel_with_credit_until).getTime() > Date.now();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={a.status === 'confirmed' ? 'default' : a.status === 'cancelled' ? 'neutral' : 'info'}>{participantStatus[a.status] ?? a.status}</Badge>
      {a.status === 'scheduled' && <Button size="sm" variant="outline" loading={busy} onClick={async () => { setBusy(true); const r = await portalConfirm(a.participant_id); setBusy(false); if (r.ok) { toast.success('Presença confirmada!'); router.refresh(); } else toast.error(r.error); }}>Confirmar</Button>}
      {a.can_cancel && <Button size="sm" variant="ghost" onClick={async () => {
        const { confirmed } = await confirm({
          title: 'Cancelar esta aula?',
          description: withCredit ? `Cancelando até ${dateTime(a.cancel_with_credit_until)} você recebe crédito de reposição (conforme seu plano).` : 'O prazo para cancelamento com crédito de reposição já passou. A aula será cancelada sem reposição.',
          destructive: true, confirmLabel: 'Cancelar aula',
        });
        if (!confirmed) return;
        const r = await portalCancel(a.participant_id);
        if (r.ok) { toast.success((r.data as any)?.message ?? 'Aula cancelada.'); router.refresh(); } else toast.error(r.error);
      }}>Cancelar</Button>}
    </div>
  );
}
