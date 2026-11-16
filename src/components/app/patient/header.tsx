import Link from 'next/link';
import { CalendarPlus, MessageCircle, Phone } from 'lucide-react';
import { getAppContext } from '@/lib/auth/context';
import { Avatar } from '@/components/ui/misc';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { label, patientStatus } from '@/lib/labels';
import { ageFrom } from '@/lib/format';
import { whatsappLink } from '@/lib/utils';
import { PatientActions } from './patient-actions';
import { PrintMenu } from '@/components/print/print-menu';

export async function PatientHeader({ patient, photoUrl, balance }: { patient: Record<string, any>; photoUrl: string | null; balance: any }) {
  const ctx = await getAppContext();
  const age = ageFrom(patient.birth_date);
  const wa = whatsappLink(patient.whatsapp ?? patient.phone);
  const [{ data: lastAssessment }, { data: programs }] = await Promise.all([
    ctx.can('assessments.view') ? ctx.supabase.from('assessments').select('id').eq('patient_id', patient.id).order('assessed_on', { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null }),
    ctx.can('exercises.view') ? ctx.supabase.from('patient_programs').select('id, name').eq('patient_id', patient.id).eq('status', 'active').order('created_at', { ascending: false }).limit(5) : Promise.resolve({ data: [] }),
  ]);
  return (
    <div className="mb-6 flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-soft md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-4">
        <Avatar name={patient.social_name || patient.full_name} src={photoUrl} size={64} />
        <div className="min-w-0">
          <Link href="/app/alunos" className="text-xs text-muted-foreground hover:text-foreground">← Alunos</Link>
          <h1 className="truncate text-xl font-semibold md:text-2xl">{patient.social_name || patient.full_name}</h1>
          {patient.social_name && <p className="text-xs text-muted-foreground">Nome de registro: {patient.full_name}</p>}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant={statusVariant[patient.status] ?? 'neutral'}>{label(patientStatus, patient.status)}</Badge>
            {age !== null && <span>{age} anos</span>}
            {balance?.plan_name && <span>· {balance.plan_name}</span>}
            {patient.user_id && <Badge variant="info">Portal ativo</Badge>}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {wa && <a href={wa} target="_blank" rel="noopener noreferrer"><Button variant="outline"><MessageCircle /> WhatsApp</Button></a>}
        {patient.phone && <a href={`tel:${String(patient.phone).replace(/\D/g, '')}`} className="sm:hidden"><Button variant="outline"><Phone /> Ligar</Button></a>}
        {ctx.can('schedule.create') && <Link href={`/app/agenda?novo=1&aluno=${patient.id}`}><Button><CalendarPlus /> Agendar</Button></Link>}
        <PrintMenu patientId={patient.id} lastAssessmentId={lastAssessment?.id ?? null} programs={(programs ?? []) as { id: string; name: string }[]}
          can={{ record: ctx.can('medical_records.view'), handout: ctx.can('documents.view'), assessment: ctx.can('assessments.view'), program: ctx.can('exercises.view') }} />
        <PatientActions patient={{ id: patient.id, full_name: patient.full_name, email: patient.email, user_id: patient.user_id, status: patient.status }}
          can={{ edit: ctx.can('patients.edit'), delete: ctx.can('patients.delete'), lgpd: ctx.can('lgpd.manage') }} />
      </div>
    </div>
  );
}
