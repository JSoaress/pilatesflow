'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontal, Send, Archive, UserX, FileDown, Camera } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Menu, MenuItem, MenuLink } from '@/components/ui/menu';
import { useConfirm } from '@/components/ui/confirm';
import { archivePatient, invitePatientToPortal, revokePortal, uploadPatientPhoto } from '@/lib/actions/patients';

export function PatientActions({ patient, can }: { patient: { id: string; full_name: string; email: string | null; user_id: string | null; status: string }; can: { edit: boolean; delete: boolean; lgpd: boolean } }) {
  const router = useRouter();
  const confirm = useConfirm();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  if (!can.edit && !can.delete && !can.lgpd) return null;
  return (
    <>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        const fd = new FormData(); fd.append('file', f);
        setBusy(true);
        const r = await uploadPatientPhoto(patient.id, fd);
        setBusy(false);
        if (r.ok) { toast.success('Foto atualizada.'); router.refresh(); } else toast.error(r.error);
        e.target.value = '';
      }} />
      <Menu trigger={(p) => <Button variant="outline" size="icon" aria-label="Mais ações" disabled={busy} {...p}><MoreHorizontal /></Button>}>
        {(close) => (
          <>
            {can.edit && <MenuItem onClick={() => { close(); fileRef.current?.click(); }}><Camera /> Alterar foto</MenuItem>}
            {can.edit && !patient.user_id && (
              <MenuItem onClick={async () => {
                close();
                if (!patient.email) { toast.error('Cadastre o e-mail do aluno para enviar o convite.'); return; }
                const { confirmed } = await confirm({ title: 'Enviar acesso ao portal?', description: `Um convite será enviado para ${patient.email}. O aluno poderá ver suas aulas, pagamentos e documentos — nunca o prontuário interno.` });
                if (!confirmed) return;
                const r = await invitePatientToPortal(patient.id);
                if (r.ok) { toast.success(r.data?.message ?? 'Convite enviado.'); router.refresh(); } else toast.error(r.error);
              }}><Send /> Enviar acesso ao portal</MenuItem>
            )}
            {can.edit && patient.user_id && (
              <MenuItem onClick={async () => {
                close();
                const { confirmed } = await confirm({ title: 'Remover acesso ao portal?', destructive: true, confirmLabel: 'Remover acesso' });
                if (!confirmed) return;
                const r = await revokePortal(patient.id);
                if (r.ok) { toast.success('Acesso removido.'); router.refresh(); } else toast.error(r.error);
              }}><UserX /> Remover acesso ao portal</MenuItem>
            )}
            {can.lgpd && <MenuLink href={`/api/lgpd/export/${patient.id}`} onClick={close}><FileDown /> Exportar dados (LGPD)</MenuLink>}
            {can.delete && (
              <MenuItem destructive onClick={async () => {
                close();
                const { confirmed } = await confirm({ title: `Arquivar ${patient.full_name}?`, description: 'O cadastro deixará de aparecer nas listas. Registros clínicos e financeiros são mantidos conforme a lei.', destructive: true, confirmLabel: 'Arquivar' });
                if (!confirmed) return;
                const r = await archivePatient(patient.id);
                if (r.ok) { toast.success('Cadastro arquivado.'); router.push('/app/alunos'); } else toast.error(r.error);
              }}><Archive /> Arquivar cadastro</MenuItem>
            )}
          </>
        )}
      </Menu>
    </>
  );
}
