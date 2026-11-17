import { notFound, redirect } from 'next/navigation';
import type { PrintOrg } from '@/lib/print';
import { createClient } from '@/lib/supabase/server';
import { PrintBar } from '@/components/print/print-bar';
import { PrintSheet, PrintFields, SignatureLine } from '@/components/print/doc';
import { money, dateTime } from '@/lib/format';
import { valorPorExtenso } from '@/lib/extenso';
import { paymentMethod } from '@/lib/labels';
import { env } from '@/lib/env';
import { storagePublicUrl } from '@/lib/utils';

export const metadata = { title: 'Recibo', robots: { index: false, follow: false } };

/** Recibo de pagamento para impressão (equipe com acesso financeiro ou o próprio aluno). */
export default async function PrintReceipt({ params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/login');
  const { data, error } = await supabase.rpc('receipt_data', { p_payment_id: paymentId });
  if (error || !data) notFound();
  const r = data as any;
  const org: PrintOrg = {
    name: r.trade_name ?? r.company,
    legal_name: r.company && r.company !== r.trade_name ? r.company : null,
    cnpj: r.cnpj ?? null,
    phone: r.phone ?? null,
    email: null,
    logo: storagePublicUrl(env.supabaseUrl, 'site', r.logo_path),
    address: r.address ?? null,
  };
  return (
    <>
      <PrintBar title={`Recibo nº ${r.receipt_number}`} />
      <PrintSheet org={org} title={`Recibo nº ${r.receipt_number}`}>
        <p className="text-center text-[22pt] font-bold">{money(r.amount)}</p>
        {r.status === 'refunded' && <p className="text-center text-[12pt] font-bold text-red-700">PAGAMENTO ESTORNADO — RECIBO SEM VALIDADE</p>}
        <p>Recebemos de {r.client}{r.cpf ? `, CPF ${r.cpf}` : ''}, a importância de {money(r.amount)} ({valorPorExtenso(Number(r.amount))}), referente a {r.reference}.</p>
        <PrintFields cols={2} items={[
          ['Cliente', r.client],
          ['CPF', r.cpf ?? 'não informado'],
          ['Valor', money(r.amount)],
          ['Referente a', r.reference],
          ['Data do pagamento', dateTime(r.paid_at, r.timezone)],
          ['Forma de pagamento', paymentMethod[r.method] ?? r.method],
          ['Identificador', String(r.payment_id).slice(0, 8).toUpperCase()],
        ]} />
        <SignatureLine name={r.company} />
      </PrintSheet>
    </>
  );
}
