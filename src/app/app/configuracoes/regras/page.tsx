import { requirePermission } from '@/lib/auth/context';
import { PageHeader, Section } from '@/components/ui/misc';
import { SettingsForm } from '@/components/app/settings-form';

export const metadata = { title: 'Regras e automações' };

export default async function RulesPage() {
  const ctx = await requirePermission('settings.view');
  const { data } = await ctx.supabase.from('system_settings').select('key, value').eq('organization_id', ctx.org.id);
  const s = Object.fromEntries(((data ?? []) as any[]).map((r) => [r.key, r.value]));
  const ro = !ctx.can('settings.edit');
  return (
    <>
      <PageHeader title="Regras e automações" description="Regras aplicadas pelo banco de dados em toda agenda, portal e agendamento online." />
      <fieldset disabled={ro} className="space-y-6">
        <Section title="Agenda, faltas e reposições">
          <SettingsForm settingKey="schedule_rules" initial={s.schedule_rules ?? {}} fields={[
            { name: 'replacements_per_month', label: 'Reposições por mês', type: 'int' },
            { name: 'replacement_validity_days', label: 'Validade do crédito de reposição (dias)', type: 'int' },
            { name: 'min_cancel_notice_hours', label: 'Antecedência mínima para desmarcar com direito a reposição (h)', type: 'int' },
            { name: 'recurrence_horizon_days', label: 'Gerar horários fixos com antecedência de (dias)', type: 'int' },
            { name: 'waitlist_hold_hours', label: 'Tempo para aceitar vaga da lista de espera (h)', type: 'int' },
            { name: 'checkin_window_minutes', label: 'Janela de check-in (min antes/depois)', type: 'int' },
            { name: 'absence_generates_credit', label: 'Falta gera crédito de reposição', type: 'bool' },
            { name: 'absence_consumes_session', label: 'Falta consome aula do plano', type: 'bool' },
            { name: 'holiday_generates_credit', label: 'Feriado gera crédito de reposição', type: 'bool' },
            { name: 'staff_absence_generates_credit', label: 'Ausência do profissional gera crédito', type: 'bool' },
          ]} />
        </Section>
        <Section title="Agendamento online (site)">
          <SettingsForm settingKey="online_booking" initial={s.online_booking ?? {}} fields={[
            { name: 'enabled', label: 'Permitir agendamento de aula experimental pelo site', type: 'bool', full: true },
            { name: 'min_advance_hours', label: 'Antecedência mínima (h)', type: 'int' },
            { name: 'max_days_ahead', label: 'Até quantos dias à frente', type: 'int' },
            { name: 'slot_step_minutes', label: 'Intervalo entre horários (min, 0 = duração da aula)', type: 'int' },
          ]} />
        </Section>
        <Section title="Lembretes automáticos" description="Mensagens só são enviadas com a integração do canal conectada.">
          <SettingsForm settingKey="automations" initial={s.automations ?? {}} fields={[
            { name: 'channel', label: 'Canal', type: 'select', options: [{ value: 'whatsapp', label: 'WhatsApp' }, { value: 'email', label: 'E-mail' }, { value: 'sms', label: 'SMS' }] },
            { name: 'appointment_reminder_hours', label: 'Lembrete de aula: horas antes', type: 'int' },
            { name: 'payment_due_reminder_days', label: 'Aviso de vencimento: dias antes', type: 'int' },
            { name: 'overdue_reminder_every_days', label: 'Cobrança de atraso: repetir a cada (dias)', type: 'int' },
            { name: 'appointment_reminder_enabled', label: 'Lembrete de aula', type: 'bool' },
            { name: 'payment_due_reminder_enabled', label: 'Aviso de vencimento', type: 'bool' },
            { name: 'overdue_reminder_enabled', label: 'Cobrança de atraso', type: 'bool' },
            { name: 'birthday_message_enabled', label: 'Mensagem de aniversário', type: 'bool' },
          ]} />
        </Section>
        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Reavaliação">
            <SettingsForm settingKey="reassessment_interval_days" scalar initial={{ v: s.reassessment_interval_days ?? 90 }} fields={[{ name: 'v', label: 'Reavaliar a cada (dias)', type: 'int' }]} />
          </Section>
          <Section title="Retenção de prontuários" description="Prazo mínimo de guarda (CFM/COFFITO: no mínimo 20 anos).">
            <SettingsForm settingKey="clinical_retention_years" scalar initial={{ v: s.clinical_retention_years ?? 20 }} fields={[{ name: 'v', label: 'Guardar por (anos)', type: 'int' }]} />
          </Section>
        </div>
      </fieldset>
    </>
  );
}
