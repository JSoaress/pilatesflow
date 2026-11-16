import { z } from 'zod';
import { isValidCNPJ, isValidCPF, onlyDigits } from '@/lib/utils';
import type { FieldDef, ResourceDef } from './types';

const blank = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
const toNumber = (v: unknown) => (typeof v === 'string' ? Number(v.replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')) : v);

function fieldSchema(f: FieldDef): z.ZodTypeAny {
  const req = (s: z.ZodTypeAny, msg: string) => (f.required ? s : s.nullable().optional());
  const pre = (fn: (v: unknown) => unknown, s: z.ZodTypeAny) => z.preprocess((v) => (blank(v) ? (f.type === 'boolean' ? false : null) : fn(v)), s);
  const reqMsg = `Preencha "${f.label}".`;
  switch (f.type) {
    case 'boolean':
      return z.preprocess((v) => v === true || v === 'true' || v === 'on' || v === '1', z.boolean());
    case 'number':
    case 'money':
    case 'percent': {
      let s = z.number({ error: `"${f.label}" deve ser um número.` });
      if (f.type !== 'number' || f.min !== undefined) s = s.min(f.min ?? 0, `"${f.label}": valor mínimo ${f.min ?? 0}.`);
      if (f.type === 'percent') s = s.max(100, `"${f.label}": máximo 100%.`);
      if (f.max !== undefined) s = s.max(f.max);
      return pre(toNumber, req(s, reqMsg));
    }
    case 'int': {
      let s = z.number({ error: `"${f.label}" deve ser um número inteiro.` }).int(`"${f.label}" deve ser inteiro.`);
      if (f.min !== undefined) s = s.min(f.min, `"${f.label}": valor mínimo ${f.min}.`);
      if (f.max !== undefined) s = s.max(f.max, `"${f.label}": valor máximo ${f.max}.`);
      return pre(toNumber, req(s, reqMsg));
    }
    case 'date':
      return pre((v) => v, req(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `"${f.label}": data inválida.`), reqMsg));
    case 'datetime':
      return pre((v) => v, req(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, `"${f.label}": data/hora inválida.`), reqMsg));
    case 'time':
      return pre((v) => v, req(z.string().regex(/^\d{2}:\d{2}/, `"${f.label}": hora inválida.`), reqMsg));
    case 'email':
      return pre((v) => String(v).trim().toLowerCase(), req(z.string().email(`"${f.label}": e-mail inválido.`).max(160), reqMsg));
    case 'phone':
      return pre((v) => String(v).trim(), req(z.string().refine((v) => onlyDigits(v).length >= 10 && onlyDigits(v).length <= 13, `"${f.label}": telefone inválido (inclua o DDD).`), reqMsg));
    case 'cpf':
      return pre((v) => String(v).trim(), req(z.string().refine(isValidCPF, 'CPF inválido.'), reqMsg));
    case 'cnpj':
      return pre((v) => String(v).trim(), req(z.string().refine(isValidCNPJ, 'CNPJ inválido.'), reqMsg));
    case 'url':
      return pre((v) => String(v).trim(), req(z.string().url(`"${f.label}": link inválido.`).startsWith('https://', `"${f.label}": use um link https://`), reqMsg));
    case 'color':
      return pre((v) => v, req(z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida.'), reqMsg));
    case 'ref':
      return pre((v) => v, req(z.string().uuid(`Selecione "${f.label}".`), `Selecione "${f.label}".`));
    case 'multiref':
      return z.preprocess((v) => (Array.isArray(v) ? v : blank(v) ? [] : [v]), z.array(z.string().uuid()).max(200));
    case 'tags':
      return z.preprocess((v) => (Array.isArray(v) ? v : blank(v) ? [] : String(v).split(',').map((s) => s.trim()).filter(Boolean)), z.array(z.string().max(80)).max(50));
    case 'hours':
      return z.preprocess((v) => { if (typeof v === 'string') { try { return JSON.parse(v); } catch { return {}; } } return v ?? {}; },
        z.record(z.string().regex(/^[0-6]$/), z.array(z.object({ start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/) })).max(4)));
    case 'select': {
      const values = (f.options ?? []).map((o) => o.value);
      const s = z.string().refine((v) => values.includes(v), `Selecione "${f.label}".`);
      return pre((v) => v, req(s, `Selecione "${f.label}".`));
    }
    case 'textarea':
    case 'richtext':
      return pre((v) => String(v).trim(), req(z.string().max(f.maxLength ?? 50_000, 'Texto muito longo.'), reqMsg));
    default:
      return pre((v) => String(v).trim(), req(z.string().min(1, reqMsg).max(f.maxLength ?? 300, `"${f.label}": máximo de ${f.maxLength ?? 300} caracteres.`), reqMsg));
  }
}

export function buildSchema(def: ResourceDef, mode: 'create' | 'edit') {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of def.fields) {
    if (f.hideInForm && f.name !== def.parentField) continue;
    if (mode === 'edit' && f.readOnlyOnEdit) continue;
    shape[f.name] = fieldSchema(f);
  }
  return z.object(shape);
}
