-- =====================================================================
-- PilatesFlow — 0015 Baixa automática por gateway, fila de mensagens e automações
-- Funções executadas pelo servidor com service role (webhooks/cron).
-- =====================================================================

-- Núcleo do recebimento (sem checagem de permissão; uso interno)
create or replace function private.apply_payment(
  p_receivable_id uuid, p_amount numeric, p_method text, p_paid_at timestamptz,
  p_gateway text default null, p_gateway_payment_id text default null, p_notes text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare r accounts_receivable%rowtype; v_id uuid; v_open numeric; v_amount numeric; v_account uuid; v_tz text;
begin
  select * into r from accounts_receivable where id = p_receivable_id for update;
  if not found or r.status in ('cancelled','paid') then return null; end if;
  v_open := r.amount - r.discount + r.surcharge - r.amount_paid;
  v_amount := least(p_amount, v_open);
  if v_amount <= 0 then return null; end if;
  select id into v_account from cash_accounts where organization_id = r.organization_id and is_active
   order by (kind = 'gateway') desc, (kind = 'bank') desc, created_at limit 1;
  v_tz := private.org_tz(r.organization_id);
  insert into payments (organization_id, unit_id, receivable_id, patient_id, amount, method, paid_at, cash_account_id,
                        receipt_number, gateway, gateway_payment_id, notes)
  values (r.organization_id, r.unit_id, r.id, r.patient_id, v_amount, p_method, coalesce(p_paid_at, now()), v_account,
          private.next_counter(r.organization_id, 'receipt'), p_gateway, p_gateway_payment_id, p_notes)
  returning id into v_id;
  insert into cash_movements (organization_id, unit_id, cash_account_id, type, amount, occurred_on, description, category_id, source, payment_id)
  values (r.organization_id, r.unit_id, v_account, 'in', v_amount, (coalesce(p_paid_at, now()) at time zone v_tz)::date,
          'Recebimento: ' || r.description, r.category_id, 'payment', v_id);
  perform private.recalc_receivable(r.id);
  if r.subscription_id is not null then
    update subscriptions set status = 'active' where id = r.subscription_id and status = 'pending';
  end if;
  return v_id;
end $$;

-- Confirmação vinda do webhook do gateway (idempotente)
create or replace function public.gateway_confirm_payment(
  p_provider text, p_external_id text, p_event_id text, p_status text, p_amount numeric,
  p_paid_at timestamptz, p_external_reference text, p_payload jsonb default null
) returns text
language plpgsql security definer set search_path = public as $$
declare c payment_gateway_charges%rowtype; v_inserted int; v_payment uuid; v_ar accounts_receivable%rowtype;
begin
  insert into gateway_webhook_events (provider, event_id, event_type, payload)
  values (p_provider, p_event_id, p_status, coalesce(p_payload, '{}'::jsonb))
  on conflict (provider, event_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then return 'duplicate'; end if;

  select * into c from payment_gateway_charges where provider = p_provider and external_id = p_external_id;
  if not found and p_external_reference ~ '^[0-9a-f-]{36}$' then
    select * into c from payment_gateway_charges where provider = p_provider and receivable_id = p_external_reference::uuid
     order by created_at desc limit 1;
  end if;
  if c.id is null then
    update gateway_webhook_events set error = 'Cobrança não encontrada', processed_at = now() where provider = p_provider and event_id = p_event_id;
    return 'not_found';
  end if;

  if p_status = 'paid' then
    if exists (select 1 from payments where gateway = p_provider and gateway_payment_id = p_external_id) then
      update gateway_webhook_events set processed_at = now() where provider = p_provider and event_id = p_event_id;
      return 'already_paid';
    end if;
    v_payment := private.apply_payment(c.receivable_id, coalesce(p_amount, c.amount),
      case c.method when 'pix' then 'pix' when 'boleto' then 'boleto' else 'credit_card' end,
      coalesce(p_paid_at, now()), p_provider, p_external_id, 'Baixa automática (' || p_provider || ')');
    update payment_gateway_charges set status = 'paid' where id = c.id;
    select * into v_ar from accounts_receivable where id = c.receivable_id;
    perform private.notify_permission(c.organization_id, 'finance.view', 'payment_confirmed', 'Pagamento confirmado',
      v_ar.description || ' — baixa automática via ' || p_provider, '/app/financeiro/receber', 'accounts_receivable', c.receivable_id);
  elsif p_status in ('cancelled','refunded') then
    update payment_gateway_charges set status = case when p_status = 'cancelled' then 'cancelled' else status end where id = c.id;
  end if;
  update gateway_webhook_events set processed_at = now() where provider = p_provider and event_id = p_event_id;
  return coalesce(v_payment::text, p_status);
end $$;

-- ---------------------------------------------------------------------
-- Fila de mensagens (worker): reserva mensagens para envio
-- ---------------------------------------------------------------------
create or replace function public.claim_messages(p_limit int default 20) returns setof messages
language plpgsql security definer set search_path = public as $$
begin
  return query
  update messages m set status = 'sending', attempts = attempts + 1
   where m.id in (select id from messages where status = 'queued' and scheduled_for <= now()
                   order by scheduled_for limit p_limit for update skip locked)
  returning m.*;
end $$;

create or replace function public.finish_message(p_id uuid, p_ok boolean, p_provider text, p_provider_message_id text, p_error text) returns void
language sql security definer set search_path = public as $$
  update messages set
    status = case when p_ok then 'sent' when attempts >= 3 then 'failed' else 'queued' end,
    scheduled_for = case when p_ok or attempts >= 3 then scheduled_for else now() + interval '10 minutes' end,
    provider = p_provider, provider_message_id = p_provider_message_id, error = case when p_ok then null else left(p_error, 500) end,
    sent_at = case when p_ok then now() else sent_at end
  where id = p_id
$$;

-- Marca como falha imediata (ex.: canal não configurado) — nunca finge envio
create or replace function public.fail_message(p_id uuid, p_error text) returns void
language sql security definer set search_path = public as $$
  update messages set status = 'failed', error = left(p_error, 500) where id = p_id
$$;

-- ---------------------------------------------------------------------
-- Automações diárias (lembretes e cobranças) — respeitam system_settings.automations
-- ---------------------------------------------------------------------
create or replace function public.run_automations(p_org uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o record; a jsonb; v_tz text; v_today date; r record; v_count int := 0; v_notif int := 0; v_channel text;
begin
  for o in select * from organizations where deleted_at is null and (p_org is null or id = p_org) loop
    a := private.setting(o.id, 'automations', '{}'::jsonb);
    v_tz := o.timezone; v_today := (now() at time zone v_tz)::date;
    v_channel := coalesce(a ->> 'channel', 'whatsapp');

    -- Lembrete de aula (X horas antes)
    if coalesce((a ->> 'appointment_reminder_enabled')::boolean, false) then
      for r in
        select ap.id, ap.patient_id, a2.starts_at, s.name as service from appointment_participants ap
          join appointments a2 on a2.id = ap.appointment_id join services s on s.id = a2.service_id
         where a2.organization_id = o.id and ap.status in ('scheduled','confirmed','replacement') and a2.status = 'scheduled'
           and a2.starts_at between now() and now() + make_interval(hours => coalesce((a ->> 'appointment_reminder_hours')::int, 24))
      loop
        begin
          perform public.queue_message(o.id, 'appointment_reminder', v_channel, r.patient_id, null,
            jsonb_build_object('data', to_char(r.starts_at at time zone v_tz, 'DD/MM'), 'hora', to_char(r.starts_at at time zone v_tz, 'HH24:MI'),
                               'modalidade', r.service, 'link', ''), null, now(), 'reminder:' || r.id, 'appointment_participants', r.id);
          v_count := v_count + 1;
        exception when others then null; -- aluno sem telefone/e-mail ou modelo inativo
        end;
      end loop;
    end if;

    -- Mensalidade a vencer
    if coalesce((a ->> 'payment_due_reminder_enabled')::boolean, false) then
      for r in select * from accounts_receivable where organization_id = o.id and status = 'pending' and patient_id is not null
                  and due_date = v_today + coalesce((a ->> 'payment_due_reminder_days')::int, 2) loop
        begin
          perform public.queue_message(o.id, 'payment_due_soon', v_channel, r.patient_id, null,
            jsonb_build_object('valor', 'R$ ' || to_char(r.amount - r.discount + r.surcharge - r.amount_paid, 'FM999G990D00'),
                               'vencimento', to_char(r.due_date, 'DD/MM/YYYY'), 'pix', ''), null, now(), 'due:' || r.id, 'accounts_receivable', r.id);
          v_count := v_count + 1;
        exception when others then null;
        end;
      end loop;
    end if;

    -- Cobrança de vencidos (a cada N dias)
    if coalesce((a ->> 'overdue_reminder_enabled')::boolean, false) then
      for r in select * from accounts_receivable where organization_id = o.id and status in ('overdue','partial') and patient_id is not null
                  and due_date < v_today and ((v_today - due_date) % greatest(coalesce((a ->> 'overdue_reminder_every_days')::int, 7), 1)) = 1 loop
        begin
          perform public.queue_message(o.id, 'payment_overdue', v_channel, r.patient_id, null,
            jsonb_build_object('valor', 'R$ ' || to_char(r.amount - r.discount + r.surcharge - r.amount_paid, 'FM999G990D00'),
                               'vencimento', to_char(r.due_date, 'DD/MM/YYYY')), null, now(), 'overdue:' || r.id || ':' || v_today, 'accounts_receivable', r.id);
          v_count := v_count + 1;
        exception when others then null;
        end;
      end loop;
    end if;

    -- Aniversário
    if coalesce((a ->> 'birthday_message_enabled')::boolean, false) then
      for r in select id from patients where organization_id = o.id and status = 'active' and deleted_at is null
                  and to_char(birth_date, 'MMDD') = to_char(v_today, 'MMDD') loop
        begin
          perform public.queue_message(o.id, 'birthday', v_channel, r.id, null, '{}'::jsonb, null, now(), 'birthday:' || r.id || ':' || v_today, 'patients', r.id);
          v_count := v_count + 1;
        exception when others then null;
        end;
      end loop;
    end if;

    -- Notificações internas diárias
    v_notif := v_notif + coalesce((select count(*) from (
      select private.notify_permission(o.id, 'finance.view', 'overdue_payment', 'Mensalidades vencidas',
        count(*) || ' título(s) vencido(s) aguardando cobrança.', '/app/financeiro/inadimplencia', 'accounts_receivable', null)
        from accounts_receivable where organization_id = o.id and status in ('overdue','partial') having count(*) > 0) x), 0);
    perform private.notify_permission(o.id, 'contracts.view', 'contract_expiring', 'Contrato vencendo',
        p.full_name || ': contrato vence em ' || to_char(c.end_date, 'DD/MM'), '/app/alunos/' || c.patient_id || '?aba=documentos', 'contracts', c.id)
      from contracts c join patients p on p.id = c.patient_id
     where c.organization_id = o.id and c.status in ('sent','accepted') and c.end_date = v_today + 15;
    perform private.notify_permission(o.id, 'equipment.view', 'maintenance', 'Manutenção próxima',
        e.name || ': manutenção prevista para ' || to_char(e.next_maintenance_date, 'DD/MM'), '/app/equipamentos', 'equipment', e.id)
      from equipment e where e.organization_id = o.id and e.deleted_at is null and e.next_maintenance_date between v_today and v_today + 7;
    perform private.notify_permission(o.id, 'assessments.view', 'reassessment_due', 'Reavaliação pendente',
        p.full_name || ': reavaliação prevista para ' || to_char(a2.next_assessment_on, 'DD/MM'), '/app/alunos/' || p.id || '?aba=avaliacoes', 'patients', p.id)
      from assessments a2 join patients p on p.id = a2.patient_id
     where a2.organization_id = o.id and a2.next_assessment_on = v_today and p.status = 'active';
    perform private.notify_permission(o.id, 'crm.view', 'lead_followup', 'Follow-up de lead',
        l.name || ': contato agendado para hoje', '/app/crm?lead=' || l.id, 'leads', l.id)
      from leads l where l.organization_id = o.id and l.deleted_at is null and (l.next_contact_at at time zone v_tz)::date = v_today
       and l.stage not in ('enrolled','lost');
  end loop;
  return jsonb_build_object('messages_queued', v_count);
end $$;
