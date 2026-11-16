-- =====================================================================
-- Desempenho: contexto da sessão em UMA chamada (organizações, perfil,
-- permissões, unidades e vínculo de profissional), em vez de 5 consultas.
-- =====================================================================
create or replace function public.app_bootstrap(p_org uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_orgs jsonb; v_org uuid; v_prof profiles%rowtype;
begin
  if v_uid is null then return null; end if;
  v_orgs := public.my_organizations();
  select * into v_prof from profiles where id = v_uid;
  if jsonb_array_length(coalesce(v_orgs, '[]')) = 0 then
    return jsonb_build_object('orgs', '[]'::jsonb, 'profile', to_jsonb(v_prof) - 'mfa_enabled',
      'is_patient', exists (select 1 from patients where user_id = v_uid and deleted_at is null));
  end if;
  select (o ->> 'id')::uuid into v_org from jsonb_array_elements(v_orgs) o
   where (o ->> 'id')::uuid = coalesce(p_org, v_prof.last_organization_id) limit 1;
  if v_org is null then v_org := (v_orgs -> 0 ->> 'id')::uuid; end if;
  return jsonb_build_object(
    'orgs', v_orgs,
    'org_id', v_org,
    'profile', jsonb_build_object('full_name', v_prof.full_name, 'avatar_path', v_prof.avatar_path, 'theme', v_prof.theme),
    'permissions', (select coalesce(jsonb_agg(k), '[]') from public.my_permissions(v_org) k),
    'units', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by created_at), '[]')
                from units where organization_id = v_org and deleted_at is null and is_active and public.has_unit_access(v_org, id)),
    'staff_id', (select id from staff where organization_id = v_org and user_id = v_uid and deleted_at is null limit 1)
  );
end $$;
revoke execute on function public.app_bootstrap(uuid) from anon, public;
grant execute on function public.app_bootstrap(uuid) to authenticated;
