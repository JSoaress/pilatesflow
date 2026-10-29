import Link from 'next/link';
import { Star, Clock, Users, CheckCircle2, MapPin, Phone, Mail, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/misc';
import { money } from '@/lib/format';
import { whatsappLink } from '@/lib/utils';
import { siteImage, type SiteData } from '@/lib/site';
import { WEEKDAYS } from '@/lib/format';

export function PageIntro({ eyebrow, title, text }: { eyebrow?: string; title: string; text?: string | null }) {
  return (
    <section className="border-b bg-primary-soft/40">
      <div className="container py-14 md:py-20">
        {eyebrow && <p className="text-sm font-medium uppercase tracking-wider text-primary">{eyebrow}</p>}
        <h1 className="mt-2 max-w-3xl font-display text-4xl leading-tight md:text-5xl">{title}</h1>
        {text && <p className="mt-4 max-w-2xl text-lg text-muted-foreground">{text}</p>}
      </div>
    </section>
  );
}

export function SectionTitle({ title, text, center }: { title: string; text?: string; center?: boolean }) {
  return (
    <div className={center ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}>
      <h2 className="font-display text-3xl md:text-4xl">{title}</h2>
      {text && <p className="mt-3 text-muted-foreground">{text}</p>}
    </div>
  );
}

const KIND_LABEL: Record<string, string> = { pilates_apparatus: 'Pilates em aparelhos', pilates_mat: 'Pilates solo', pilates_individual: 'Pilates individual', pilates_duo: 'Pilates em dupla', pilates_group: 'Pilates em grupo', assessment: 'Avaliação', reassessment: 'Reavaliação', physiotherapy: 'Fisioterapia', trial: 'Aula experimental', other: 'Atendimento' };

export function ServicesGrid({ services }: { services: SiteData['services'] }) {
  if (!services.length) return <p className="text-muted-foreground">As modalidades serão publicadas em breve.</p>;
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {services.map((s) => (
        <article key={s.id} className="flex flex-col rounded-2xl border bg-card p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-primary">{KIND_LABEL[s.kind] ?? s.kind}</p>
          <h3 className="mt-1 font-display text-xl">{s.name}</h3>
          {s.description && <p className="mt-2 flex-1 text-sm text-muted-foreground">{s.description}</p>}
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground"><Clock className="h-4 w-4" />{s.duration} min</span>
            {s.allow_online_booking && <Link href={`/agendar?servico=${s.id}`} className="font-medium text-primary hover:underline">Agendar →</Link>}
          </div>
        </article>
      ))}
    </div>
  );
}

const STAFF_KIND: Record<string, string> = { physiotherapist: 'Fisioterapeuta', pe_professional: 'Profissional de Educação Física', instructor: 'Instrutor(a) de Pilates', receptionist: 'Recepção', admin: 'Administração', finance: 'Financeiro', other: 'Equipe' };

export function TeamGrid({ team }: { team: SiteData['team'] }) {
  if (!team.length) return <p className="text-muted-foreground">Em breve apresentaremos nossa equipe.</p>;
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {team.map((t) => {
        const photo = siteImage(t.photo_path);
        return (
          <article key={t.id} className="rounded-2xl border bg-card p-6 text-center shadow-sm">
            <Avatar name={t.name} src={photo} size={112} className="mx-auto" />
            <h3 className="mt-4 font-display text-xl">{t.name}</h3>
            <p className="text-sm text-primary">{STAFF_KIND[t.kind] ?? 'Equipe'}{t.registry ? ` · ${t.registry}` : ''}</p>
            {t.specialties?.length > 0 && <p className="mt-2 text-xs text-muted-foreground">{t.specialties.join(' · ')}</p>}
            {t.bio && <p className="mt-3 text-sm text-muted-foreground">{t.bio}</p>}
          </article>
        );
      })}
    </div>
  );
}

function cycleLabel(p: SiteData['plans'][number]) {
  if (p.total_sessions && !p.weekly_frequency) return `pacote de ${p.total_sessions} sessões`;
  if (p.billing_type === 'monthly' || !p.cycle_months || p.cycle_months === 1) return 'por mês';
  return `${p.cycle_months} meses${p.billing_type === 'installments' ? ' (parcelado)' : ''}`;
}

export function PlansGrid({ plans, showPrices }: { plans: SiteData['plans']; showPrices: boolean }) {
  if (!plans.length) return <p className="text-muted-foreground">Consulte nossos planos pelo WhatsApp.</p>;
  return (
    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
      {plans.map((p, i) => (
        <article key={p.id} className={`flex flex-col rounded-2xl border bg-card p-6 shadow-sm ${i === 1 ? 'ring-2 ring-primary' : ''}`}>
          <h3 className="font-display text-xl">{p.name}</h3>
          {p.weekly_frequency && <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><Users className="h-4 w-4" />{p.weekly_frequency}x por semana</p>}
          {showPrices ? (
            <p className="mt-4"><span className="font-display text-3xl">{money(p.price)}</span> <span className="text-sm text-muted-foreground">{cycleLabel(p)}</span></p>
          ) : <p className="mt-4 text-sm text-muted-foreground">Consulte valores</p>}
          {p.installments_count > 1 && <p className="text-xs text-muted-foreground">em até {p.installments_count}x</p>}
          {p.description && <p className="mt-3 flex-1 text-sm text-muted-foreground">{p.description}</p>}
          <Link href="/agendar" className="mt-5"><Button variant={i === 1 ? 'default' : 'outline'} className="w-full">Começar com aula experimental</Button></Link>
        </article>
      ))}
    </div>
  );
}

export function Testimonials({ items }: { items: SiteData['testimonials'] }) {
  if (!items.length) return <p className="text-muted-foreground">Depoimentos em breve.</p>;
  return (
    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
      {items.map((t) => (
        <figure key={t.id} className="rounded-2xl border bg-card p-6 shadow-sm">
          {t.rating ? <div className="flex gap-0.5 text-amber-500" aria-label={`${t.rating} de 5 estrelas`}>{Array.from({ length: t.rating }).map((_, i) => <Star key={i} className="h-4 w-4 fill-current" />)}</div> : null}
          <blockquote className="mt-3 text-sm leading-relaxed">“{t.content}”</blockquote>
          <figcaption className="mt-4 text-sm font-medium">{t.author}{t.role && <span className="font-normal text-muted-foreground"> · {t.role}</span>}</figcaption>
        </figure>
      ))}
    </div>
  );
}

export function FaqList({ faqs }: { faqs: SiteData['faqs'] }) {
  if (!faqs.length) return <p className="text-muted-foreground">Envie sua dúvida pelo formulário de contato.</p>;
  return (
    <div className="divide-y rounded-2xl border bg-card">
      {faqs.map((f, i) => (
        <details key={i} className="group p-5 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer items-center justify-between gap-4 font-medium">{f.question}<span className="text-primary transition-transform group-open:rotate-45" aria-hidden>+</span></summary>
          <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">{f.answer}</p>
        </details>
      ))}
    </div>
  );
}

export function Gallery({ items }: { items: SiteData['gallery'] }) {
  if (!items.length) return null;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      {items.map((g, i) => (
        <figure key={i} className="overflow-hidden rounded-2xl border bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={siteImage(g.path) ?? ''} alt={g.caption ?? 'Foto do studio'} loading="lazy" className="aspect-[4/3] w-full object-cover" />
          {g.caption && <figcaption className="p-2 text-xs text-muted-foreground">{g.caption}</figcaption>}
        </figure>
      ))}
    </div>
  );
}

export function Benefits() {
  const items = ['Turmas reduzidas e atenção individual', 'Profissionais habilitados (Crefito)', 'Avaliação inicial e acompanhamento da evolução', 'Agenda flexível com reposição de aulas'];
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {items.map((t) => <li key={t} className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />{t}</li>)}
    </ul>
  );
}

export function CtaBand({ site }: { site: SiteData | null }) {
  const wa = whatsappLink(site?.organization.whatsapp ?? site?.units?.[0]?.whatsapp, 'Olá! Quero agendar uma aula experimental.');
  return (
    <section className="bg-[hsl(158_27%_18%)] text-white">
      <div className="container flex flex-col items-start justify-between gap-6 py-14 md:flex-row md:items-center">
        <div>
          <h2 className="font-display text-3xl">Experimente uma aula</h2>
          <p className="mt-2 text-white/75">Escolha o melhor horário e conheça o studio sem compromisso.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/agendar"><Button size="lg" className="bg-white text-[hsl(158_27%_18%)] hover:bg-white/90">{site?.website?.cta_label || 'Agendar agora'}</Button></Link>
          {wa && <a href={wa} target="_blank" rel="noopener noreferrer"><Button size="lg" variant="outline" className="border-white/40 bg-transparent text-white hover:bg-white/10"><MessageCircle />WhatsApp</Button></a>}
        </div>
      </div>
    </section>
  );
}

export function ContactInfo({ site }: { site: SiteData | null }) {
  const o = site?.organization;
  return (
    <div className="space-y-6">
      {(site?.units ?? []).map((u) => (
        <div key={u.id} className="rounded-2xl border bg-card p-6">
          <h3 className="font-display text-xl">{u.name}</h3>
          <div className="mt-3 space-y-2 text-sm">
            {u.street && <p className="flex gap-2"><MapPin className="h-4 w-4 shrink-0 text-primary" />{[u.street, u.number, u.district, u.city && `${u.city}/${u.state}`, u.zip].filter(Boolean).join(', ')}</p>}
            {(u.phone || o?.phone) && <p className="flex gap-2"><Phone className="h-4 w-4 text-primary" />{u.phone ?? o?.phone}</p>}
            {(u.email || o?.email) && <p className="flex gap-2"><Mail className="h-4 w-4 text-primary" />{u.email ?? o?.email}</p>}
          </div>
          <BusinessHours hours={u.business_hours} />
        </div>
      ))}
    </div>
  );
}

export function BusinessHours({ hours }: { hours: Record<string, { start: string; end: string }[]> | null | undefined }) {
  if (!hours || !Object.keys(hours).length) return null;
  return (
    <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      {[1, 2, 3, 4, 5, 6, 0].map((d) => {
        const r = hours[String(d)] ?? [];
        return (
          <div key={d} className="contents">
            <dt className="text-muted-foreground">{WEEKDAYS[d]}</dt>
            <dd>{r.length ? r.map((x) => `${x.start}–${x.end}`).join(', ') : 'Fechado'}</dd>
          </div>
        );
      })}
    </dl>
  );
}

/** Conteúdo em texto simples com parágrafos (sem HTML arbitrário → sem XSS). */
export function Prose({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  return (
    <div className="space-y-4 leading-relaxed text-foreground/90">
      {text.split(/\n{2,}/).map((p, i) => {
        if (p.startsWith('## ')) return <h2 key={i} className="pt-4 font-display text-2xl">{p.slice(3)}</h2>;
        if (p.startsWith('# ')) return <h2 key={i} className="pt-4 font-display text-3xl">{p.slice(2)}</h2>;
        if (/^[-*] /m.test(p)) return <ul key={i} className="list-disc space-y-1 pl-5">{p.split('\n').map((l, j) => <li key={j}>{l.replace(/^[-*]\s*/, '')}</li>)}</ul>;
        return <p key={i} className="whitespace-pre-line">{p}</p>;
      })}
    </div>
  );
}
