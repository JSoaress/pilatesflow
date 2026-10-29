import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPost, getSite, siteImage } from '@/lib/site';
import { date } from '@/lib/format';
import { env } from '@/lib/env';
import { CtaBand, Prose } from '@/components/site/sections';

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const post = await getPost((await params).slug);
  if (!post) return { title: 'Artigo não encontrado' };
  const img = siteImage(post.cover_path);
  return {
    title: post.seo_title || post.title,
    description: post.seo_description || post.excerpt || undefined,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: { type: 'article', title: post.seo_title || post.title, description: post.seo_description || post.excerpt || undefined, publishedTime: post.published_at, images: img ? [{ url: img }] : undefined },
  };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const [post, site] = await Promise.all([getPost((await params).slug), getSite()]);
  if (!post) notFound();
  const img = siteImage(post.cover_path);
  const ld = { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: post.title, datePublished: post.published_at, dateModified: post.updated_at, image: img ?? undefined, url: `${env.siteUrl}/blog/${post.slug}`, publisher: { '@type': 'Organization', name: site?.organization.name } };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }} />
      <article className="container max-w-3xl py-14">
        <Link href="/blog" className="text-sm text-primary hover:underline">← Blog</Link>
        <p className="mt-6 text-sm text-muted-foreground">{date(post.published_at)}</p>
        <h1 className="mt-2 font-display text-4xl leading-tight">{post.title}</h1>
        {post.excerpt && <p className="mt-4 text-lg text-muted-foreground">{post.excerpt}</p>}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {img && <img src={img} alt="" className="mt-8 w-full rounded-2xl object-cover" />}
        <div className="mt-8"><Prose text={post.content} /></div>
        <p className="mt-10 rounded-xl bg-muted p-4 text-xs text-muted-foreground">Conteúdo informativo. Não substitui avaliação de profissional de saúde.</p>
      </article>
      <CtaBand site={site} />
    </>
  );
}
