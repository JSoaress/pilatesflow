import { getAppContext } from '@/lib/auth/context';
import { Section, EmptyState } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';
import { dateTime, date } from '@/lib/format';
import { MedicalRecordForm } from '@/components/app/clinical/medical-record-form';
import { EvolutionButton, EvolutionActions } from '@/components/app/clinical/evolution-dialog';

export async function MedicalTab({ patientId }: { patientId: string }) {
  const ctx = await getAppContext();
  const [record, evolutions, templates, exercises, recentAppts] = await Promise.all([
    ctx.supabase.from('medical_records').select('*').eq('patient_id', patientId).maybeSingle(),
    ctx.supabase.from('clinical_evolutions').select('*, staff(full_name)').eq('patient_id', patientId).order('occurred_at', { ascending: false }).limit(100),
    ctx.supabase.from('evolution_templates').select('id, name, defaults').eq('organization_id', ctx.org.id).eq('is_active', true),
    ctx.supabase.from('exercises').select('id, name').eq('organization_id', ctx.org.id).eq('is_active', true).is('deleted_at', null).order('name'),
    ctx.supabase.from('appointment_participants').select('appointments!inner(id, starts_at, services(name))').eq('patient_id', patientId)
      .in('status', ['present', 'completed', 'scheduled', 'confirmed']).gte('appointments.starts_at', new Date(Date.now() - 14 * 86400000).toISOString())
      .lte('appointments.starts_at', new Date(Date.now() + 86400000).toISOString()).limit(20),
  ]);
  const history = record.data
    ? await ctx.supabase.from('medical_record_history').select('changed_at, changed_fields').eq('medical_record_id', record.data.id).order('changed_at', { ascending: false }).limit(20)
    : { data: [] as any[] };
  const evos = (evolutions.data ?? []) as any[];
  const originals = evos.filter((e) => !e.amends_id);
  const addenda = evos.filter((e) => e.amends_id);
  const appts = ((recentAppts.data ?? []) as any[]).map((x) => ({ id: x.appointments.id, label: `${dateTime(x.appointments.starts_at, ctx.tz)} · ${x.appointments.services?.name ?? ''}` }));
  const canCreate = ctx.can('medical_records.create');

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-info/30 bg-info-soft/40 p-3 text-sm text-muted-foreground">
        Registro clínico confidencial. Acesso restrito a perfis autorizados; toda alteração é versionada e auditada. Evoluções finalizadas não podem ser apagadas — use adendo/retificação.
      </div>
      <Section title="Evoluções" actions={canCreate ? <EvolutionButton patientId={patientId} templates={(templates.data ?? []) as any[]} exercises={(exercises.data ?? []) as any[]} appointments={appts} /> : undefined}>
        {originals.length === 0 ? <EmptyState title="Nenhuma evolução registrada" /> : (
          <ol className="space-y-4">
            {originals.map((e) => (
              <li key={e.id} className="rounded-xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{dateTime(e.occurred_at, ctx.tz)} · {e.staff?.full_name ?? 'Profissional'}</p>
                    <p className="text-xs text-muted-foreground">
                      {e.status === 'finalized' ? <>Finalizada em {dateTime(e.finalized_at, ctx.tz)}</> : <Badge variant="warning">Rascunho</Badge>}
                      {(e.pain_before !== null || e.pain_after !== null) && <> · Dor: {e.pain_before ?? '—'} → {e.pain_after ?? '—'}</>}
                    </p>
                  </div>
                  <EvolutionActions evolution={e} patientId={patientId} canCreate={canCreate} isAuthor={e.author_id === ctx.user.id} templates={(templates.data ?? []) as any[]} exercises={(exercises.data ?? []) as any[]} appointments={appts} />
                </div>
                <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  {[['Queixas', e.complaints], ['Estado do paciente', e.patient_state], ['Resposta ao tratamento', e.treatment_response], ['Intercorrências', e.incidents], ['Orientações', e.guidance], ['Próxima conduta', e.next_conduct], ['Observações', e.notes]]
                    .filter(([, v]) => v).map(([k, v]) => <div key={k as string}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="whitespace-pre-wrap">{v}</dd></div>)}
                </dl>
                {Array.isArray(e.exercises) && e.exercises.length > 0 && (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1 pr-3">Exercício</th><th className="pr-3">Molas/carga</th><th className="pr-3">Séries</th><th className="pr-3">Rep.</th><th>Tempo</th></tr></thead>
                      <tbody>{e.exercises.map((x: any, i: number) => <tr key={i} className="border-t"><td className="py-1 pr-3">{x.name}</td><td className="pr-3">{x.springs || x.load || '—'}</td><td className="pr-3">{x.sets || '—'}</td><td className="pr-3">{x.reps || '—'}</td><td>{x.time || '—'}</td></tr>)}</tbody>
                    </table>
                  </div>
                )}
                {addenda.filter((a) => a.amends_id === e.id).map((a) => (
                  <div key={a.id} className="mt-3 rounded-lg border-l-4 border-warning bg-warning-soft/40 p-3 text-sm">
                    <p className="text-xs font-medium">Adendo/retificação · {dateTime(a.finalized_at, ctx.tz)} · {a.staff?.full_name ?? ''}</p>
                    <p className="text-xs text-muted-foreground">Motivo: {a.amendment_reason}</p>
                    <p className="mt-1 whitespace-pre-wrap">{a.notes}</p>
                  </div>
                ))}
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section title="Prontuário" description={record.data ? `Atualizado em ${dateTime(record.data.updated_at, ctx.tz)}` : 'Ainda não preenchido'}>
        <MedicalRecordForm patientId={patientId} record={record.data} canEdit={record.data ? ctx.can('medical_records.edit') : canCreate} />
        {(history.data ?? []).length > 0 && (
          <details className="mt-6 text-sm">
            <summary className="cursor-pointer text-muted-foreground">Histórico de versões ({(history.data ?? []).length})</summary>
            <ul className="mt-2 space-y-1">{((history.data ?? []) as any[]).map((h, i) => <li key={i}>{date(h.changed_at, ctx.tz)} {dateTime(h.changed_at, ctx.tz).slice(-5)} — campos: {(h.changed_fields ?? []).join(', ')}</li>)}</ul>
          </details>
        )}
      </Section>
    </div>
  );
}
