'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontal, Undo2, XCircle, Receipt, PauseCircle, PlayCircle, Ban, FileSignature, Send, FileDown } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Menu, MenuItem, MenuLink } from '@/components/ui/menu';
import { useConfirm } from '@/components/ui/confirm';
import { refundPayment, cancelReceivable, changeSubscriptionStatus, generateContract, setContractStatus } from '@/lib/actions/finance';

async function done(r: { ok: boolean; error?: string }, msg: string, router: ReturnType<typeof useRouter>) {
  if (r.ok) { toast.success(msg); router.refresh(); } else toast.error(r.error);
}

export function PaymentRowActions({ paymentId, status, canRefund }: { paymentId: string; status: string; canRefund: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  return (
    <Menu trigger={(p) => <Button variant="ghost" size="icon-sm" aria-label="Ações do pagamento" {...p}><MoreHorizontal /></Button>}>
      {(close) => (
        <>
          <MenuLink href={`/api/receipts/${paymentId}`} onClick={close}><Receipt /> Recibo (PDF)</MenuLink>
          {canRefund && status === 'confirmed' && (
            <MenuItem destructive onClick={async () => {
              close();
              const { confirmed, reason } = await confirm({ title: 'Estornar pagamento?', description: 'Será lançada uma saída no caixa e o título voltará a ficar em aberto. A operação fica registrada na auditoria.', requireReason: true, destructive: true, confirmLabel: 'Estornar' });
              if (confirmed && reason) done(await refundPayment(paymentId, reason), 'Pagamento estornado.', router);
            }}><Undo2 /> Estornar</MenuItem>
          )}
        </>
      )}
    </Menu>
  );
}

export function ReceivableRowActions({ id, canEdit }: { id: string; canEdit: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  if (!canEdit) return null;
  return (
    <Menu trigger={(p) => <Button variant="ghost" size="icon-sm" aria-label="Ações do título" {...p}><MoreHorizontal /></Button>}>
      {(close) => (
        <MenuItem destructive onClick={async () => {
          close();
          const { confirmed, reason } = await confirm({ title: 'Cancelar esta cobrança?', requireReason: true, destructive: true, confirmLabel: 'Cancelar cobrança' });
          if (confirmed && reason) done(await cancelReceivable(id, reason), 'Cobrança cancelada.', router);
        }}><XCircle /> Cancelar cobrança</MenuItem>
      )}
    </Menu>
  );
}

export function SubscriptionRowActions({ id, status, canEdit, canContract }: { id: string; status: string; canEdit: boolean; canContract: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  return (
    <Menu trigger={(p) => <Button variant="ghost" size="icon-sm" aria-label="Ações do plano" {...p}><MoreHorizontal /></Button>}>
      {(close) => (
        <>
          {canContract && <MenuItem onClick={async () => { close(); done(await generateContract(id), 'Contrato gerado (rascunho).', router); }}><FileSignature /> Gerar contrato</MenuItem>}
          {canEdit && status === 'active' && <MenuItem onClick={async () => {
            close();
            const { confirmed } = await confirm({ title: 'Pausar plano?', description: 'O aluno ficará com status Pausado.' });
            if (confirmed) done(await changeSubscriptionStatus(id, 'paused'), 'Plano pausado.', router);
          }}><PauseCircle /> Pausar</MenuItem>}
          {canEdit && status === 'paused' && <MenuItem onClick={async () => { close(); done(await changeSubscriptionStatus(id, 'active'), 'Plano reativado.', router); }}><PlayCircle /> Reativar</MenuItem>}
          {canEdit && ['active', 'paused'].includes(status) && <MenuItem destructive onClick={async () => {
            close();
            const { confirmed, reason } = await confirm({ title: 'Cancelar plano?', description: 'A renovação automática será desligada e as cobranças em aberto sem pagamento serão canceladas.', requireReason: true, destructive: true, confirmLabel: 'Cancelar plano' });
            if (confirmed && reason) done(await changeSubscriptionStatus(id, 'cancelled', reason, undefined, true), 'Plano cancelado.', router);
          }}><Ban /> Cancelar plano</MenuItem>}
        </>
      )}
    </Menu>
  );
}

export function ContractRowActions({ id, status, canEdit }: { id: string; status: string; canEdit: boolean }) {
  const router = useRouter();
  return (
    <Menu trigger={(p) => <Button variant="ghost" size="icon-sm" aria-label="Ações do contrato" {...p}><MoreHorizontal /></Button>}>
      {(close) => (
        <>
          <MenuLink href={`/api/contracts/${id}/pdf`} onClick={close}><FileDown /> Baixar PDF</MenuLink>
          {canEdit && status === 'draft' && <MenuItem onClick={async () => { close(); done(await setContractStatus(id, 'sent'), 'Contrato enviado ao portal do aluno para aceite.', router); }}><Send /> Enviar para aceite</MenuItem>}
          {canEdit && ['draft', 'sent'].includes(status) && <MenuItem destructive onClick={async () => { close(); done(await setContractStatus(id, 'cancelled'), 'Contrato cancelado.', router); }}><Ban /> Cancelar</MenuItem>}
        </>
      )}
    </Menu>
  );
}
