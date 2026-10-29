import { getSite } from '@/lib/site';
import { pageMeta } from '@/lib/site-meta';
import { env } from '@/lib/env';
import { ContactInfo, PageIntro } from '@/components/site/sections';
import { LeadForm } from '@/components/site/lead-form';

export const revalidate = 300;
export const generateMetadata = () => pageMeta('/contato', 'Contato');

export default async function Page() {
  const site = await getSite();
  const map = site?.website?.google_maps_embed_url as string | undefined;
  const safeMap = map && /^https:\/\/(www\.)?google\.com\/maps\/embed/.test(map) ? map : null;
  return (
    <>
      <PageIntro eyebrow="Contato" title="Fale com a gente" text="Responderemos o mais breve possível em horário comercial." />
      <section className="container grid gap-10 py-16 md:grid-cols-2">
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <h2 className="font-display text-2xl">Envie uma mensagem</h2>
          <LeadForm slug={env.defaultOrgSlug} services={(site?.services ?? []).map((s) => s.name)} />
        </div>
        <div className="space-y-6">
          <ContactInfo site={site} />
          {safeMap && <iframe src={safeMap} title="Mapa de localização" loading="lazy" className="h-72 w-full rounded-2xl border" referrerPolicy="no-referrer-when-downgrade" />}
        </div>
      </section>
    </>
  );
}
