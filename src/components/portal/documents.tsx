'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input, Checkbox } from '@/components/ui/input';
import { portalAcceptContract, portalSignDocument, portalSubmitAnamnesis } from '@/lib/actions/portal';
import { AnamnesisForm, type Question } from '@/components/app/clinical/anamnesis-form';

/** Aceite eletrônico simples (registra nome, data, hora e IP). Para assinatura com validade ICP-Brasil, integre um provedor. */
export function AcceptDocument({ kind, id }: { kind: 'contract' | 'document'; id: string }) {
  const router = useRouter();
  const [name, setName] = React.useState('');
  const [agree, setAgree] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  return (
    <div className="w-full space-y-2 rounded-lg border bg-muted/30 p-3">
      <Checkbox checked={agree} onChange={(e) => setAgree(e.target.checked)} label="Li e concordo com o conteúdo acima." />
      <div className="flex flex-wrap gap-2">
        <Input placeholder="Digite seu nome completo" aria-label="Nome completo" value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" />
        <Button disabled={!agree || name.trim().length < 5} loading={pending} onClick={async () => {
          setPending(true);
          const r = kind === 'contract' ? await portalAcceptContract(id, name) : await portalSignDocument(id, name);
          setPending(false);
          if (r.ok) { toast.success('Aceite registrado. Obrigado!'); router.refresh(); } else toast.error(r.error);
        }}>{kind === 'contract' ? 'Aceitar contrato' : 'Assinar'}</Button>
      </div>
    </div>
  );
}

export function PortalAnamnesis({ id, questions }: { id: string; questions: Question[] }) {
  const router = useRouter();
  return (
    <AnamnesisForm questions={questions} onSubmit={async (answers, sig) => {
      const r = await portalSubmitAnamnesis(id, answers, sig);
      if (!r.ok) { toast.error(r.error); return false; }
      toast.success('Anamnese enviada. Obrigado!');
      router.refresh();
      return true;
    }} />
  );
}
