'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Copy, Pencil, Printer, Plus, EyeOff, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { setEvaluationTemplateActive } from '@/lib/actions/evaluation';

type T = { key: string; name: string; specialty: string; description: string; system: boolean; fields: number; active?: boolean };

export function EvaluationTemplatesList({ items, canEdit }: { items: T[]; canEdit: boolean }) {
  const router = useRouter();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">As fichas do sistema são mantidas pelo PilatesFlow. Para adaptar, duplique e edite a cópia. Avaliações já feitas guardam a versão da ficha usada.</p>
        {canEdit && <Link href="/app/configuracoes/fichas/nova"><Button><Plus />Nova ficha</Button></Link>}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((t) => (
          <div key={t.key} className={`flex flex-col rounded-xl border bg-card p-5 shadow-soft ${t.active === false ? 'opacity-60' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <div><p className="font-medium leading-tight">{t.name}</p><p className="text-xs text-muted-foreground">{t.specialty} · {t.fields} itens</p></div>
              {t.system ? <Badge variant="info">Sistema</Badge> : t.active === false ? <Badge variant="neutral">Inativa</Badge> : <Badge variant="success">Própria</Badge>}
            </div>
            <p className="mt-2 flex-1 text-sm text-muted-foreground">{t.description}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a href={`/imprimir/ficha-em-branco/${encodeURIComponent(t.key)}`} target="_blank" rel="noopener"><Button size="sm" variant="outline"><Printer />Em branco</Button></a>
              {canEdit && (t.system
                ? <Link href={`/app/configuracoes/fichas/nova?base=${encodeURIComponent(t.key)}`}><Button size="sm" variant="ghost"><Copy />Duplicar e editar</Button></Link>
                : <>
                  <Link href={`/app/configuracoes/fichas/${t.key}`}><Button size="sm" variant="ghost"><Pencil />Editar</Button></Link>
                  <Link href={`/app/configuracoes/fichas/nova?base=${t.key}`}><Button size="sm" variant="ghost"><Copy />Duplicar</Button></Link>
                  <Button size="sm" variant="ghost" onClick={async () => { const r = await setEvaluationTemplateActive(t.key, t.active === false); if (r.ok) { toast.success(t.active === false ? 'Ficha reativada.' : 'Ficha desativada.'); router.refresh(); } else toast.error(r.error); }}>
                    {t.active === false ? <><Eye />Reativar</> : <><EyeOff />Desativar</>}
                  </Button>
                </>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
