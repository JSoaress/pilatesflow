'use client';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { portalLeaveWaitlist } from '@/lib/actions/portal';

export function LeaveWaitlistButton({ id }: { id: string }) {
  const router = useRouter();
  return <Button size="sm" variant="ghost" onClick={async () => { const r = await portalLeaveWaitlist(id); if (r.ok) { toast.success('Você saiu da lista de espera.'); router.refresh(); } else toast.error(r.error); }}>Sair da lista</Button>;
}
