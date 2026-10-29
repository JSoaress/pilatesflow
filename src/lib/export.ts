import 'server-only';
import ExcelJS from 'exceljs';

export type Col = { key: string; header: string; width?: number; format?: 'money' | 'date' | 'datetime' };

/** Gera XLSX ou CSV (separador ;, compatível com Excel pt-BR). */
export async function exportTable(rows: Record<string, unknown>[], cols: Col[], format: 'xlsx' | 'csv', name: string) {
  const filename = `${name}-${new Date().toISOString().slice(0, 10)}.${format}`;
  if (format === 'csv') {
    const esc = (v: unknown) => { const s = v === null || v === undefined ? '' : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const body = [cols.map((c) => esc(c.header)).join(';'), ...rows.map((r) => cols.map((c) => esc(fmt(r[c.key], c.format))).join(';'))].join('\r\n');
    return new Response('﻿' + body, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'private, no-store' } });
  }
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PilatesFlow';
  const ws = wb.addWorksheet(name.slice(0, 30));
  ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 20 }));
  ws.getRow(1).font = { bold: true };
  for (const r of rows) {
    const row: Record<string, unknown> = {};
    for (const c of cols) {
      const v = r[c.key];
      row[c.key] = c.format === 'money' ? (v === null || v === undefined ? null : Number(v)) : c.format === 'date' || c.format === 'datetime' ? (v ? new Date(String(v).length === 10 ? `${v}T12:00:00` : String(v)) : null) : v;
    }
    ws.addRow(row);
  }
  cols.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    if (c.format === 'money') col.numFmt = '"R$" #,##0.00';
    if (c.format === 'date') col.numFmt = 'dd/mm/yyyy';
    if (c.format === 'datetime') col.numFmt = 'dd/mm/yyyy hh:mm';
  });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'private, no-store' } });
}

function fmt(v: unknown, f?: Col['format']) {
  if (v === null || v === undefined) return '';
  if (f === 'money') return Number(v).toFixed(2).replace('.', ',');
  if (f === 'date') return String(v).slice(0, 10).split('-').reverse().join('/');
  if (f === 'datetime') return new Date(String(v)).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}
