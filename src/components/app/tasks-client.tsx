'use client';
import { useRouter } from 'next/navigation';
import { CheckCircle2, PlayCircle, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ResourceManager, type ResourceManagerProps } from '@/components/resource/resource-manager';
import { setTaskStatus } from '@/lib/actions/tasks';

function TaskActions({ row }: { row: Record<string, any> }) {
  const router = useRouter();
  const go = async (s: 'open' | 'in_progress' | 'done') => { const r = await setTaskStatus(row.id, s); if (r.ok) router.refresh(); else toast.error(r.error); };
  if (row.status === 'done' || row.status === 'cancelled') return <Button size="sm" variant="ghost" onClick={() => go('open')}><RotateCcw /> Reabrir</Button>;
  return (
    <>
      {row.status === 'open' && <Button size="sm" variant="ghost" onClick={() => go('in_progress')}><PlayCircle /> Iniciar</Button>}
      <Button size="sm" variant="soft" onClick={() => go('done')}><CheckCircle2 /> Concluir</Button>
    </>
  );
}

export function TasksClient(props: ResourceManagerProps) {
  return <ResourceManager {...props} rowActions={(row) => <TaskActions row={row} />} />;
}
