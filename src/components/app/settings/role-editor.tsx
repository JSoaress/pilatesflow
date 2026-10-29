'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Save, Trash2, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Field, Input } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/confirm';
import { saveRole, deleteRole } from '@/lib/actions/staff';
import { cn } from '@/lib/utils';

type Role = { id: string; key: string; name: string; description: string | null; is_system: boolean };
type Perm = { key: string; module: string; action: string; module_label: string; action_label: string; is_sensitive: boolean };

export function RoleEditor({ roles, permissions, rolePerms, memberCounts, canManage }: { roles: Role[]; permissions: Perm[]; rolePerms: Record<string, string[]>; memberCounts: Record<string, number>; canManage: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [selected, setSelected] = React.useState<string | 'new'>(roles[0]?.id ?? 'new');
  const role = roles.find((r) => r.id === selected) ?? null;
  const [name, setName] = React.useState(role?.name ?? '');
  const [desc, setDesc] = React.useState(role?.description ?? '');
  const [set, setSet] = React.useState<Set<string>>(new Set(role ? rolePerms[role.id] ?? [] : []));
  const [pending, start] = React.useTransition();
  React.useEffect(() => {
    const r = roles.find((x) => x.id === selected);
    setName(r?.name ?? ''); setDesc(r?.description ?? ''); setSet(new Set(r ? rolePerms[r.id] ?? [] : []));
  }, [selected, roles, rolePerms]);

  const isOwner = role?.key === 'owner';
  const locked = !canManage || isOwner;
  const modules = React.useMemo(() => {
    const m = new Map<string, { label: string; perms: Perm[] }>();
    for (const p of permissions) { if (!m.has(p.module)) m.set(p.module, { label: p.module_label, perms: [] }); m.get(p.module)!.perms.push(p); }
    return [...m.entries()];
  }, [permissions]);
  const toggle = (k: string) => setSet((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else { n.add(k); const mod = k.split('.')[0]; if (!k.endsWith('.view') && permissions.some((p) => p.key === `${mod}.view`)) n.add(`${mod}.view`); } return n; });
  const toggleModule = (perms: Perm[]) => setSet((s) => { const n = new Set(s); const all = perms.every((p) => n.has(p.key)); perms.forEach((p) => (all ? n.delete(p.key) : n.add(p.key))); return n; });

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <aside className="space-y-1">
        {roles.map((r) => (
          <button key={r.id} type="button" onClick={() => setSelected(r.id)} className={cn('flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm', selected === r.id ? 'bg-primary-soft text-primary' : 'hover:bg-muted')}>
            <span className="truncate">{r.name}</span>
            <span className="flex items-center gap-1.5">{!r.is_system && <Badge variant="outline">personalizado</Badge>}<span className="text-xs text-muted-foreground">{memberCounts[r.id] ?? 0}</span></span>
          </button>
        ))}
        {canManage && <Button variant="outline" className="mt-2 w-full" onClick={() => setSelected('new')}><Plus />Novo perfil</Button>}
      </aside>

      <form className="space-y-5 rounded-xl border bg-card p-5" onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveRole(selected === 'new' ? null : selected, { name, description: desc, permissions: [...set] });
          if (!r.ok) { toast.error(r.error); return; }
          toast.success('Perfil salvo.');
          if (selected === 'new' && r.data) setSelected((r.data as { id: string }).id);
          router.refresh();
        });
      }}>
        {isOwner && <p className="flex items-center gap-2 rounded-lg bg-info-soft p-3 text-sm text-info"><ShieldAlert className="h-4 w-4" />O Proprietário tem acesso total e não pode ser alterado.</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome do perfil" htmlFor="role-name" required><Input id="role-name" value={name} onChange={(e) => setName(e.target.value)} disabled={locked} required /></Field>
          <Field label="Descrição" htmlFor="role-desc"><Input id="role-desc" value={desc} onChange={(e) => setDesc(e.target.value)} disabled={locked} /></Field>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left"><th className="py-2 pr-4 font-medium">Módulo</th><th className="py-2 font-medium">Permissões</th></tr></thead>
            <tbody>
              {modules.map(([mod, { label, perms }]) => (
                <tr key={mod} className="border-b last:border-0 align-top">
                  <td className="py-2.5 pr-4">
                    <button type="button" disabled={locked} onClick={() => toggleModule(perms)} className="text-left font-medium hover:text-primary disabled:hover:text-current">{label}</button>
                    {perms.some((p) => p.is_sensitive) && <span className="ml-1 text-xs text-warning" title="Contém permissões sensíveis">●</span>}
                  </td>
                  <td className="py-2.5">
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {perms.map((p) => (
                        <label key={p.key} className={cn('inline-flex items-center gap-1.5', locked && 'opacity-70')}>
                          <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={isOwner || set.has(p.key)} disabled={locked} onChange={() => toggle(p.key)} />
                          <span className={cn(p.is_sensitive && 'text-warning')}>{p.action_label}</span>
                        </label>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!locked && (
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={pending}><Save />Salvar perfil</Button>
            {role && !role.is_system && (
              <Button type="button" variant="ghost" className="text-destructive" onClick={async () => {
                if (!(await confirm({ title: `Excluir o perfil "${role.name}"?`, description: 'Somente perfis sem usuários podem ser excluídos.', confirmLabel: 'Excluir', destructive: true })).confirmed) return;
                const r = await deleteRole(role.id);
                if (r.ok) { toast.success('Perfil excluído.'); setSelected(roles[0]?.id ?? 'new'); router.refresh(); } else toast.error(r.error);
              }}><Trash2 />Excluir</Button>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
