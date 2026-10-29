import { NextResponse } from 'next/server';
import { getAppContext } from '@/lib/auth/context';

/** Exportação dos dados do titular (LGPD — acesso/portabilidade). Registrada na auditoria pelo banco. */
export async function GET(_req: Request, { params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params;
  const ctx = await getAppContext();
  if (!ctx.can('lgpd.manage')) return new NextResponse('Você não tem permissão.', { status: 403 });
  const { data, error } = await ctx.supabase.rpc('export_patient_data', { p_patient_id: patientId });
  if (error) return new NextResponse('Não foi possível exportar.', { status: 400 });
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="dados-titular-${patientId.slice(0, 8)}.json"`, 'Cache-Control': 'private, no-store' },
  });
}
