// Limpa respostas recebidas do navegador: só campos do modelo, tipos e tamanhos válidos.
import type { Answers, Field, FormTemplate, CellSpec } from './types';
import { allFields } from './engine';

const str = (v: unknown, max = 5000) => (typeof v === 'string' ? v.slice(0, max) : typeof v === 'number' && Number.isFinite(v) ? String(v) : undefined);

function cell(spec: CellSpec, v: unknown) {
  if (spec.type === 'single') return typeof v === 'string' && spec.options?.some((o) => o.value === v) ? v : undefined;
  if (spec.type === 'multi') { const arr = Array.isArray(v) ? v.filter((x) => typeof x === 'string' && spec.options?.some((o) => o.value === x)) : []; return arr.length ? arr : undefined; }
  if (spec.type === 'date') return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
  return str(v, 300);
}

function one(f: Field, v: unknown): unknown {
  switch (f.type) {
    case 'text': return str(v, 500);
    case 'textarea': return str(v, 8000);
    case 'number': case 'bp': return str(v, 20);
    case 'date': return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
    case 'yesno': return v === 'yes' || v === 'no' ? v : undefined;
    case 'single': case 'scale': return typeof v === 'string' && f.options?.some((o) => o.value === v) ? v : undefined;
    case 'multi': return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && f.options?.some((o) => o.value === x)) : undefined;
    case 'bilateral': {
      if (!v || typeof v !== 'object' || !f.bilateral) return undefined;
      const o = v as Record<string, unknown>; const out: Record<string, unknown> = {};
      for (const k of ['d', 'e']) { const c = cell(f.bilateral.cell, o[k]); if (c !== undefined && c !== '') out[k] = c; }
      return Object.keys(out).length ? out : undefined;
    }
    case 'grid': {
      if (!v || typeof v !== 'object' || !f.grid) return undefined;
      const out: Record<string, Record<string, unknown>> = {};
      for (const r of f.grid.rows) {
        const row = (v as Record<string, Record<string, unknown>>)[r.id];
        if (!row || typeof row !== 'object') continue;
        for (const c of f.grid.columns) { const x = cell(f.grid.cell, row[c.id]); if (x !== undefined && x !== '') (out[r.id] ??= {})[c.id] = x; }
      }
      return Object.keys(out).length ? out : undefined;
    }
    default: return undefined;
  }
}

export function sanitizeAnswers(t: FormTemplate, input: unknown): Answers {
  const a = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const out: Answers = {};
  for (const f of allFields(t)) {
    if (f.type === 'computed' || f.type === 'info') continue;
    const v = one(f, a[f.id]);
    if (v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)) out[f.id] = v;
    const det = str(a[`${f.id}__det`], 1000); if (det) out[`${f.id}__det`] = det;
    const oth = str(a[`${f.id}__other`], 300); if (oth) out[`${f.id}__other`] = oth;
  }
  return out;
}
