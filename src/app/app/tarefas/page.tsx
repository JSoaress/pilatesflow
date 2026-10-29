import Link from 'next/link';
import { requirePermission } from '@/lib/auth/context';
import { PageHeader, ErrorState } from '@/components/ui/misc';
import { TasksClient } from '@/components/app/tasks-client';
import { getResourceDef } from '@/lib/resources/defs';
import { listResource, loadRefOptions } from '@/lib/resources/server';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Tarefas' };

export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requirePermission('tasks.view');
  const sp = await searchParams;
  const def = getResourceDef('tasks');
  const filters: Record<string, string> = {};
  if (sp.minhas === '1') filters.assignee_id = ctx.user.id;
  filters.status = sp.status ?? 'open';
  if (filters.status === 'todas') delete filters.status;
  try {
    const [list, refOptions] = await Promise.all([listResource(ctx, 'tasks', { q: sp.q, page: Number(sp.p ?? 1) || 1, filters }), loadRefOptions(ctx, def)]);
    const chip = (k: string, v: string | null, l: string) => {
      const n = new URLSearchParams(sp as Record<string, string>);
      if (v === null) n.delete(k); else n.set(k, v);
      const active = (sp[k] ?? (k === 'status' ? 'open' : null)) === v;
      return <Link key={k + v} href={`/app/tarefas?${n.toString()}`} className={cn('rounded-full border px-3 py-1 text-sm', active ? 'border-primary bg-primary-soft text-primary' : 'hover:bg-muted')}>{l}</Link>;
    };
    return (
      <>
        <PageHeader title="Tarefas" description="Pequenas tarefas administrativas: ligar, cobrar, renovar contrato, solicitar manutenção…" />
        <div className="mb-4 flex flex-wrap gap-2">
          {chip('status', 'open', 'Abertas')}{chip('status', 'in_progress', 'Em andamento')}{chip('status', 'done', 'Concluídas')}{chip('status', 'todas', 'Todas')}
          <span className="mx-1 border-l" />
          {chip('minhas', '1', 'Somente minhas')}{chip('minhas', null, 'De todos')}
        </div>
        <TasksClient def={def} rows={list.rows} total={list.total} page={list.page} pageSize={list.pageSize} refOptions={refOptions} tz={ctx.tz}
          can={{ create: ctx.can('tasks.create'), edit: ctx.can('tasks.edit'), delete: ctx.can('tasks.delete') }} />
      </>
    );
  } catch { return <ErrorState />; }
}
