'use server';
import Papa from 'papaparse';
import ExcelJS from 'exceljs';
import { revalidatePath } from 'next/cache';
import { patientSchema } from '@/lib/validation/patient';
import { onlyDigits } from '@/lib/utils';
import { runAction, must, UserError } from './safe-action';

export type ImportRow = {
  line: number;
  data: Record<string, unknown>;
  errors: string[];
  duplicate?: string;
};

const HEADER_MAP: Record<string, string> = {
  nome: 'full_name', nome_completo: 'full_name', aluno: 'full_name', paciente: 'full_name',
  nome_social: 'social_name', data_nascimento: 'birth_date', nascimento: 'birth_date', data_de_nascimento: 'birth_date',
  cpf: 'cpf', rg: 'rg', sexo: 'gender', genero: 'gender', profissao: 'profession', telefone: 'phone', celular: 'whatsapp',
  whatsapp: 'whatsapp', email: 'email', e_mail: 'email', cep: 'address_zip', endereco: 'address_street', logradouro: 'address_street',
  rua: 'address_street', numero: 'address_number', complemento: 'address_complement', bairro: 'address_district',
  cidade: 'address_city', uf: 'address_state', estado: 'address_state', status: 'status', situacao: 'status',
  observacoes: 'notes', obs: 'notes', origem: 'origin', pin: 'checkin_pin',
};
const STATUS: Record<string, string> = { ativo: 'active', ativa: 'active', inativo: 'inactive', inativa: 'inactive', pausado: 'paused', pausada: 'paused', cancelado: 'cancelled', cancelada: 'cancelled', experimental: 'trial', lead: 'lead' };
const GENDER: Record<string, string> = { f: 'female', feminino: 'female', m: 'male', masculino: 'male', outro: 'other' };

function norm(h: string) {
  return h.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function toISODate(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  if (/^\d{5}$/.test(s)) { const d = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000); return d.toISOString().slice(0, 10); }
  return s;
}

async function parseFile(file: File): Promise<Record<string, unknown>[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv') || file.type === 'text/csv') {
    const text = await file.text();
    const res = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true, delimitersToGuess: [';', ',', '\t'] });
    return res.data;
  }
  if (name.endsWith('.xlsx')) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    if (!ws) return [];
    const headers: string[] = [];
    ws.getRow(1).eachCell((c, col) => { headers[col] = String(c.text ?? '').trim(); });
    const rows: Record<string, unknown>[] = [];
    ws.eachRow((row, idx) => {
      if (idx === 1) return;
      const obj: Record<string, unknown> = {};
      row.eachCell({ includeEmpty: true }, (c, col) => { if (headers[col]) obj[headers[col]] = c.value instanceof Date ? c.value : c.text; });
      if (Object.values(obj).some((v) => v !== '' && v !== null && v !== undefined)) rows.push(obj);
    });
    return rows;
  }
  throw new UserError('Formato não suportado. Envie um arquivo .csv ou .xlsx.');
}

/** Lê a planilha e devolve pré-visualização com válidos, erros e duplicidades. NADA é gravado aqui. */
export async function previewImport(fd: FormData) {
  return runAction({ permission: 'patients.create' }, async (ctx) => {
    const file = fd.get('file');
    if (!(file instanceof File) || !file.size) throw new UserError('Selecione um arquivo.');
    if (file.size > 5 * 1024 * 1024) throw new UserError('Arquivo muito grande (máx. 5 MB).');
    const raw = await parseFile(file);
    if (!raw.length) throw new UserError('Nenhuma linha encontrada. A primeira linha deve conter os cabeçalhos (ex.: nome, telefone, email).');
    if (raw.length > 3000) throw new UserError('Importe no máximo 3.000 alunos por vez.');

    const { data: existing } = await ctx.supabase.from('patients').select('full_name, cpf, email, phone').eq('organization_id', ctx.org.id).is('deleted_at', null);
    const byCpf = new Set((existing ?? []).map((p) => onlyDigits(p.cpf)).filter(Boolean));
    const byEmail = new Set((existing ?? []).map((p) => (p.email ?? '').toLowerCase()).filter(Boolean));
    const byPhone = new Set((existing ?? []).map((p) => onlyDigits(p.phone)).filter(Boolean));
    const seen = new Set<string>();

    const rows: ImportRow[] = raw.map((r, i) => {
      const data: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(r)) {
        const key = HEADER_MAP[norm(k)];
        if (key) data[key] = typeof v === 'string' ? v.trim() : v;
      }
      data.birth_date = toISODate(data.birth_date);
      if (data.status) data.status = STATUS[norm(String(data.status))] ?? 'active'; else data.status = 'active';
      if (data.gender) data.gender = GENDER[norm(String(data.gender))] ?? 'not_informed';
      if (data.origin) data.origin = null;
      if (!data.whatsapp && data.phone) data.whatsapp = data.phone;
      const parsed = patientSchema.safeParse(data);
      const errors = parsed.success ? [] : parsed.error.issues.map((x) => x.message);
      const cpf = onlyDigits(String(data.cpf ?? ''));
      const email = String(data.email ?? '').toLowerCase();
      const phone = onlyDigits(String(data.phone ?? ''));
      let duplicate: string | undefined;
      if (cpf && byCpf.has(cpf)) duplicate = 'CPF já cadastrado';
      else if (email && byEmail.has(email)) duplicate = 'E-mail já cadastrado';
      else if (phone && byPhone.has(phone)) duplicate = 'Telefone já cadastrado';
      const fileKey = cpf || email || phone || String(data.full_name ?? '').toLowerCase();
      if (!duplicate && fileKey && seen.has(fileKey)) duplicate = 'Repetido na planilha';
      if (fileKey) seen.add(fileKey);
      return { line: i + 2, data: parsed.success ? parsed.data : data, errors, duplicate };
    });
    return {
      rows,
      summary: { total: rows.length, valid: rows.filter((r) => !r.errors.length && !r.duplicate).length, errors: rows.filter((r) => r.errors.length).length, duplicates: rows.filter((r) => r.duplicate).length },
    };
  });
}

/** Grava somente as linhas válidas confirmadas pelo usuário (validadas novamente no servidor). */
export async function confirmImport(rows: Record<string, unknown>[]) {
  return runAction({ permission: 'patients.create' }, async (ctx) => {
    if (!Array.isArray(rows) || !rows.length) throw new UserError('Nenhuma linha válida para importar.');
    if (rows.length > 3000) throw new UserError('Importe no máximo 3.000 alunos por vez.');
    const valid = rows.map((r) => patientSchema.safeParse(r)).filter((r) => r.success).map((r) => {
      const { emergency_name, emergency_phone, emergency_relationship, ...rest } = r.data!;
      void emergency_name; void emergency_phone; void emergency_relationship;
      return { ...rest, organization_id: ctx.org.id, unit_id: rest.unit_id ?? ctx.unitId ?? ctx.units[0]?.id ?? null, registered_by: ctx.user.id, notes: rest.notes ?? 'Importado de planilha.' };
    });
    for (let i = 0; i < valid.length; i += 500) must(await ctx.supabase.from('patients').insert(valid.slice(i, i + 500)));
    await ctx.supabase.rpc('log_audit_event', { p_org: ctx.org.id, p_action: 'import', p_entity: 'patients', p_entity_id: null, p_context: { count: valid.length } });
    revalidatePath('/app/alunos');
    return { imported: valid.length };
  });
}
