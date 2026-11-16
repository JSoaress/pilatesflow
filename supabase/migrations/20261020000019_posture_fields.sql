-- =====================================================================
-- Campos de medida usados pelo modelo 3D de evolução corporal
--   chest (tórax) e medidas posturais simples (opcionais).
-- Valores ausentes são estimados no visualizador e marcados como "estimado".
-- =====================================================================
create or replace function private.add_body3d_fields(p_org uuid) returns void
language sql security definer set search_path = public as $$
  insert into assessment_fields (organization_id, section, key, label, unit, higher_is_better, sort_order) values
    (p_org, 'circumferences', 'chest', 'Tórax', 'cm', null, 9),
    (p_org, 'posture', 'head_forward_cm', 'Anteriorização da cabeça (distância do lóbulo da orelha à linha do ombro)', 'cm', false, 60),
    (p_org, 'posture', 'shoulder_diff_cm', 'Desnível dos ombros (+ direito mais alto, − esquerdo)', 'cm', null, 61),
    (p_org, 'posture', 'pelvis_diff_cm', 'Desnível da pelve (+ direita mais alta, − esquerda)', 'cm', null, 62),
    (p_org, 'posture', 'thoracic_kyphosis_deg', 'Cifose torácica', '°', null, 63),
    (p_org, 'posture', 'lumbar_lordosis_deg', 'Lordose lombar', '°', null, 64)
  on conflict (organization_id, key) do nothing
$$;

select private.add_body3d_fields(id) from organizations;

-- novas clínicas recebem os campos automaticamente
create or replace function private.trg_org_body3d_fields() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform private.add_body3d_fields(new.id);
  return new;
end $$;
create trigger trg_org_body3d_fields after insert on public.organizations
  for each row execute function private.trg_org_body3d_fields();

-- Portal do aluno: evolução corporal (somente avaliações FINALIZADAS e somente medidas corporais;
-- observações clínicas, conclusões e fotos não são expostas)
create or replace function public.portal_body_evolution(p_patient_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare pt patients%rowtype := private.portal_patient(p_patient_id);
  v_keys text[] := array['chest','waist','abdomen','hip','arm_right','thigh_right','head_forward_cm','shoulder_diff_cm',
                         'pelvis_diff_cm','thoracic_kyphosis_deg','lumbar_lordosis_deg'];
begin
  return jsonb_build_object(
    'sex', pt.gender,
    'better', (select coalesce(jsonb_object_agg(key, higher_is_better), '{}') from assessment_fields
                where organization_id = pt.organization_id and key = any (v_keys)),
    'history', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'date', a.assessed_on, 'height_cm', a.height_cm,
                  'weight_kg', a.weight_kg, 'data', (select coalesce(jsonb_object_agg(k, a.data -> k), '{}') from unnest(v_keys) k where a.data ? k))
                  order by a.assessed_on), '[]')
                from assessments a where a.patient_id = pt.id and a.status = 'finalized')
  );
end $$;

-- (também garantido em 0099; repetido aqui para bancos que já tinham aplicado as migrations anteriores)
revoke execute on function public.portal_body_evolution(uuid) from anon, public;
grant execute on function public.portal_body_evolution(uuid) to authenticated;
revoke execute on function private.add_body3d_fields(uuid), private.trg_org_body3d_fields() from public, anon, authenticated;
