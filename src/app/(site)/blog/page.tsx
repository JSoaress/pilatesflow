import Link from 'next/link';
import { getPosts, siteImage } from '@/lib/site';
import { pageMeta } from '@/lib/site-meta';
import { date } from '@/lib/format';
import { PageIntro } from '@/components/site/sections';

export const revalidate = 300;
export const generateMetadata = () => pageMeta('/blog', 'Blog');

export default async function Page({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const page = Math.max(1, Number((await searchParams).p) || 1);
  const posts = await getPosts(13, (page - 1) * 12);
  const hasNext = posts.length > 12;
  return (
    <>
      <PageIntro eyebrow="Blog" title="Conteúdos sobre movimento e saúde" />
      <section className="container py-16">
        {posts.length === 0 ? <p className="text-muted-foreground">Nenhum artigo publicado ainda.</p> : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.slice(0, 12).map((p) => (
              <Link key={p.slug} href={`/blog/${p.slug}`} className="group overflow-hidden rounded-2xl border bg-card shadow-sm transition-shadow hover:shadow-lift">
                {p.cover_path ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={siteImage(p.cover_path) ?? ''} alt="" loading="lazy" className="aspect-[16/9] w-full object-cover" />
                ) : <div aria-hidden className="aspect-[16/9] bg-primary-soft" />}
                <div className="p-5">
                  <p className="text-xs text-muted-foreground">{date(p.published_at)}</p>
                  <h2 className="mt-1 font-display text-xl group-hover:text-primary">{p.title}</h2>
                  {p.excerpt && <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{p.excerpt}</p>}
                </div>
              </Link>
            ))}
          </div>
        )}
        <nav className="mt-10 flex justify-between" aria-label="Paginação">
          {page > 1 ? <Link className="text-primary hover:underline" href={`/blog?p=${page - 1}`}>← Mais recentes</Link> : <span />}
          {hasNext && <Link className="text-primary hover:underline" href={`/blog?p=${page + 1}`}>Mais antigos →</Link>}
        </nav>
      </section>
    </>
  );
}
