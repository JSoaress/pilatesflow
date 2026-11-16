-- =====================================================================
-- Metas corporais do aluno (usadas no corpo 3D "Meta")
-- { weight_kg, waist, abdomen, hip, chest, arm_right, thigh_right,
--   head_forward_cm, shoulder_diff_cm, pelvis_diff_cm, thoracic_kyphosis_deg, lumbar_lordosis_deg,
--   target_date, note, set_by, set_at }
-- =====================================================================
alter table public.patients add column if not exists body_goals jsonb;

-- Portal: inclui a meta definida pela equipe
create or replace function public.portal_body_evolution(p_patient_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare pt patients%rowtype := private.portal_patient(p_patient_id);
  v_keys text[] := array['chest','waist','abdomen','hip','arm_right','thigh_right','head_forward_cm','shoulder_diff_cm',
                         'pelvis_diff_cm','thoracic_kyphosis_deg','lumbar_lordosis_deg'];
begin
  return jsonb_build_object(
    'sex', pt.gender,
    'goals', pt.body_goals,
    'better', (select coalesce(jsonb_object_agg(key, higher_is_better), '{}') from assessment_fields
                where organization_id = pt.organization_id and key = any (v_keys)),
    'history', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'date', a.assessed_on, 'height_cm', a.height_cm,
                  'weight_kg', a.weight_kg, 'data', (select coalesce(jsonb_object_agg(k, a.data -> k), '{}') from unnest(v_keys) k where a.data ? k))
                  order by a.assessed_on), '[]')
                from assessments a where a.patient_id = pt.id and a.status = 'finalized')
  );
end $$;
revoke execute on function public.portal_body_evolution(uuid) from anon, public;
grant execute on function public.portal_body_evolution(uuid) to authenticated;

-- Meta de demonstração (aluno com 3 avaliações)
update patients p set body_goals = jsonb_build_object('weight_kg', 78, 'waist', 86, 'abdomen', 89, 'head_forward_cm', 1.5,
  'thoracic_kyphosis_deg', 38, 'lumbar_lordosis_deg', 42, 'note', 'Meta combinada na reavaliação.')
 where p.body_goals is null and exists (select 1 from organizations o where o.id = p.organization_id and o.slug = 'studio-movimento')
   and (select count(*) from assessments a where a.patient_id = p.id) >= 3;
