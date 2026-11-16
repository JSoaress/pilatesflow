import { requirePermission } from '@/lib/auth/context';
import { PageHeader, Section } from '@/components/ui/misc';
import { ScheduleRulesForm, OnlineBookingForm, AutomationsForm, RetentionForm } from '@/components/app/settings/rules-forms';

export const metadata = { title: 'Regras e automações' };

const DEFAULTS = {
  schedule_rules: {
    replacements_per_month: 2, replacement_validity_days: 30, min_cancel_notice_hours: 3,
    absence_generates_credit: false, absence_consumes_session: true, holiday_generates_credit: true,
    staff_absence_generates_credit: true, recurrence_horizon_days: 60, waitlist_hold_hours: 2, checkin_window_minutes: 60,
  } as Record<string, any>,
  online_booking: { enabled: true, min_advance_hours: 2, max_days_ahead: 30, slot_step_minutes: 0 } as Record<string, any>,
  automations: {
    appointment_reminder_enabled: false, appointment_reminder_hours: 24, payment_due_reminder_enabled: false, payment_due_reminder_days: 2,
    overdue_reminder_enabled: false, overdue_reminder_every_days: 7, birthday_message_enabled: false, channel: 'whatsapp',
  } as Record<string, any>,
};

export default async function RulesPage() {
  const ctx = await requirePermission('settings.view');
  const canEdit = ctx.can('settings.edit');
  const { data: rows } = await ctx.supabase.from('system_settings').select('key, value').eq('organization_id', ctx.org.id)
    .in('key', ['schedule_rules', 'online_booking', 'automations', 'reassessment_interval_days', 'clinical_retention_years']);
  const byKey = Object.fromEntries(((rows ?? []) as { key: string; value: unknown }[]).map((r) => [r.key, r.value]));

  const scheduleRules = { ...DEFAULTS.schedule_rules, ...((byKey.schedule_rules as object) ?? {}) };
  const onlineBooking = { ...DEFAULTS.online_booking, ...((byKey.online_booking as object) ?? {}) };
  const automations = { ...DEFAULTS.automations, ...((byKey.automations as object) ?? {}) };
  const reassessmentDays = typeof byKey.reassessment_interval_days === 'number' ? byKey.reassessment_interval_days : 90;
  const retentionYears = typeof byKey.clinical_retention_years === 'number' ? byKey.clinical_retention_years : 20;

  return (
    <>
      <PageHeader title="Regras e automações" description="Reposição, cancelamento, agendamento online, lembretes e retenção de dados clínicos." />
      <div className="space-y-6">
        <Section title="Reposições e cancelamentos" description="O que acontece quando um aluno falta ou cancela uma aula.">
          <ScheduleRulesForm value={scheduleRules} readOnly={!canEdit} />
        </Section>
        <Section title="Agendamento online" description="Regras da página pública de agendamento de aula experimental.">
          <OnlineBookingForm value={onlineBooking} readOnly={!canEdit} />
        </Section>
        <Section title="Lembretes e mensagens automáticas" description="Envio automático de lembretes de aula, cobrança e aniversário.">
          <AutomationsForm value={automations} readOnly={!canEdit} />
        </Section>
        <Section title="Reavaliação e retenção de dados clínicos" description="Periodicidade de reavaliação e prazo de guarda do prontuário.">
          <RetentionForm reassessmentDays={reassessmentDays} retentionYears={retentionYears} readOnly={!canEdit} />
        </Section>
      </div>
    </>
  );
}
