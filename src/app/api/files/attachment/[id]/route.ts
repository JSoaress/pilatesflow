import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';

/** Abre um anexo privado por URL temporária (5 min). O download é registrado na auditoria. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.redirect(new URL('/login', env.siteUrl));
  const { data: a } = await supabase.from('attachments').select('id, organization_id, bucket, storage_path, is_clinical, title').eq('id', id).is('deleted_at', null).maybeSingle();
  if (!a) return new NextResponse('Arquivo não encontrado ou acesso negado.', { status: 404 });
  const { data: signed, error } = await supabase.storage.from(a.bucket).createSignedUrl(a.storage_path, 300);
  if (error || !signed) return new NextResponse('Acesso ao arquivo negado.', { status: 403 });
  await supabase.rpc('log_audit_event', { p_org: a.organization_id, p_action: 'download', p_entity: 'attachments', p_entity_id: a.id, p_context: { clinical: a.is_clinical, title: a.title } });
  return NextResponse.redirect(signed.signedUrl);
}
