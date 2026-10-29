import 'server-only';
import { getAppContext } from '@/lib/auth/context';
import { getResourceDef } from '@/lib/resources/defs';
import { listResource, loadRefOptions } from '@/lib/resources/server';
import { NoPermission, ErrorState } from '@/components/ui/misc';
import { ResourceManager } from './resource-manager';
import { captureException } from '@/lib/observability';

const has = (can: (p: string) => boolean, p: string | string[] | undefined) => !!p && (Array.isArray(p) ? p : [p]).some(can);

/** Componente de servidor: carrega dados do cadastro e renderiza o gerenciador. */
export async function ResourceSection({ resource, searchParams, fixed, compact, hideSearch, onRowClick, filters }: {
  resource: string; searchParams?: Record<string, string | string[] | undefined>; fixed?: Record<string, string>;
  compact?: boolean; hideSearch?: boolean; onRowClick?: string; filters?: Record<string, string>;
}) {
  const ctx = await getAppContext();
  const def = getResourceDef(resource);
  if (!has(ctx.can, def.perms.view)) return <NoPermission />;
  const page = Number(searchParams?.p ?? 1) || 1;
  const q = typeof searchParams?.q === 'string' ? searchParams.q : undefined;
  try {
    const [list, refOptions] = await Promise.all([
      listResource(ctx, resource, { q, page, parent: fixed, filters }),
      loadRefOptions(ctx, def),
    ]);
    return (
      <ResourceManager
        def={def} rows={list.rows} total={list.total} page={list.page} pageSize={list.pageSize} refOptions={refOptions} tz={ctx.tz}
        can={{ create: ctx.can(def.perms.create), edit: ctx.can(def.perms.edit), delete: has(ctx.can, def.perms.delete) }}
        fixed={fixed} compact={compact} hideSearch={hideSearch} onRowClick={onRowClick}
      />
    );
  } catch (e) {
    captureException(e, { resource });
    return <ErrorState />;
  }
}
