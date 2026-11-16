-- =====================================================================
-- Alinha a permissão de GESTÃO dos modelos de ficha a apenas settings.edit.
--
-- Antes a policy exigia assessments.edit E settings.edit, enquanto a Server Action
-- exigia "qualquer uma" das duas e as rotas exigiam só settings.edit — então quem
-- tinha settings.edit (mas não assessments.edit) entrava no construtor e falhava
-- ao salvar (bloqueado pela RLS). Gerenciar modelos é configuração: basta settings.edit.
-- Ver/usar os modelos continua em assessments.view (policy de select inalterada).
-- =====================================================================
drop policy if exists evaluation_templates_write on public.evaluation_templates;
create policy evaluation_templates_write on public.evaluation_templates for all to authenticated
  using (public.has_permission(organization_id, 'settings.edit'))
  with check (public.has_permission(organization_id, 'settings.edit'));
