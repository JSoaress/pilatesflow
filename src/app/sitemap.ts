import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';
import { getPosts } from '@/lib/site';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = ['', '/sobre', '/pilates', '/modalidades', '/equipe', '/planos', '/estrutura', '/depoimentos', '/perguntas-frequentes', '/blog', '/contato', '/agendar', '/privacidade', '/termos'];
  const now = new Date();
  const base: MetadataRoute.Sitemap = pages.map((p) => ({ url: `${env.siteUrl}${p}`, lastModified: now, changeFrequency: p === '' || p === '/blog' ? 'weekly' : 'monthly', priority: p === '' ? 1 : p === '/agendar' ? 0.9 : 0.7 }));
  let posts: Awaited<ReturnType<typeof getPosts>> = [];
  try { posts = env.supabaseUrl ? await getPosts(200) : []; } catch { posts = []; }
  return [...base, ...posts.map((p) => ({ url: `${env.siteUrl}/blog/${p.slug}`, lastModified: new Date(p.published_at), changeFrequency: 'monthly' as const, priority: 0.6 }))];
}
