import { requirePermission } from '@/lib/auth/context';
import { PageHeader, ErrorState } from '@/components/ui/misc';
import { MembersManager } from '@/components/app/settings/members';

export const metadata = { title: 'Usuários' };

export default async function UsersPage() {
  const ctx = await requirePermission('users.view');
  const [members, roles, mu, staff] = await Promise.all([
    ctx.supabase.from('organization_members').select('id, user_id, role_id, status, all_units, created_at, profile:profiles(full_name, email)').eq('organization_id', ctx.org.id).order('created_at'),
    ctx.supabase.from('roles').select('id, key, name').eq('organization_id', ctx.org.id).neq('key', 'patient').order('name'),
    ctx.supabase.from('member_units').select('member_id, unit_id, organization_members!inner(organization_id)').eq('organization_members.organization_id', ctx.org.id),
    ctx.supabase.from('staff').select('id, full_name, user_id').eq('organization_id', ctx.org.id).is('deleted_at', null).order('full_name'),
  ]);
  if (members.error) return <ErrorState description={members.error.message} />;
  const unitsBy: Record<string, string[]> = {};
  for (const r of (mu.data ?? []) as any[]) (unitsBy[r.member_id] ??= []).push(r.unit_id);
  const roleMap = Object.fromEntries(((roles.data ?? []) as any[]).map((r) => [r.id, r]));
  const rows = ((members.data ?? []) as any[]).filter((m) => roleMap[m.role_id]).map((m) => ({ ...m, unit_ids: unitsBy[m.id] ?? [] }));
  return (
    <>
      <PageHeader title="Usuários da equipe" description="Cada usuário acessa somente o que o perfil permite e apenas as unidades selecionadas. Alunos acessam pelo portal (convite na ficha do aluno)." />
      <MembersManager members={rows} roles={(roles.data ?? []) as any[]} units={ctx.units} staff={((staff.data ?? []) as any[]).filter((s) => !s.user_id)} canManage={ctx.can('users.manage')} me={ctx.user.id} tz={ctx.tz} />
    </>
  );
}
