-- =====================================================================
-- Folhas de orientação para entregar ao aluno (impressão)
-- Novo tipo de documento "handout" + modelos prontos por clínica.
-- =====================================================================
alter table public.document_templates drop constraint if exists document_templates_type_check;
alter table public.document_templates add constraint document_templates_type_check check (type in
  ('contract','anamnesis','consent_term','image_authorization','privacy_policy','assessment','certificate','exam','receipt','handout','other'));
alter table public.documents drop constraint if exists documents_type_check;
alter table public.documents add constraint documents_type_check check (type in
  ('contract','anamnesis','consent_term','image_authorization','privacy_policy','assessment','certificate','exam','receipt','handout','other'));

create or replace function private.add_handout_templates(p_org uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from document_templates where organization_id = p_org and type = 'handout') then return; end if;
  insert into document_templates (organization_id, type, name, body, requires_signature) values
  (p_org, 'handout', 'Boas-vindas e orientações gerais',
'Olá, {{nome_aluno}}! Seja bem-vindo(a) à {{empresa}}.

## Antes da aula
- Chegue com 10 minutos de antecedência.
- Use roupas confortáveis que permitam ver o alinhamento do corpo.
- Traga meias antiderrapantes e uma garrafa de água.
- Evite refeições pesadas na hora anterior à aula.

## Durante a aula
- Avise o profissional sobre dores, desconfortos ou mudanças na sua saúde.
- Respeite seus limites: o Pilates não deve causar dor.

## Remarcações e reposições
- Avise com antecedência caso não possa comparecer.
- Consulte as regras de reposição do seu plano com a recepção.

Unidade: {{unidade}} — {{endereco_unidade}}
Data: {{data_hoje}}', false),
  (p_org, 'handout', 'Cuidados após a sessão',
'{{nome_aluno}}, algumas orientações para depois das suas sessões:

- Hidrate-se bem ao longo do dia.
- Um leve desconforto muscular nas primeiras 24–48 h pode acontecer e tende a melhorar sozinho.
- Procure manter a postura que trabalhamos na aula no seu dia a dia: ao sentar, ao usar o celular e ao carregar peso.
- Se sentir dor forte, formigamento, tontura ou inchaço, interrompa as atividades e entre em contato com a equipe.

Data: {{data_hoje}}', false),
  (p_org, 'handout', 'Postura no dia a dia',
'Dicas de postura para {{nome_aluno}}:

## No trabalho (sentado)
- Pés apoiados no chão, joelhos na altura do quadril.
- Tela na altura dos olhos; ombros relaxados.
- Levante e se movimente a cada 50 minutos.

## Ao usar o celular
- Leve o celular à altura dos olhos em vez de inclinar a cabeça.

## Ao pegar peso
- Dobre os joelhos, mantenha o objeto perto do corpo e contraia o abdômen.

## Ao dormir
- Prefira dormir de lado com um travesseiro entre os joelhos, ou de barriga para cima com apoio sob os joelhos.

Data: {{data_hoje}}', false);
end $$;

select private.add_handout_templates(id) from organizations;

create or replace function private.trg_org_handouts() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform private.add_handout_templates(new.id);
  return new;
end $$;
create trigger trg_org_handouts after insert on public.organizations
  for each row execute function private.trg_org_handouts();
revoke execute on function private.add_handout_templates(uuid), private.trg_org_handouts() from public, anon, authenticated;
