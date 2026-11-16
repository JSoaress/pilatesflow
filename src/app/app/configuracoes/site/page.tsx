import { requirePermission } from '@/lib/auth/context';
import { PageHeader, Section } from '@/components/ui/misc';
import { TabLinks } from '@/components/ui/tab-links';
import { ResourceSection } from '@/components/resource/resource-page';
import { SettingsForm } from '@/components/app/settings-form';
import { GalleryManager } from '@/components/app/settings/gallery-manager';
import { env } from '@/lib/env';
import { storagePublicUrl } from '@/lib/utils';

export const metadata = { title: 'Site público' };

export default async function SitePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requirePermission('website.view');
  const sp = await searchParams;
  const tabs = [{ id: 'textos', label: 'Textos e SEO' }, { id: 'fotos', label: 'Fotos' }, { id: 'faq', label: 'Perguntas frequentes' }, { id: 'blog', label: 'Blog' }, { id: 'depoimentos', label: 'Depoimentos' }];
  const tab = tabs.some((t) => t.id === sp.aba) ? sp.aba : 'textos';
  let body: React.ReactNode = null;
  if (tab === 'textos') {
    const { data } = await ctx.supabase.from('system_settings').select('value').eq('organization_id', ctx.org.id).eq('key', 'website').maybeSingle();
    body = (
      <Section title="Textos do site" description="A equipe e as modalidades exibidas vêm dos cadastros (marque “Exibir no site”).">
        <SettingsForm settingKey="website" initial={(data?.value as any) ?? {}} fields={[
          { name: 'hero_title', label: 'Título principal', type: 'text', full: true },
          { name: 'hero_subtitle', label: 'Subtítulo', type: 'textarea' },
          { name: 'cta_label', label: 'Texto do botão de agendamento', type: 'text' },
          { name: 'about_title', label: 'Título "Sobre"', type: 'text' },
          { name: 'about_text', label: 'Resumo "Sobre" (página inicial)', type: 'textarea' },
          { name: 'about_long_text', label: 'Texto completo da página Sobre', type: 'textarea' },
          { name: 'pilates_text', label: 'Resumo do método (página Pilates)', type: 'textarea' },
          { name: 'pilates_long_text', label: 'Texto completo da página Pilates', type: 'textarea' },
          { name: 'structure_text', label: 'Texto da página Estrutura', type: 'textarea' },
          { name: 'seo_title', label: 'Título para o Google (até 70 caracteres)', type: 'text' },
          { name: 'seo_description', label: 'Descrição para o Google (até 170 caracteres)', type: 'text' },
          { name: 'google_maps_embed_url', label: 'Link "Incorporar mapa" do Google Maps', type: 'text', full: true },
          { name: 'show_prices', label: 'Mostrar preços dos planos no site', type: 'bool' },
        ]} />
      </Section>
    );
  }
  if (tab === 'fotos') {
    const { data } = await ctx.supabase.from('site_gallery').select('id, image_path, caption, section').eq('organization_id', ctx.org.id).order('sort_order');
    body = <Section title="Fotos do site"><GalleryManager canEdit={ctx.can('website.edit')} items={((data ?? []) as any[]).map((g) => ({ id: g.id, url: storagePublicUrl(env.supabaseUrl, 'site', g.image_path) ?? '', caption: g.caption, section: g.section }))} /></Section>;
  }
  if (tab === 'faq') body = <ResourceSection resource="site_faqs" searchParams={sp} />;
  if (tab === 'blog') body = <ResourceSection resource="site_posts" searchParams={sp} />;
  if (tab === 'depoimentos') body = <ResourceSection resource="site_testimonials" searchParams={sp} />;
  return (
    <>
      <PageHeader title="Site público" description={<>Conteúdo exibido em <a href="/" target="_blank" className="text-primary hover:underline">seu site</a>. As alterações aparecem em até 5 minutos.</>} />
      <TabLinks base="/app/configuracoes/site" active={tab} tabs={tabs} />
      {body}
    </>
  );
}
