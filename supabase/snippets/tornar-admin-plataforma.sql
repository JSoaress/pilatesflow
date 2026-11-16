-- Rode UMA vez no Supabase (SQL Editor) trocando o e-mail pelo seu login no PilatesFlow.
-- Isso dá acesso ao "Painel da plataforma" (/plataforma), onde você libera, estende e bloqueia clínicas.
insert into public.platform_admins (user_id)
select id from auth.users where email = 'SEU-EMAIL-AQUI'
on conflict do nothing;

-- Opcional: liberar a sua própria clínica sem prazo (troque o nome).
-- update public.organizations set license_status = 'active', license_expires_at = null where name = 'NOME DA SUA CLÍNICA';
