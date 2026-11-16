'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Upload, Pencil, Download, Trash2, FileText, ImageIcon, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/confirm';
import { uploadExamReport, updateExamReport, archiveExamReport } from '@/lib/actions/exam-reports';
import { EXAM_AREAS, EXAM_KINDS, SUGGESTED_KINDS, type ExamReport } from '@/lib/exam-reports';
import { cn } from '@/lib/utils';

type AssessmentOpt = { id: string; label: string };

function fmtSize(n: number) {
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

function ReportFields({ area, setArea, report, assessments }: { area: string; setArea: (a: string) => void; report?: ExamReport; assessments: AssessmentOpt[] }) {
  const suggested = SUGGESTED_KINDS[area] ?? [];
  const others = Object.keys(EXAM_KINDS).filter((k) => !suggested.includes(k));
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <Field label="Área do laudo" required hint={EXAM_AREAS.find((a) => a.key === area)?.hint}>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Área do laudo">
          {EXAM_AREAS.map((a) => (
            <button key={a.key} type="button" role="radio" aria-checked={area === a.key} onClick={() => setArea(a.key)}
              className={cn('rounded-full border px-3 py-1 text-sm transition-colors', area === a.key ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')}>
              {a.label}
            </button>
          ))}
        </div>
        <input type="hidden" name="exam_area" value={area} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tipo de exame" htmlFor="er-kind" required>
          <Select id="er-kind" name="exam_kind" defaultValue={report?.exam_kind ?? suggested[0] ?? 'raio_x'} key={area}>
            {suggested.length > 0 && <optgroup label="Mais usados nesta área">{suggested.map((k) => <option key={k} value={k}>{EXAM_KINDS[k]}</option>)}</optgroup>}
            <optgroup label={suggested.length ? 'Outros' : 'Tipos'}>{others.map((k) => <option key={k} value={k}>{EXAM_KINDS[k]}</option>)}</optgroup>
          </Select>
        </Field>
        <Field label="Documento" htmlFor="er-cat">
          <Select id="er-cat" name="category" defaultValue={report?.category ?? 'exam'}>
            <option value="exam">Exame (imagem/resultado)</option>
            <option value="medical_report">Laudo / relatório médico</option>
          </Select>
        </Field>
        <Field label="Data do exame" htmlFor="er-date">
          <Input id="er-date" name="exam_date" type="date" max={today} defaultValue={report?.exam_date ?? ''} />
        </Field>
        <Field label="Médico / clínica que emitiu" htmlFor="er-issuer">
          <Input id="er-issuer" name="issuer" maxLength={200} defaultValue={report?.issuer ?? ''} placeholder="Ex.: Dr. Fulano — CRM 12345 / Clínica X" />
        </Field>
      </div>
      <Field label="Título (opcional)" htmlFor="er-title" hint="Se vazio, usamos o tipo e a data do exame.">
        <Input id="er-title" name="title" maxLength={160} defaultValue={report?.title ?? ''} placeholder="Ex.: Ressonância de coluna lombar" />
      </Field>
      <Field label="Conclusão / achados principais" htmlFor="er-findings" hint="Resuma o que o laudo diz — aparece na ficha e no prontuário impresso.">
        <Textarea id="er-findings" name="findings" rows={4} maxLength={8000} defaultValue={report?.findings ?? ''} placeholder="Ex.: Protrusão discal L4-L5 sem compressão radicular. Discreta escoliose lombar à esquerda." />
      </Field>
      {assessments.length > 0 && (
        <Field label="Vincular a uma avaliação (opcional)" htmlFor="er-asm">
          <Select id="er-asm" name="assessment_id" defaultValue={report?.assessment_id ?? ''}>
            <option value="">Nenhuma</option>
            {assessments.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </Select>
        </Field>
      )}
    </>
  );
}

export function UploadReportButton({ patientId, defaultArea = 'geral', assessments = [], size = 'sm', label = 'Enviar laudo' }:
  { patientId: string; defaultArea?: string; assessments?: AssessmentOpt[]; size?: 'sm' | 'default'; label?: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [area, setArea] = React.useState(defaultArea);
  const [files, setFiles] = React.useState<File[]>([]);
  const [drag, setDrag] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setFiles((cur) => [...cur, ...Array.from(list)].slice(0, 10));
  };
  React.useEffect(() => { if (open) { setArea(defaultArea); setFiles([]); } }, [open, defaultArea]);

  return (
    <>
      <Button size={size} onClick={() => setOpen(true)}><Upload /> {label}</Button>
      <Dialog open={open} onOpenChange={setOpen} size="lg" title="Enviar laudo ou exame" description="PDF, JPG ou PNG — até 10 arquivos (20 MB cada). Fica em armazenamento privado e só abre por link temporário.">
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault();
          if (!files.length) { toast.error('Selecione ao menos um arquivo.'); return; }
          const fd = new FormData(e.currentTarget);
          fd.delete('file');
          files.forEach((f) => fd.append('file', f));
          setPending(true);
          const r = await uploadExamReport(patientId, fd);
          setPending(false);
          if (!r.ok) { toast.error(r.error); return; }
          toast.success(files.length > 1 ? `${files.length} arquivos enviados.` : 'Laudo enviado.');
          setOpen(false);
          router.refresh();
        }}>
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
            onClick={() => inputRef.current?.click()}
            className={cn('flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-6 text-center text-sm transition-colors', drag ? 'border-primary bg-primary/5' : 'hover:bg-muted/50')}>
            <Upload className="size-6 text-muted-foreground" />
            <p className="font-medium">Arraste os arquivos aqui ou clique para escolher</p>
            <p className="text-xs text-muted-foreground">Pode fotografar o laudo pelo celular</p>
            <input ref={inputRef} type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden"
              onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          </div>
          {files.length > 0 && (
            <ul className="space-y-1">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm">
                  {f.type === 'application/pdf' ? <FileText className="size-4 text-muted-foreground" /> : <ImageIcon className="size-4 text-muted-foreground" />}
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  <span className={cn('text-xs', f.size > 20 * 1024 * 1024 ? 'text-destructive' : 'text-muted-foreground')}>{fmtSize(f.size)}</span>
                  <button type="button" aria-label={`Remover ${f.name}`} onClick={() => setFiles((c) => c.filter((_, j) => j !== i))} className="rounded p-0.5 hover:bg-muted"><X className="size-4" /></button>
                </li>
              ))}
            </ul>
          )}
          <ReportFields area={area} setArea={setArea} assessments={assessments} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" loading={pending}>Enviar {files.length > 1 ? `${files.length} arquivos` : ''}</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

export function ReportActions({ report, patientId, canEdit, canArchive, assessments = [] }:
  { report: ExamReport; patientId: string; canEdit: boolean; canArchive: boolean; assessments?: AssessmentOpt[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [area, setArea] = React.useState(report.exam_area ?? 'geral');
  return (
    <div className="flex shrink-0 justify-end gap-1">
      <a href={`/api/files/attachment/${report.id}`} target="_blank" rel="noopener noreferrer">
        <Button variant="outline" size="sm"><Download /> Abrir</Button>
      </a>
      {canEdit && <Button variant="ghost" size="icon-sm" aria-label="Editar dados do laudo" onClick={() => { setArea(report.exam_area ?? 'geral'); setOpen(true); }}><Pencil /></Button>}
      {canArchive && <Button variant="ghost" size="icon-sm" aria-label="Arquivar laudo" onClick={async () => {
        const { confirmed } = await confirm({ title: 'Arquivar este laudo?', description: 'Ele deixa de aparecer, mas permanece guardado para fins de histórico e obrigações legais.', destructive: true, confirmLabel: 'Arquivar' });
        if (!confirmed) return;
        const r = await archiveExamReport(report.id, patientId);
        if (r.ok) { toast.success('Laudo arquivado.'); router.refresh(); } else toast.error(r.error);
      }}><Trash2 className="text-destructive" /></Button>}
      {canEdit && (
        <Dialog open={open} onOpenChange={setOpen} size="lg" title="Editar dados do laudo" description="O arquivo enviado não muda — só as informações.">
          <form className="space-y-4" onSubmit={async (e) => {
            e.preventDefault();
            const input = Object.fromEntries(new FormData(e.currentTarget).entries());
            setPending(true);
            const r = await updateExamReport(report.id, patientId, input);
            setPending(false);
            if (!r.ok) { toast.error(r.error); return; }
            toast.success('Laudo atualizado.');
            setOpen(false);
            router.refresh();
          }}>
            <ReportFields area={area} setArea={setArea} report={report} assessments={assessments} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" loading={pending}>Salvar</Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
