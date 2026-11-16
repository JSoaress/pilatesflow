import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.redirect(new URL('/login', req.url));
  const { data: p } = await supabase.from('accounts_payable').select('receipt_path').eq('id', id).maybeSingle();
  if (!p?.receipt_path) return new NextResponse('Comprovante não encontrado.', { status: 404 });
  const { data: signed } = await supabase.storage.from('documents').createSignedUrl(p.receipt_path, 300);
  if (!signed) return new NextResponse('Acesso negado.', { status: 403 });
  return NextResponse.redirect(signed.signedUrl);
}
