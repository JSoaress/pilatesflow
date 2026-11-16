// Atalhos para escrever modelos de ficha de forma legível.
import type { Band, CellSpec, Field, Opt } from './types';

export const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
/** opts('Normal', 'Valgo') ou opts(['0', 'Ausente', 0], ...) */
export const opts = (...items: (string | [string, string, number?])[]): Opt[] =>
  items.map((i) => (Array.isArray(i) ? { value: i[0], label: i[1], ...(i[2] !== undefined ? { score: i[2] } : {}) } : { value: slug(i), label: i }));

type X = Partial<Field>;
export const text = (id: string, label: string, x: X = {}): Field => ({ id, label, type: 'text', span: 2, ...x });
export const area = (id: string, label: string, x: X = {}): Field => ({ id, label, type: 'textarea', span: 4, lines: 3, ...x });
export const num = (id: string, label: string, unit?: string, x: X = {}): Field => ({ id, label, type: 'number', unit, span: 1, ...x });
export const date = (id: string, label: string, x: X = {}): Field => ({ id, label, type: 'date', span: 1, ...x });
export const yesno = (id: string, label: string, x: X = {}): Field => ({ id, label, type: 'yesno', span: 2, ...x });
export const yesnoSpec = (id: string, label: string, detail = 'Especificar', x: X = {}): Field => yesno(id, label, { detail: { when: ['yes'], label: detail }, span: 4, ...x });
export const single = (id: string, label: string, options: Opt[], x: X = {}): Field => ({ id, label, type: 'single', options, span: 4, ...x });
export const multi = (id: string, label: string, options: Opt[], x: X = {}): Field => ({ id, label, type: 'multi', options, span: 4, ...x });
export const scale = (id: string, label: string, min = 0, max = 10, x: X = {}): Field => ({ id, label, type: 'scale', min, max, span: 4, options: Array.from({ length: max - min + 1 }, (_, i) => ({ value: String(min + i), label: String(min + i), score: min + i })), ...x });
export const bp = (id: string, label = 'Pressão arterial', x: X = {}): Field => ({ id, label, type: 'bp', unit: 'mmHg', span: 1, help: 'Ex.: 120/80', ...x });
export const bilateral = (id: string, label: string, cell: CellSpec, x: X = {}): Field => ({ id, label, type: 'bilateral', bilateral: { cell }, span: 4, ...x });
export const grid = (id: string, label: string, rows: string[], columns: string[], cell: CellSpec, x: X = {}): Field => ({
  id, label, type: 'grid', span: 4, ...x,
  grid: { rows: rows.map((r) => ({ id: slug(r), label: r })), columns: columns.map((c) => ({ id: slug(c), label: c })), cell },
});
export const calc = (id: string, label: string, compute: Field['compute'], x: X & { bands?: Band[] } = {}): Field => ({ id, label, type: 'computed', compute, span: 2, ...x });
export const info = (id: string, label: string, help?: string): Field => ({ id, label, type: 'info', help, span: 4 });

export const SIDES: CellSpec = { type: 'single', options: opts('Direito', 'Esquerdo') };
export const MRC = opts(['0', '0 — Nulo', 0], ['1', '1 — Esboço', 1], ['2', '2 — Fraco', 2], ['3', '3 — Regular', 3], ['4', '4 — Bom', 4], ['5', '5 — Normal', 5]);
export const BMI_BANDS: Band[] = [
  { max: 18.49, label: 'Baixo peso', tone: 'warn' }, { min: 18.5, max: 24.99, label: 'Eutrofia', tone: 'ok' },
  { min: 25, max: 29.99, label: 'Sobrepeso', tone: 'warn' }, { min: 30, label: 'Obesidade', tone: 'alert' },
];
export const BMI_BANDS_ELDERLY: Band[] = [ // Lipschitz (1994), idosos
  { max: 21.99, label: 'Baixo peso', tone: 'warn' }, { min: 22, max: 27, label: 'Eutrofia', tone: 'ok' }, { min: 27.01, label: 'Sobrepeso', tone: 'warn' },
];
export const EVN_BANDS: Band[] = [{ max: 0, label: 'Sem dor', tone: 'ok' }, { min: 1, max: 3, label: 'Dor leve', tone: 'info' }, { min: 4, max: 6, label: 'Dor moderada', tone: 'warn' }, { min: 7, label: 'Dor intensa', tone: 'alert' }];
