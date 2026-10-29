import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const started = Date.now();
  const supabase = await createClient();
  const { error } = await supabase.rpc('public_blog_posts', { p_slug: '__health__', p_limit: 1, p_offset: 0 });
  return NextResponse.json({ status: error ? 'degraded' : 'ok', db_ms: Date.now() - started, time: new Date().toISOString() }, { status: error ? 503 : 200 });
}
