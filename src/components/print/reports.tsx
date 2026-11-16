import { date } from '@/lib/format';
import { EXAM_AREAS, examKindLabel, type ExamReport } from '@/lib/exam-reports';

/** Lista de laudos/exames agrupada por área, para impressão. */
export function PrintReports({ reports }: { reports: ExamReport[] }) {
  if (!reports.length) return <p className="text-[9.5pt] italic text-neutral-500">Nenhum laudo registrado.</p>;
  return (
    <div className="space-y-3">
      {EXAM_AREAS.map((a) => {
        const list = reports.filter((r) => (r.exam_area ?? 'geral') === a.key);
        if (!list.length) return null;
        return (
          <div key={a.key}>
            <h3 className="mb-1 text-[10pt] font-semibold">{a.label} <span className="font-normal text-neutral-500">({list.length})</span></h3>
            <table className="w-full border-collapse text-[9pt]">
              <thead>
                <tr className="border-b border-neutral-400 text-left text-[8pt] uppercase tracking-wide text-neutral-500">
                  <th className="w-[20mm] py-1 pr-2 font-medium">Data</th>
                  <th className="w-[38mm] py-1 pr-2 font-medium">Exame</th>
                  <th className="py-1 pr-2 font-medium">Conclusão / achados</th>
                  <th className="w-[38mm] py-1 font-medium">Emitido por</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} className="avoid-break border-b border-neutral-200 align-top">
                    <td className="py-1 pr-2 whitespace-nowrap">{r.exam_date ? date(r.exam_date) : '—'}</td>
                    <td className="py-1 pr-2"><span className="font-medium">{examKindLabel(r.exam_kind)}</span><br /><span className="text-neutral-600">{r.title}</span></td>
                    <td className="py-1 pr-2 whitespace-pre-wrap">{r.findings || <span className="italic text-neutral-400">não resumido</span>}</td>
                    <td className="py-1">{r.issuer || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
