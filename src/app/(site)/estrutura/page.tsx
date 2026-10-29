import { getSite } from '@/lib/site';
import { pageMeta } from '@/lib/site-meta';
import { CtaBand, Gallery, PageIntro } from '@/components/site/sections';

export const revalidate = 300;
export const generateMetadata = () => pageMeta('/estrutura', 'Estrutura');

export default async function Page() {
  const site = await getSite();
  const items = (site?.gallery ?? []).filter((g) => g.section !== 'hero');
  return (
    <>
      <PageIntro eyebrow="Estrutura" title="Conheça nosso espaço" text={site?.website?.structure_text} />
      <section className="container py-16">
        {items.length ? <Gallery items={items} /> : <p className="text-muted-foreground">As fotos do espaço serão publicadas em breve.</p>}
      </section>
      <CtaBand site={site} />
    </>
  );
}
