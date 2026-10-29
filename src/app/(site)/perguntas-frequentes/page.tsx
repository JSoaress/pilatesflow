import { getSite } from '@/lib/site';
import { pageMeta } from '@/lib/site-meta';
import { CtaBand, FaqList, PageIntro } from '@/components/site/sections';

export const revalidate = 300;
export const generateMetadata = () => pageMeta('/perguntas-frequentes', 'Perguntas frequentes');

export default async function Page() {
  const site = await getSite();
  const faqs = site?.faqs ?? [];
  const ld = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })) };
  return (
    <>
      {faqs.length > 0 && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }} />}
      <PageIntro eyebrow="Dúvidas" title="Perguntas frequentes" />
      <section className="container max-w-3xl py-16"><FaqList faqs={faqs} /></section>
      <CtaBand site={site} />
    </>
  );
}
