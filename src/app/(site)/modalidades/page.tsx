import { getSite } from '@/lib/site';
import { pageMeta } from '@/lib/site-meta';
import { CtaBand, PageIntro, ServicesGrid } from '@/components/site/sections';

export const revalidate = 300;
export const generateMetadata = () => pageMeta('/modalidades', 'Modalidades');

export default async function Page() {
  const site = await getSite();
  return (
    <>
      <PageIntro eyebrow="Modalidades" title="Encontre o atendimento ideal" text="Pilates em aparelhos, solo, individual, em grupo e fisioterapia." />
      <section className="container py-16"><ServicesGrid services={site?.services ?? []} /></section>
      <CtaBand site={site} />
    </>
  );
}
