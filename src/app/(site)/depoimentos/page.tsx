import { getSite } from '@/lib/site';
import { pageMeta } from '@/lib/site-meta';
import { CtaBand, PageIntro, Testimonials } from '@/components/site/sections';

export const revalidate = 300;
export const generateMetadata = () => pageMeta('/depoimentos', 'Depoimentos');

export default async function Page() {
  const site = await getSite();
  return (
    <>
      <PageIntro eyebrow="Depoimentos" title="Histórias de quem pratica com a gente" />
      <section className="container py-16"><Testimonials items={site?.testimonials ?? []} /></section>
      <CtaBand site={site} />
    </>
  );
}
