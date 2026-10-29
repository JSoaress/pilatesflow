'use client';
import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Dialog } from './dialog';
import { Button } from './button';
import { Textarea, Field } from './input';

type ConfirmOptions = {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  /** exige que o usuário escreva um motivo (ex.: estorno, cancelamento) */
  requireReason?: boolean;
  reasonLabel?: string;
};

type Pending = ConfirmOptions & { resolve: (v: { confirmed: boolean; reason?: string }) => void };
const Ctx = React.createContext<((o: ConfirmOptions) => Promise<{ confirmed: boolean; reason?: string }>) | null>(null);

/** Provedor do diálogo de confirmação para ações críticas. */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = React.useState<Pending | null>(null);
  const [reason, setReason] = React.useState('');
  const confirm = React.useCallback((o: ConfirmOptions) => new Promise<{ confirmed: boolean; reason?: string }>((resolve) => {
    setReason('');
    setPending({ ...o, resolve });
  }), []);
  const close = (confirmed: boolean) => {
    pending?.resolve({ confirmed, reason: reason.trim() || undefined });
    setPending(null);
  };
  return (
    <Ctx.Provider value={confirm}>
      {children}
      <Dialog
        open={!!pending}
        onOpenChange={(o) => !o && close(false)}
        size="sm"
        title={<span className="flex items-center gap-2">{pending?.destructive && <AlertTriangle className="h-5 w-5 text-destructive" />}{pending?.title}</span>}
        footer={
          <>
            <Button variant="outline" onClick={() => close(false)}>Voltar</Button>
            <Button variant={pending?.destructive ? 'destructive' : 'default'} disabled={!!pending?.requireReason && reason.trim().length < 3} onClick={() => close(true)}>
              {pending?.confirmLabel ?? 'Confirmar'}
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-sm text-muted-foreground">
          {pending?.description && <div>{pending.description}</div>}
          {pending?.requireReason && (
            <Field label={pending.reasonLabel ?? 'Motivo'} htmlFor="confirm-reason" required>
              <Textarea id="confirm-reason" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
            </Field>
          )}
        </div>
      </Dialog>
    </Ctx.Provider>
  );
}

export function useConfirm() {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error('useConfirm precisa de <ConfirmProvider>');
  return ctx;
}
