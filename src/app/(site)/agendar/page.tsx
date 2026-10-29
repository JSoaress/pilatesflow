import { getBookingOptions, getSite } from '@/lib/site';
import { pageMeta } from '@/lib/site-meta';
import { env } from '@/lib/env';
import { whatsappLink } from '@/lib/utils';
import { PageIntro } from '@/components/site/sections';
import { TrialBooking } from '@/components/site/trial-booking';

export const dynamic = 'force-dynamic';
export const generateMetadata = () => pageMeta('/agendar', 'Agende sua aula experimental', 'Escolha a modalidade, o dia e o horário e agende sua aula experimental online.');

export default async function Page({ searchParams }: { searchParams: Promise<{ servico?: string }> }) {
  const [opts, site, sp] = await Promise.all([getBookingOptions(), getSite(), searchParams]);
  const wa = whatsappLink(site?.organization.whatsapp ?? site?.units?.[0]?.whatsapp, 'Olá! Quero agendar uma aula experimental.');
  return (
    <>
      <PageIntro eyebrow="Agendamento online" title="Agende sua aula experimental" text="Em poucos passos: escolha a modalidade, o dia e o horário." />
      <section className="container max-w-4xl py-12">
        {!opts || !opts.services.length || !opts.units.length ? (
          <div className="rounded-2xl border bg-card p-8 text-center">
            <p className="font-medium">O agendamento online não está disponível no momento.</p>
            <p className="mt-1 text-sm text-muted-foreground">Fale com a gente {wa ? <a className="text-primary underline" href={wa} target="_blank" rel="noopener noreferrer">pelo WhatsApp</a> : 'pela página de contato'}.</p>
          </div>
        ) : (
          <TrialBooking slug={env.defaultOrgSlug} options={opts} initialService={sp.servico} timezone={site?.organization.timezone ?? 'America/Sao_Paulo'} whatsapp={wa} />
        )}
      </section>
    </>
  );
}
