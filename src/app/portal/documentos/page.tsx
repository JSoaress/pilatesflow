import { getPortalContext } from '@/lib/auth/portal';
import { Section, EmptyState } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';
import { dateTime } from '@/lib/format';
import { AcceptDocument, PortalAnamnesis } from '@/components/portal/documents';

export const metadata = { title: 'Documentos' };

export default async function PortalDocuments() {
  const { supabase, me } = await getPortalContext();
  const { data } = await supabase.rpc('portal_documents', { p_patient_id: me.patient_id });
  const d = (data ?? {}) as any;
  const contracts = (d.contracts ?? []) as any[];
  const docs = (d.documents ?? []) as any[];
  const anam = (d.anamnesis ?? []) as any[];
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Documentos</h1>
      {anam.filter((a) => a.status === 'pending').map((a) => (
        <Section key={a.id} title="Anamnese pendente" description="Preencha antes da sua avaliação.">
          <PortalAnamnesis id={a.id} questions={a.questions} />
        </Section>
      ))}
      <Section title="Contratos">
        {contracts.length === 0 ? <EmptyState title="Nenhum contrato" /> : (
          <ul className="space-y-4">{contracts.map((c) => (
            <li key={c.id} className="rounded-xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{c.title}</p>
                {c.status === 'accepted' ? <Badge variant="success">Aceito em {dateTime(c.accepted_at)}</Badge> : <Badge variant="warning">Aguardando seu aceite</Badge>}
              </div>
              <details className="mt-2"><summary className="cursor-pointer text-sm text-primary">Ler contrato</summary><pre className="mt-2 max-h-96 overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted p-3 font-sans text-sm">{c.content}</pre></details>
              <div className="mt-3 flex flex-wrap gap-2">
                <a href={`/imprimir/contrato/${c.id}`} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">Baixar PDF</a>
                {c.status === 'sent' && <AcceptDocument kind="contract" id={c.id} />}
              </div>
            </li>
          ))}</ul>
        )}
      </Section>
      {docs.length > 0 && (
        <Section title="Termos e documentos">
          <ul className="space-y-4">{docs.map((x) => (
            <li key={x.id} className="rounded-xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{x.title}</p>
                {x.status === 'signed' ? <Badge variant="success">Assinado em {dateTime(x.signed_at)}</Badge> : x.requires_signature ? <Badge variant="warning">Aguardando assinatura</Badge> : null}
              </div>
              <details className="mt-2"><summary className="cursor-pointer text-sm text-primary">Ler documento</summary><pre className="mt-2 max-h-96 overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted p-3 font-sans text-sm">{x.content}</pre></details>
              <div className="mt-3 flex flex-wrap gap-2">
                <a href={`/imprimir/documento/${x.id}`} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">Baixar PDF</a>
                {x.status === 'sent' && x.requires_signature && <AcceptDocument kind="document" id={x.id} />}
              </div>
            </li>
          ))}</ul>
        </Section>
      )}
    </div>
  );
}
