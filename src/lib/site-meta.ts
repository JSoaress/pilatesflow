import type { Metadata } from 'next';
import { getSite, siteImage } from '@/lib/site';
import { env } from '@/lib/env';

/** Metadados SEO por página, usando os textos configurados no painel (Configurações › Site). */
export async function pageMeta(path: string, title: string, description?: string): Promise<Metadata> {
  const site = await getSite();
  const name = site?.organization.name ?? env.appName;
  const desc = description || site?.website?.seo_description || site?.website?.hero_subtitle || `${name} — Pilates e fisioterapia.`;
  const fullTitle = path === '/' ? (site?.website?.seo_title || `${name} | Pilates`) : `${title} | ${name}`;
  const img = siteImage(site?.website?.og_image_path) ?? siteImage(site?.organization.logo_path);
  return {
    title: { absolute: fullTitle },
    description: desc,
    alternates: { canonical: path },
    openGraph: { title: fullTitle, description: desc, url: path, siteName: name, locale: 'pt_BR', type: 'website', images: img ? [{ url: img }] : undefined },
    twitter: { card: img ? 'summary_large_image' : 'summary', title: fullTitle, description: desc },
  };
}
