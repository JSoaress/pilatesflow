import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Check } from 'lucide-react';
import { getUser, getAppContext } from '@/lib/auth/context';
import { ResourceSection } from '@/components/resource/resource-page';
import { Logo } from '@/components/layout/sidebar';
import { cn } from '@/lib/utils';
import { OrgForm } from './org-form';
import { StepNav } from './step-nav';
import { UnitHours } from './unit-hours';
import { ImportPatients } from '@/components/app/import-patients';

export const metadata: Metadata = { title: 'Primeiro acesso' };
export const dynamic = 'force-dynamic';

const STEPS = [
  'Dados da clínica', 'Unidade', 'Horário de funcionamento', 'Salas', 'Equipamentos',
  'Profissionais', 'Modalidades', 'Planos', 'Importar alunos', 'Finalizar',
];

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { supabase, user } = await getUser();
  if (!user) redirect('/login?next=/onboarding');
  const { data: orgs } = await supabase.rpc('my_organizations');
  const owned = (Array.isArray(orgs) ? orgs : []).filter((o: { role_key: string }) => o.role_key === 'owner');
  const hasOrg = owned.length > 0;
  const step = hasOrg ? Math.min(10, Math.max(2, Number(sp.passo ?? owned[0].onboarding_step ?? 2) || 2)) : 1;

  let content: React.ReactNode;
  if (!hasOrg) {
    content = <OrgForm />;
  } else {
    const ctx = await getAppContext();
    if (ctx.org.onboarding_completed_at && !sp.passo) redirect('/app');
    const { data: units } = await ctx.supabase.from('units').select('*').eq('organization_id', ctx.org.id).is('deleted_at', null).order('created_at');
    switch (step) {
      case 2: content = <><Intro text="Cadastre a unidade (endereço, CNPJ, contatos). Você pode ter várias unidades." /><ResourceSection resource="units" searchParams={sp} compact hideSearch /></>; break;
      case 3: content = (units?.length ? <UnitHours units={units} tz={ctx.tz} /> : <Intro text="Cadastre uma unidade no passo anterior." />); break;
      case 4: content = <><Intro text="Salas onde as aulas acontecem e quantos alunos cabem ao mesmo tempo." /><ResourceSection resource="rooms" searchParams={sp} compact hideSearch /></>; break;
      case 5: content = <><Intro text="Reformer, Cadillac, Chair… com datas de manutenção." /><ResourceSection resource="equipment" searchParams={sp} compact hideSearch /></>; break;
      case 6: content = <><Intro text="Fisioterapeutas, instrutores e recepção. O acesso ao sistema pode ser enviado depois em Configurações → Usuários." /><ResourceSection resource="staff" searchParams={sp} compact hideSearch /></>; break;
      case 7: content = <><Intro text="Modalidades/tipos de atendimento, com duração e número de vagas." /><ResourceSection resource="services" searchParams={sp} compact hideSearch /></>; break;
      case 8: content = <><Intro text="Planos e pacotes com valores, frequência e regras de reposição." /><ResourceSection resource="plans" searchParams={sp} compact hideSearch /></>; break;
      case 9: content = <><Intro text="Importe sua lista de alunos de uma planilha (CSV ou XLSX). Você revisa antes de confirmar." /><ImportPatients /></>; break;
      default: content = (
        <div className="space-y-3">
          <h2 className="font-display text-2xl">Tudo pronto!</h2>
          <p className="text-muted-foreground">Sua clínica está configurada. Revise os modelos de contrato e a Política de Privacidade (Configurações → LGPD) antes de usar com alunos.</p>
        </div>
      );
    }
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="flex h-16 items-center gap-2 border-b bg-card px-6"><Logo /><span className="font-display text-lg">Primeiro acesso</span></header>
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 lg:grid-cols-[240px_1fr]">
        <ol className="space-y-1" aria-label="Etapas">
          {STEPS.map((s, i) => {
            const n = i + 1;
            const done = n < step;
            return (
              <li key={s}>
                <a href={hasOrg && n > 1 ? `/onboarding?passo=${n}` : undefined} aria-current={n === step ? 'step' : undefined}
                  className={cn('flex items-center gap-3 rounded-lg px-3 py-2 text-sm', n === step ? 'bg-card font-medium shadow-soft' : 'text-muted-foreground', hasOrg && n > 1 && 'hover:bg-card')}>
                  <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs', done ? 'border-primary bg-primary text-primary-foreground' : n === step ? 'border-primary text-primary' : '')}>
                    {done ? <Check className="h-3.5 w-3.5" /> : n}
                  </span>
                  {s}
                </a>
              </li>
            );
          })}
        </ol>
        <section className="rounded-2xl border bg-card p-6 shadow-soft">
          <p className="text-xs font-medium uppercase tracking-wide text-primary">Passo {step} de 10</p>
          <h1 className="mb-5 mt-1 text-2xl font-semibold">{STEPS[step - 1]}</h1>
          {content}
          {hasOrg && <StepNav step={step} />}
        </section>
      </div>
    </div>
  );
}

function Intro({ text }: { text: string }) {
  return <p className="mb-5 text-sm text-muted-foreground">{text}</p>;
}
