import { NextResponse, type NextRequest } from 'next/server';
import { getAppContext } from '@/lib/auth/context';
import { exportTable, type Col } from '@/lib/export';
import { label, patientStatus, receivableStatus, gender, origin } from '@/lib/labels';
import { captureException } from '@/lib/observability';

/** Exportações (XLSX/CSV) — respeitam permissões e são registradas na auditoria. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ resource: string }> }) {
  const { resource } = await params;
  const sp = req.nextUrl.searchParams;
  const format = sp.get('format') === 'csv' ? 'csv' : 'xlsx';
  const ctx = await getAppContext();
  const deny = () => new NextResponse('Você não tem permissão para exportar estes dados.', { status: 403 });
  try {
    let rows: Record<string, unknown>[] = [];
    let cols: Col[] = [];
    let name = resource;
    if (resource === 'patients') {
      if (!ctx.can('patients.export')) return deny();
      let q = ctx.supabase.from('patients').select('full_name, social_name, birth_date, cpf, gender, phone, whatsapp, email, address_city, address_state, status, origin, created_at').eq('organization_id', ctx.org.id).is('deleted_at', null);
      if (ctx.unitId) q = q.eq('unit_id', ctx.unitId);
      const { data } = await q.order('full_name').limit(20000);
      rows = ((data ?? []) as any[]).map((r) => ({ ...r, status: label(patientStatus, r.status), gender: label(gender, r.gender), origin: label(origin, r.origin) }));
      cols = [{ key: 'full_name', header: 'Nome', width: 34 }, { key: 'social_name', header: 'Nome social' }, { key: 'birth_date', header: 'Nascimento', format: 'date' }, { key: 'cpf', header: 'CPF' }, { key: 'gender', header: 'Sexo' }, { key: 'phone', header: 'Telefone' }, { key: 'whatsapp', header: 'WhatsApp' }, { key: 'email', header: 'E-mail', width: 30 }, { key: 'address_city', header: 'Cidade' }, { key: 'address_state', header: 'UF', width: 6 }, { key: 'status', header: 'Status' }, { key: 'origin', header: 'Origem' }, { key: 'created_at', header: 'Cadastro', format: 'datetime' }];
      name = 'alunos';
    } else if (resource === 'receivables') {
      if (!ctx.can('finance.export')) return deny();
      let q = ctx.supabase.from('v_receivables').select('due_date, patient_name, description, amount, discount, surcharge, amount_paid, open_amount, status, days_overdue, category_name').eq('organization_id', ctx.org.id);
      if (sp.get('status')) q = q.eq('status', sp.get('status')!);
      if (ctx.unitId) q = q.eq('unit_id', ctx.unitId);
      const { data } = await q.order('due_date').limit(50000);
      rows = ((data ?? []) as any[]).map((r) => ({ ...r, status: label(receivableStatus, r.status) }));
      cols = [{ key: 'due_date', header: 'Vencimento', format: 'date' }, { key: 'patient_name', header: 'Aluno', width: 30 }, { key: 'description', header: 'Descrição', width: 36 }, { key: 'category_name', header: 'Categoria' }, { key: 'amount', header: 'Valor', format: 'money' }, { key: 'discount', header: 'Desconto', format: 'money' }, { key: 'surcharge', header: 'Acréscimos', format: 'money' }, { key: 'amount_paid', header: 'Pago', format: 'money' }, { key: 'open_amount', header: 'Em aberto', format: 'money' }, { key: 'status', header: 'Status' }, { key: 'days_overdue', header: 'Dias de atraso' }];
      name = 'contas-a-receber';
    } else if (resource === 'cash-flow') {
      if (!ctx.can('finance.export')) return deny();
      const { data } = await ctx.supabase.rpc('cash_flow', { p_org: ctx.org.id, p_unit: ctx.unitId, p_from: sp.get('from'), p_to: sp.get('to'), p_group: sp.get('group') ?? 'day' });
      rows = (data ?? []) as any[];
      cols = [{ key: 'period', header: 'Período', format: 'date' }, { key: 'opening', header: 'Saldo inicial', format: 'money' }, { key: 'inflow', header: 'Entradas', format: 'money' }, { key: 'outflow', header: 'Saídas', format: 'money' }, { key: 'closing', header: 'Saldo final', format: 'money' }, { key: 'forecast_in', header: 'A receber (previsto)', format: 'money' }, { key: 'forecast_out', header: 'A pagar (previsto)', format: 'money' }];
      name = 'fluxo-de-caixa';
    } else if (resource === 'report') {
      if (!ctx.can('reports.export')) return deny();
      const kind = sp.get('kind') ?? '';
      const from = sp.get('from') ?? '', to = sp.get('to') ?? '';
      if (kind === 'profissionais') {
        const { data } = await ctx.supabase.rpc('report_staff', { p_org: ctx.org.id, p_unit: ctx.unitId, p_from: from, p_to: to });
        rows = (data ?? []) as any[];
        cols = [{ key: 'staff', header: 'Profissional', width: 28 }, { key: 'sessions', header: 'Atendimentos' }, { key: 'hours', header: 'Horas' }, { key: 'presences', header: 'Presenças' }, { key: 'absences', header: 'Faltas' }, { key: 'occupancy', header: 'Ocupação (%)' }, ...(ctx.can('commissions.view') ? [{ key: 'commissions', header: 'Comissões', format: 'money' as const }] : [])];
      } else if (kind === 'origem-leads') {
        const { data } = await ctx.supabase.rpc('report_marketing', { p_org: ctx.org.id, p_from: from, p_to: to });
        rows = ((data as any)?.by_origin ?? []).map((r: any) => ({ ...r, origin: label(origin, r.origin) }));
        cols = [{ key: 'origin', header: 'Origem' }, { key: 'leads', header: 'Leads' }, { key: 'enrolled', header: 'Matriculados' }, { key: 'conversion', header: 'Conversão (%)' }, { key: 'avg_cost', header: 'Custo médio', format: 'money' }];
      } else if (kind === 'agenda-horarios') {
        const { data } = await ctx.supabase.rpc('report_schedule', { p_org: ctx.org.id, p_unit: ctx.unitId, p_from: from, p_to: to });
        const wd = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        rows = ((data as any)?.by_slot ?? []).map((r: any) => ({ dia: wd[r.weekday], hora: `${String(r.hour).padStart(2, '0')}:00`, sessoes: r.sessions, vagas: r.capacity, ocupadas: r.booked, ocupacao: r.capacity ? Math.round((100 * r.booked) / r.capacity) : 0 }));
        cols = [{ key: 'dia', header: 'Dia' }, { key: 'hora', header: 'Hora' }, { key: 'sessoes', header: 'Sessões' }, { key: 'vagas', header: 'Vagas' }, { key: 'ocupadas', header: 'Ocupadas' }, { key: 'ocupacao', header: 'Ocupação (%)' }];
      } else if (kind === 'agenda-modalidades') {
        const { data } = await ctx.supabase.rpc('report_schedule', { p_org: ctx.org.id, p_unit: ctx.unitId, p_from: from, p_to: to });
        rows = (data as any)?.by_service ?? [];
        cols = [{ key: 'service', header: 'Modalidade', width: 30 }, { key: 'sessions', header: 'Sessões' }, { key: 'presences', header: 'Presenças' }, { key: 'absences', header: 'Faltas' }];
      } else if (kind === 'financeiro-categorias' || kind === 'financeiro-profissionais' || kind === 'financeiro-planos') {
        if (!ctx.can('finance.view')) return deny();
        const { data } = await ctx.supabase.rpc('report_finance', { p_org: ctx.org.id, p_unit: ctx.unitId, p_from: from, p_to: to });
        const d = data as any;
        if (kind === 'financeiro-categorias') {
          rows = (d?.by_category ?? []).map((r: any) => ({ ...r, type: r.type === 'in' ? 'Entrada' : 'Saída' }));
          cols = [{ key: 'category', header: 'Categoria', width: 30 }, { key: 'type', header: 'Tipo' }, { key: 'total', header: 'Total', format: 'money' }];
        } else if (kind === 'financeiro-planos') {
          rows = d?.by_plan ?? [];
          cols = [{ key: 'plan', header: 'Plano', width: 30 }, { key: 'total', header: 'Receita', format: 'money' }];
        } else {
          rows = d?.by_staff ?? [];
          cols = [{ key: 'staff', header: 'Profissional', width: 30 }, { key: 'attended', header: 'Aulas atendidas' }, { key: 'total', header: 'Receita estimada', format: 'money' }];
        }
      } else if (kind === 'alunos-risco') {
        if (!ctx.can('patients.view')) return deny();
        const { data } = await ctx.supabase.rpc('patient_risk', { p_org: ctx.org.id, p_unit: ctx.unitId });
        rows = ((data ?? []) as any[]).map((r) => ({ ...r, reasons: (r.reasons ?? []).join('; ') }));
        cols = [{ key: 'full_name', header: 'Aluno', width: 30 }, { key: 'level', header: 'Risco' }, { key: 'score', header: 'Pontuação' }, { key: 'reasons', header: 'Motivos', width: 70 }];
      } else if (kind === 'alunos-sem-plano') {
        if (!ctx.can('patients.view')) return deny();
        const { data } = await ctx.supabase.rpc('report_patients_without_plan', { p_org: ctx.org.id, p_unit: ctx.unitId });
        rows = (data ?? []) as any[];
        cols = [{ key: 'full_name', header: 'Aluno', width: 30 }, { key: 'phone', header: 'Telefone' }, { key: 'last_plan', header: 'Último plano' }, { key: 'last_end', header: 'Encerrado em', format: 'date' }, { key: 'last_attendance', header: 'Última presença', format: 'datetime' }];
      } else return new NextResponse('Relatório desconhecido.', { status: 404 });
      name = `relatorio-${kind}`;
    } else {
      return new NextResponse('Exportação desconhecida.', { status: 404 });
    }
    await ctx.supabase.rpc('log_audit_event', { p_org: ctx.org.id, p_action: 'export', p_entity: resource, p_entity_id: null, p_context: { format, rows: rows.length } });
    return exportTable(rows, cols, format, name);
  } catch (e) {
    captureException(e, { where: 'export', resource });
    return new NextResponse('Não foi possível gerar a exportação.', { status: 500 });
  }
}
