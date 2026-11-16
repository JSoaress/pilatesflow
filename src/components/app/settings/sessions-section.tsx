'use client';
import * as React from 'react';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { logoutAction } from '@/lib/actions/auth';

/** Não há uma API de listagem de sessões no Supabase Auth; a opção segura e
 *  disponível é encerrar todas de uma vez (equivalente a trocar a senha). */
export function SessionsSection() {
  const [pending, start] = React.useTransition();
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Se você acha que outra pessoa pode ter acesso à sua conta, encerre todas as sessões ativas em qualquer dispositivo. Você precisará entrar novamente.</p>
      <Button variant="destructive" loading={pending} onClick={() => start(() => logoutAction('global'))}>
        <LogOut />Sair de todos os dispositivos
      </Button>
    </div>
  );
}
