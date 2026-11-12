'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Eye, FileDown } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Select } from '@/components/ui/input';
import { createFicha, submitFicha, type FichaQuestion } from '@/lib/actions/clinical';
import { AnamnesisForm, AnamnesisView } from './anamnesis-form';

/** Cria a ficha e já abre o preenchimento no mesmo diálogo — sem link público, sempre feito pela equipe. */
export function NewFichaButton({ patientId, templates }: { patientId: string; templates: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [tpl, setTpl] = React.useState(templates[0]?.id ?? '');
  const [ficha, setFicha] = React.useState<{ id: string; questions: FichaQuestion[] } | null>(null);
  const [pending, setPending] = React.useState(false);
  return (
    <>
      <Button size="sm" onClick={() => { setFicha(null); setOpen(true); }} disabled={!templates.length}><Plus /> Nova ficha</Button>
      <Dialog open={open} onOpenChange={setOpen} size="lg" title={ficha ? 'Preencher ficha' : 'Nova ficha de avaliação'}>
        {!ficha ? (
          <div className="space-y-4">
            <Field label="Modelo" htmlFor="ficha-tpl"><Select id="ficha-tpl" value={tpl} onChange={(e) => setTpl(e.target.value)}>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
            <Button loading={pending} onClick={async () => {
              setPending(true);
              const r = await createFicha(patientId, tpl);
              setPending(false);
              if (!r.ok) { toast.error(r.error); return; }
              setFicha({ id: r.data!.id, questions: r.data!.questions });
            }}>Iniciar preenchimento</Button>
          </div>
        ) : (
          <AnamnesisForm questions={ficha.questions} submitLabel="Salvar ficha" onSubmit={async (answers, signature) => {
            const r = await submitFicha(ficha.id, patientId, answers, signature);
            if (!r.ok) { toast.error(r.error); return false; }
            toast.success('Ficha registrada.');
            setOpen(false);
            router.refresh();
            return true;
          }} />
        )}
      </Dialog>
    </>
  );
}

export function FichaActions({ ficha, patientId, canEdit }: { ficha: { id: string; status: string; questions: FichaQuestion[]; answers: Record<string, unknown> }; patientId: string; canEdit?: boolean }) {
  const router = useRouter();
  const [view, setView] = React.useState(false);
  const [fill, setFill] = React.useState(false);
  if (ficha.status !== 'finalized') {
    if (!canEdit) return null;
    return (
      <>
        <Button size="sm" variant="outline" onClick={() => setFill(true)}>Continuar preenchimento</Button>
        <Dialog open={fill} onOpenChange={setFill} size="lg" title="Preencher ficha">
          <AnamnesisForm questions={ficha.questions} submitLabel="Salvar ficha" onSubmit={async (answers, signature) => {
            const r = await submitFicha(ficha.id, patientId, answers, signature);
            if (!r.ok) { toast.error(r.error); return false; }
            toast.success('Ficha registrada.');
            setFill(false);
            router.refresh();
            return true;
          }} />
        </Dialog>
      </>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      <Button size="sm" variant="outline" onClick={() => setView(true)}><Eye /> Ver respostas</Button>
      <Link href={`/api/fichas/${ficha.id}/pdf`} target="_blank"><Button size="sm" variant="ghost"><FileDown /> Baixar PDF</Button></Link>
      <Dialog open={view} onOpenChange={setView} size="lg" title="Respostas da ficha"><AnamnesisView questions={ficha.questions} answers={ficha.answers} /></Dialog>
    </div>
  );
}
