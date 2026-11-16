import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { SimplePdf, pdfResponse } from '@/lib/pdf/simple';
import { valorPorExtenso } from '@/lib/extenso';
import { money, dateTime } from '@/lib/format';
import { paymentMethod } from '@/lib/labels';

/** Recibo de pagamento em PDF (equipe com acesso financeiro ou o próprio aluno). */
export async function GET(_req: Request, { params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.redirect(new URL('/login', _req.url));
  const { data, error } = await supabase.rpc('receipt_data', { p_payment_id: paymentId });
  if (error || !data) return new NextResponse('Recibo não encontrado ou acesso negado.', { status: 404 });
  const r = data as any;
  const pdf = await SimplePdf.create(`Recibo ${r.receipt_number}`);
  pdf.text(r.trade_name ?? r.company, { size: 16, bold: true });
  pdf.text([r.company !== r.trade_name ? r.company : null, r.cnpj ? `CNPJ ${r.cnpj}` : null].filter(Boolean).join(' · '), { size: 9 });
  if (r.address) pdf.text(r.address, { size: 9 });
  if (r.phone) pdf.text(`Telefone: ${r.phone}`, { size: 9 });
  pdf.line(14);
  pdf.text(`RECIBO Nº ${r.receipt_number}`, { size: 18, bold: true, align: 'center', gap: 6 });
  pdf.text(money(r.amount), { size: 22, bold: true, align: 'center', gap: 14 });
  if (r.status === 'refunded') pdf.text('PAGAMENTO ESTORNADO — RECIBO SEM VALIDADE', { size: 12, bold: true, align: 'center', color: [0.75, 0.1, 0.1], gap: 10 });
  pdf.paragraph(`Recebemos de ${r.client}${r.cpf ? `, CPF ${r.cpf}` : ''}, a importância de ${money(r.amount)} (${valorPorExtenso(Number(r.amount))}), referente a ${r.reference}.`);
  pdf.y -= 10;
  pdf.kv('Cliente', r.client);
  pdf.kv('CPF', r.cpf ?? 'não informado');
  pdf.kv('Valor', money(r.amount));
  pdf.kv('Referente a', r.reference);
  pdf.kv('Data do pagamento', dateTime(r.paid_at, r.timezone));
  pdf.kv('Forma de pagamento', paymentMethod[r.method] ?? r.method);
  pdf.kv('Identificador', String(r.payment_id).slice(0, 8).toUpperCase());
  pdf.y -= 40;
  pdf.text('_______________________________________________', { align: 'center' });
  pdf.text(r.company, { align: 'center', size: 10 });
  pdf.footer(`Recibo gerado em ${dateTime(new Date().toISOString(), r.timezone)}`);
  return pdfResponse(await pdf.bytes(), `recibo-${r.receipt_number}.pdf`);
}
