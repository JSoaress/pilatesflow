import Link from 'next/link';
import { MessageCircle } from 'lucide-react';
import { getSite, siteImage } from '@/lib/site';
import { pageMeta } from '@/lib/site-meta';
import { env } from '@/lib/env';
import { whatsappLink } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Benefits, CtaBand, FaqList, PlansGrid, SectionTitle, ServicesGrid, TeamGrid, Testimonials, Gallery } from '@/components/site/sections';

export const revalidate = 300;
export const generateMetadata = () => pageMeta('/', 'Início');

export default async function Home() {
  const site = await getSite();
  if (!site) {
    return (
      <div className="container py-24 text-center">
        <h1 className="font-display text-3xl">Site em configuração</h1>
        <p className="mt-2 text-muted-foreground">Configure o Supabase e a organização padrão (NEXT_PUBLIC_DEFAULT_ORG_SLUG) para publicar o site.</p>
        <Link href="/entrar" className="mt-6 inline-block"><Button>Acessar o sistema</Button></Link>
      </div>
    );
  }
  const w = site.website;
  const hero = siteImage(w.hero_image_path) ?? siteImage(site.gallery.find((g) => g.section === 'hero')?.path);
  const wa = whatsappLink(site.organization.whatsapp ?? site.units[0]?.whatsapp, 'Olá! Gostaria de saber mais sobre as aulas.');
  const unit = site.units[0];
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': ['HealthAndBeautyBusiness', 'MedicalBusiness'],
    name: site.organization.name,
    url: env.siteUrl,
    telephone: unit?.phone ?? site.organization.phone ?? undefined,
    email: site.organization.email ?? undefined,
    image: siteImage(site.organization.logo_path) ?? undefined,
    address: unit?.street ? { '@type': 'PostalAddress', streetAddress: [unit.street, unit.number].filter(Boolean).join(', '), addressLocality: unit.city, addressRegion: unit.state, postalCode: unit.zip, addressCountry: 'BR' } : undefined,
    geo: unit?.latitude ? { '@type': 'GeoCoordinates', latitude: unit.latitude, longitude: unit.longitude } : undefined,
    sameAs: site.organization.instagram ? [`https://instagram.com/${site.organization.instagram.replace(/^@/, '')}`] : undefined,
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <section className="relative overflow-hidden">
        <div className="container grid items-center gap-10 py-16 md:grid-cols-2 md:py-24">
          <div>
            <p className="text-sm font-medium uppercase tracking-wider text-primary">{site.organization.name}</p>
            <h1 className="mt-3 font-display text-4xl leading-[1.1] md:text-6xl">{w.hero_title}</h1>
            <p className="mt-5 max-w-xl text-lg text-muted-foreground">{w.hero_subtitle}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/agendar"><Button size="lg">{w.cta_label || 'Agende sua aula experimental'}</Button></Link>
              {wa && <a href={wa} target="_blank" rel="noopener noreferrer"><Button size="lg" variant="outline"><MessageCircle />Falar no WhatsApp</Button></a>}
            </div>
          </div>
          <div className="relative">
            {hero ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={hero} alt="Ambiente do studio" className="aspect-[4/5] w-full rounded-[2rem] object-cover shadow-lift" />
            ) : (
              <div aria-hidden className="aspect-[4/5] w-full rounded-[2rem] bg-[radial-gradient(circle_at_30%_20%,hsl(var(--primary)/0.35),transparent_55%),radial-gradient(circle_at_80%_80%,hsl(30_60%_70%/0.45),transparent_50%)] bg-primary-soft" />
            )}
          </div>
        </div>
      </section>

      <section className="container py-16">
        <div className="grid gap-10 md:grid-cols-2">
          <SectionTitle title={w.about_title || 'Sobre nós'} text={w.about_text} />
          <Benefits />
        </div>
      </section>

      <section className="bg-muted/40 py-16">
        <div className="container space-y-8">
          <SectionTitle title="Modalidades" text="Atendimentos pensados para cada objetivo e momento." />
          <ServicesGrid services={site.services.slice(0, 6)} />
        </div>
      </section>

      {site.plans.length > 0 && (
        <section className="container space-y-8 py-16">
          <SectionTitle title="Planos" text="Escolha a frequência ideal para sua rotina." />
          <PlansGrid plans={site.plans} showPrices={w.show_prices !== false} />
        </section>
      )}

      {site.team.length > 0 && (
        <section className="bg-muted/40 py-16">
          <div className="container space-y-8">
            <SectionTitle title="Nossa equipe" />
            <TeamGrid team={site.team.slice(0, 6)} />
          </div>
        </section>
      )}

      {site.gallery.filter((g) => g.section !== 'hero').length > 0 && (
        <section className="container space-y-8 py-16">
          <SectionTitle title="Nossa estrutura" text={w.structure_text} />
          <Gallery items={site.gallery.filter((g) => g.section !== 'hero').slice(0, 6)} />
        </section>
      )}

      {site.testimonials.length > 0 && (
        <section className="container space-y-8 py-16">
          <SectionTitle title="O que dizem nossos alunos" />
          <Testimonials items={site.testimonials.slice(0, 6)} />
        </section>
      )}

      {site.faqs.length > 0 && (
        <section className="container grid gap-8 py-16 md:grid-cols-[1fr_2fr]">
          <SectionTitle title="Perguntas frequentes" />
          <FaqList faqs={site.faqs.slice(0, 6)} />
        </section>
      )}
      <CtaBand site={site} />
    </>
  );
}
