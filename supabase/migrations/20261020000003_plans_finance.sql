-- =====================================================================
-- PilatesFlow — 0003 Planos, assinaturas, contratos e financeiro
-- =====================================================================

-- Contadores sequenciais por organização (recibos, contratos...)
create table public.org_counters (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key text not null,
  value bigint not null default 0,
  primary key (organization_id, key)
);

create or replace function private.next_counter(p_org uuid, p_key text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  insert into org_counters (organization_id, key, value) values (p_org, p_key, 1)
  on conflict (organization_id, key) do update set value = org_counters.value + 1
  returning value into v;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- Planos
-- ---------------------------------------------------------------------
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,      -- null = todas
  name text not null,
  description text,
  price numeric(12,2) not null check (price >= 0),                    -- valor total do ciclo
  cycle_months int check (cycle_months is null or cycle_months between 1 and 24),
  weekly_frequency int check (weekly_frequency is null or weekly_frequency between 1 and 7),
  total_sessions int check (total_sessions is null or total_sessions > 0),   -- pacotes
  session_duration_min int not null default 50,
  validity_days int check (validity_days is null or validity_days > 0),      -- validade de pacotes
  replacements_allowed int not null default 0 check (replacements_allowed >= 0),
  enrollment_fee numeric(12,2) not null default 0 check (enrollment_fee >= 0),
  discount_percent numeric(5,2) not null default 0 check (discount_percent between 0 and 100),
  auto_renew boolean not null default true,
  billing_type text not null default 'monthly' check (billing_type in ('monthly','upfront','installments')),
  installments_count int not null default 1 check (installments_count between 1 and 24),
  contract_template_id uuid,
  show_on_website boolean not null default true,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  check (cycle_months is not null or total_sessions is not null)
);
create index idx_plans_org on public.plans(organization_id) where deleted_at is null;

create table public.plan_services (
  plan_id uuid not null references public.plans(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  primary key (plan_id, service_id)
);

-- ---------------------------------------------------------------------
-- Assinaturas (plano contratado pelo aluno; permite plano personalizado)
-- ---------------------------------------------------------------------
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  patient_id uuid not null references public.patients(id) on delete restrict,
  plan_id uuid not null references public.plans(id) on delete restrict,
  price numeric(12,2) not null check (price >= 0),          -- valor efetivamente contratado (personalizável)
  discount_percent numeric(5,2) not null default 0 check (discount_percent between 0 and 100),
  enrollment_fee numeric(12,2) not null default 0,
  start_date date not null,
  end_date date,
  due_day int check (due_day between 1 and 28),
  weekly_frequency int,
  sessions_total int,                                        -- null = ilimitado
  sessions_used int not null default 0 check (sessions_used >= 0),
  sessions_extra int not null default 0,
  replacements_allowed int not null default 0,
  auto_renew boolean not null default true,
  billing_type text not null default 'monthly' check (billing_type in ('monthly','upfront','installments')),
  installments_count int not null default 1,
  status text not null default 'active' check (status in ('pending','active','paused','cancelled','expired')),
  paused_at date,
  paused_until date,
  cancelled_at timestamptz,
  cancel_reason text,
  renewed_from_id uuid references public.subscriptions(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  check (end_date is null or end_date >= start_date)
);
create index idx_subs_patient on public.subscriptions(patient_id, status);
create index idx_subs_org_end on public.subscriptions(organization_id, end_date) where status = 'active';

-- ---------------------------------------------------------------------
-- Contratos
-- ---------------------------------------------------------------------
create table public.contract_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  body text not null,                    -- texto com variáveis {{nome_aluno}} etc.
  version int not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz
);
alter table public.plans add constraint fk_plans_contract_template
  foreign key (contract_template_id) references public.contract_templates(id) on delete set null;

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  patient_id uuid not null references public.patients(id) on delete restrict,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  template_id uuid references public.contract_templates(id) on delete set null,
  template_version int,
  number bigint,
  title text not null,
  content text not null,                  -- conteúdo final renderizado (imutável após envio)
  content_hash text not null,
  status text not null default 'draft' check (status in ('draft','sent','accepted','cancelled','expired')),
  start_date date,
  end_date date,
  sent_at timestamptz,
  accepted_at timestamptz,
  accepted_ip text,
  accepted_user_agent text,
  accepted_by_name text,
  signature_provider text,                -- integração futura (ex.: Clicksign, D4Sign)
  signature_external_id text,
  pdf_path text,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
create index idx_contracts_patient on public.contracts(patient_id);
create index idx_contracts_end on public.contracts(organization_id, end_date) where status in ('sent','accepted');

-- Conteúdo de contrato enviado/aceito não pode ser alterado
create or replace function private.protect_contract_content() returns trigger
language plpgsql as $$
begin
  if old.status in ('sent','accepted') and (new.content is distinct from old.content or new.content_hash is distinct from old.content_hash) then
    raise exception 'O conteúdo de um contrato enviado ou aceito não pode ser alterado. Gere uma nova versão.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger trg_contracts_protect before update on public.contracts
  for each row execute function private.protect_contract_content();

-- ---------------------------------------------------------------------
-- Estrutura financeira
-- ---------------------------------------------------------------------
create table public.financial_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  parent_id uuid references public.financial_categories(id) on delete restrict,
  type text not null check (type in ('income','expense')),
  name text not null,
  key text,                               -- categorias de sistema: tuition, assessment, ...
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, type, parent_id, name)
);
create unique index uq_fin_cat_key on public.financial_categories(organization_id, key) where key is not null;

create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key text not null check (key in ('pix','cash','credit_card','debit_card','boleto','transfer','other')),
  name text not null,
  fee_percent numeric(5,2) not null default 0,
  is_active boolean not null default true,
  unique (organization_id, key)
);

create table public.cash_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  name text not null,
  kind text not null default 'cash' check (kind in ('cash','bank','gateway')),
  opening_balance numeric(12,2) not null default 0,
  opening_date date not null default current_date,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Contas a receber (títulos)
create table public.accounts_receivable (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  patient_id uuid references public.patients(id) on delete restrict,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  category_id uuid references public.financial_categories(id) on delete set null,
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  discount numeric(12,2) not null default 0 check (discount >= 0),
  surcharge numeric(12,2) not null default 0 check (surcharge >= 0),  -- multa/juros
  amount_paid numeric(12,2) not null default 0 check (amount_paid >= 0),
  due_date date not null,
  competence_date date,
  status text not null default 'pending' check (status in ('pending','paid','overdue','partial','cancelled','refunded')),
  payment_method text check (payment_method in ('pix','cash','credit_card','debit_card','boleto','transfer','other')),
  installment_number int,
  installment_count int,
  paid_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  last_contact_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
create index idx_ar_org_status_due on public.accounts_receivable(organization_id, status, due_date);
create index idx_ar_patient on public.accounts_receivable(patient_id);
create index idx_ar_subscription on public.accounts_receivable(subscription_id);

-- Pagamentos recebidos (baixas)
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  receivable_id uuid references public.accounts_receivable(id) on delete restrict,
  patient_id uuid references public.patients(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  method text not null check (method in ('pix','cash','credit_card','debit_card','boleto','transfer','other')),
  paid_at timestamptz not null default now(),
  cash_account_id uuid references public.cash_accounts(id) on delete set null,
  status text not null default 'confirmed' check (status in ('confirmed','refunded')),
  refunded_at timestamptz,
  refunded_by uuid references auth.users(id) on delete set null,
  refund_reason text,
  gateway text,
  gateway_payment_id text,
  receipt_number bigint,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
create index idx_payments_org_paid on public.payments(organization_id, paid_at desc);
create index idx_payments_receivable on public.payments(receivable_id);
create unique index uq_payments_gateway on public.payments(gateway, gateway_payment_id) where gateway_payment_id is not null;

-- Contas a pagar
create table public.accounts_payable (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  category_id uuid references public.financial_categories(id) on delete set null,
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  due_date date not null,
  competence_date date,
  status text not null default 'pending' check (status in ('pending','paid','overdue','cancelled')),
  payment_method text check (payment_method in ('pix','cash','credit_card','debit_card','boleto','transfer','other')),
  paid_at timestamptz,
  paid_amount numeric(12,2),
  cash_account_id uuid references public.cash_accounts(id) on delete set null,
  document_number text,
  receipt_path text,                     -- comprovante (storage privado)
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz
);
create index idx_ap_org_status_due on public.accounts_payable(organization_id, status, due_date) where deleted_at is null;

-- Movimentações de caixa (livro-razão; correções por estorno, nunca por exclusão)
create table public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  cash_account_id uuid references public.cash_accounts(id) on delete set null,
  type text not null check (type in ('in','out')),
  amount numeric(12,2) not null check (amount > 0),
  occurred_on date not null default current_date,
  description text not null,
  category_id uuid references public.financial_categories(id) on delete set null,
  source text not null default 'manual' check (source in ('payment','refund','payable','manual','adjustment','sale')),
  payment_id uuid references public.payments(id) on delete restrict,
  payable_id uuid references public.accounts_payable(id) on delete restrict,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
create index idx_cash_org_date on public.cash_movements(organization_id, occurred_on);

create or replace function private.block_cash_delete() returns trigger
language plpgsql as $$
begin
  raise exception 'Movimentações de caixa não podem ser excluídas. Registre um estorno/ajuste.' using errcode = '42501';
end $$;
create trigger trg_cash_no_delete before delete on public.cash_movements
  for each row execute function private.block_cash_delete();

-- NFS-e (arquitetura desacoplada — emissão depende de provedor configurado)
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  patient_id uuid references public.patients(id) on delete set null,
  payment_id uuid references public.payments(id) on delete set null,
  receivable_id uuid references public.accounts_receivable(id) on delete set null,
  amount numeric(12,2) not null check (amount > 0),
  service_description text not null,
  status text not null default 'not_requested' check (status in ('not_requested','pending','issued','error','cancelled')),
  provider text,
  external_id text,
  number text,
  verification_code text,
  pdf_url text,
  xml_path text,
  error_message text,
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

-- Cobranças em gateways (Asaas, Mercado Pago, Stripe). Nunca guarda dados de cartão.
create table public.payment_gateway_charges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  receivable_id uuid not null references public.accounts_receivable(id) on delete cascade,
  provider text not null check (provider in ('asaas','mercadopago','stripe')),
  external_id text,
  method text not null check (method in ('pix','boleto','card','link')),
  status text not null default 'created' check (status in ('created','pending','paid','expired','cancelled','error')),
  amount numeric(12,2) not null,
  due_date date,
  pix_copy_paste text,
  pix_qr_image text,
  payment_url text,
  error_message text,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_id)
);

create table public.gateway_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  event_type text,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text,
  unique (provider, event_id)
);

-- ---------------------------------------------------------------------
-- Gatilhos padrão
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['plans','subscriptions','contract_templates','contracts','accounts_receivable',
                           'accounts_payable','invoices','payment_gateway_charges'] loop
    execute format('create trigger trg_%1$s_updated before update on public.%1$I for each row execute function private.set_updated_at()', t);
  end loop;
  foreach t in array array['plans','subscriptions','contract_templates','contracts','accounts_receivable',
                           'accounts_payable','payments','cash_movements','invoices'] loop
    execute format('create trigger trg_%1$s_created_by before insert on public.%1$I for each row execute function private.set_created_by()', t);
  end loop;
  foreach t in array array['plans','subscriptions','contract_templates','contracts','financial_categories','payment_methods',
                           'cash_accounts','accounts_receivable','payments','accounts_payable','cash_movements','invoices'] loop
    perform private.enable_audit(('public.' || t)::regclass);
  end loop;
end $$;

-- =====================================================================
-- Regras de negócio financeiras (executadas no servidor)
-- =====================================================================

-- Recalcula valor pago e status do título
create or replace function private.recalc_receivable(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  r accounts_receivable%rowtype;
  v_paid numeric(12,2);
  v_refunded_any boolean;
  v_total numeric(12,2);
  v_status text;
begin
  select * into r from accounts_receivable where id = p_id for update;
  if not found then return; end if;
  select coalesce(sum(amount) filter (where status = 'confirmed'), 0),
         coalesce(bool_or(status = 'refunded'), false)
    into v_paid, v_refunded_any
  from payments where receivable_id = p_id;

  v_total := r.amount - r.discount + r.surcharge;
  if r.status = 'cancelled' then
    v_status := 'cancelled';
  elsif v_paid >= v_total and v_total > 0 then
    v_status := 'paid';
  elsif v_paid > 0 then
    v_status := 'partial';
  elsif v_refunded_any then
    v_status := 'refunded';
  elsif r.due_date < (now() at time zone (select timezone from organizations where id = r.organization_id))::date then
    v_status := 'overdue';
  else
    v_status := 'pending';
  end if;

  update accounts_receivable
     set amount_paid = v_paid,
         status = v_status,
         paid_at = case when v_status = 'paid' then coalesce(
                     (select max(paid_at) from payments where receivable_id = p_id and status = 'confirmed'), now()) end
   where id = p_id;
end $$;

-- Registra recebimento (baixa manual ou automática)
create or replace function public.register_payment(
  p_receivable_id uuid,
  p_amount numeric,
  p_method text,
  p_paid_at timestamptz default now(),
  p_cash_account_id uuid default null,
  p_notes text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  r accounts_receivable%rowtype;
  v_payment_id uuid;
  v_receipt bigint;
  v_open numeric(12,2);
  v_account uuid := p_cash_account_id;
  v_tz text;
begin
  select * into r from accounts_receivable where id = p_receivable_id for update;
  if not found then raise exception 'Título não encontrado.'; end if;
  perform private.require_permission(r.organization_id, 'finance.create');
  if not public.has_unit_access(r.organization_id, r.unit_id) then
    raise exception 'Sem acesso a esta unidade.' using errcode = '42501';
  end if;
  if r.status in ('cancelled','paid') then
    raise exception 'Este título está % e não aceita novos pagamentos.',
      case r.status when 'cancelled' then 'cancelado' else 'quitado' end;
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Informe um valor maior que zero.'; end if;
  v_open := r.amount - r.discount + r.surcharge - r.amount_paid;
  if p_amount > v_open + 0.009 then
    raise exception 'Valor (R$ %) maior que o saldo em aberto (R$ %).', to_char(p_amount, 'FM999G999G990D00'), to_char(v_open, 'FM999G999G990D00');
  end if;
  if p_paid_at > now() + interval '1 day' then raise exception 'A data do pagamento não pode estar no futuro.'; end if;

  if v_account is null then
    select id into v_account from cash_accounts
     where organization_id = r.organization_id and is_active and (unit_id = r.unit_id or unit_id is null)
     order by (kind = case when p_method = 'cash' then 'cash' else 'bank' end) desc, created_at limit 1;
  end if;
  select timezone into v_tz from organizations where id = r.organization_id;
  v_receipt := private.next_counter(r.organization_id, 'receipt');

  insert into payments (organization_id, unit_id, receivable_id, patient_id, amount, method, paid_at,
                        cash_account_id, receipt_number, notes)
  values (r.organization_id, r.unit_id, r.id, r.patient_id, p_amount, p_method, p_paid_at, v_account, v_receipt, p_notes)
  returning id into v_payment_id;

  insert into cash_movements (organization_id, unit_id, cash_account_id, type, amount, occurred_on, description,
                              category_id, source, payment_id)
  values (r.organization_id, r.unit_id, v_account, 'in', p_amount, (p_paid_at at time zone v_tz)::date,
          'Recebimento: ' || r.description, r.category_id, 'payment', v_payment_id);

  perform private.recalc_receivable(r.id);

  -- Ativa assinatura pendente após primeiro pagamento
  if r.subscription_id is not null then
    update subscriptions set status = 'active' where id = r.subscription_id and status = 'pending';
  end if;
  return v_payment_id;
end $$;

-- Estorno de pagamento (permissão específica)
create or replace function public.refund_payment(p_payment_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare p payments%rowtype; v_tz text;
begin
  select * into p from payments where id = p_payment_id for update;
  if not found then raise exception 'Pagamento não encontrado.'; end if;
  perform private.require_permission(p.organization_id, 'finance.refund');
  if p.status = 'refunded' then raise exception 'Este pagamento já foi estornado.'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Informe o motivo do estorno.'; end if;
  select timezone into v_tz from organizations where id = p.organization_id;

  update payments set status = 'refunded', refunded_at = now(), refunded_by = auth.uid(), refund_reason = p_reason
   where id = p.id;
  insert into cash_movements (organization_id, unit_id, cash_account_id, type, amount, occurred_on, description, source, payment_id)
  values (p.organization_id, p.unit_id, p.cash_account_id, 'out', p.amount, (now() at time zone v_tz)::date,
          'Estorno: ' || p_reason, 'refund', p.id);
  insert into audit_logs (organization_id, unit_id, user_id, action, entity, entity_id, context)
  values (p.organization_id, p.unit_id, auth.uid(), 'refund', 'payments', p.id::text,
          jsonb_build_object('amount', p.amount, 'reason', p_reason));
  if p.receivable_id is not null then
    perform private.recalc_receivable(p.receivable_id);
  end if;
end $$;

-- Cancela título em aberto
create or replace function public.cancel_receivable(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare r accounts_receivable%rowtype;
begin
  select * into r from accounts_receivable where id = p_id for update;
  if not found then raise exception 'Título não encontrado.'; end if;
  perform private.require_permission(r.organization_id, 'finance.edit');
  if r.amount_paid > 0 then raise exception 'Título com pagamento registrado: estorne os pagamentos antes de cancelar.'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Informe o motivo do cancelamento.'; end if;
  update accounts_receivable set status = 'cancelled', cancelled_at = now(), cancel_reason = p_reason where id = p_id;
end $$;

-- Paga conta a pagar
create or replace function public.pay_payable(
  p_id uuid, p_paid_at date default current_date, p_amount numeric default null,
  p_method text default null, p_cash_account_id uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare a accounts_payable%rowtype; v_amount numeric(12,2); v_account uuid := p_cash_account_id;
begin
  select * into a from accounts_payable where id = p_id for update;
  if not found then raise exception 'Conta não encontrada.'; end if;
  perform private.require_permission(a.organization_id, 'finance.edit');
  if a.status in ('paid','cancelled') then raise exception 'Esta conta já está % .', case a.status when 'paid' then 'paga' else 'cancelada' end; end if;
  v_amount := coalesce(p_amount, a.amount);
  if v_amount <= 0 then raise exception 'Valor inválido.'; end if;
  if v_account is null then
    select id into v_account from cash_accounts where organization_id = a.organization_id and is_active
     order by (kind = case when coalesce(p_method, a.payment_method) = 'cash' then 'cash' else 'bank' end) desc, created_at limit 1;
  end if;
  update accounts_payable set status = 'paid', paid_at = p_paid_at::timestamptz, paid_amount = v_amount,
         payment_method = coalesce(p_method, payment_method), cash_account_id = v_account
   where id = p_id;
  insert into cash_movements (organization_id, unit_id, cash_account_id, type, amount, occurred_on, description, category_id, source, payable_id)
  values (a.organization_id, a.unit_id, v_account, 'out', v_amount, p_paid_at, 'Pagamento: ' || a.description, a.category_id, 'payable', a.id);
end $$;

-- Atualiza status de vencidos (rodar diariamente via cron)
create or replace function public.refresh_overdue(p_org uuid default null) returns int
language plpgsql security definer set search_path = public as $$
declare v_count int := 0; n int;
begin
  update accounts_receivable ar set status = 'overdue'
    from organizations o
   where o.id = ar.organization_id and (p_org is null or ar.organization_id = p_org)
     and ar.status = 'pending' and ar.due_date < (now() at time zone o.timezone)::date;
  get diagnostics n = row_count; v_count := v_count + n;
  update accounts_payable ap set status = 'overdue'
    from organizations o
   where o.id = ap.organization_id and (p_org is null or ap.organization_id = p_org)
     and ap.status = 'pending' and ap.due_date < (now() at time zone o.timezone)::date and ap.deleted_at is null;
  get diagnostics n = row_count; v_count := v_count + n;
  return v_count;
end $$;
revoke execute on function public.refresh_overdue(uuid) from public, anon, authenticated;

-- Gera os títulos de uma assinatura conforme o tipo de cobrança
create or replace function private.generate_subscription_receivables(p_sub uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  s subscriptions%rowtype;
  p plans%rowtype;
  v_total numeric(12,2);
  v_n int;
  v_value numeric(12,2);
  v_first_due date;
  v_cat uuid;
  v_count int := 0;
  i int;
begin
  select * into s from subscriptions where id = p_sub;
  select * into p from plans where id = s.plan_id;
  select id into v_cat from financial_categories where organization_id = s.organization_id and key = 'tuition';

  v_total := round(s.price * (1 - s.discount_percent / 100.0), 2);
  v_n := case s.billing_type
           when 'monthly' then greatest(coalesce(p.cycle_months, 1), 1)
           when 'installments' then greatest(s.installments_count, 1)
           else 1 end;
  v_first_due := case
    when s.due_day is not null then
      case when s.due_day >= extract(day from s.start_date)::int
           then make_date(extract(year from s.start_date)::int, extract(month from s.start_date)::int, s.due_day)
           else (make_date(extract(year from s.start_date)::int, extract(month from s.start_date)::int, s.due_day) + interval '1 month')::date end
    else s.start_date end;

  if s.enrollment_fee > 0 then
    insert into accounts_receivable (organization_id, unit_id, patient_id, subscription_id, category_id, description,
                                     amount, due_date, competence_date)
    values (s.organization_id, s.unit_id, s.patient_id, s.id,
            (select id from financial_categories where organization_id = s.organization_id and key = 'fees'),
            'Taxa de matrícula — ' || p.name, s.enrollment_fee, s.start_date, s.start_date);
    v_count := v_count + 1;
  end if;

  if v_total > 0 then
    for i in 1..v_n loop
      v_value := case when i < v_n then round(v_total / v_n, 2) else v_total - round(v_total / v_n, 2) * (v_n - 1) end;
      insert into accounts_receivable (organization_id, unit_id, patient_id, subscription_id, category_id, description,
                                       amount, due_date, competence_date, installment_number, installment_count)
      values (s.organization_id, s.unit_id, s.patient_id, s.id, v_cat,
              p.name || case when v_n > 1 then ' — parcela ' || i || '/' || v_n else '' end,
              v_value, (v_first_due + make_interval(months => i - 1))::date,
              (s.start_date + make_interval(months => i - 1))::date, i, v_n);
      v_count := v_count + 1;
    end loop;
  end if;
  return v_count;
end $$;

-- Contrata plano para aluno (assinatura + títulos). Permite valores personalizados.
create or replace function public.create_subscription(
  p_patient_id uuid,
  p_plan_id uuid,
  p_start_date date,
  p_custom_price numeric default null,
  p_discount_percent numeric default null,
  p_due_day int default null,
  p_generate_receivables boolean default true,
  p_notes text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  pt patients%rowtype;
  p plans%rowtype;
  v_id uuid;
  v_end date;
  v_sessions int;
begin
  select * into pt from patients where id = p_patient_id and deleted_at is null;
  if not found then raise exception 'Aluno não encontrado.'; end if;
  perform private.require_permission(pt.organization_id, 'plans.create');
  select * into p from plans where id = p_plan_id and organization_id = pt.organization_id and deleted_at is null;
  if not found then raise exception 'Plano não encontrado.'; end if;
  if not p.is_active then raise exception 'Este plano está inativo.'; end if;

  v_end := case
    when p.cycle_months is not null then (p_start_date + make_interval(months => p.cycle_months) - interval '1 day')::date
    when p.validity_days is not null then p_start_date + p.validity_days - 1
    else null end;
  v_sessions := coalesce(p.total_sessions, p.weekly_frequency * 4 * coalesce(p.cycle_months, 1));

  insert into subscriptions (organization_id, unit_id, patient_id, plan_id, price, discount_percent, enrollment_fee,
                             start_date, end_date, due_day, weekly_frequency, sessions_total, replacements_allowed,
                             auto_renew, billing_type, installments_count, status, notes)
  values (pt.organization_id, pt.unit_id, pt.id, p.id, coalesce(p_custom_price, p.price),
          coalesce(p_discount_percent, p.discount_percent), p.enrollment_fee, p_start_date, v_end, p_due_day,
          p.weekly_frequency, v_sessions, p.replacements_allowed, p.auto_renew, p.billing_type, p.installments_count,
          'active', p_notes)
  returning id into v_id;

  if p_generate_receivables then
    perform private.generate_subscription_receivables(v_id);
  end if;

  update patients set status = 'active' where id = pt.id and status in ('lead','trial','inactive','cancelled','paused');
  return v_id;
end $$;

-- Renova assinaturas vencidas com renovação automática (cron diário)
create or replace function public.renew_subscriptions(p_org uuid default null) returns int
language plpgsql security definer set search_path = public as $$
declare s record; v_new uuid; v_count int := 0; p plans%rowtype; v_today date;
begin
  for s in
    select sb.* from subscriptions sb join organizations o on o.id = sb.organization_id
     where (p_org is null or sb.organization_id = p_org) and sb.status = 'active' and sb.end_date is not null
       and sb.end_date < (now() at time zone o.timezone)::date
  loop
    select * into p from plans where id = s.plan_id;
    if s.auto_renew and p.cycle_months is not null and p.is_active and p.deleted_at is null then
      insert into subscriptions (organization_id, unit_id, patient_id, plan_id, price, discount_percent, enrollment_fee,
                                 start_date, end_date, due_day, weekly_frequency, sessions_total, replacements_allowed,
                                 auto_renew, billing_type, installments_count, status, renewed_from_id, notes)
      values (s.organization_id, s.unit_id, s.patient_id, s.plan_id, s.price, s.discount_percent, 0,
              s.end_date + 1, (s.end_date + 1 + make_interval(months => p.cycle_months) - interval '1 day')::date,
              s.due_day, s.weekly_frequency,
              coalesce(p.total_sessions, s.weekly_frequency * 4 * p.cycle_months), s.replacements_allowed,
              true, s.billing_type, s.installments_count, 'active', s.id, s.notes)
      returning id into v_new;
      perform private.generate_subscription_receivables(v_new);
      update subscriptions set status = 'expired' where id = s.id;
      v_count := v_count + 1;
    else
      update subscriptions set status = 'expired' where id = s.id;
    end if;
  end loop;
  return v_count;
end $$;
revoke execute on function public.renew_subscriptions(uuid) from public, anon, authenticated;

-- Renderiza contrato a partir do modelo (variáveis) e grava versão imutável
create or replace function public.generate_contract(p_subscription_id uuid, p_template_id uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  s subscriptions%rowtype; pt patients%rowtype; p plans%rowtype; t contract_templates%rowtype;
  u units%rowtype; o organizations%rowtype;
  v_body text; v_id uuid; v_value numeric;
begin
  select * into s from subscriptions where id = p_subscription_id;
  if not found then raise exception 'Assinatura não encontrada.'; end if;
  perform private.require_permission(s.organization_id, 'contracts.create');
  select * into pt from patients where id = s.patient_id;
  select * into p from plans where id = s.plan_id;
  select * into o from organizations where id = s.organization_id;
  select * into u from units where id = coalesce(s.unit_id, pt.unit_id);
  select * into t from contract_templates
   where id = coalesce(p_template_id, p.contract_template_id) and organization_id = s.organization_id and deleted_at is null;
  if not found then
    select * into t from contract_templates where organization_id = s.organization_id and is_active and deleted_at is null
     order by created_at limit 1;
  end if;
  if t.id is null then raise exception 'Nenhum modelo de contrato cadastrado. Crie um em Configurações → Contratos.'; end if;

  v_value := round(s.price * (1 - s.discount_percent / 100.0), 2);
  v_body := t.body;
  v_body := replace(v_body, '{{nome_aluno}}', coalesce(pt.full_name, ''));
  v_body := replace(v_body, '{{cpf}}', coalesce(pt.cpf, 'não informado'));
  v_body := replace(v_body, '{{plano}}', coalesce(p.name, ''));
  v_body := replace(v_body, '{{valor}}', 'R$ ' || replace(replace(replace(to_char(v_value, 'FM999,999,990.00'), ',', '#'), '.', ','), '#', '.'));
  v_body := replace(v_body, '{{frequencia}}', coalesce(s.weekly_frequency::text || 'x por semana', coalesce(s.sessions_total::text || ' sessões', '-')));
  v_body := replace(v_body, '{{data_inicio}}', to_char(s.start_date, 'DD/MM/YYYY'));
  v_body := replace(v_body, '{{data_fim}}', coalesce(to_char(s.end_date, 'DD/MM/YYYY'), 'indeterminado'));
  v_body := replace(v_body, '{{unidade}}', coalesce(u.name, ''));
  v_body := replace(v_body, '{{empresa}}', coalesce(o.legal_name, o.name));
  v_body := replace(v_body, '{{cnpj_empresa}}', coalesce(u.cnpj, o.cnpj, ''));
  v_body := replace(v_body, '{{data_hoje}}', to_char((now() at time zone o.timezone)::date, 'DD/MM/YYYY'));

  insert into contracts (organization_id, unit_id, patient_id, subscription_id, template_id, template_version, number,
                         title, content, content_hash, status, start_date, end_date)
  values (s.organization_id, s.unit_id, s.patient_id, s.id, t.id, t.version,
          private.next_counter(s.organization_id, 'contract'),
          t.name || ' — ' || pt.full_name, v_body, encode(extensions.digest(v_body, 'sha256'), 'hex'),
          'draft', s.start_date, s.end_date)
  returning id into v_id;
  return v_id;
end $$;

-- Registra aceite eletrônico simples (registro de IP, data e nome)
create or replace function private.accept_contract(p_contract_id uuid, p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update contracts set status = 'accepted', accepted_at = now(), accepted_ip = private.request_ip(),
         accepted_user_agent = private.request_user_agent(), accepted_by_name = p_name
   where id = p_contract_id and status in ('draft','sent');
  if not found then raise exception 'Contrato não disponível para aceite.'; end if;
end $$;
