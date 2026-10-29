import { getSite } from '@/lib/site';
import { pageMeta } from '@/lib/site-meta';
import { Benefits, CtaBand, PageIntro, Prose, TeamGrid, SectionTitle } from '@/components/site/sections';

export const revalidate = 300;
export const generateMetadata = () => pageMeta('/sobre', 'Sobre');

export default async function Page() {
  const site = await getSite();
  const w = site?.website ?? {};
  return (
    <>
      <PageIntro eyebrow="Sobre" title={w.about_title || 'Sobre a clínica'} text={site?.organization.name} />
      <section className="container grid gap-12 py-16 md:grid-cols-2">
        <Prose text={w.about_long_text || w.about_text} />
        <Benefits />
      </section>
      {site?.team?.length ? <section className="container space-y-8 pb-16"><SectionTitle title="Quem cuida de você" /><TeamGrid team={site.team} /></section> : null}
      <CtaBand site={site} />
    </>
  );
}
