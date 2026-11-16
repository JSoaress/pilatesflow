import Link from 'next/link';
import { MessageCircle, Instagram, Phone, Mail, MapPin } from 'lucide-react';
import { getSite, siteImage } from '@/lib/site';
import { whatsappLink } from '@/lib/utils';
import { SiteNav } from '@/components/site/site-nav';
import { Logo } from '@/components/layout/sidebar';

export const revalidate = 300;

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const site = await getSite();
  const o = site?.organization;
  const wa = whatsappLink(o?.whatsapp ?? site?.units?.[0]?.whatsapp, 'Olá! Gostaria de informações sobre as aulas.');
  const logo = siteImage(o?.logo_path);
  const unit = site?.units?.[0];
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-card focus:px-4 focus:py-2">Pular para o conteúdo</a>
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
        <div className="container flex h-16 items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logo ? <img src={logo} alt={o?.name ?? ''} className="h-9 w-auto" /> : <Logo />}
            <span className="font-display text-lg">{o?.name ?? 'Studio de Pilates'}</span>
          </Link>
          <SiteNav cta={site?.website?.cta_label || 'Agende sua aula experimental'} />
        </div>
      </header>
      <main id="conteudo" className="flex-1">{children}</main>
      <footer className="border-t bg-[hsl(158_27%_14%)] text-white/80">
        <div className="container grid gap-8 py-12 md:grid-cols-4">
          <div className="md:col-span-2">
            <p className="font-display text-xl text-white">{o?.name}</p>
            <p className="mt-2 max-w-sm text-sm">{site?.website?.hero_subtitle}</p>
            <div className="mt-4 flex gap-3">
              {o?.instagram && <a href={`https://instagram.com/${o.instagram.replace(/^@/, '')}`} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="rounded-full bg-white/10 p-2 hover:bg-white/20"><Instagram className="h-5 w-5" /></a>}
              {wa && <a href={wa} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="rounded-full bg-white/10 p-2 hover:bg-white/20"><MessageCircle className="h-5 w-5" /></a>}
            </div>
          </div>
          <div className="space-y-2 text-sm">
            <p className="font-medium text-white">Contato</p>
            {(o?.phone || unit?.phone) && <p className="flex items-center gap-2"><Phone className="h-4 w-4" />{unit?.phone ?? o?.phone}</p>}
            {o?.email && <p className="flex items-center gap-2"><Mail className="h-4 w-4" />{o.email}</p>}
            {unit?.street && <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0" />{[unit.street, unit.number, unit.district, unit.city && `${unit.city}/${unit.state}`].filter(Boolean).join(', ')}</p>}
          </div>
          <div className="space-y-2 text-sm">
            <p className="font-medium text-white">Links</p>
            <Link href="/planos" className="block hover:text-white">Planos</Link>
            <Link href="/blog" className="block hover:text-white">Blog</Link>
            <Link href="/privacidade" className="block hover:text-white">Política de Privacidade</Link>
            <Link href="/termos" className="block hover:text-white">Termos de Uso</Link>
            <Link href="/login" className="block hover:text-white">Área do aluno / equipe</Link>
          </div>
        </div>
        <p className="border-t border-white/10 py-4 text-center text-xs text-white/50">© {new Date().getFullYear()} {o?.name}. Todos os direitos reservados.</p>
      </footer>
      {wa && (
        <a href={wa} target="_blank" rel="noopener noreferrer" aria-label="Fale conosco pelo WhatsApp" className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lift transition-transform hover:scale-105">
          <MessageCircle className="h-7 w-7" />
        </a>
      )}
    </div>
  );
}
