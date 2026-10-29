-- =====================================================================
-- PilatesFlow — 0016 Vínculos com perfis (permitem exibir nomes via API)
-- profiles.id = auth.users.id, portanto os vínculos são equivalentes.
-- =====================================================================
alter table public.attachments add constraint fk_attachments_uploaded_profile foreign key (uploaded_by) references public.profiles(id) on delete set null;
alter table public.crm_interactions add constraint fk_crm_created_profile foreign key (created_by) references public.profiles(id) on delete set null;
alter table public.tasks add constraint fk_tasks_assignee_profile foreign key (assignee_id) references public.profiles(id) on delete set null;
alter table public.leads add constraint fk_leads_assigned_profile foreign key (assigned_to) references public.profiles(id) on delete set null;
alter table public.clinical_evolutions add constraint fk_evolutions_author_profile foreign key (author_id) references public.profiles(id) on delete set null;
alter table public.messages add constraint fk_messages_created_profile foreign key (created_by) references public.profiles(id) on delete set null;
