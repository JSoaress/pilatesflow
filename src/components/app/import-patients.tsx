'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, Td, Th, Tr, StatCard } from '@/components/ui/misc';
import { previewImport, confirmImport, type ImportRow } from '@/lib/actions/import';

/** Importação de alunos (CSV/XLSX) com pré-visualização obrigatória antes de gravar. */
export function ImportPatients() {
  const router = useRouter();
  const [rows, setRows] = React.useState<ImportRow[] | null>(null);
  const [summary, setSummary] = React.useState<{ total: number; valid: number; errors: number; duplicates: number } | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [filter, setFilter] = React.useState<'all' | 'valid' | 'errors' | 'dup'>('all');

  const onFile = async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    setLoading(true);
    const r = await previewImport(fd);
    setLoading(false);
    if (!r.ok) { toast.error(r.error); return; }
    setRows(r.data!.rows);
    setSummary(r.data!.summary);
  };

  const shown = (rows ?? []).filter((r) => filter === 'all' || (filter === 'valid' && !r.errors.length && !r.duplicate) || (filter === 'errors' && r.errors.length) || (filter === 'dup' && r.duplicate));

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-dashed p-6 text-center">
        <FileSpreadsheet className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-2 text-sm">Colunas reconhecidas: <b>nome</b>, telefone, whatsapp, email, cpf, data_nascimento, sexo, profissão, cep, endereço, número, bairro, cidade, uf, status, observações.</p>
        <p className="mt-1 text-xs text-muted-foreground">Datas no formato DD/MM/AAAA. Arquivo .csv (separado por ; ou ,) ou .xlsx, até 5 MB.</p>
        <label className="mt-4 inline-flex">
          <input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
          <span className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <Upload className="h-4 w-4" /> {loading ? 'Lendo arquivo…' : 'Selecionar planilha'}
          </span>
        </label>
        <p className="mt-3 text-xs"><a className="text-primary underline" href="data:text/csv;charset=utf-8,nome;telefone;email;cpf;data_nascimento;status%0AMaria Exemplo;(11) 90000-0000;maria@exemplo.com;;15/03/1985;ativo" download="modelo-alunos.csv">Baixar modelo CSV</a></p>
      </div>

      {summary && rows && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <button onClick={() => setFilter('all')} className="text-left"><StatCard label="Linhas" value={summary.total} /></button>
            <button onClick={() => setFilter('valid')} className="text-left"><StatCard label="Válidas" value={summary.valid} icon={CheckCircle2} tone="success" /></button>
            <button onClick={() => setFilter('errors')} className="text-left"><StatCard label="Com erros" value={summary.errors} icon={AlertTriangle} tone="danger" /></button>
            <button onClick={() => setFilter('dup')} className="text-left"><StatCard label="Duplicadas" value={summary.duplicates} icon={Copy} tone="warning" /></button>
          </div>
          <Table>
            <thead><tr><Th>Linha</Th><Th>Nome</Th><Th>Telefone</Th><Th>E-mail</Th><Th>Situação</Th></tr></thead>
            <tbody>
              {shown.slice(0, 300).map((r) => (
                <Tr key={r.line}>
                  <Td className="tabular-nums text-muted-foreground">{r.line}</Td>
                  <Td>{String(r.data.full_name ?? '—')}</Td>
                  <Td>{String(r.data.phone ?? '—')}</Td>
                  <Td>{String(r.data.email ?? '—')}</Td>
                  <Td>
                    {r.errors.length ? <span className="text-xs text-destructive">{r.errors.join(' ')}</span>
                      : r.duplicate ? <Badge variant="warning">{r.duplicate}</Badge> : <Badge variant="success">Pronta</Badge>}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          {shown.length > 300 && <p className="text-xs text-muted-foreground">Mostrando 300 de {shown.length} linhas.</p>}
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={!summary.valid} loading={saving} onClick={async () => {
              setSaving(true);
              const r = await confirmImport(rows.filter((x) => !x.errors.length && !x.duplicate).map((x) => x.data));
              setSaving(false);
              if (!r.ok) { toast.error(r.error); return; }
              toast.success(`${r.data?.imported ?? 0} aluno(s) importado(s).`);
              setRows(null); setSummary(null);
              router.refresh();
            }}>Confirmar importação de {summary.valid} aluno(s)</Button>
            <Button variant="outline" onClick={() => { setRows(null); setSummary(null); }}>Cancelar</Button>
            <span className="text-xs text-muted-foreground">Linhas com erro ou duplicadas não serão importadas.</span>
          </div>
        </>
      )}
    </div>
  );
}
