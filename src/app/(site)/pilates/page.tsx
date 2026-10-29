import { getSite } from '@/lib/site';
import { pageMeta } from '@/lib/site-meta';
import { CtaBand, PageIntro, Prose } from '@/components/site/sections';

export const revalidate = 300;
export const generateMetadata = () => pageMeta('/pilates', 'O que é Pilates', 'Conheça o método Pilates: benefícios, para quem é indicado e como funcionam as aulas.');

const BENEFITS = [
  ['Postura e alinhamento', 'Fortalece a musculatura profunda que sustenta a coluna.'],
  ['Força e flexibilidade', 'Ganho de mobilidade com controle e segurança.'],
  ['Consciência corporal', 'Respiração e concentração integradas ao movimento.'],
  ['Para todas as idades', 'Exercícios adaptados a cada condição e objetivo.'],
];

export default async function Page() {
  const site = await getSite();
  return (
    <>
      <PageIntro eyebrow="O método" title="O que é Pilates" text={site?.website?.pilates_text} />
      <section className="container grid gap-12 py-16 md:grid-cols-2">
        <Prose text={site?.website?.pilates_long_text || 'Criado por Joseph Pilates no início do século XX, o método combina controle, precisão, respiração, centralização, concentração e fluidez. As aulas podem ser realizadas em aparelhos (Reformer, Cadillac, Chair, Barrel) ou no solo, sempre com supervisão de profissional habilitado.\n\nAntes de começar, realizamos uma avaliação para entender seu histórico e objetivos. As orientações do site têm caráter informativo e não substituem avaliação profissional.'} />
        <div className="grid gap-4 sm:grid-cols-2">
          {BENEFITS.map(([t, d]) => (
            <div key={t} className="rounded-2xl border bg-card p-5">
              <h2 className="font-display text-lg">{t}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{d}</p>
            </div>
          ))}
        </div>
      </section>
      <CtaBand site={site} />
    </>
  );
}
