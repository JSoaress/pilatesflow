'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Copy, Send, ClipboardEdit, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/input';
import { createAnamnesis, submitAnamnesisStaff, sendAnamnesisLink } from '@/lib/actions/clinical';
import { AnamnesisForm, AnamnesisView, type Question } from './anamnesis-form';

export function NewAnamnesisButton({ patientId, templates }: { patientId: string; templates: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [tpl, setTpl] = React.useState(templates[0]?.id ?? '');
  const [link, setLink] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  return (
    <>
      <Button size="sm" onClick={() => { setLink(null); setOpen(true); }} disabled={!templates.length}><Plus /> Nova anamnese</Button>
      <Dialog open={open} onOpenChange={setOpen} size="sm" title="Nova anamnese">
        {!link ? (
          <div className="space-y-4">
            <Field label="Modelo" htmlFor="an-tpl"><Select id="an-tpl" value={tpl} onChange={(e) => setTpl(e.target.value)}>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
            <Button loading={pending} onClick={async () => {
              setPending(true);
              const r = await createAnamnesis(patientId, tpl);
              setPending(false);
              if (!r.ok) { toast.error(r.error); return; }
              setLink(r.data?.link ?? null);
              router.refresh();
            }}>Criar anamnese</Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm">Anamnese criada. Envie este link para o aluno preencher (válido por 14 dias):</p>
            <div className="flex gap-2"><Input readOnly value={link} aria-label="Link da anamnese" /><Button variant="outline" size="icon" aria-label="Copiar link" onClick={() => { navigator.clipboard.writeText(link); toast.success('Link copiado.'); }}><Copy /></Button></div>
          </div>
        )}
      </Dialog>
    </>
  );
}

export function AnamnesisActions({ anamnesis, patientId, canEdit, canSend }: { anamnesis: { id: string; status: string; link: string | null; questions: Question[]; answers: Record<string, unknown> }; patientId: string; canEdit: boolean; canSend: boolean }) {
  const router = useRouter();
  const [fill, setFill] = React.useState(false);
  const [view, setView] = React.useState(false);
  if (anamnesis.status === 'completed') {
    return (
      <>
        <Button size="sm" variant="outline" onClick={() => setView(true)}><Eye /> Ver respostas</Button>
        <Dialog open={view} onOpenChange={setView} size="lg" title="Respostas da anamnese"><AnamnesisView questions={anamnesis.questions} answers={anamnesis.answers} /></Dialog>
      </>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      {anamnesis.link && <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(anamnesis.link!); toast.success('Link copiado.'); }}><Copy /> Copiar link</Button>}
      {canSend && <Button size="sm" variant="ghost" onClick={async () => { const r = await sendAnamnesisLink(anamnesis.id, patientId, 'whatsapp'); if (r.ok) toast.success(r.data?.message ?? 'Enviado para a fila.'); else toast.error(r.error); }}><Send /> WhatsApp</Button>}
      {canEdit && <Button size="sm" variant="outline" onClick={() => setFill(true)}><ClipboardEdit /> Preencher agora</Button>}
      <Dialog open={fill} onOpenChange={setFill} size="lg" title="Preencher anamnese">
        <AnamnesisForm questions={anamnesis.questions} onSubmit={async (answers, signature) => {
          const r = await submitAnamnesisStaff(anamnesis.id, patientId, answers, signature);
          if (!r.ok) { toast.error(r.error); return false; }
          toast.success('Anamnese registrada.');
          setFill(false);
          router.refresh();
          return true;
        }} />
      </Dialog>
    </div>
  );
}
