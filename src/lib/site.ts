import 'server-only';
import { cache } from 'react';
import { createClient as createSb } from '@supabase/supabase-js';
import { env } from '@/lib/env';
import { storagePublicUrl } from '@/lib/utils';

export type SiteData = {
  organization: { id: string; slug: string; name: string; app_name: string; phone: string | null; whatsapp: string | null; email: string | null; instagram: string | null; website: string | null; logo_path: string | null; primary_color: string; timezone: string };
  website: Record<string, any>;
  units: { id: string; name: string; phone: string | null; whatsapp: string | null; email: string | null; street: string | null; number: string | null; district: string | null; city: string | null; state: string | null; zip: string | null; latitude: number | null; longitude: number | null; business_hours: Record<string, { start: string; end: string }[]> }[];
  services: { id: string; name: string; kind: string; description: string | null; duration: number; allow_online_booking: boolean }[];
  team: { id: string; name: string; kind: string; registry: string | null; specialties: string[]; bio: string | null; photo_path: string | null }[];
  plans: { id: string; name: string; description: string | null; price: number; cycle_months: number | null; weekly_frequency: number | null; total_sessions: number | null; billing_type: string; installments_count: number }[];
  testimonials: { id: string; author: string; role: string | null; content: string; rating: number | null }[];
  faqs: { question: string; answer: string }[];
  gallery: { path: string; caption: string | null; section: string }[];
  legal: Record<string, { title: string; content: string; version: number; published_at: string }>;
};

/** Cliente anônimo (somente funções públicas). Sem cookies → páginas podem ser estáticas/ISR. */
function anon() {
  return createSb(env.supabaseUrl, env.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export const getSite = cache(async (): Promise<SiteData | null> => {
  if (!env.supabaseUrl) return null;
  const { data } = await anon().rpc('public_site', { p_slug: env.defaultOrgSlug });
  return (data as SiteData) ?? null;
});

export async function getPosts(limit = 12, offset = 0) {
  const { data } = await anon().rpc('public_blog_posts', { p_slug: env.defaultOrgSlug, p_limit: limit, p_offset: offset });
  return (data ?? []) as { slug: string; title: string; excerpt: string | null; cover_path: string | null; published_at: string }[];
}

export async function getPost(slug: string) {
  const { data } = await anon().rpc('public_blog_post', { p_slug: env.defaultOrgSlug, p_post_slug: slug });
  return data as { slug: string; title: string; excerpt: string | null; content: string; cover_path: string | null; published_at: string; updated_at: string; seo_title: string | null; seo_description: string | null } | null;
}

export async function getBookingOptions() {
  const { data } = await anon().rpc('public_booking_options', { p_slug: env.defaultOrgSlug });
  return data as { units: { id: string; name: string }[]; services: { id: string; name: string; kind: string; duration: number; description: string | null }[]; staff: { id: string; name: string; unit_id: string | null }[]; privacy_policy_version: number | null } | null;
}

export const siteImage = (path: string | null | undefined) => storagePublicUrl(env.supabaseUrl, 'site', path);
