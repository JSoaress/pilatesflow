'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Send, UserX, FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ResourceManager, type ResourceManagerProps } from '@/components/resource/resource-manager';
import { useConfirm } from '@/components/ui/confirm';
import { PatientPicker, type PickedPatient } from '@/components/app/agenda/patient-picker';
import { publishLegalDocument, anonymizePatient } from '@/lib/actions/settings';

function PublishAction({ row }: { row: Record<string, any> }) {
  const router = useRouter();
  const confirm = useConfirm();
  if (row.is_current) return <span className="text-xs text-success">Vigente</span>;
  return (
    <Button size="sm" variant="soft" onClick={async () => {
      if (!(await confirm({ title: `Publicar a versão ${row.version}?`, description: 'Ela passa a ser a versão vigente no site e nos aceites. A versão anterior fica guardada no histórico e não pode mais ser alterada.', confirmLabel: 'Publicar' })).confirmed) return;
      const r = await publishLegalDocument(row.id);
      if (r.ok) { toast.success('Versão publicada.'); router.refresh(); } else toast.error(r.error);
    }}><Send />Publicar</Button>
  );
}

export function LegalDocsManager(props: ResourceManagerProps) {
  return <ResourceManager {...props} rowActions={(row) => <PublishAction row={row} />} />;
}

/** Exportação e anonimização de um titular (respeita prazos legais de guarda do prontuário). */
export function SubjectTools() {
  const router = useRouter();
  const confirm = useConfirm();
  const [picked, setPicked] = React.useState<PickedPatient[]>([]);
  const p = picked[0];
  return (
    <div className="space-y-3">
      <PatientPicker value={picked} onChange={setPicked} multiple={false} placeholder="Buscar titular (aluno) por nome ou telefone…" />
      <div className="flex flex-wrap gap-2">
        <a href={p ? `/api/lgpd/export/${p.id}` : undefined} aria-disabled={!p} className={!p ? 'pointer-events-none opacity-50' : undefined}><Button variant="outline" disabled={!p}><FileDown />Exportar dados do titular (JSON)</Button></a>
        <Button variant="destructive" disabled={!p} onClick={async () => {
          const { confirmed, reason } = await confirm({ title: `Anonimizar ${p!.name}?`, description: 'Nome, contatos e documentos pessoais são substituídos de forma irreversível. Prontuários e registros financeiros são mantidos pelo prazo legal de guarda, sem identificação direta.', confirmLabel: 'Anonimizar', destructive: true, requireReason: true, reasonLabel: 'Número/descrição da solicitação do titular' });
          if (!confirmed) return;
          const r = await anonymizePatient(p!.id, null);
          if (r.ok) { toast.success(`Titular anonimizado. Registro: ${reason ?? ''}`); setPicked([]); router.refresh(); } else toast.error(r.error);
        }}><UserX />Anonimizar</Button>
      </div>
    </div>
  );
}
