import { notFound, redirect } from 'next/navigation';
import type { PrintOrg } from '@/lib/print';
import { createClient } from '@/lib/supabase/server';
import { PrintBar } from '@/components/print/print-bar';
import { PrintSheet } from '@/components/print/doc';
import { dateTime } from '@/lib/format';
import { env } from '@/lib/env';
import { storagePublicUrl } from '@/lib/utils';

export const metadata = { title: 'Contrato', robots: { index: false, follow: false } };

const baseOrg = (name = '', logo: string | null = null): PrintOrg => ({ name, legal_name: null, cnpj: null, phone: null, email: null, logo, address: null });

/** Contrato (versão imutável) para impressão, com registro de aceite. Equipe ou o próprio aluno via portal. */
export default async function PrintContract({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/login');
  let c: any = (await supabase.from('contracts').select('id, number, title, content, content_hash, status, accepted_at, accepted_by_name, accepted_ip, created_at, organization_id').eq('id', id).maybeSingle()).data;
  let tz = 'America/Sao_Paulo';
  let org: PrintOrg = baseOrg();
  if (!c) {
    // portal do aluno
    const { data: me } = await supabase.rpc('portal_me');
    for (const p of (me ?? []) as any[]) {
      const { data: docs } = await supabase.rpc('portal_documents', { p_patient_id: p.patient_id });
      const found = ((docs as any)?.contracts ?? []).find((x: any) => x.id === id);
      if (found) { c = { ...found, number: '' }; org = baseOrg(p.organization_name, storagePublicUrl(env.supabaseUrl, 'site', p.logo_path)); break; }
    }
  } else {
    const { data: o } = await supabase.from('organizations').select('name, legal_name, cnpj, phone, email, logo_path, timezone').eq('id', c.organization_id).single();
    tz = o?.timezone ?? tz;
    if (o) org = { name: o.name, legal_name: o.legal_name, cnpj: o.cnpj, phone: o.phone, email: o.email, logo: storagePublicUrl(env.supabaseUrl, 'site', o.logo_path), address: null };
    await supabase.rpc('log_audit_event', { p_org: c.organization_id, p_action: 'print', p_entity: 'contracts', p_entity_id: id, p_context: { format: 'html' } });
  }
  if (!c) notFound();
  return (
    <>
      <PrintBar title={c.title} />
      <PrintSheet org={org} title={c.title} subtitle={c.number ? `Contrato nº ${c.number}` : undefined} footerNote={c.content_hash ? `Integridade (SHA-256): ${c.content_hash}` : undefined}>
        <div className="whitespace-pre-wrap leading-relaxed">{c.content}</div>
        <div className="mt-4 border-t pt-2 text-[9pt]">
          {c.accepted_at
            ? <><p className="font-semibold">Registro de aceite eletrônico</p><p>Aceito por {c.accepted_by_name} em {dateTime(c.accepted_at, tz)}{c.accepted_ip ? ` · IP ${c.accepted_ip}` : ''}</p></>
            : <p>Status: {c.status === 'draft' ? 'rascunho' : c.status === 'sent' ? 'aguardando aceite' : c.status}</p>}
        </div>
      </PrintSheet>
    </>
  );
}
