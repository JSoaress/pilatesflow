'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Checkbox } from '@/components/ui/input';
import { saveSetting, type SettingKey } from '@/lib/actions/settings';
import { channel as channelLabels } from '@/lib/labels';

/** Form genérico para uma configuração objeto (system_settings) com um único botão de salvar. */
function useSettingForm(key: SettingKey, initial: Record<string, any>) {
  const router = useRouter();
  const [v, setV] = React.useState<Record<string, any>>(initial);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, start] = React.useTransition();
  const set = (patch: Record<string, any>) => setV((prev) => ({ ...prev, ...patch }));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await saveSetting(key, v);
      if (r.ok) { setErrors({}); toast.success('Configurações salvas.'); router.refresh(); }
      else { setErrors(r.fieldErrors ?? {}); toast.error(r.error); }
    });
  };
  return { v, set, errors, pending, submit };
}

const num = (fn: (n: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) => fn(Number(e.target.value));
const bool = (fn: (b: boolean) => void) => (e: React.ChangeEvent<HTMLInputElement>) => fn(e.target.checked);

export function ScheduleRulesForm({ value, readOnly }: { value: Record<string, any>; readOnly: boolean }) {
  const { v, set, errors, pending, submit } = useSettingForm('schedule_rules', value);
  return (
    <form onSubmit={submit}>
      <fieldset disabled={readOnly} className="grid gap-4 sm:grid-cols-2">
        <p className="text-sm font-semibold sm:col-span-2">Reposições</p>
        <Field label="Reposições permitidas por mês" htmlFor="sr-rpm" error={errors.replacements_per_month} hint="Quantos créditos de reposição por falta um aluno pode acumular.">
          <Input id="sr-rpm" type="number" min={0} max={31} value={v.replacements_per_month} onChange={num((n) => set({ replacements_per_month: n }))} />
        </Field>
        <Field label="Validade da reposição (dias)" htmlFor="sr-rvd" error={errors.replacement_validity_days} hint="Prazo para usar um crédito de reposição antes que ele expire.">
          <Input id="sr-rvd" type="number" min={1} max={365} value={v.replacement_validity_days} onChange={num((n) => set({ replacement_validity_days: n }))} />
        </Field>

        <p className="pt-2 text-sm font-semibold sm:col-span-2">Cancelamento e faltas</p>
        <Field label="Aviso mínimo para cancelamento (horas)" htmlFor="sr-mcn" error={errors.min_cancel_notice_hours} hint="Até quanto tempo antes da aula o aluno pode cancelar sem perder a sessão." className="sm:col-span-2 sm:max-w-xs">
          <Input id="sr-mcn" type="number" min={0} max={168} value={v.min_cancel_notice_hours} onChange={num((n) => set({ min_cancel_notice_hours: n }))} />
        </Field>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Checkbox label="Falta gera crédito de reposição" checked={!!v.absence_generates_credit} onChange={bool((b) => set({ absence_generates_credit: b }))} />
          <Checkbox label="Falta consome a sessão do plano" checked={!!v.absence_consumes_session} onChange={bool((b) => set({ absence_consumes_session: b }))} />
          <Checkbox label="Feriado gera crédito de reposição" checked={!!v.holiday_generates_credit} onChange={bool((b) => set({ holiday_generates_credit: b }))} />
          <Checkbox label="Falta do profissional gera crédito de reposição" checked={!!v.staff_absence_generates_credit} onChange={bool((b) => set({ staff_absence_generates_credit: b }))} />
        </div>

        <p className="pt-2 text-sm font-semibold sm:col-span-2">Horário fixo, lista de espera e check-in</p>
        <Field label="Horizonte de recorrência (dias)" htmlFor="sr-rhd" error={errors.recurrence_horizon_days} hint="Até quando no futuro os horários fixos semanais são gerados na agenda.">
          <Input id="sr-rhd" type="number" min={14} max={180} value={v.recurrence_horizon_days} onChange={num((n) => set({ recurrence_horizon_days: n }))} />
        </Field>
        <Field label="Prazo da lista de espera (horas)" htmlFor="sr-wh" error={errors.waitlist_hold_hours} hint="Tempo para um aluno da lista de espera confirmar uma vaga liberada.">
          <Input id="sr-wh" type="number" min={1} max={72} value={v.waitlist_hold_hours} onChange={num((n) => set({ waitlist_hold_hours: n }))} />
        </Field>
        <Field label="Janela de check-in (minutos)" htmlFor="sr-cw" error={errors.checkin_window_minutes} hint="Tolerância, antes e depois do horário, para o check-in da aula.">
          <Input id="sr-cw" type="number" min={10} max={240} value={v.checkin_window_minutes} onChange={num((n) => set({ checkin_window_minutes: n }))} />
        </Field>

        {!readOnly && <div className="sm:col-span-2"><Button type="submit" loading={pending}><Save />Salvar</Button></div>}
      </fieldset>
    </form>
  );
}

export function OnlineBookingForm({ value, readOnly }: { value: Record<string, any>; readOnly: boolean }) {
  const { v, set, errors, pending, submit } = useSettingForm('online_booking', value);
  return (
    <form onSubmit={submit}>
      <fieldset disabled={readOnly} className="grid gap-4 sm:grid-cols-2">
        <Checkbox label="Habilitar agendamento online de aula experimental" checked={!!v.enabled} onChange={bool((b) => set({ enabled: b }))} className="sm:col-span-2" />
        <Field label="Antecedência mínima (horas)" htmlFor="ob-min" error={errors.min_advance_hours} hint="Quanto tempo de antecedência o visitante precisa ter para agendar.">
          <Input id="ob-min" type="number" min={0} max={168} value={v.min_advance_hours} onChange={num((n) => set({ min_advance_hours: n }))} />
        </Field>
        <Field label="Até quantos dias no futuro" htmlFor="ob-max" error={errors.max_days_ahead} hint="Intervalo de datas que o visitante pode escolher.">
          <Input id="ob-max" type="number" min={1} max={180} value={v.max_days_ahead} onChange={num((n) => set({ max_days_ahead: n }))} />
        </Field>
        <Field label="Intervalo entre horários (minutos)" htmlFor="ob-step" error={errors.slot_step_minutes} hint="De quanto em quanto tempo os horários disponíveis são exibidos. 0 = usa a duração de cada modalidade.">
          <Input id="ob-step" type="number" min={0} max={120} value={v.slot_step_minutes} onChange={num((n) => set({ slot_step_minutes: n }))} />
        </Field>

        {!readOnly && <div className="sm:col-span-2"><Button type="submit" loading={pending}><Save />Salvar</Button></div>}
      </fieldset>
    </form>
  );
}

export function AutomationsForm({ value, readOnly }: { value: Record<string, any>; readOnly: boolean }) {
  const { v, set, errors, pending, submit } = useSettingForm('automations', value);
  const channelOptions = Object.entries(channelLabels).filter(([k]) => ['whatsapp', 'email', 'sms'].includes(k));
  return (
    <form onSubmit={submit}>
      <fieldset disabled={readOnly} className="space-y-5">
        <div className="flex flex-wrap items-end gap-4">
          <Checkbox label="Lembrete de aula" checked={!!v.appointment_reminder_enabled} onChange={bool((b) => set({ appointment_reminder_enabled: b }))} />
          <Field label="Horas de antecedência" htmlFor="am-arh" error={errors.appointment_reminder_hours} className="w-44">
            <Input id="am-arh" type="number" min={1} max={72} value={v.appointment_reminder_hours} onChange={num((n) => set({ appointment_reminder_hours: n }))} />
          </Field>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <Checkbox label="Lembrete de vencimento" checked={!!v.payment_due_reminder_enabled} onChange={bool((b) => set({ payment_due_reminder_enabled: b }))} />
          <Field label="Dias antes do vencimento" htmlFor="am-pdd" error={errors.payment_due_reminder_days} className="w-44">
            <Input id="am-pdd" type="number" min={0} max={15} value={v.payment_due_reminder_days} onChange={num((n) => set({ payment_due_reminder_days: n }))} />
          </Field>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <Checkbox label="Cobrança de atraso" checked={!!v.overdue_reminder_enabled} onChange={bool((b) => set({ overdue_reminder_enabled: b }))} />
          <Field label="Repetir a cada (dias)" htmlFor="am-ored" error={errors.overdue_reminder_every_days} className="w-44">
            <Input id="am-ored" type="number" min={1} max={30} value={v.overdue_reminder_every_days} onChange={num((n) => set({ overdue_reminder_every_days: n }))} />
          </Field>
        </div>
        <Checkbox label="Mensagem de aniversário" checked={!!v.birthday_message_enabled} onChange={bool((b) => set({ birthday_message_enabled: b }))} />
        <Field label="Canal padrão de envio" htmlFor="am-ch" error={errors.channel} hint="Usado quando nenhum canal específico é escolhido." className="max-w-xs">
          <Select id="am-ch" value={v.channel} onChange={(e) => set({ channel: e.target.value })}>
            {channelOptions.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>

        {!readOnly && <div><Button type="submit" loading={pending}><Save />Salvar</Button></div>}
      </fieldset>
    </form>
  );
}

export function RetentionForm({ reassessmentDays, retentionYears, readOnly }: { reassessmentDays: number; retentionYears: number; readOnly: boolean }) {
  const router = useRouter();
  const [v, setV] = React.useState({ reassessment_interval_days: reassessmentDays, clinical_retention_years: retentionYears });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, start] = React.useTransition();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const [r1, r2] = await Promise.all([
        saveSetting('reassessment_interval_days', v.reassessment_interval_days),
        saveSetting('clinical_retention_years', v.clinical_retention_years),
      ]);
      const errs: Record<string, string> = {};
      if (!r1.ok) errs.reassessment_interval_days = r1.error;
      if (!r2.ok) errs.clinical_retention_years = r2.error;
      setErrors(errs);
      if (!r1.ok) {
        toast.error(r1.error);
        return;
      }
      if (!r2.ok) {
        toast.error(r2.error);
        return;
      }
      toast.success('Configurações salvas.');
      router.refresh();
    });
  };
  return (
    <form onSubmit={submit}>
      <fieldset disabled={readOnly} className="grid gap-4 sm:grid-cols-2">
        <Field label="Intervalo de reavaliação física (dias)" htmlFor="rt-ri" error={errors.reassessment_interval_days} hint="Periodicidade recomendada para reavaliar o aluno.">
          <Input id="rt-ri" type="number" min={15} max={730} value={v.reassessment_interval_days} onChange={num((n) => setV((p) => ({ ...p, reassessment_interval_days: n })))} />
        </Field>
        <Field label="Retenção de dados clínicos (anos)" htmlFor="rt-cr" error={errors.clinical_retention_years} hint="Por quanto tempo o prontuário é mantido antes de ser elegível para descarte.">
          <Input id="rt-cr" type="number" min={5} max={100} value={v.clinical_retention_years} onChange={num((n) => setV((p) => ({ ...p, clinical_retention_years: n })))} />
        </Field>
        {!readOnly && <div className="sm:col-span-2"><Button type="submit" loading={pending}><Save />Salvar</Button></div>}
      </fieldset>
    </form>
  );
}
