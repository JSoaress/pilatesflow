-- =====================================================================
-- PilatesFlow — 0015 Privilégios finais (executar sempre por último)
-- No Supabase, objetos novos recebem privilégios padrão para anon/authenticated.
-- Aqui fechamos tudo para o visitante anônimo e liberamos somente o necessário.
-- =====================================================================

revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated, service_role;

-- Funções exclusivas de rotinas do servidor (cron/worker com service role)
revoke execute on function public.refresh_overdue(uuid), public.renew_subscriptions(uuid),
  public.generate_all_recurrences(uuid), public.expire_replacement_credits(), public.check_rate_limit(text, int, int),
  public.seed_demo_data(uuid, uuid, uuid, uuid, uuid)
  from authenticated;

-- Funções públicas (site, agendamento online, anamnese por link)
grant execute on function
  public.public_site(text),
  public.public_blog_posts(text, int, int),
  public.public_blog_post(text, text),
  public.public_create_lead(text, text, text, text, text, text, boolean, jsonb, text),
  public.public_booking_options(text),
  public.public_available_slots(text, uuid, uuid, date, uuid),
  public.public_book_trial(text, jsonb),
  public.get_anamnesis_by_token(uuid),
  public.submit_anamnesis_by_token(uuid, jsonb, text),
  public.f_unaccent(text)
to anon;

-- Funções privadas: nunca executáveis diretamente por usuários
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on all functions in schema private to service_role;
-- (as funções SECURITY DEFINER públicas chamam as privadas com o privilégio do proprietário)
-- Exceções usadas dentro de policies/views avaliadas com o privilégio do usuário:
grant execute on function private.storage_org(text) to authenticated;
grant execute on function private.only_digits(text) to authenticated, anon;

-- Futuras funções/tabelas criadas pelo owner não ficam abertas ao anon
alter default privileges in schema public revoke execute on functions from anon, public;
alter default privileges in schema public revoke all on tables from anon;

-- Rotinas de servidor (somente service role)
revoke execute on function public.gateway_confirm_payment(text, text, text, text, numeric, timestamptz, text, jsonb),
  public.claim_messages(int), public.finish_message(uuid, boolean, text, text, text), public.fail_message(uuid, text),
  public.run_automations(uuid)
  from authenticated, anon, public;
grant execute on function public.portal_full_classes(uuid, uuid, date), public.portal_join_waitlist(uuid, uuid),
  public.portal_waitlist(uuid), public.portal_leave_waitlist(uuid) to authenticated;
