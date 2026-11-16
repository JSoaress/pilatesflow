import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { requirePermission } from '@/lib/auth/context';
import { loadPrintOrg, auditPrint } from '@/lib/print';
import { PrintBar } from '@/components/print/print-bar';
import { PrintSheet, PrintSection } from '@/components/print/doc';
import { date } from '@/lib/format';
import { exerciseLevel, label } from '@/lib/labels';

export const metadata = { title: 'Imprimir programa de exercícios' };

/** Folha de exercícios para entregar ao aluno (linguagem simples, campos para marcar). */
export default async function PrintProgram({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const ctx = await requirePermission('exercises.view');
  const { id } = await params;
  const sp = await searchParams;
  const { data: prog } = await ctx.supabase.from('patient_programs').select('*, patient:patients(full_name, social_name, unit_id), staff(full_name, professional_registry)').eq('id', id).eq('organization_id', ctx.org.id).maybeSingle();
  if (!prog) notFound();
  const { data: items } = await ctx.supabase.from('patient_program_exercises')
    .select('*, exercise:exercises(name, objective, start_position, execution, repetitions, springs_config, video_url, level, contraindications)')
    .eq('program_id', id).order('sort_order');
  const org = await loadPrintOrg(ctx, (prog as any).patient?.unit_id);
  const list = (items ?? []) as any[];
  const showChecks = sp.registro !== '0';
  const weeks = Math.min(8, Math.max(1, Number(sp.semanas) || 4));
  const qrs = await Promise.all(list.map((x) => (x.exercise?.video_url ? QRCode.toDataURL(x.exercise.video_url, { margin: 0, width: 160 }) : Promise.resolve(null))));
  if (prog.patient_id) await auditPrint(ctx, 'patient_programs', id, { patient_id: prog.patient_id });
  const pname = (prog as any).patient?.social_name || (prog as any).patient?.full_name || 'Modelo de programa';

  return (
    <>
      <PrintBar title={`Programa — ${pname}`}>
        <form method="get" className="flex items-center gap-3 text-xs">
          <label className="inline-flex items-center gap-1">Tabela de registro <select name="registro" defaultValue={showChecks ? '1' : '0'} className="rounded border px-1"><option value="1">Sim</option><option value="0">Não</option></select></label>
          <label className="inline-flex items-center gap-1">Semanas <input type="number" name="semanas" min={1} max={8} defaultValue={weeks} className="w-12 rounded border px-1" /></label>
          <button className="rounded border px-2 py-1 hover:bg-muted">Aplicar</button>
        </form>
      </PrintBar>
      <PrintSheet org={org} title={prog.name} subtitle={<>{pname}{prog.start_date ? ` · início ${date(prog.start_date)}` : ''}{(prog as any).staff?.full_name ? ` · ${(prog as any).staff.full_name}` : ''}</>}
        footerNote="Faça os exercícios apenas como orientado pelo seu profissional. Se sentir dor forte, tontura ou falta de ar, pare e avise a equipe.">
        {(prog.goal || prog.notes) && (
          <div className="rounded border-l-4 border-[#2F6B5A] bg-[#eef5f1] p-3 text-[10pt]">
            {prog.goal && <p><strong>Objetivo:</strong> {prog.goal}</p>}
            {prog.notes && <p className="mt-1 whitespace-pre-wrap">{prog.notes}</p>}
          </div>
        )}
        <PrintSection title="Exercícios">
          {list.length === 0 ? <p className="italic text-neutral-500">Nenhum exercício no programa.</p> : (
            <ol className="space-y-3">
              {list.map((x, i) => (
                <li key={x.id} className="avoid-break flex gap-3 rounded border border-neutral-300 p-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#2F6B5A] text-[10pt] font-semibold text-white">{i + 1}</span>
                  <div className="min-w-0 flex-1 text-[10pt]">
                    <p className="text-[11pt] font-semibold">{x.exercise?.name} <span className="text-[8.5pt] font-normal text-neutral-500">{label(exerciseLevel, x.exercise?.level)}</span></p>
                    <p className="mt-0.5 font-medium">
                      {[x.sets && `${x.sets} séries`, (x.repetitions || x.exercise?.repetitions) && `${x.repetitions || x.exercise?.repetitions} repetições`, x.duration_seconds && `${x.duration_seconds} s`, (x.springs || x.load) && `molas/carga: ${x.springs || x.load}`].filter(Boolean).join(' · ')}
                    </p>
                    {x.exercise?.objective && <p><strong>Para que serve:</strong> {x.exercise.objective}</p>}
                    {x.exercise?.start_position && <p><strong>Posição inicial:</strong> {x.exercise.start_position}</p>}
                    {x.exercise?.execution && <p><strong>Como fazer:</strong> {x.exercise.execution}</p>}
                    {x.notes && <p><strong>Atenção:</strong> {x.notes}</p>}
                    {x.progression && <p className="text-neutral-600"><strong>Progressão:</strong> {x.progression}</p>}
                  </div>
                  {qrs[i] && (
                    <figure className="w-[22mm] shrink-0 text-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={qrs[i]!} alt="QR code do vídeo" className="w-full" />
                      <figcaption className="text-[7pt] text-neutral-500">Vídeo</figcaption>
                    </figure>
                  )}
                </li>
              ))}
            </ol>
          )}
        </PrintSection>
        {showChecks && list.length > 0 && (
          <PrintSection title="Registro semanal (marque os dias em que fez)">
            <table className="w-full border-collapse text-[9pt]">
              <thead><tr><th className="border border-neutral-400 p-1 text-left">Semana</th>{['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d) => <th key={d} className="w-[11mm] border border-neutral-400 p-1">{d}</th>)}<th className="border border-neutral-400 p-1 text-left">Como se sentiu / dor (0–10)</th></tr></thead>
              <tbody>{Array.from({ length: weeks }).map((_, w) => <tr key={w}><td className="h-[9mm] border border-neutral-400 p-1">{w + 1}ª</td>{Array.from({ length: 7 }).map((__, d) => <td key={d} className="border border-neutral-400" />)}<td className="border border-neutral-400" /></tr>)}</tbody>
            </table>
          </PrintSection>
        )}
      </PrintSheet>
    </>
  );
}
