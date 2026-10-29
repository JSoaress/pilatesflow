import { getSite } from '@/lib/site';
import { pageMeta } from '@/lib/site-meta';
import { CtaBand, PageIntro, PlansGrid } from '@/components/site/sections';

export const revalidate = 300;
export const generateMetadata = () => pageMeta('/planos', 'Planos e valores');

export default async function Page() {
  const site = await getSite();
  return (
    <>
      <PageIntro eyebrow="Planos" title="Planos e valores" text="Comece com uma aula experimental e escolha o plano depois de conhecer o studio." />
      <section className="container py-16"><PlansGrid plans={site?.plans ?? []} showPrices={site?.website?.show_prices !== false} /></section>
      <CtaBand site={site} />
    </>
  );
}
