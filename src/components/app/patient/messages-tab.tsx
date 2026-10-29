import { getAppContext } from '@/lib/auth/context';
import { Section, Table, Th, Td, Tr, EmptyState } from '@/components/ui/misc';
import { Badge, statusVariant } from '@/components/ui/badge';
import { dateTime } from '@/lib/format';
import { label, messageStatus, channel } from '@/lib/labels';
import { SendMessageButton, InteractionButton } from '@/components/app/comm/send-message';

const CH: Record<string, string> = { call: 'Ligação', whatsapp: 'WhatsApp', email: 'E-mail', in_person: 'Presencial', instagram: 'Instagram', sms: 'SMS', other: 'Outro' };

export async function MessagesTab({ patient }: { patient: Record<string, any> }) {
  const ctx = await getAppContext();
  const [msgs, ints, templates] = await Promise.all([
    ctx.can('communication.view') ? ctx.supabase.from('messages').select('id, channel, template_key, body, status, error, created_at, sent_at, to_address').eq('patient_id', patient.id).order('created_at', { ascending: false }).limit(50) : Promise.resolve({ data: [] }),
    ctx.supabase.from('crm_interactions').select('id, channel, direction, summary, occurred_at, profiles:created_by(full_name)').eq('patient_id', patient.id).order('occurred_at', { ascending: false }).limit(50),
    ctx.supabase.from('message_templates').select('id, key, channel, name, body').eq('organization_id', ctx.org.id).eq('is_active', true).order('name'),
  ]);
  return (
    <div className="space-y-6">
      <Section title="Mensagens enviadas" actions={ctx.can('communication.create') ? <SendMessageButton patientId={patient.id} templates={(templates.data ?? []) as any[]} /> : undefined}>
        {(msgs.data ?? []).length === 0 ? <EmptyState title="Nenhuma mensagem" /> : (
          <Table>
            <thead><tr><Th>Data</Th><Th>Canal</Th><Th>Mensagem</Th><Th>Status</Th></tr></thead>
            <tbody>
              {((msgs.data ?? []) as any[]).map((m) => (
                <Tr key={m.id}>
                  <Td className="whitespace-nowrap">{dateTime(m.created_at, ctx.tz)}</Td>
                  <Td>{label(channel, m.channel)}<span className="block text-xs text-muted-foreground">{m.to_address}</span></Td>
                  <Td><p className="line-clamp-2 max-w-md text-sm">{m.body}</p></Td>
                  <Td><Badge variant={statusVariant[m.status] ?? 'neutral'}>{label(messageStatus, m.status)}</Badge>{m.error && <span className="block text-xs text-destructive">{m.error}</span>}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>
      <Section title="Contatos registrados" actions={<InteractionButton patientId={patient.id} />}>
        {(ints.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Nenhum contato registrado.</p> : (
          <ul className="space-y-3">
            {((ints.data ?? []) as any[]).map((i) => (
              <li key={i.id} className="rounded-lg border p-3 text-sm">
                <p className="text-xs text-muted-foreground">{dateTime(i.occurred_at, ctx.tz)} · {CH[i.channel]} · {i.direction === 'inbound' ? 'recebido' : 'realizado'} por {i.profiles?.full_name ?? '—'}</p>
                <p className="mt-1 whitespace-pre-wrap">{i.summary}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
