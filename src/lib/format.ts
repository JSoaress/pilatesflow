import { TZDate } from '@date-fns/tz';
import { format as dfFormat, formatDistanceToNowStrict } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export const DEFAULT_TZ = 'America/Sao_Paulo';

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const num = new Intl.NumberFormat('pt-BR');

export function money(v: number | string | null | undefined) {
  const n = typeof v === 'string' ? Number(v) : v;
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return brl.format(n);
}

export function number(v: number | string | null | undefined, digits = 0) {
  const n = typeof v === 'string' ? Number(v) : v;
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n);
}

export function percent(v: number | string | null | undefined, digits = 1) {
  const n = typeof v === 'string' ? Number(v) : v;
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: digits }).format(n)}%`;
}

export function int(v: number | null | undefined) {
  return v === null || v === undefined ? '—' : num.format(v);
}

/** Converte qualquer data para o fuso da clínica. */
export function inTz(date: Date | string | number, tz = DEFAULT_TZ) {
  return new TZDate(new Date(date).getTime(), tz);
}

export function fmt(date: Date | string | number | null | undefined, pattern: string, tz = DEFAULT_TZ) {
  if (date === null || date === undefined || date === '') return '—';
  // datas "AAAA-MM-DD" (sem hora) não sofrem conversão de fuso
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, m, d] = date.split('-').map(Number);
    return dfFormat(new Date(y, m - 1, d), pattern, { locale: ptBR });
  }
  return dfFormat(inTz(date, tz), pattern, { locale: ptBR });
}

export const date = (d: Date | string | null | undefined, tz?: string) => fmt(d, 'dd/MM/yyyy', tz);
export const time = (d: Date | string | null | undefined, tz?: string) => fmt(d, 'HH:mm', tz);
export const dateTime = (d: Date | string | null | undefined, tz?: string) => fmt(d, "dd/MM/yyyy 'às' HH:mm", tz);
export const weekdayDate = (d: Date | string | null | undefined, tz?: string) => fmt(d, "EEEE, d 'de' MMMM", tz);

export function relative(d: Date | string | null | undefined) {
  if (!d) return '—';
  return formatDistanceToNowStrict(new Date(d), { locale: ptBR, addSuffix: true });
}

/** "Hoje" no fuso da clínica, em AAAA-MM-DD. */
export function todayISO(tz = DEFAULT_TZ) {
  return dfFormat(inTz(Date.now(), tz), 'yyyy-MM-dd');
}

export function isoDate(d: Date) {
  return dfFormat(d, 'yyyy-MM-dd');
}

/** Converte data local (AAAA-MM-DD) + hora (HH:mm) no fuso da clínica para ISO UTC. */
export function localToISO(dateStr: string, timeStr: string, tz = DEFAULT_TZ) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  return new TZDate(y, m - 1, d, hh, mm, 0, tz).toISOString();
}

export function addDaysISO(dateStr: string, days: number) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function ageFrom(birth: string | null | undefined) {
  if (!birth) return null;
  const b = new Date(birth + 'T12:00:00');
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

export const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
