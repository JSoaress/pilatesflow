'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Eye, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field as FF, Input, Select, Textarea } from '@/components/ui/input';
import { saveEvaluationTemplate } from '@/lib/actions/evaluation';
import { slug } from '@/lib/evaluation/build';
import type { Field, Section } from '@/lib/evaluation/types';
import { FieldControl } from './fields';
import { cn } from '@/lib/utils';

const TYPES: [Field['type'], string][] = [
  ['text', 'Texto curto'], ['textarea', 'Texto longo'], ['number', 'Número'], ['date', 'Data'], ['yesno', 'Sim / Não'],
  ['single', 'Escolha única'], ['multi', 'Múltipla escolha'], ['scale', 'Escala 0–10'], ['bp', 'Pressão arterial'],
  ['bilateral', 'Direito / Esquerdo'], ['grid', 'Tabela'], ['info', 'Texto informativo / subtítulo'],
];
const linesToOpts = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const m = l.match(/^(.*?)\s*=\s*(-?\d+(?:[.,]\d+)?)$/); const lbl = m ? m[1] : l; return { value: slug(lbl) || lbl.slice(0, 30), label: lbl, ...(m ? { score: Number(m[2].replace(',', '.')) } : {}) }; });
const optsToLines = (o?: { label: string; score?: number }[]) => (o ?? []).map((x) => (x.score !== undefined ? `${x.label} = ${x.score}` : x.label)).join('\n');
const uniqueId = (base: string, taken: Set<string>) => { let id = (slug(base) || 'campo').slice(0, 34); let k = 2; while (taken.has(id)) id = `${slug(base).slice(0, 30)}_${k++}`; return id; };

type Init = { id: string | null; name: string; specialty: string; description: string; based_on: string | null; sections: Section[]; summary: string[] };

export function FormBuilder({ init }: { init: Init }) {
  const router = useRouter();
  const [meta, setMeta] = React.useState({ name: init.name, specialty: init.specialty, description: init.description });
  const [sections, setSections] = React.useState<Section[]>(init.sections.length ? init.sections : [{ id: 'secao_1', title: 'Seção 1', fields: [] }]);
  const [open, setOpen] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const taken = React.useMemo(() => new Set(sections.flatMap((s) => s.fields.map((f) => f.id))), [sections]);

  const upSec = (i: number, p: Partial<Section>) => setSections((ss) => ss.map((s, k) => (k === i ? { ...s, ...p } : s)));
  const upField = (si: number, fi: number, p: Partial<Field>) => setSections((ss) => ss.map((s, k) => (k === si ? { ...s, fields: s.fields.map((f, j) => (j === fi ? { ...f, ...p } : f)) } : s)));
  const move = <T,>(arr: T[], i: number, d: number) => { const a = [...arr]; const j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; };
  const addField = (si: number) => {
    const id = uniqueId('nova_pergunta', taken);
    setSections((ss) => ss.map((s, k) => (k === si ? { ...s, fields: [...s.fields, { id, label: 'Nova pergunta', type: 'text', span: 4 }] } : s)));
    setOpen(id);
  };

  const save = async () => {
    setPending(true);
    const r = await saveEvaluationTemplate(init.id, { ...meta, based_on: init.based_on, sections, summary: init.summary });
    setPending(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success('Ficha salva.');
    router.push('/app/configuracoes/modelos?aba=fichas');
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 rounded-xl border bg-card p-5 shadow-soft sm:grid-cols-3">
        <FF label="Nome da ficha" htmlFor="fb-name" required><Input id="fb-name" value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} /></FF>
        <FF label="Especialidade" htmlFor="fb-spec"><Input id="fb-spec" value={meta.specialty} onChange={(e) => setMeta({ ...meta, specialty: e.target.value })} placeholder="Ex.: Ortopedia" /></FF>
        <FF label="Descrição" htmlFor="fb-desc"><Input id="fb-desc" value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} /></FF>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant={preview ? 'default' : 'outline'} onClick={() => setPreview(!preview)}><Eye />{preview ? 'Voltar a editar' : 'Pré-visualizar'}</Button>
        <span className="text-sm text-muted-foreground">{sections.length} seções · {taken.size} itens</span>
        <Button className="ml-auto" loading={pending} onClick={save}><Save />Salvar ficha</Button>
      </div>

      {preview ? (
        <div className="space-y-5">
          {sections.map((s, i) => (
            <section key={s.id} className="rounded-xl border bg-card shadow-soft">
              <h3 className="border-b px-5 py-3 font-display text-lg"><span className="mr-2 text-primary">{i + 1}.</span>{s.title}</h3>
              <div className="grid gap-5 p-5 sm:grid-cols-4">{s.fields.map((f) => <div key={f.id} className={cn('col-span-1', { 1: 'sm:col-span-1', 2: 'sm:col-span-2', 3: 'sm:col-span-3', 4: 'sm:col-span-4' }[f.span ?? 4])}><FieldControl f={f} a={{}} set={() => undefined} /></div>)}</div>
            </section>
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          {sections.map((s, si) => (
            <section key={s.id} className="rounded-xl border bg-card shadow-soft">
              <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
                <span className="font-display text-lg text-primary">{si + 1}.</span>
                <Input aria-label="Título da seção" value={s.title} onChange={(e) => upSec(si, { title: e.target.value })} className="h-9 max-w-md font-medium" />
                <div className="ml-auto flex gap-1">
                  <Button size="icon-sm" variant="ghost" aria-label="Subir seção" onClick={() => setSections((ss) => move(ss, si, -1))}><ArrowUp /></Button>
                  <Button size="icon-sm" variant="ghost" aria-label="Descer seção" onClick={() => setSections((ss) => move(ss, si, 1))}><ArrowDown /></Button>
                  <Button size="icon-sm" variant="ghost" aria-label="Excluir seção" className="text-destructive" onClick={() => { if (!s.fields.length || window.confirm(`Excluir a seção "${s.title}" e suas ${s.fields.length} perguntas?`)) setSections((ss) => ss.filter((_, k) => k !== si)); }}><Trash2 /></Button>
                </div>
              </div>
              <ul className="divide-y">
                {s.fields.map((f, fi) => {
                  const isOpen = open === f.id;
                  const locked = f.type === 'computed';
                  return (
                    <li key={f.id} className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => setOpen(isOpen ? null : f.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm" aria-expanded={isOpen}>
                          {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                          <span className="truncate">{f.label}</span>
                          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{locked ? 'Cálculo automático' : TYPES.find((t) => t[0] === f.type)?.[1]}</span>
                        </button>
                        <Button size="icon-sm" variant="ghost" aria-label="Subir" onClick={() => upSec(si, { fields: move(s.fields, fi, -1) })}><ArrowUp /></Button>
                        <Button size="icon-sm" variant="ghost" aria-label="Descer" onClick={() => upSec(si, { fields: move(s.fields, fi, 1) })}><ArrowDown /></Button>
                        <Button size="icon-sm" variant="ghost" aria-label="Excluir" className="text-destructive" onClick={() => upSec(si, { fields: s.fields.filter((_, j) => j !== fi) })}><Trash2 /></Button>
                      </div>
                      {isOpen && (
                        <div className="mt-3 grid gap-3 rounded-lg bg-muted/30 p-3 sm:grid-cols-4">
                          <div className="sm:col-span-3"><FF label="Pergunta / rótulo" htmlFor={`l-${f.id}`}><Input id={`l-${f.id}`} value={f.label} onChange={(e) => upField(si, fi, { label: e.target.value })} /></FF></div>
                          <FF label="Tipo" htmlFor={`t-${f.id}`}>
                            <Select id={`t-${f.id}`} value={f.type} disabled={locked} onChange={(e) => {
                              const type = e.target.value as Field['type'];
                              const p: Partial<Field> = { type };
                              if ((type === 'single' || type === 'multi') && !f.options?.length) p.options = linesToOpts('Opção 1\nOpção 2');
                              if (type === 'scale') { p.min = 0; p.max = 10; p.options = Array.from({ length: 11 }, (_, i) => ({ value: String(i), label: String(i), score: i })); }
                              if (type === 'bilateral' && !f.bilateral) p.bilateral = { cell: { type: 'text' } };
                              if (type === 'grid' && !f.grid) p.grid = { rows: [{ id: 'linha_1', label: 'Linha 1' }], columns: [{ id: 'direito', label: 'Direito' }, { id: 'esquerdo', label: 'Esquerdo' }], cell: { type: 'text' } };
                              if (['number', 'date', 'bp'].includes(type)) p.span = 1;
                              upField(si, fi, p);
                            }}>
                              {locked && <option value="computed">Cálculo automático</option>}
                              {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                            </Select>
                          </FF>
                          {(f.type === 'single' || f.type === 'multi') && (
                            <div className="sm:col-span-2"><FF label="Opções (uma por linha)" htmlFor={`o-${f.id}`} hint='Para pontuar, use "Opção = 2".'><Textarea id={`o-${f.id}`} rows={5} defaultValue={optsToLines(f.options)} onBlur={(e) => upField(si, fi, { options: linesToOpts(e.target.value) })} /></FF></div>
                          )}
                          {f.type === 'grid' && f.grid && <>
                            <FF label="Linhas (uma por linha)" htmlFor={`gr-${f.id}`}><Textarea id={`gr-${f.id}`} rows={5} defaultValue={f.grid.rows.map((r) => r.label).join('\n')} onBlur={(e) => upField(si, fi, { grid: { ...f.grid!, rows: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean).map((x) => ({ id: slug(x) || x, label: x })) } })} /></FF>
                            <FF label="Colunas (uma por linha)" htmlFor={`gc-${f.id}`}><Textarea id={`gc-${f.id}`} rows={5} defaultValue={f.grid.columns.map((r) => r.label).join('\n')} onBlur={(e) => upField(si, fi, { grid: { ...f.grid!, columns: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 8).map((x) => ({ id: slug(x) || x, label: x })) } })} /></FF>
                          </>}
                          {(f.type === 'grid' || f.type === 'bilateral') && (() => {
                            const cell = f.type === 'grid' ? f.grid!.cell : f.bilateral!.cell;
                            const setCell = (c: typeof cell) => upField(si, fi, f.type === 'grid' ? { grid: { ...f.grid!, cell: c } } : { bilateral: { ...f.bilateral!, cell: c } });
                            return <>
                              <FF label="Resposta em cada célula" htmlFor={`c-${f.id}`}><Select id={`c-${f.id}`} value={cell.type} onChange={(e) => setCell({ ...cell, type: e.target.value as typeof cell.type, options: e.target.value === 'single' ? cell.options ?? linesToOpts('Normal\nAlterado') : undefined })}><option value="text">Texto</option><option value="number">Número</option><option value="single">Escolha</option><option value="date">Data</option></Select></FF>
                              {cell.type === 'single' ? <FF label="Opções da célula" htmlFor={`co-${f.id}`}><Textarea id={`co-${f.id}`} rows={4} defaultValue={optsToLines(cell.options)} onBlur={(e) => setCell({ ...cell, options: linesToOpts(e.target.value) })} /></FF>
                                : <FF label="Unidade" htmlFor={`cu-${f.id}`}><Input id={`cu-${f.id}`} value={cell.unit ?? ''} onChange={(e) => setCell({ ...cell, unit: e.target.value || undefined })} /></FF>}
                            </>;
                          })()}
                          {(f.type === 'number' || f.type === 'text') && <FF label="Unidade" htmlFor={`u-${f.id}`}><Input id={`u-${f.id}`} value={f.unit ?? ''} onChange={(e) => upField(si, fi, { unit: e.target.value || undefined })} placeholder="cm, kg, s…" /></FF>}
                          {(f.type === 'yesno' || f.type === 'single' || f.type === 'multi') && (
                            <FF label='Pedir "especificar" quando' htmlFor={`d-${f.id}`}>
                              <Select id={`d-${f.id}`} value={f.detail?.when.join('|') ?? ''} onChange={(e) => upField(si, fi, { detail: e.target.value ? { when: e.target.value.split('|'), label: 'Especificar' } : undefined })}>
                                <option value="">Nunca</option>
                                {f.type === 'yesno' ? <option value="yes">Resposta for Sim</option> : (f.options ?? []).map((o) => <option key={o.value} value={o.value}>Marcar “{o.label}”</option>)}
                                {f.type !== 'yesno' && f.options && f.options.length > 1 && <option value={f.options.map((o) => o.value).join('|')}>Qualquer opção</option>}
                              </Select>
                            </FF>
                          )}
                          {(f.type === 'single' || f.type === 'multi') && <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={!!f.other} onChange={(e) => upField(si, fi, { other: e.target.checked || undefined })} />Permitir “Outro”</label>}
                          <FF label="Largura" htmlFor={`w-${f.id}`}><Select id={`w-${f.id}`} value={String(f.span ?? 4)} onChange={(e) => upField(si, fi, { span: Number(e.target.value) as 1 | 2 | 3 | 4 })}><option value="1">1/4</option><option value="2">Metade</option><option value="3">3/4</option><option value="4">Linha inteira</option></Select></FF>
                          <div className="sm:col-span-3"><FF label="Texto de ajuda" htmlFor={`h-${f.id}`}><Input id={`h-${f.id}`} value={f.help ?? ''} onChange={(e) => upField(si, fi, { help: e.target.value || undefined })} /></FF></div>
                          {locked && <p className="text-xs text-muted-foreground sm:col-span-4">Este item é calculado automaticamente a partir de outras respostas. Você pode renomeá-lo ou excluí-lo; se excluir perguntas que ele usa, o resultado ficará vazio.</p>}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              <div className="border-t px-4 py-2.5"><Button size="sm" variant="ghost" onClick={() => addField(si)}><Plus />Adicionar pergunta</Button></div>
            </section>
          ))}
          <Button variant="outline" onClick={() => setSections((ss) => [...ss, { id: uniqueId(`secao_${ss.length + 1}`, new Set(ss.map((x) => x.id))), title: `Seção ${ss.length + 1}`, fields: [] }])}><Plus />Adicionar seção</Button>
        </div>
      )}
    </div>
  );
}
