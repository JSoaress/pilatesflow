import { notFound } from 'next/navigation';
import { getAppContext, requirePermission } from '@/lib/auth/context';
import { TabLinks } from '@/components/ui/tab-links';
import { PatientHeader } from '@/components/app/patient/header';
import { SummaryTab } from '@/components/app/patient/summary-tab';
import { DataTab } from '@/components/app/patient/data-tab';
import { ScheduleTab } from '@/components/app/patient/schedule-tab';
import { FinanceTab } from '@/components/app/patient/finance-tab';
import { MedicalTab } from '@/components/app/patient/medical-tab';
import { AssessmentsTab } from '@/components/app/patient/assessments-tab';
import { ProgramsTab } from '@/components/app/patient/programs-tab';
import { DocumentsTab } from '@/components/app/patient/documents-tab';
import { MessagesTab } from '@/components/app/patient/messages-tab';
import { signedUrl } from '@/lib/storage';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getAppContext();
  const { data } = await ctx.supabase.from('patients').select('full_name').eq('id', id).maybeSingle();
  return { title: data?.full_name ?? 'Aluno' };
}

export default async function PatientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const ctx = await requirePermission('patients.view');
  const { id } = await params;
  const sp = await searchParams;
  const { data: patient } = await ctx.supabase.from('patients').select('*').eq('id', id).eq('organization_id', ctx.org.id).maybeSingle();
  if (!patient || patient.deleted_at) notFound();
  const [{ data: balance }, photo] = await Promise.all([
    ctx.supabase.rpc('patient_balance', { p_patient: id }),
    signedUrl(ctx, 'avatars', patient.photo_path, 3600),
  ]);

  const tabs = [
    { id: 'resumo', label: 'Resumo' },
    { id: 'dados', label: 'Dados' },
    { id: 'agenda', label: 'Agenda', hidden: !ctx.can('schedule.view') },
    { id: 'financeiro', label: 'Plano e financeiro', hidden: !(ctx.can('finance.view') || ctx.can('plans.view')) },
    { id: 'prontuario', label: 'Prontuário', hidden: !ctx.can('medical_records.view') },
    { id: 'avaliacoes', label: 'Avaliações e anamnese', hidden: !ctx.can('assessments.view') },
    { id: 'exercicios', label: 'Exercícios', hidden: !ctx.can('exercises.view') },
    { id: 'documentos', label: 'Documentos', hidden: !(ctx.can('documents.view') || ctx.can('contracts.view')) },
    { id: 'mensagens', label: 'Mensagens', hidden: !(ctx.can('communication.view') || ctx.can('crm.view')) },
  ];
  const active = tabs.find((t) => t.id === sp.aba && !t.hidden)?.id ?? 'resumo';
  const base = `/app/alunos/${id}`;

  return (
    <>
      <PatientHeader patient={patient} photoUrl={photo} balance={balance} />
      <TabLinks tabs={tabs} active={active} base={base} />
      {active === 'resumo' && <SummaryTab patientId={id} balance={balance} />}
      {active === 'dados' && <DataTab patient={patient} />}
      {active === 'agenda' && <ScheduleTab patientId={id} searchParams={sp} />}
      {active === 'financeiro' && <FinanceTab patientId={id} />}
      {active === 'prontuario' && <MedicalTab patientId={id} />}
      {active === 'avaliacoes' && <AssessmentsTab patientId={id} />}
      {active === 'exercicios' && <ProgramsTab patientId={id} />}
      {active === 'documentos' && <DocumentsTab patientId={id} />}
      {active === 'mensagens' && <MessagesTab patient={patient} />}
    </>
  );
}
