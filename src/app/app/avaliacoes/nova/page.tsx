import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Ruler, ClipboardList, Printer, ChevronRight } from 'lucide-react';
import { requirePermission } from '@/lib/auth/context';
import { PageHeader } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';
import { AssessmentForm } from '@/components/app/clinical/assessment-form';
import { FormRunner } from '@/components/app/evaluation/form-runner';
import { ChoosePatient } from '@/components/app/evaluation/choose-patient';
import { listTemplates, loadTemplate, ageAt } from '@/lib/evaluation/server';
import { todayISO } from '@/lib/format';

export const metadata = { title: 'Nova avaliação' };

export default async function NewAssessment({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requirePermission('assessments.create');
  const sp = await searchParams;
  const [{ data: staff }, patient] = await Promise.all([
    ctx.supabase.from('staff').select('id, full_name').eq('organization_id', ctx.org.id).eq('status', 'active').in('kind', ['physiotherapist', 'pe_professional', 'instructor']).is('deleted_at', null).order('full_name'),
    sp.aluno ? ctx.supabase.from('patients').select('id, full_name, social_name, gender, birth_date').eq('id', sp.aluno).eq('organization_id', ctx.org.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const p = patient.data as any;
  const staffOpts = ((staff ?? []) as any[]).map((s) => ({ id: s.id, name: s.full_name }));
  const back = sp.aluno ? { href: `/app/alunos/${sp.aluno}?aba=avaliacoes`, label: 'Aluno' } : { href: '/app/avaliacoes', label: 'Avaliações' };
  const qsAluno = sp.aluno ? `&aluno=${sp.aluno}` : '';

  // 1) Medidas corporais e testes (formulário existente)
  if (sp.ficha === 'medidas') {
    const { data: fields } = await ctx.supabase.from('assessment_fields').select('key, label, unit, section, input_type').eq('organization_id', ctx.org.id).eq('is_active', true).order('sort_order');
    return (
      <>
        <PageHeader title="Medidas corporais e testes" back={back} />
        <div className="rounded-xl border bg-card p-6 shadow-soft">
          <AssessmentForm fields={(fields ?? []) as any[]} staff={staffOpts} patient={p ? { id: p.id, name: p.social_name || p.full_name } : null} />
        </div>
      </>
    );
  }

  // 2) Ficha estruturada
  if (sp.ficha) {
    const tpl = await loadTemplate(ctx, sp.ficha);
    if (!tpl) notFound();
    if (!p) return (
      <>
        <PageHeader title={tpl.name} description="Escolha o aluno para iniciar a avaliação." back={back} />
        <div className="rounded-xl border bg-card p-6 shadow-soft"><ChoosePatient baseHref={`/app/avaliacoes/nova?ficha=${encodeURIComponent(sp.ficha)}`} /></div>
      </>
    );
    const today = todayISO(ctx.tz);
    return (
      <>
        <PageHeader title={tpl.name} description={`${tpl.specialty} · ${p.social_name || p.full_name}`} back={back}
          actions={<a href={`/imprimir/ficha-em-branco/${encodeURIComponent(tpl.key)}?aluno=${p.id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"><Printer className="h-4 w-4" />Imprimir em branco</a>} />
        <FormRunner template={tpl} patient={{ id: p.id, name: p.social_name || p.full_name, sex: p.gender ?? null, age: ageAt(p.birth_date, today) }} staff={staffOpts} defaultStaffId={ctx.staffId} today={today} canFinalize={ctx.can('assessments.edit')} />
      </>
    );
  }

  // 3) Escolha do tipo de avaliação
  const templates = await listTemplates(ctx);
  return (
    <>
      <PageHeader title="Nova avaliação" description={p ? `Aluno: ${p.social_name || p.full_name}` : 'Escolha o tipo de avaliação.'} back={back} />
      <div className="space-y-6">
        <Link href={`/app/avaliacoes/nova?ficha=medidas${qsAluno}`} className="group flex items-center gap-4 rounded-xl border bg-card p-5 shadow-soft transition-shadow hover:shadow-lift">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary"><Ruler className="h-5 w-5" /></span>
          <span className="flex-1"><span className="block font-medium group-hover:text-primary">Medidas corporais e testes físicos</span><span className="text-sm text-muted-foreground">Peso, altura, perimetria, flexibilidade, testes funcionais e fotos posturais — com gráficos de evolução.</span></span>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </Link>
        <div>
          <h2 className="mb-3 font-display text-xl">Fichas de avaliação</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {templates.map((t) => (
              <div key={t.key} className="flex flex-col rounded-xl border bg-card p-5 shadow-soft">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary"><ClipboardList className="h-5 w-5" /></span>
                  <div className="min-w-0"><p className="font-medium leading-tight">{t.name}</p><p className="text-xs text-muted-foreground">{t.specialty} · {t.fields} itens</p></div>
                  {!t.system && <Badge variant="outline" className="ml-auto">própria</Badge>}
                </div>
                <p className="mt-3 flex-1 text-sm text-muted-foreground">{t.description}</p>
                <div className="mt-4 flex items-center gap-3">
                  <Link href={`/app/avaliacoes/nova?ficha=${encodeURIComponent(t.key)}${qsAluno}`} className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">Preencher</Link>
                  <a href={`/imprimir/ficha-em-branco/${encodeURIComponent(t.key)}${sp.aluno ? `?aluno=${sp.aluno}` : ''}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-sm text-primary hover:underline"><Printer className="h-4 w-4" />Em branco</a>
                </div>
              </div>
            ))}
          </div>
          {ctx.can('settings.edit') && <p className="mt-3 text-sm text-muted-foreground">Crie fichas próprias em <Link href="/app/configuracoes/modelos?aba=fichas" className="text-primary hover:underline">Configurações › Modelos › Fichas de avaliação</Link>.</p>}
        </div>
      </div>
    </>
  );
}
