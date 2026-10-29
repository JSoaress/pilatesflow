'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Checkbox } from '@/components/ui/input';
import { Table, Th, Td, Tr, Avatar, EmptyState } from '@/components/ui/misc';
import { useConfirm } from '@/components/ui/confirm';
import { inviteMember, updateMember, removeMember } from '@/lib/actions/staff';
import { date } from '@/lib/format';

type Member = { id: string; user_id: string; role_id: string; status: string; all_units: boolean; created_at: string; unit_ids: string[]; profile: { full_name: string | null; email: string | null } | null };
type Role = { id: string; key: string; name: string };

const STATUS: Record<string, { l: string; v: 'success' | 'warning' | 'neutral' }> = { active: { l: 'Ativo', v: 'success' }, invited: { l: 'Convidado', v: 'warning' }, suspended: { l: 'Suspenso', v: 'neutral' } };

export function MembersManager({ members, roles, units, staff, canManage, me, tz }: { members: Member[]; roles: Role[]; units: { id: string; name: string }[]; staff: { id: string; full_name: string }[]; canManage: boolean; me: string; tz: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [invite, setInvite] = React.useState(false);
  const [edit, setEdit] = React.useState<Member | null>(null);
  const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? '—';
  return (
    <div className="space-y-4">
      {canManage && <Button onClick={() => setInvite(true)}><UserPlus />Convidar usuário</Button>}
      {members.length === 0 ? <EmptyState title="Nenhum usuário" /> : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <thead><tr><Th>Usuário</Th><Th>Perfil</Th><Th>Unidades</Th><Th>Status</Th><Th>Desde</Th><Th className="w-24" /></tr></thead>
            <tbody>
              {members.map((m) => (
                <Tr key={m.id}>
                  <Td><div className="flex items-center gap-3"><Avatar name={m.profile?.full_name ?? m.profile?.email} size={32} /><div><p className="font-medium">{m.profile?.full_name ?? '—'}{m.user_id === me && <span className="ml-1 text-xs text-muted-foreground">(você)</span>}</p><p className="text-xs text-muted-foreground">{m.profile?.email}</p></div></div></Td>
                  <Td>{roleName(m.role_id)}</Td>
                  <Td className="text-sm">{m.all_units || m.unit_ids.length === 0 ? 'Todas' : m.unit_ids.map((u) => units.find((x) => x.id === u)?.name).filter(Boolean).join(', ')}</Td>
                  <Td><Badge variant={STATUS[m.status]?.v ?? 'neutral'}>{STATUS[m.status]?.l ?? m.status}</Badge></Td>
                  <Td>{date(m.created_at, tz)}</Td>
                  <Td>
                    {canManage && m.user_id !== me && (
                      <div className="flex justify-end gap-1">
                        <Button size="icon-sm" variant="ghost" aria-label="Editar" onClick={() => setEdit(m)}><Pencil /></Button>
                        <Button size="icon-sm" variant="ghost" aria-label="Remover acesso" className="text-destructive" onClick={async () => {
                          if (!(await confirm({ title: `Remover o acesso de ${m.profile?.full_name ?? m.profile?.email}?`, description: 'O usuário deixará de acessar esta clínica. O histórico e a auditoria são mantidos.', confirmLabel: 'Remover acesso', destructive: true })).confirmed) return;
                          const r = await removeMember(m.id);
                          if (r.ok) { toast.success('Acesso removido.'); router.refresh(); } else toast.error(r.error);
                        }}><Trash2 /></Button>
                      </div>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
      {invite && <MemberDialog mode="invite" roles={roles} units={units} staff={staff} onClose={() => setInvite(false)} />}
      {edit && <MemberDialog mode="edit" member={edit} roles={roles} units={units} staff={staff} onClose={() => setEdit(null)} />}
    </div>
  );
}

function MemberDialog({ mode, member, roles, units, staff, onClose }: { mode: 'invite' | 'edit'; member?: Member; roles: Role[]; units: { id: string; name: string }[]; staff: { id: string; full_name: string }[]; onClose: () => void }) {
  const router = useRouter();
  const [v, setV] = React.useState({ email: '', full_name: '', role_id: member?.role_id ?? roles.find((r) => r.key === 'receptionist')?.id ?? roles[0]?.id ?? '', status: (member?.status === 'suspended' ? 'suspended' : 'active') as 'active' | 'suspended', unit_ids: member?.all_units ? [] : member?.unit_ids ?? [], staff_id: '' });
  const [pending, start] = React.useTransition();
  const toggleUnit = (id: string) => setV((s) => ({ ...s, unit_ids: s.unit_ids.includes(id) ? s.unit_ids.filter((x) => x !== id) : [...s.unit_ids, id] }));
  const submit = () => start(async (): Promise<void> => {
    const r = mode === 'invite'
      ? await inviteMember({ email: v.email, full_name: v.full_name, role_id: v.role_id, unit_ids: v.unit_ids, staff_id: v.staff_id || null })
      : await updateMember(member!.id, { role_id: v.role_id, status: v.status, unit_ids: v.unit_ids });
    if (!r.ok) { toast.error(r.error); return; }
    toast.success((r.data as { message?: string } | undefined)?.message ?? 'Usuário atualizado.');
    onClose(); router.refresh();
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={mode === 'invite' ? 'Convidar usuário' : 'Editar acesso'}
      description={mode === 'invite' ? 'A pessoa recebe um e-mail para definir a senha. O envio usa o e-mail configurado no Supabase Auth.' : member?.profile?.email}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button loading={pending} onClick={submit}>{mode === 'invite' ? 'Enviar convite' : 'Salvar'}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        {mode === 'invite' && <>
          <Field label="Nome" htmlFor="mb-name" required><Input id="mb-name" value={v.full_name} onChange={(e) => setV({ ...v, full_name: e.target.value })} /></Field>
          <Field label="E-mail" htmlFor="mb-email" required><Input id="mb-email" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></Field>
        </>}
        <Field label="Perfil de acesso" htmlFor="mb-role" required><Select id="mb-role" value={v.role_id} onChange={(e) => setV({ ...v, role_id: e.target.value })}>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
        {mode === 'edit' ? (
          <Field label="Status" htmlFor="mb-status"><Select id="mb-status" value={v.status} onChange={(e) => setV({ ...v, status: e.target.value as 'active' | 'suspended' })}><option value="active">Ativo</option><option value="suspended">Suspenso (sem acesso)</option></Select></Field>
        ) : staff.length > 0 ? (
          <Field label="Vincular ao profissional" htmlFor="mb-staff" hint="Para que veja a própria agenda e assine evoluções."><Select id="mb-staff" value={v.staff_id} onChange={(e) => setV({ ...v, staff_id: e.target.value })}><option value="">Não vincular</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</Select></Field>
        ) : null}
        {units.length > 1 && (
          <fieldset className="sm:col-span-2">
            <legend className="mb-2 text-sm font-medium">Unidades com acesso</legend>
            <p className="mb-2 text-xs text-muted-foreground">Nenhuma marcada = todas as unidades.</p>
            <div className="flex flex-wrap gap-x-4">{units.map((u) => <Checkbox key={u.id} checked={v.unit_ids.includes(u.id)} onChange={() => toggleUnit(u.id)} label={u.name} />)}</div>
          </fieldset>
        )}
      </div>
    </Dialog>
  );
}
