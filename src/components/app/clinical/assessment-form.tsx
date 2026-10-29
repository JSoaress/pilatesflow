'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/confirm';
import { saveAssessment } from '@/lib/actions/clinical';
import { assessmentType } from '@/lib/labels';
import { todayISO } from '@/lib/format';
import { PatientPicker, type PickedPatient } from '@/components/app/agenda/patient-picker';

export type FieldCfg = { key: string; label: string; unit: string | null; section: string; input_type: string };
const SECTIONS: Record<string, string> = { circumferences: 'Circunferências', rom: 'Amplitude de movimento', flexibility: 'Flexibilidade', strength: 'Força', mobility: 'Mobilidade', balance: 'Equilíbrio', coordination: 'Coordenação', endurance: 'Resistência', functional_tests: 'Testes funcionais', other: 'Outros' };

/** Avaliação física/funcional com campos configuráveis, IMC automático e escalas de dor e Borg. */
export function AssessmentForm({ assessment, fields, patient, staff }: { assessment?: Record<string, any> | null; fields: FieldCfg[]; patient?: PickedPatient | null; staff: { id: string; name: string }[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [patients, setPatients] = React.useState<PickedPatient[]>(patient ? [patient] : []);
  const [v, setV] = React.useState<Record<string, any>>({
    type: 'physical', assessed_on: todayISO(), staff_id: '', height_cm: '', weight_kg: '', pain_scale: '', borg_scale: '',
    postural_findings: '', notes: '', conclusion: '', next_assessment_on: '',
    ...Object.fromEntries(Object.entries(assessment ?? {}).filter(([k]) => k !== 'data').map(([k, x]) => [k, x ?? ''])),
  });
  const [data, setData] = React.useState<Record<string, string>>(Object.fromEntries(Object.entries(assessment?.data ?? {}).map(([k, x]) => [k, String(x)])));
  const [pending, setPending] = React.useState(false);
  const h = Number(String(v.height_cm).replace(',', '.')), w = Number(String(v.weight_kg).replace(',', '.'));
  const bmi = h > 0 && w > 0 ? w / (h / 100) ** 2 : null;
  const set = (k: string) => (e: React.ChangeEvent<any>) => setV({ ...v, [k]: e.target.value });
  const grouped = Object.entries(SECTIONS).map(([sec, title]) => ({ sec, title, list: fields.filter((f) => f.section === sec) })).filter((g) => g.list.length);

  const submit = async (finalize: boolean) => {
    if (!patients[0]) { toast.error('Selecione o aluno.'); return; }
    if (finalize) {
      const { confirmed } = await confirm({ title: 'Finalizar avaliação?', description: 'Depois de finalizada, a avaliação não poderá mais ser alterada.', confirmLabel: 'Finalizar' });
      if (!confirmed) return;
    }
    setPending(true);
    const payload = {
      patient_id: patients[0].id, type: v.type, assessed_on: v.assessed_on, staff_id: v.staff_id || null, height_cm: v.height_cm, weight_kg: v.weight_kg,
      pain_scale: v.pain_scale, borg_scale: v.borg_scale, postural_findings: v.postural_findings, notes: v.notes, conclusion: v.conclusion,
      next_assessment_on: v.next_assessment_on || null, finalize,
      data: Object.fromEntries(Object.entries(data).filter(([, x]) => x !== '').map(([k, x]) => {
        const f = fields.find((ff) => ff.key === k);
        const n = Number(String(x).replace(',', '.'));
        return [k, f?.input_type === 'text' || Number.isNaN(n) ? x : n];
      })),
    };
    const r = await saveAssessment(assessment?.id ?? null, payload as any);
    setPending(false);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(finalize ? 'Avaliação finalizada.' : 'Avaliação salva.');
    router.push(`/app/avaliacoes/${r.data?.id}`);
    router.refresh();
  };

  return (
    <form className="space-y-8" onSubmit={(e) => { e.preventDefault(); submit(false); }}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2"><p className="mb-1.5 text-sm font-medium">Aluno <span className="text-destructive">*</span></p>
          {assessment ? <p className="text-sm">{patient?.name}</p> : <PatientPicker value={patients} onChange={setPatients} multiple={false} />}</div>
        <Field label="Tipo" htmlFor="as-type"><Select id="as-type" value={v.type} onChange={set('type')}>{Object.entries(assessmentType).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="Data" htmlFor="as-date"><Input id="as-date" type="date" value={v.assessed_on} onChange={set('assessed_on')} /></Field>
        <Field label="Profissional" htmlFor="as-staff"><Select id="as-staff" value={v.staff_id} onChange={set('staff_id')}><option value="">Eu</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
      </div>

      <fieldset className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <legend className="mb-2 text-sm font-semibold text-muted-foreground">Antropometria e escalas</legend>
        <Field label="Altura (cm)" htmlFor="as-h"><Input id="as-h" inputMode="decimal" value={v.height_cm} onChange={set('height_cm')} /></Field>
        <Field label="Peso (kg)" htmlFor="as-w"><Input id="as-w" inputMode="decimal" value={v.weight_kg} onChange={set('weight_kg')} /></Field>
        <Field label="IMC" htmlFor="as-bmi" hint="Calculado automaticamente."><Input id="as-bmi" readOnly value={bmi ? bmi.toFixed(1).replace('.', ',') : ''} /></Field>
        <Field label="Escala de dor (0–10)" htmlFor="as-pain"><Input id="as-pain" type="number" min={0} max={10} value={v.pain_scale} onChange={set('pain_scale')} /></Field>
        <Field label="Escala de Borg (6–20)" htmlFor="as-borg"><Input id="as-borg" type="number" min={6} max={20} value={v.borg_scale} onChange={set('borg_scale')} /></Field>
      </fieldset>

      {grouped.map((g) => (
        <fieldset key={g.sec} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <legend className="mb-2 text-sm font-semibold text-muted-foreground">{g.title}</legend>
          {g.list.map((f) => (
            <Field key={f.key} label={`${f.label}${f.unit ? ` (${f.unit})` : ''}`} htmlFor={`as-${f.key}`}>
              <Input id={`as-${f.key}`} inputMode={f.input_type === 'text' ? 'text' : 'decimal'} value={data[f.key] ?? ''} onChange={(e) => setData({ ...data, [f.key]: e.target.value })} />
            </Field>
          ))}
        </fieldset>
      ))}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Achados posturais" htmlFor="as-post" className="sm:col-span-2"><Textarea id="as-post" rows={3} value={v.postural_findings} onChange={set('postural_findings')} /></Field>
        <Field label="Observações" htmlFor="as-notes"><Textarea id="as-notes" rows={3} value={v.notes} onChange={set('notes')} /></Field>
        <Field label="Conclusão" htmlFor="as-concl"><Textarea id="as-concl" rows={3} value={v.conclusion} onChange={set('conclusion')} /></Field>
        <Field label="Próxima reavaliação" htmlFor="as-next"><Input id="as-next" type="date" value={v.next_assessment_on} onChange={set('next_assessment_on')} /></Field>
      </div>
      <p className="text-xs text-muted-foreground">As fotos posturais (anterior, posterior e laterais) podem ser enviadas após salvar.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="outline" loading={pending}><Save /> Salvar rascunho</Button>
        <Button type="button" onClick={() => submit(true)} disabled={pending}><Lock /> Finalizar avaliação</Button>
      </div>
    </form>
  );
}
