import { getSite } from '@/lib/site';
import { pageMeta } from '@/lib/site-meta';
import { CtaBand, PageIntro, TeamGrid } from '@/components/site/sections';

export const revalidate = 300;
export const generateMetadata = () => pageMeta('/equipe', 'Equipe');

export default async function Page() {
  const site = await getSite();
  return (
    <>
      <PageIntro eyebrow="Equipe" title="Profissionais que cuidam de você" />
      <section className="container py-16"><TeamGrid team={site?.team ?? []} /></section>
      <CtaBand site={site} />
    </>
  );
}
