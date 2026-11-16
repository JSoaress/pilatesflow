'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { saveIntegration } from '@/lib/actions/settings';

const VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = { connected: 'success', config_required: 'warning', error: 'danger', not_connected: 'neutral' };
const LABEL: Record<string, string> = { connected: 'Conectado', config_required: 'Configuração necessária', error: 'Erro', not_connected: 'Não conectado' };

export function IntegrationCard({ provider, name, desc, envVars, status, enabled, hasCreds, lastError, canEdit, soon }: {
  provider: string; name: string; desc: string; envVars: string[]; status: string; enabled: boolean; hasCreds: boolean; lastError: string | null; canEdit: boolean; soon?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const toggle = async (on: boolean) => {
    setBusy(true);
    const r = await saveIntegration(provider, { enabled: on, config: {} });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    const st = (r.data as { status: string }).status;
    toast[st === 'connected' ? 'success' : st === 'config_required' ? 'warning' : 'message'](st === 'connected' ? `${name} ativado.` : st === 'config_required' ? 'Faltam as credenciais no servidor (variáveis de ambiente).' : `${name} desativado.`);
    router.refresh();
  };
  return (
    <div className="flex flex-col rounded-xl border bg-card p-5 shadow-soft">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium">{name}</p>
        <Badge variant={VARIANT[status] ?? 'neutral'}>{LABEL[status] ?? status}</Badge>
      </div>
      <p className="mt-1 flex-1 text-sm text-muted-foreground">{desc}</p>
      {lastError && status !== 'connected' && <p className="mt-2 text-xs text-destructive">{lastError}</p>}
      <p className="mt-3 text-xs text-muted-foreground">Credenciais no servidor: {hasCreds ? <span className="text-success">encontradas</span> : <span>ausentes</span>}{envVars.length > 0 && <> · <code className="text-[11px]">{envVars.join(', ')}</code></>}</p>
      {canEdit && !soon && (
        <div className="mt-3">
          {enabled ? <Button size="sm" variant="outline" loading={busy} onClick={() => toggle(false)}>Desativar</Button>
            : <Button size="sm" loading={busy} onClick={() => toggle(true)}>Ativar</Button>}
        </div>
      )}
      {soon && <p className="mt-3 text-xs text-muted-foreground">Integração preparada; requer contrato com o parceiro.</p>}
    </div>
  );
}
