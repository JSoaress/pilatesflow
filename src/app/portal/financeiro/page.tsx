import { getPortalContext } from '@/lib/auth/portal';
import { Section, Table, Th, Td, Tr, EmptyState } from '@/components/ui/misc';
import { Badge, statusVariant } from '@/components/ui/badge';
import { date, dateTime, money } from '@/lib/format';
import { label, receivableStatus, subscriptionStatus, paymentMethod } from '@/lib/labels';
import { CopyPix } from '@/components/portal/copy-pix';

export const metadata = { title: 'Financeiro' };

export default async function PortalFinance() {
  const { supabase, me } = await getPortalContext();
  const { data } = await supabase.rpc('portal_financial', { p_patient_id: me.patient_id });
  const f = (data ?? {}) as any;
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Financeiro</h1>
      <Section title="Meu plano">
        {(f.subscriptions ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Nenhum plano.</p> : (
          <ul className="divide-y">{(f.subscriptions as any[]).map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <span><b>{s.plan}</b> · {date(s.start_date)} – {s.end_date ? date(s.end_date) : 'indeterminado'} · {money(s.price)}</span>
              <Badge variant={statusVariant[s.status] ?? 'neutral'}>{label(subscriptionStatus, s.status)}</Badge>
            </li>
          ))}</ul>
        )}
      </Section>
      <Section title="Vencimentos">
        {(f.receivables ?? []).length === 0 ? <EmptyState title="Nenhuma cobrança" /> : (
          <Table>
            <thead><tr><Th>Vencimento</Th><Th>Descrição</Th><Th className="text-right">Valor</Th><Th>Status</Th><Th /></tr></thead>
            <tbody>{(f.receivables as any[]).map((r) => (
              <Tr key={r.id}>
                <Td>{date(r.due_date)}</Td><Td>{r.description}</Td>
                <Td className="text-right tabular-nums">{money(Number(r.amount) - Number(r.amount_paid))}</Td>
                <Td><Badge variant={statusVariant[r.status] ?? 'neutral'}>{label(receivableStatus, r.status)}</Badge></Td>
                <Td className="text-right">{['pending', 'overdue', 'partial'].includes(r.status) && (r.pix_copy_paste || r.payment_url) && <CopyPix pix={r.pix_copy_paste} url={r.payment_url} />}</Td>
              </Tr>
            ))}</tbody>
          </Table>
        )}
      </Section>
      <Section title="Pagamentos e recibos">
        {(f.payments ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Nenhum pagamento.</p> : (
          <ul className="divide-y">{(f.payments as any[]).map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <span>{dateTime(p.paid_at)} · {money(p.amount)} · {label(paymentMethod, p.method)}{p.status === 'refunded' && ' · estornado'}</span>
              {p.status === 'confirmed' && <a className="text-primary hover:underline" href={`/api/receipts/${p.id}`} target="_blank" rel="noopener noreferrer">Recibo nº {p.receipt_number} (PDF)</a>}
            </li>
          ))}</ul>
        )}
      </Section>
    </div>
  );
}
