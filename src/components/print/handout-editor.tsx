'use client';
import * as React from 'react';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea, Checkbox } from '@/components/ui/input';
import { PrintBar } from './print-bar';
import { PrintSheet, PrintSection } from './doc';
import { RichText } from './rich-text';
import { saveHandoutCopy } from '@/lib/actions/clinical';
import type { PrintOrg } from '@/lib/print';

type Tpl = { id: string; type: string; name: string; body: string };
const render = (body: string, vars: Record<string, string>) => body.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, k) => vars[k] ?? '');

/** Monta a folha a partir de um modelo (com variáveis do aluno), permite editar e imprimir. */
export function HandoutEditor({ org, patient, templates, vars, initialTemplate, upcoming, planLine, canSave }: {
  org: PrintOrg; patient: { id: string; name: string }; templates: Tpl[]; vars: Record<string, string>; initialTemplate: string | null;
  upcoming: string[]; planLine: string | null; canSave: boolean;
}) {
  const start = templates.find((t) => t.id === initialTemplate) ?? templates.find((t) => t.type === 'handout') ?? null;
  const [tpl, setTpl] = React.useState<string>(start?.id ?? '');
  const [title, setTitle] = React.useState(start?.name ?? 'Orientações');
  const [body, setBody] = React.useState(start ? render(start.body, vars) : '');
  const [withClasses, setWithClasses] = React.useState(upcoming.length > 0);
  const [withPlan, setWithPlan] = React.useState(!!planLine);
  const [notes, setNotes] = React.useState(true);
  const [signer, setSigner] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  const pick = (id: string) => {
    setTpl(id);
    const t = templates.find((x) => x.id === id);
    setSaved(false);
    if (t) { setTitle(t.name); setBody(render(t.body, vars)); } else { setTitle('Orientações'); setBody(''); }
  };

  return (
    <>
      <PrintBar title={`Folha para ${patient.name}`}>
        {canSave && (
          <Button size="sm" variant="outline" loading={saving} disabled={saved} onClick={async () => {
            setSaving(true);
            const extra = [withPlan && planLine ? `\n\n## Seu plano\n${planLine}` : '', withClasses && upcoming.length ? `\n\n## Próximas aulas\n${upcoming.map((u) => `- ${u}`).join('\n')}` : ''].join('');
            const r = await saveHandoutCopy(patient.id, { title, content: body + extra, template_id: tpl || null });
            setSaving(false);
            if (r.ok) { setSaved(true); toast.success('Cópia guardada na ficha do aluno (aba Documentos).'); } else toast.error(r.error);
          }}><Save />{saved ? 'Cópia salva' : 'Salvar cópia na ficha'}</Button>
        )}
      </PrintBar>

      <div className="no-print mx-auto mt-4 grid max-w-[210mm] gap-3 rounded-xl border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Modelo" htmlFor="ho-tpl" hint="Crie e edite modelos em Configurações → Modelos.">
            <Select id="ho-tpl" value={tpl} onChange={(e) => pick(e.target.value)}>
              <option value="">Em branco</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
          <Field label="Título" htmlFor="ho-title"><Input id="ho-title" value={title} onChange={(e) => { setTitle(e.target.value); setSaved(false); }} /></Field>
        </div>
        <Field label="Texto" htmlFor="ho-body" hint='Use "## " para subtítulos e "- " para listas. A folha abaixo atualiza na hora.'>
          <Textarea id="ho-body" rows={10} value={body} onChange={(e) => { setBody(e.target.value); setSaved(false); }} className="font-mono text-xs" />
        </Field>
        <div className="flex flex-wrap gap-x-5">
          {planLine && <Checkbox checked={withPlan} onChange={(e) => setWithPlan(e.target.checked)} label="Incluir plano" />}
          {upcoming.length > 0 && <Checkbox checked={withClasses} onChange={(e) => setWithClasses(e.target.checked)} label={`Incluir próximas aulas (${upcoming.length})`} />}
          <Checkbox checked={notes} onChange={(e) => setNotes(e.target.checked)} label="Linhas para anotações" />
        </div>
        <Field label="Assinatura (opcional)" htmlFor="ho-sign"><Input id="ho-sign" value={signer} onChange={(e) => setSigner(e.target.value)} placeholder="Nome e registro do profissional" /></Field>
      </div>

      <PrintSheet org={org} title={title || 'Orientações'} subtitle={<>Para: {patient.name}</>}>
        {body.trim() ? <RichText text={body} /> : <p className="italic text-neutral-400 print:hidden">Escolha um modelo ou escreva o texto acima.</p>}
        {withPlan && planLine && <PrintSection title="Seu plano"><p className="text-[10.5pt]">{planLine}</p></PrintSection>}
        {withClasses && upcoming.length > 0 && (
          <PrintSection title="Próximas aulas">
            <ul className="grid grid-cols-1 gap-1 text-[10pt] sm:grid-cols-2 print:grid-cols-2">{upcoming.map((u) => <li key={u} className="rounded border border-neutral-300 px-2 py-1">{u}</li>)}</ul>
          </PrintSection>
        )}
        {notes && (
          <PrintSection title="Anotações">
            <div className="space-y-[7mm] pt-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="border-b border-neutral-300" />)}</div>
          </PrintSection>
        )}
        {signer.trim() && <div className="avoid-break mt-10 w-[75mm] border-t border-black pt-1 text-center text-[9pt]">{signer}</div>}
      </PrintSheet>
    </>
  );
}
