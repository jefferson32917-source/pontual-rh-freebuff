-- ============================================================
-- migration_v10: refinamentos operacionais
--   1. Lixeira de 30 dias: excluir PDI/feedback/avaliação vira
--      soft delete (tabela trash + coluna deleted_at), com
--      restauração 1:1 pelo gestor.
--   2. update_own_phone: qualquer usuário autenticado atualiza
--      o PRÓPRIO telefone (colaborador não passa pelo
--      admin_update_user, que nega por design).
--   3. update_pdi_by_manager: gestor atualiza/exclui PDIs do
--      seu time de forma confiável (can_manage + criador).
--   4. delete_feedback_by_manager: exclusão (lixeira) de
--      feedback pelo remetente/gestor.
--   5. rpc_purge_expired_trash: purga itens com mais de 30 dias.
--
-- Aplicar no SQL Editor do Supabase. Idempotente.
-- ============================================================

-- 1. Lixeira --------------------------------------------------------------
create table if not exists public.trash (
  id uuid primary key default gen_random_uuid(),
  source_table text not null check (source_table in ('pdis','feedbacks','assessments')),
  source_id uuid not null,
  payload jsonb not null,
  deleted_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz not null default now(),
  unique (source_table, source_id)
);

alter table public.trash enable row level security;

drop policy if exists trash_select on public.trash;
create policy trash_select on public.trash
  for select to authenticated
  using (
    deleted_by = auth.uid()
    or public.is_super_admin()
    or exists (
      select 1 from public.profiles me
      where me.id = auth.uid() and me.role in ('gestor','rh','super_admin')
    )
  );

drop policy if exists trash_insert on public.trash;
create policy trash_insert on public.trash
  for insert to authenticated
  with check (deleted_by = auth.uid() or public.is_super_admin());

drop policy if exists trash_delete on public.trash;
create policy trash_delete on public.trash
  for delete to authenticated
  using (deleted_by = auth.uid() or public.is_super_admin());

-- 2. Soft delete: coluna deleted_at nas três tabelas ----------------------
alter table public.pdis        add column if not exists deleted_at timestamptz;
alter table public.feedbacks   add column if not exists deleted_at timestamptz;
alter table public.assessments add column if not exists deleted_at timestamptz;

-- 3. Telefone próprio ------------------------------------------------------
create or replace function public.update_own_phone(p_phone text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_phone is not null and char_length(p_phone) > 20 then
    raise exception 'PHONE_TOO_LONG';
  end if;
  update public.profiles set phone = coalesce(p_phone, '')
  where id = auth.uid();
end;
$$;

grant execute on function public.update_own_phone(text) to authenticated;

-- 4. PDI: update/delete confiável pelo gestor ------------------------------
-- RLS: o gestor precisa ler o PDI para editar. A policy pdis_read do schema
-- (employee_id = auth.uid() or can_manage) já cobre; complementamos com
-- created_by para o criador sempre ler o próprio PDI.
drop policy if exists pdis_read on public.pdis;
create policy pdis_read on public.pdis
  for select to authenticated
  using (
    employee_id = auth.uid()
    or created_by = auth.uid()
    or public.can_manage(employee_id)
    or public.is_super_admin()
  );

-- Update: dono (etapas/progresso), criador e gestores competentes.
drop policy if exists pdis_write on public.pdis;
create policy pdis_write on public.pdis
  for update to authenticated
  using (
    employee_id = auth.uid()
    or created_by = auth.uid()
    or public.can_manage(employee_id)
    or public.is_super_admin()
  )
  with check (
    employee_id = auth.uid()
    or created_by = auth.uid()
    or public.can_manage(employee_id)
    or public.is_super_admin()
  );

-- 5. Feedback: remetente pode editar/remover (lixeira) ----------------------
drop policy if exists feedbacks_owner_update on public.feedbacks;
create policy feedbacks_owner_update on public.feedbacks
  for update to authenticated
  using (from_id = auth.uid() or to_id = auth.uid())
  with check (from_id = auth.uid() or to_id = auth.uid());

-- 6. Avaliação: criador pode remover (lixeira) ------------------------------
drop policy if exists assessments_owner_update on public.assessments;
create policy assessments_owner_update on public.assessments
  for update to authenticated
  using (created_by = auth.uid() or public.is_super_admin())
  with check (created_by = auth.uid() or public.is_super_admin());

-- 7. RPC load_heavy_data: excluir itens na lixeira das cargas ---------------
drop function if exists public.load_heavy_data();
create or replace function public.load_heavy_data()
returns jsonb
language sql
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'pdis', (select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at), '[]'::jsonb) from public.pdis p where p.deleted_at is null),
    'assessments', (select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc), '[]'::jsonb) from public.assessments a where a.deleted_at is null),
    'feedbacks', (select coalesce(jsonb_agg(to_jsonb(f) order by f.created_at desc), '[]'::jsonb) from public.feedbacks f where f.deleted_at is null),
    'vacancies', (select coalesce(jsonb_agg(to_jsonb(v) order by v.opened_at desc), '[]'::jsonb) from public.vacancies v),
    'requests', (select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]'::jsonb) from public.requests r),
    'request_attachments', (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) from public.request_attachments a),
    'vacations', (select coalesce(jsonb_agg(to_jsonb(v) order by v.created_at desc), '[]'::jsonb) from public.vacation_requests v),
    'vacation_history', (select coalesce(jsonb_agg(to_jsonb(h) order by h.period_start desc), '[]'::jsonb) from public.vacation_history h),
    'day_offs', (select coalesce(jsonb_agg(to_jsonb(d) order by d.day desc), '[]'::jsonb) from public.day_off_requests d),
    'time_entries', (select coalesce(jsonb_agg(to_jsonb(t) order by t.occurred_at desc), '[]'::jsonb) from public.time_entries t),
    'tasks', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb) from public.tasks t),
    'payrolls', (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) from public.payrolls p),
    'hour_bank', (select coalesce(jsonb_agg(to_jsonb(h) order by h.created_at desc), '[]'::jsonb) from public.hour_bank h)
  );
$$;

-- 8. Purga automática: itens com mais de 30 dias são removidos de verdade ---
create or replace function public.purge_expired_trash()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select * from public.trash where deleted_at < now() - interval '30 days'
  loop
    if r.source_table = 'pdis' then
      delete from public.pdis where id = r.source_id;
    elsif r.source_table = 'feedbacks' then
      delete from public.feedbacks where id = r.source_id;
    elsif r.source_table = 'assessments' then
      delete from public.assessments where id = r.source_id;
    end if;
    delete from public.trash where id = r.id;
  end loop;
end;
$$;

-- (Opcional) agendar a purga diária se pg_cron estiver disponível:
-- select cron.schedule('purge-trash-daily', '0 3 * * *', $$ select public.purge_expired_trash(); $$);
