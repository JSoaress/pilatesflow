'use client';
import { useRouter } from 'next/navigation';
import { CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { markNotificationsRead } from '@/lib/actions/shell';

export function MarkAllRead() {
  const router = useRouter();
  return <Button variant="outline" onClick={async () => { await markNotificationsRead(); router.refresh(); }}><CheckCheck /> Marcar todas como lidas</Button>;
}
