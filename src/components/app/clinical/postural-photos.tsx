'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Upload, PenLine, MapPin, Save, Undo2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { uploadPosturalPhoto, savePhotoAnnotations } from '@/lib/actions/clinical';
import { posturalView } from '@/lib/labels';
import { cn } from '@/lib/utils';

type Photo = { id: string; view: string; url: string | null; annotations: Annotations; taken_at: string };
type Pt = { x: number; y: number };
type Annotations = { lines: { a: Pt; b: Pt }[]; angles: unknown[]; marks: (Pt & { label?: string })[]; notes: unknown[] };
const VIEWS = ['anterior', 'posterior', 'right_lateral', 'left_lateral'] as const;

/** Compacta a imagem no navegador antes do envio (economia de espaço e upload mais rápido). */
async function compress(file: File, max = 1800, quality = 0.85): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
  return blob ? new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }) : file;
}

export function PosturalPhotos({ assessmentId, patientId, photos, canUpload, canAnnotate }: { assessmentId: string; patientId: string; photos: Photo[]; canUpload: boolean; canAnnotate: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [annotating, setAnnotating] = React.useState<Photo | null>(null);
  const upload = async (view: string, file: File) => {
    setBusy(view);
    const fd = new FormData();
    fd.append('file', await compress(file));
    const r = await uploadPosturalPhoto(assessmentId, patientId, view, fd);
    setBusy(null);
    if (r.ok) { toast.success('Foto enviada.'); router.refresh(); } else toast.error(r.error);
  };
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {VIEWS.map((v) => {
          const p = [...photos].reverse().find((x) => x.view === v);
          return (
            <figure key={v} className="overflow-hidden rounded-xl border">
              <div className="relative flex aspect-[3/4] items-center justify-center bg-muted">
                {p?.url ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={`Foto postural ${posturalView[v]}`} className="h-full w-full object-contain" />
                    <AnnotationOverlay ann={p.annotations} />
                  </>
                ) : <span className="text-sm text-muted-foreground">Sem foto</span>}
              </div>
              <figcaption className="flex items-center justify-between gap-1 p-2 text-sm">
                <span className="font-medium">{posturalView[v]}</span>
                <span className="flex gap-1">
                  {p?.url && canAnnotate && <Button size="icon-sm" variant="ghost" aria-label="Anotar" onClick={() => setAnnotating(p)}><PenLine /></Button>}
                  {canUpload && (
                    <label className={cn('inline-flex h-8 cursor-pointer items-center gap-1 rounded-md px-2 text-xs hover:bg-muted', busy === v && 'opacity-50')}>
                      <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={!!busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(v, f); e.target.value = ''; }} />
                      <Upload className="h-4 w-4" /> {busy === v ? 'Enviando…' : p ? 'Trocar' : 'Enviar'}
                    </label>
                  )}
                </span>
              </figcaption>
            </figure>
          );
        })}
      </div>
      <Dialog open={!!annotating} onOpenChange={(o) => !o && setAnnotating(null)} size="xl" title="Marcações na foto" description="Desenhe linhas (o ângulo em relação à horizontal é calculado) e marque pontos anatômicos.">
        {annotating && <Annotator photo={annotating} onSaved={() => { setAnnotating(null); router.refresh(); }} />}
      </Dialog>
    </>
  );
}

function angleOf(l: { a: Pt; b: Pt }) {
  const deg = (Math.atan2(l.b.y - l.a.y, l.b.x - l.a.x) * 180) / Math.PI;
  const n = Math.abs(deg) > 90 ? 180 - Math.abs(deg) : Math.abs(deg);
  return n.toFixed(1).replace('.', ',') + '°';
}

function AnnotationOverlay({ ann }: { ann: Annotations }) {
  if (!ann || (!ann.lines?.length && !ann.marks?.length)) return null;
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
      {ann.lines?.map((l, i) => <line key={i} x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y} stroke="#E11D48" strokeWidth="0.5" />)}
      {ann.marks?.map((m, i) => <circle key={i} cx={m.x} cy={m.y} r="0.9" fill="#2563EB" />)}
    </svg>
  );
}

function Annotator({ photo, onSaved }: { photo: Photo; onSaved: () => void }) {
  const [ann, setAnn] = React.useState<Annotations>({ lines: photo.annotations?.lines ?? [], angles: [], marks: photo.annotations?.marks ?? [], notes: [] });
  const [mode, setMode] = React.useState<'line' | 'mark'>('line');
  const [start, setStart] = React.useState<Pt | null>(null);
  const [saving, setSaving] = React.useState(false);
  const toPt = (e: React.MouseEvent<SVGSVGElement>): Pt => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={mode === 'line' ? 'default' : 'outline'} onClick={() => setMode('line')}><PenLine /> Linha / ângulo</Button>
        <Button size="sm" variant={mode === 'mark' ? 'default' : 'outline'} onClick={() => setMode('mark')}><MapPin /> Marcação</Button>
        <Button size="sm" variant="ghost" onClick={() => setAnn((a) => (mode === 'line' ? { ...a, lines: a.lines.slice(0, -1) } : { ...a, marks: a.marks.slice(0, -1) }))}><Undo2 /> Desfazer</Button>
        <Button size="sm" variant="ghost" onClick={() => setAnn({ lines: [], angles: [], marks: [], notes: [] })}><Trash2 /> Limpar</Button>
      </div>
      <div className="relative mx-auto max-h-[65vh] w-fit">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.url!} alt="Foto postural" className="max-h-[65vh] select-none" draggable={false} />
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full cursor-crosshair"
          onClick={(e) => {
            const p = toPt(e);
            if (mode === 'mark') { setAnn((a) => ({ ...a, marks: [...a.marks, p] })); return; }
            if (!start) setStart(p); else { setAnn((a) => ({ ...a, lines: [...a.lines, { a: start, b: p }] })); setStart(null); }
          }}>
          {ann.lines.map((l, i) => (
            <g key={i}>
              <line x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y} stroke="#E11D48" strokeWidth="0.4" />
              <text x={(l.a.x + l.b.x) / 2} y={(l.a.y + l.b.y) / 2 - 1} fontSize="2.6" fill="#E11D48" stroke="white" strokeWidth="0.15">{angleOf(l)}</text>
            </g>
          ))}
          {start && <circle cx={start.x} cy={start.y} r="0.8" fill="#E11D48" />}
          {ann.marks.map((m, i) => <circle key={i} cx={m.x} cy={m.y} r="0.9" fill="#2563EB" stroke="white" strokeWidth="0.2" />)}
        </svg>
      </div>
      <Button loading={saving} onClick={async () => {
        setSaving(true);
        const r = await savePhotoAnnotations(photo.id, ann);
        setSaving(false);
        if (r.ok) { toast.success('Marcações salvas.'); onSaved(); } else toast.error(r.error);
      }}><Save /> Salvar marcações</Button>
    </div>
  );
}
