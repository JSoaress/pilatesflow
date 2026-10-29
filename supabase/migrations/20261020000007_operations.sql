-- =====================================================================
-- PilatesFlow — 0007 Operação: estoque, manutenção de equipamentos e comissões
-- =====================================================================

-- ---------------------------------------------------------------------
-- Estoque
-- ---------------------------------------------------------------------
create table public.inventory_products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  name text not null,
  category text,
  sku text,
  quantity numeric(12,2) not null default 0,
  min_quantity numeric(12,2) not null default 0 check (min_quantity >= 0),
  unit_of_measure text not null default 'un',
  cost numeric(12,2) check (cost is null or cost >= 0),
  price numeric(12,2) check (price is null or price >= 0),
  is_for_sale boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz
);
create index idx_inv_products_unit on public.inventory_products(unit_id) where deleted_at is null;
create unique index uq_inv_products_sku on public.inventory_products(organization_id, unit_id, sku) where sku is not null and deleted_at is null;

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.inventory_products(id) on delete restrict,
  type text not null check (type in ('in','out','sale','adjustment','loss')),
  quantity numeric(12,2) not null check (quantity <> 0),   -- ajuste pode ser negativo; demais sempre positivos
  unit_cost numeric(12,2),
  unit_price numeric(12,2),
  patient_id uuid references public.patients(id) on delete set null,
  receivable_id uuid references public.accounts_receivable(id) on delete set null,
  notes text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  check (type = 'adjustment' or quantity > 0)
);
create index idx_inv_mov_product on public.inventory_movements(product_id, occurred_at desc);

create or replace function private.apply_inventory_movement() returns trigger
language plpgsql security definer set search_path = public as $$
declare p inventory_products%rowtype; v_delta numeric;
begin
  select * into p from inventory_products where id = new.product_id for update;
  if p.organization_id <> new.organization_id then raise exception 'Produto inválido.'; end if;
  v_delta := case new.type when 'in' then new.quantity when 'adjustment' then new.quantity else -new.quantity end;
  if p.quantity + v_delta < 0 then
    raise exception 'Estoque insuficiente de "%": disponível %, solicitado %.', p.name, p.quantity, new.quantity;
  end if;
  update inventory_products set quantity = quantity + v_delta,
         cost = case when new.type = 'in' and new.unit_cost is not null then new.unit_cost else cost end
   where id = p.id;
  if p.quantity + v_delta <= p.min_quantity and p.quantity > p.min_quantity then
    perform private.notify_permission(p.organization_id, 'inventory.view', 'low_stock', 'Estoque baixo',
      format('%s: restam %s %s (mínimo %s).', p.name, p.quantity + v_delta, p.unit_of_measure, p.min_quantity),
      '/app/estoque', 'inventory_products', p.id);
  end if;
  return new;
end $$;
create trigger trg_inventory_apply after insert on public.inventory_movements
  for each row execute function private.apply_inventory_movement();

create or replace function private.block_movement_changes() returns trigger
language plpgsql as $$
begin
  raise exception 'Movimentações de estoque não podem ser alteradas/excluídas. Lance um ajuste.' using errcode = '42501';
end $$;
create trigger trg_inventory_immutable before update or delete on public.inventory_movements
  for each row execute function private.block_movement_changes();

-- Venda de produto: baixa estoque e gera título a receber
create or replace function public.sell_product(p_product_id uuid, p_quantity numeric, p_patient_id uuid default null,
  p_unit_price numeric default null, p_due_date date default current_date) returns uuid
language plpgsql security definer set search_path = public as $$
declare p inventory_products%rowtype; v_ar uuid; v_price numeric;
begin
  select * into p from inventory_products where id = p_product_id;
  if not found then raise exception 'Produto não encontrado.'; end if;
  perform private.require_permission(p.organization_id, 'inventory.edit');
  perform private.require_permission(p.organization_id, 'finance.create');
  if not p.is_for_sale then raise exception 'Este produto não está marcado para venda.'; end if;
  v_price := coalesce(p_unit_price, p.price);
  if v_price is null or v_price <= 0 then raise exception 'Informe o preço de venda.'; end if;
  insert into accounts_receivable (organization_id, unit_id, patient_id, category_id, description, amount, due_date, competence_date)
  values (p.organization_id, p.unit_id, p_patient_id,
          (select id from financial_categories where organization_id = p.organization_id and key = 'products'),
          'Venda: ' || p.name || ' (' || p_quantity || ' ' || p.unit_of_measure || ')', round(v_price * p_quantity, 2), p_due_date, current_date)
  returning id into v_ar;
  insert into inventory_movements (organization_id, product_id, type, quantity, unit_price, patient_id, receivable_id)
  values (p.organization_id, p.id, 'sale', p_quantity, v_price, p_patient_id, v_ar);
  return v_ar;
end $$;

-- ---------------------------------------------------------------------
-- Manutenção de equipamentos
-- ---------------------------------------------------------------------
create table public.equipment_maintenance (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  equipment_id uuid not null references public.equipment(id) on delete cascade,
  type text not null default 'preventive' check (type in ('preventive','corrective','inspection','cleaning','other')),
  performed_on date not null,
  provider_name text,             -- empresa/técnico
  supplier_id uuid references public.suppliers(id) on delete set null,
  cost numeric(12,2) check (cost is null or cost >= 0),
  description text,
  parts_replaced text,
  next_maintenance_on date,
  receipt_path text,              -- nota/comprovante (storage privado)
  payable_id uuid references public.accounts_payable(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
create index idx_maint_equipment on public.equipment_maintenance(equipment_id, performed_on desc);

create or replace function private.maintenance_update_equipment() returns trigger
language plpgsql security definer set search_path = public as $$
declare e equipment%rowtype;
begin
  select * into e from equipment where id = new.equipment_id;
  update equipment set next_maintenance_date = coalesce(new.next_maintenance_on,
           case when e.maintenance_interval_days is not null then new.performed_on + e.maintenance_interval_days end,
           next_maintenance_date),
         status = case when status = 'maintenance' then 'available' else status end
   where id = new.equipment_id
     and (next_maintenance_date is null or new.performed_on >= coalesce(
           (select max(performed_on) from equipment_maintenance where equipment_id = new.equipment_id and id <> new.id), new.performed_on));
  return null;
end $$;
create trigger trg_maintenance_equipment after insert on public.equipment_maintenance
  for each row execute function private.maintenance_update_equipment();

-- ---------------------------------------------------------------------
-- Comissões (relatório gerencial — não substitui folha de pagamento)
-- ---------------------------------------------------------------------
alter table public.subscriptions add column seller_staff_id uuid references public.staff(id) on delete set null;

create table public.commission_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  staff_id uuid references public.staff(id) on delete cascade,        -- null = todos os profissionais
  name text not null,
  basis text not null check (basis in ('per_session','per_attendance','percent_service','per_sale','fixed')),
  service_id uuid references public.services(id) on delete cascade,  -- filtro por modalidade
  plan_id uuid references public.plans(id) on delete cascade,        -- filtro por plano (vendas)
  value numeric(12,2) not null check (value >= 0),
  is_percent boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create table public.commissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  rule_id uuid references public.commission_rules(id) on delete set null,
  period_month date not null check (extract(day from period_month) = 1),
  basis text not null,
  quantity numeric(12,2) not null default 0,
  base_amount numeric(12,2) not null default 0,
  amount numeric(12,2) not null default 0,
  status text not null default 'calculated' check (status in ('calculated','approved','paid','cancelled')),
  details jsonb,
  calculated_at timestamptz not null default now(),
  approved_by uuid references auth.users(id) on delete set null,
  paid_at timestamptz
);
create index idx_commissions_period on public.commissions(organization_id, period_month);

-- Calcula comissões do mês (substitui cálculos ainda não aprovados)
create or replace function public.calculate_commissions(p_org uuid, p_month date) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_end date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_tz text := private.org_tz(p_org);
  r record; st record; v_qty numeric; v_base numeric; v_amount numeric; v_count int := 0;
begin
  perform private.require_permission(p_org, 'commissions.create');
  delete from commissions where organization_id = p_org and period_month = v_start and status = 'calculated';

  for r in select * from commission_rules where organization_id = p_org and is_active loop
    for st in select id from staff where organization_id = p_org and deleted_at is null
               and (r.staff_id is null or id = r.staff_id) loop
      v_qty := 0; v_base := 0;
      if r.basis = 'per_session' then
        select count(*) into v_qty from appointments a
         where a.organization_id = p_org and a.staff_id = st.id and a.status <> 'cancelled'
           and (r.service_id is null or a.service_id = r.service_id)
           and (a.starts_at at time zone v_tz)::date >= v_start and (a.starts_at at time zone v_tz)::date < v_end
           and exists (select 1 from appointment_participants ap where ap.appointment_id = a.id and ap.status in ('present','completed'));
        v_amount := v_qty * r.value;
      elsif r.basis = 'per_attendance' then
        select count(*) into v_qty from appointment_participants ap join appointments a on a.id = ap.appointment_id
         where a.organization_id = p_org and a.staff_id = st.id and ap.status in ('present','completed')
           and (r.service_id is null or a.service_id = r.service_id)
           and (a.starts_at at time zone v_tz)::date >= v_start and (a.starts_at at time zone v_tz)::date < v_end;
        v_amount := v_qty * r.value;
      elsif r.basis = 'percent_service' then
        select count(*), coalesce(sum(s.price), 0) into v_qty, v_base
          from appointment_participants ap join appointments a on a.id = ap.appointment_id join services s on s.id = a.service_id
         where a.organization_id = p_org and a.staff_id = st.id and ap.status in ('present','completed')
           and (r.service_id is null or a.service_id = r.service_id)
           and (a.starts_at at time zone v_tz)::date >= v_start and (a.starts_at at time zone v_tz)::date < v_end;
        v_amount := round(v_base * r.value / 100.0, 2);
      elsif r.basis = 'per_sale' then
        select count(*), coalesce(sum(round(price * (1 - discount_percent / 100.0), 2)), 0) into v_qty, v_base
          from subscriptions where organization_id = p_org and seller_staff_id = st.id
           and (r.plan_id is null or plan_id = r.plan_id) and renewed_from_id is null
           and (created_at at time zone v_tz)::date >= v_start and (created_at at time zone v_tz)::date < v_end;
        v_amount := case when r.is_percent then round(v_base * r.value / 100.0, 2) else v_qty * r.value end;
      else -- fixed
        v_qty := 1; v_amount := r.value;
      end if;

      if v_amount > 0 or v_qty > 0 then
        insert into commissions (organization_id, staff_id, rule_id, period_month, basis, quantity, base_amount, amount, details)
        values (p_org, st.id, r.id, v_start, r.basis, v_qty, v_base, v_amount, jsonb_build_object('rule', r.name, 'value', r.value, 'is_percent', r.is_percent));
        v_count := v_count + 1;
      end if;
    end loop;
  end loop;
  return v_count;
end $$;

do $$
declare t text;
begin
  foreach t in array array['inventory_products','equipment_maintenance'] loop
    execute format('create trigger trg_%1$s_updated before update on public.%1$I for each row execute function private.set_updated_at()', t);
    execute format('create trigger trg_%1$s_created_by before insert on public.%1$I for each row execute function private.set_created_by()', t);
  end loop;
  foreach t in array array['inventory_products','inventory_movements','equipment_maintenance','commission_rules','commissions'] loop
    perform private.enable_audit(('public.' || t)::regclass);
  end loop;
end $$;
