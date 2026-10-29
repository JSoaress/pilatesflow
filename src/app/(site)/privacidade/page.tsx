import { getSite } from '@/lib/site';
import { pageMeta } from '@/lib/site-meta';
import { date } from '@/lib/format';
import { PageIntro, Prose } from '@/components/site/sections';

export const revalidate = 300;
export const generateMetadata = () => pageMeta('/privacidade', 'Política de Privacidade');

export default async function Page() {
  const site = await getSite();
  const doc = site?.legal?.['privacy_policy'];
  return (
    <>
      <PageIntro title={doc?.title ?? 'Política de Privacidade'} text={doc ? `Versão ${doc.version} · publicada em ${date(doc.published_at)}` : null} />
      <section className="container max-w-3xl py-14">
        {doc ? <Prose text={doc.content} /> : <p className="text-muted-foreground">Documento ainda não publicado pela clínica. Para dúvidas sobre seus dados, use a página de contato.</p>}
      </section>
    </>
  );
}
