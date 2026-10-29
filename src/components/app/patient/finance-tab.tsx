import { getAppContext } from '@/lib/auth/context';
import { Section, Table, Th, Td, Tr, EmptyState } from '@/components/ui/misc';
import { Badge, statusVariant } from '@/components/ui/badge';
import { money, date, dateTime } from '@/lib/format';
import { label, receivableStatus, subscriptionStatus, paymentMethod, contractStatus } from '@/lib/labels';
import { PaymentButton, ChargeButton } from '@/components/app/finance/payment-dialog';
import { SubscriptionButton } from '@/components/app/finance/subscription-dialog';
import { PaymentRowActions, ReceivableRowActions, SubscriptionRowActions, ContractRowActions } from '@/components/app/finance/row-actions';
import { NewReceivableButton } from '@/components/app/finance/new-receivable';

export async function FinanceTab({ patientId }: { patientId: string }) {
  const ctx = await getAppContext();
  const fin = ctx.can('finance.view');
  const [subs, recs, pays, contracts, plans, staff, accounts, cats] = await Promise.all([
    ctx.supabase.from('subscriptions').select('*, plans(name)').eq('patient_id', patientId).order('start_date', { ascending: false }),
    fin ? ctx.supabase.from('v_receivables').select('*').eq('patient_id', patientId).neq('status', 'cancelled').order('due_date', { ascending: false }).limit(100) : Promise.resolve({ data: [] }),
    fin ? ctx.supabase.from('payments').select('*').eq('patient_id', patientId).order('paid_at', { ascending: false }).limit(100) : Promise.resolve({ data: [] }),
    ctx.can('contracts.view') ? ctx.supabase.from('contracts').select('id, number, title, status, start_date, end_date, accepted_at, accepted_by_name, created_at').eq('patient_id', patientId).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
    ctx.supabase.from('plans').select('id, name, price, cycle_months, weekly_frequency, total_sessions, billing_type, installments_count, enrollment_fee, discount_percent').eq('organization_id', ctx.org.id).eq('is_active', true).is('deleted_at', null).order('sort_order'),
    ctx.supabase.from('staff').select('id, full_name').eq('organization_id', ctx.org.id).eq('status', 'active').is('deleted_at', null).order('full_name'),
    fin ? ctx.supabase.from('cash_accounts').select('id, name').eq('organization_id', ctx.org.id).eq('is_active', true) : Promise.resolve({ data: [] }),
    fin ? ctx.supabase.from('financial_categories').select('id, name').eq('organization_id', ctx.org.id).eq('type', 'income').eq('is_active', true).order('name') : Promise.resolve({ data: [] }),
  ]);
  const accountList = (accounts.data ?? []) as { id: string; name: string }[];

  return (
    <div className="space-y-6">
      <Section title="Planos" actions={ctx.can('plans.create') ? <SubscriptionButton patientId={patientId} plans={(plans.data ?? []) as any[]} staff={(staff.data ?? []) as any[]} canContract={ctx.can('contracts.create')} /> : undefined}>
        {(subs.data ?? []).length === 0 ? <EmptyState title="Nenhum plano contratado" /> : (
          <Table>
            <thead><tr><Th>Plano</Th><Th>Vigência</Th><Th>Valor</Th><Th>Aulas</Th><Th>Status</Th><Th /></tr></thead>
            <tbody>
              {((subs.data ?? []) as any[]).map((s) => (
                <Tr key={s.id}>
                  <Td className="font-medium">{s.plans?.name}{s.auto_renew && s.status === 'active' && <span className="ml-2 text-xs text-muted-foreground">renova automaticamente</span>}</Td>
                  <Td className="whitespace-nowrap">{date(s.start_date)} – {s.end_date ? date(s.end_date) : 'indeterminado'}</Td>
                  <Td>{money(s.price * (1 - s.discount_percent / 100))}{s.discount_percent > 0 && <span className="block text-xs text-muted-foreground">{s.discount_percent}% desc.</span>}</Td>
                  <Td className="tabular-nums">{s.sessions_total ? `${s.sessions_used}/${s.sessions_total + s.sessions_extra}` : `${s.sessions_used} usadas`}</Td>
                  <Td><Badge variant={statusVariant[s.status] ?? 'neutral'}>{label(subscriptionStatus, s.status)}</Badge></Td>
                  <Td className="text-right"><SubscriptionRowActions id={s.id} status={s.status} canEdit={ctx.can('plans.edit')} canContract={ctx.can('contracts.create')} /></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>

      {fin && (
        <Section title="Cobranças" actions={ctx.can('finance.create') ? <NewReceivableButton patientId={patientId} categories={(cats.data ?? []) as any[]} /> : undefined}>
          {(recs.data ?? []).length === 0 ? <EmptyState title="Nenhuma cobrança" /> : (
            <Table>
              <thead><tr><Th>Vencimento</Th><Th>Descrição</Th><Th>Valor</Th><Th>Em aberto</Th><Th>Status</Th><Th /></tr></thead>
              <tbody>
                {((recs.data ?? []) as any[]).map((r) => (
                  <Tr key={r.id}>
                    <Td className="whitespace-nowrap">{date(r.due_date)}{r.status === 'overdue' && <span className="block text-xs text-destructive">{r.days_overdue} dias em atraso</span>}</Td>
                    <Td>{r.description}</Td>
                    <Td className="tabular-nums">{money(Number(r.amount) - Number(r.discount) + Number(r.surcharge))}</Td>
                    <Td className="tabular-nums">{money(r.open_amount)}</Td>
                    <Td><Badge variant={statusVariant[r.status] ?? 'neutral'}>{label(receivableStatus, r.status)}</Badge></Td>
                    <Td className="whitespace-nowrap text-right">
                      <div className="flex justify-end gap-1">
                        {['pending', 'overdue', 'partial'].includes(r.status) && ctx.can('finance.create') && (
                          <>
                            <ChargeButton receivableId={r.id} />
                            <PaymentButton receivable={{ id: r.id, description: r.description, open_amount: Number(r.open_amount), due_date: r.due_date, payment_method: r.payment_method }} accounts={accountList} />
                          </>
                        )}
                        {['pending', 'overdue'].includes(r.status) && Number(r.amount_paid) === 0 && <ReceivableRowActions id={r.id} canEdit={ctx.can('finance.edit')} />}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Section>
      )}

      {fin && (
        <Section title="Pagamentos recebidos">
          {(pays.data ?? []).length === 0 ? <EmptyState title="Nenhum pagamento" /> : (
            <Table>
              <thead><tr><Th>Data</Th><Th>Recibo</Th><Th>Valor</Th><Th>Forma</Th><Th>Status</Th><Th /></tr></thead>
              <tbody>
                {((pays.data ?? []) as any[]).map((p) => (
                  <Tr key={p.id}>
                    <Td className="whitespace-nowrap">{dateTime(p.paid_at, ctx.tz)}</Td>
                    <Td className="tabular-nums">nº {p.receipt_number}</Td>
                    <Td className="tabular-nums">{money(p.amount)}</Td>
                    <Td>{label(paymentMethod, p.method)}{p.gateway && <span className="block text-xs text-muted-foreground">via {p.gateway}</span>}</Td>
                    <Td><Badge variant={p.status === 'confirmed' ? 'success' : 'neutral'}>{p.status === 'confirmed' ? 'Confirmado' : 'Estornado'}</Badge>{p.refund_reason && <span className="block text-xs text-muted-foreground">{p.refund_reason}</span>}</Td>
                    <Td className="text-right"><PaymentRowActions paymentId={p.id} status={p.status} canRefund={ctx.can('finance.refund')} /></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Section>
      )}

      {ctx.can('contracts.view') && (
        <Section title="Contratos">
          {(contracts.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Nenhum contrato. Gere a partir de um plano (menu de ações do plano).</p> : (
            <Table>
              <thead><tr><Th>Nº</Th><Th>Contrato</Th><Th>Vigência</Th><Th>Status</Th><Th /></tr></thead>
              <tbody>
                {((contracts.data ?? []) as any[]).map((c) => (
                  <Tr key={c.id}>
                    <Td className="tabular-nums">{c.number}</Td>
                    <Td>{c.title}{c.accepted_at && <span className="block text-xs text-muted-foreground">Aceito por {c.accepted_by_name} em {dateTime(c.accepted_at, ctx.tz)}</span>}</Td>
                    <Td className="whitespace-nowrap">{c.start_date ? date(c.start_date) : '—'} – {c.end_date ? date(c.end_date) : '—'}</Td>
                    <Td><Badge variant={statusVariant[c.status] ?? 'neutral'}>{label(contractStatus, c.status)}</Badge></Td>
                    <Td className="text-right"><ContractRowActions id={c.id} status={c.status} canEdit={ctx.can('contracts.edit')} /></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Section>
      )}
    </div>
  );
}
