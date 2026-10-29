import { requirePermission } from '@/lib/auth/context';
import { PageHeader, ErrorState } from '@/components/ui/misc';
import { RoleEditor } from '@/components/app/settings/role-editor';

export const metadata = { title: 'Perfis e permissões' };

export default async function RolesPage() {
  const ctx = await requirePermission('users.view');
  const [roles, perms, rp, members] = await Promise.all([
    ctx.supabase.from('roles').select('id, key, name, description, is_system').eq('organization_id', ctx.org.id).order('is_system', { ascending: false }).order('name'),
    ctx.supabase.from('permissions').select('key, module, action, module_label, action_label, is_sensitive, sort_order').order('sort_order'),
    ctx.supabase.from('role_permissions').select('role_id, permission_key, roles!inner(organization_id)').eq('roles.organization_id', ctx.org.id),
    ctx.supabase.from('organization_members').select('role_id').eq('organization_id', ctx.org.id),
  ]);
  if (roles.error || perms.error) return <ErrorState />;
  const byRole: Record<string, string[]> = {};
  for (const r of (rp.data ?? []) as any[]) (byRole[r.role_id] ??= []).push(r.permission_key);
  const counts: Record<string, number> = {};
  for (const m of (members.data ?? []) as any[]) counts[m.role_id] = (counts[m.role_id] ?? 0) + 1;
  return (
    <>
      <PageHeader title="Perfis e permissões" description="Permissões são verificadas no servidor e no banco (RLS). Itens marcados como sensíveis dão acesso a dados de saúde ou financeiros." />
      <RoleEditor roles={(roles.data ?? []) as any[]} permissions={(perms.data ?? []) as any[]} rolePerms={byRole} memberCounts={counts} canManage={ctx.can('users.manage')} />
    </>
  );
}
