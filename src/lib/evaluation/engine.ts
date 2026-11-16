// Motor de cálculo das fichas (puro, usado no navegador, no servidor e na impressão).
import type { Answers, Band, EvalContext, Field, FormTemplate, Scores, ScoreResult } from './types';

export const allFields = (t: FormTemplate) => t.sections.flatMap((s) => s.fields);

export const toNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

export const fmtNum = (n: number, d = 1) => n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: d });

export function isVisible(f: Field, a: Answers) {
  if (!f.showIf) return true;
  const v = a[f.showIf.field];
  if (Array.isArray(v)) return v.some((x) => f.showIf!.in.includes(String(x)));
  return v !== undefined && v !== null && f.showIf.in.includes(String(v));
}

export function bandFor(bands: Band[] | undefined, v: number | null) {
  if (!bands || v === null) return undefined;
  return bands.find((b) => (b.min === undefined || v >= b.min) && (b.max === undefined || v <= b.max));
}

/** Pontuação numérica de um campo (número, escala, opção com score, sim/não). */
function fieldScore(f: Field | undefined, v: unknown): number | null {
  if (!f) return toNum(v);
  if (f.type === 'single' || f.type === 'scale') {
    const o = f.options?.find((x) => x.value === v);
    if (o && o.score !== undefined) return o.score;
    return toNum(v);
  }
  if (f.type === 'yesno') {
    const [y, n] = f.yesNoScore ?? [1, 0];
    return v === 'yes' ? y : v === 'no' ? n : null;
  }
  if (f.type === 'multi') return Array.isArray(v) ? v.reduce((t: number, x) => t + (f.options?.find((o) => o.value === x)?.score ?? 1), 0) : null;
  return toNum(v);
}

const parseBp = (v: unknown): [number, number] | null => {
  const m = String(v ?? '').match(/(\d{2,3})\s*[x/×]\s*(\d{2,3})/i);
  return m ? [Number(m[1]), Number(m[2])] : null;
};

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);

// Regiões do Índice de Dor Generalizada (ACR 2016): mandíbula, tórax e abdome não contam para "dor generalizada".
const FIBRO_REGIONS = ['idg_r1', 'idg_r2', 'idg_r3', 'idg_r4', 'idg_r5'];
const FIBRO_EXCLUDED = ['mandibula_e', 'mandibula_d', 'torax', 'abdome'];

// Medianas de referência do MEEM por escolaridade (Brucki et al., 2003)
const MEEM_REF = [{ max: 0, cut: 20 }, { max: 4, cut: 25 }, { max: 8, cut: 26.5 }, { max: 11, cut: 28 }, { max: 99, cut: 29 }];

function named(name: string, a: Answers, s: Scores, ctx: EvalContext, args: Record<string, string> = {}): ScoreResult {
  const n = (id: string) => (s[id] ? toNum(s[id].value) : toNum(a[id]));
  switch (name) {
    case 'mae': { // Massa apendicular estimada (Lee et al., 2000)
      const w = n(args.weight), h = n(args.height), age = n(args.age) ?? ctx.age ?? null;
      const sexV = a[args.sex] ?? ctx.sex;
      const sex = sexV === 'm' || sexV === 'male' ? 1 : sexV === 'f' || sexV === 'female' ? 0 : null;
      const raceCoef = ({ branca: 0, afro: 1.4, asiatica: -1.2, outra: 0 } as Record<string, number>)[String(a[args.race] ?? '')];
      if (w === null || h === null || age === null || sex === null || raceCoef === undefined) return { value: null, text: 'Preencha peso, altura, idade, sexo e raça' };
      const v = 0.244 * w + 7.8 * h + 6.6 * sex - 0.098 * age + raceCoef - 3.3;
      return { value: Math.round(v * 100) / 100, text: `${fmtNum(v, 2)} kg` };
    }
    case 'fibro_regions': {
      const c = FIBRO_REGIONS.filter((r) => Array.isArray(a[r]) && (a[r] as string[]).some((x) => !FIBRO_EXCLUDED.includes(x))).length;
      return { value: c, text: `${c} de 5 regiões` };
    }
    case 'fibro_criteria': {
      const idg = n(args.idg), egs = n(args.egs);
      if (idg === null || egs === null) return { value: null, text: '—' };
      const ok = (idg >= 7 && egs >= 5) || (idg >= 4 && idg <= 6 && egs >= 9);
      return { value: ok ? 'yes' : 'no', text: ok ? 'Atendido' : 'Não atendido', band: ok ? { label: 'Atendido', tone: 'warn' } : { label: 'Não atendido', tone: 'ok' } };
    }
    case 'fibro_conclusion': {
      const c1 = s[args.c1]?.value === 'yes', c2 = (n(args.regions) ?? 0) >= 4, c3 = a[args.c3] === 'yes', c4 = a[args.c4] !== 'no';
      const filled = s[args.c1]?.value !== null && a[args.c3] !== undefined;
      if (!filled) return { value: null, text: 'Preencha IDG, EGS e a duração dos sintomas' };
      const ok = c1 && c2 && c3 && c4;
      return { value: ok ? 'yes' : 'no', text: ok ? 'Critérios preenchidos (ACR 2016)' : 'Critérios não preenchidos', band: { label: ok ? 'Critérios preenchidos' : 'Critérios não preenchidos', tone: ok ? 'alert' : 'ok' } };
    }
    case 'orthostatic': { // queda ≥ 20 mmHg sistólica ou ≥ 10 diastólica do decúbito para ortostatismo (3 min)
      const sup = parseBp(a[args.supine]);
      const stand = [args.stand0, args.stand3, args.stand5].map((k) => parseBp(a[k])).filter(Boolean) as [number, number][];
      if (!sup || !stand.length) return { value: null, text: 'Preencha a PA deitado e em pé' };
      const drop = stand.map((p) => [sup[0] - p[0], sup[1] - p[1]]);
      const pos = drop.some(([ds, dd]) => ds >= 20 || dd >= 10);
      const maxS = Math.max(...drop.map((d) => d[0])), maxD = Math.max(...drop.map((d) => d[1]));
      return { value: pos ? 'yes' : 'no', text: `${pos ? 'Positivo' : 'Negativo'} (queda máx. ${maxS}/${maxD} mmHg)`, band: { label: pos ? 'Hipotensão postural' : 'Sem hipotensão postural', tone: pos ? 'alert' : 'ok' } };
    }
    case 'gest_age': {
      const dum = String(a[args.dum] ?? ''), ref = ctx.date ?? new Date().toISOString().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dum)) return { value: null, text: 'Informe a DUM' };
      const d = daysBetween(dum, ref);
      if (d < 0 || d > 300) return { value: null, text: 'DUM fora do intervalo esperado' };
      return { value: Math.round((d / 7) * 10) / 10, text: `${Math.floor(d / 7)} semanas e ${d % 7} dia(s)` };
    }
    case 'dpp': { // Regra de Naegele: DUM + 280 dias
      const dum = String(a[args.dum] ?? '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dum)) return { value: null, text: 'Informe a DUM' };
      const d = new Date(dum + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 280);
      const iso = d.toISOString().slice(0, 10);
      return { value: iso, text: iso.split('-').reverse().join('/') };
    }
    case 'meem': {
      const score = n(args.score), years = n(args.years);
      if (score === null) return { value: null, text: '—' };
      if (years === null) return { value: score, text: `${fmtNum(score)} pontos (informe a escolaridade para comparar)` };
      const ref = MEEM_REF.find((r) => years <= r.max)!.cut;
      const below = score < ref;
      return { value: score, text: `${fmtNum(score)} / 30 — referência para ${years} ano(s) de estudo: ${fmtNum(ref)}`, band: { label: below ? 'Abaixo da referência — investigar' : 'Dentro da referência', tone: below ? 'warn' : 'ok' } };
    }
    case 'parq': {
      const ids = (args.fields ?? '').split(',');
      const answered = ids.filter((id) => a[id] === 'yes' || a[id] === 'no').length;
      if (!answered) return { value: null, text: '—' };
      const yes = ids.filter((id) => a[id] === 'yes').length;
      return { value: yes, text: yes ? `${yes} resposta(s) "sim"` : 'Todas as respostas "não"', band: yes ? { label: 'Recomendar liberação médica antes de iniciar', tone: 'alert' } : { label: 'Apto a iniciar atividade física gradual', tone: 'ok' } };
    }
    case 'fried_fatigue': {
      const v = [n(args.a), n(args.b)];
      if (v.every((x) => x === null)) return { value: null, text: '—' };
      const pos = v.some((x) => x !== null && x >= 2);
      return { value: pos ? 'yes' : 'no', text: pos ? 'Critério de fadiga presente' : 'Critério de fadiga ausente', band: { label: pos ? 'Fadiga (critério de Fried)' : 'Sem fadiga', tone: pos ? 'warn' : 'ok' } };
    }
  }
  return { value: null, text: '—' };
}

/** Calcula todos os campos calculados, na ordem em que aparecem. */
export function computeScores(t: FormTemplate, a: Answers, ctx: EvalContext = {}): Scores {
  const fields = allFields(t);
  const byId = new Map(fields.map((f) => [f.id, f]));
  const s: Scores = {};
  for (const f of fields) {
    if (f.type !== 'computed' || !f.compute) continue;
    const c = f.compute;
    let r: ScoreResult = { value: null, text: '—' };
    const val = (id: string) => (s[id] ? toNum(s[id].value) : fieldScore(byId.get(id), a[id]));
    if (c.kind === 'bmi') {
      const w = toNum(a[c.weight]), h = toNum(a[c.height]);
      if (w && h) { const hm = h > 3 ? h / 100 : h; const v = w / (hm * hm); r = { value: Math.round(v * 10) / 10, text: fmtNum(v, 1) }; }
    } else if (c.kind === 'sum' || c.kind === 'avg') {
      const vals = c.fields.map(val).filter((x): x is number => x !== null);
      if (vals.length) {
        const total = vals.reduce((x, y) => x + y, 0);
        const v = c.kind === 'sum' ? total : total / vals.length;
        r = { value: Math.round(v * 100) / 100, text: fmtNum(v, f.decimals ?? (c.kind === 'avg' ? 1 : 0)) + (f.unit ? ` ${f.unit}` : '') };
      }
    } else if (c.kind === 'count') {
      let total = 0, any = false;
      for (const id of c.fields) {
        const v = a[id];
        if (Array.isArray(v)) { any = true; total += v.filter((x) => !c.exclude?.includes(String(x))).length; }
        else if (v === 'yes') { any = true; total += 1; } else if (v === 'no') any = true;
      }
      if (any) r = { value: total, text: String(total) + (f.unit ? ` ${f.unit}` : '') };
    } else if (c.kind === 'bilateral_diff') {
      const v = a[c.field] as Record<string, unknown> | undefined;
      const d = toNum(v?.d), e = toNum(v?.e);
      if (d !== null && e !== null) { const x = Math.abs(d - e); r = { value: Math.round(x * 10) / 10, text: `${fmtNum(x)}${f.unit ? ` ${f.unit}` : ''}${x > 0 ? ` (maior: ${d > e ? 'direito' : 'esquerdo'})` : ''}` }; }
    } else if (c.kind === 'ratio') {
      const x = val(c.field);
      if (x) { const v = c.numerator / x; r = { value: Math.round(v * 100) / 100, text: `${fmtNum(v, c.decimals ?? 2)}${f.unit ? ` ${f.unit}` : ''}` }; }
    } else if (c.kind === 'named') {
      r = named(c.name, a, s, ctx, c.args);
    }
    if (!r.band && typeof r.value === 'number') r.band = bandFor(f.bands, r.value);
    s[f.id] = r;
  }
  return s;
}

/** Progresso: campos visíveis respondidos / total (ignora calculados e informativos). */
export function progress(t: FormTemplate, a: Answers) {
  let total = 0, done = 0;
  for (const f of allFields(t)) {
    if (f.type === 'computed' || f.type === 'info' || !isVisible(f, a)) continue;
    total++;
    if (hasValue(a[f.id])) done++;
  }
  return { total, done, pct: total ? Math.round((100 * done) / total) : 0 };
}

export function hasValue(v: unknown): boolean {
  if (v === null || v === undefined || v === '') return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.values(v as object).some(hasValue);
  return true;
}

/** Texto legível de uma resposta (visualização e impressão). */
export function answerText(f: Field, a: Answers): string {
  const v = a[f.id];
  const lbl = (opts: Field['options'], x: unknown) => opts?.find((o) => o.value === x)?.label ?? String(x);
  const withDetail = (s: string) => {
    const det = a[`${f.id}__det`], oth = a[`${f.id}__other`];
    return [s, oth ? `Outro: ${oth}` : '', det ? `— ${det}` : ''].filter(Boolean).join(' ');
  };
  switch (f.type) {
    case 'yesno': return v === 'yes' ? withDetail('Sim') : v === 'no' ? withDetail('Não') : '';
    case 'single': case 'scale': return hasValue(v) ? withDetail(lbl(f.options, v)) : '';
    case 'multi': return Array.isArray(v) && v.length ? withDetail(v.map((x) => lbl(f.options, x)).join('; ')) : (a[`${f.id}__other`] ? withDetail('') : '');
    case 'number': return hasValue(v) ? `${String(v).replace('.', ',')}${f.unit ? ` ${f.unit}` : ''}` : '';
    case 'date': return typeof v === 'string' && v ? v.split('-').reverse().join('/') : '';
    case 'bp': return hasValue(v) ? `${v} mmHg` : '';
    case 'bilateral': {
      const o = (v ?? {}) as Record<string, unknown>;
      const [l1, l2] = f.bilateral?.sides ?? ['Direito', 'Esquerdo'];
      const fmt = (x: unknown) => (f.bilateral?.cell.options ? (Array.isArray(x) ? x.map((y) => lbl(f.bilateral!.cell.options, y)).join(', ') : lbl(f.bilateral.cell.options, x)) : `${String(x).replace('.', ',')}${f.bilateral?.cell.unit ? ` ${f.bilateral.cell.unit}` : ''}`);
      return [hasValue(o.d) ? `${l1}: ${fmt(o.d)}` : '', hasValue(o.e) ? `${l2}: ${fmt(o.e)}` : ''].filter(Boolean).join(' · ');
    }
    default: return hasValue(v) ? withDetail(String(v)) : '';
  }
}
