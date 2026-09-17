-- ============================================================
-- migration_v6: gestão de ponto pelo gestor, flags de usuário/empresa,
-- atestado estruturado e auditoria de ajustes de batida.
--
-- Aplicar no SQL Editor do Supabase. Idempotente (IF NOT EXISTS).
-- ============================================================

-- 1. Novas colunas ------------------------------------------------------
alter table public.profiles add column if not exists requires_punch boolean not null default true;
alter table public.companies add column if not exists payroll_enabled boolean not null default true;
alter table public.time_entries
  add column if not exists adjustment_note text,
  add column if not exists adjusted_by text;
alter table public.requests
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists days_count int,
  add column if not exists return_date date,
  add column if not exists cid text,
  add column if not exists review_note text;

-- 2. GESTOR edita batidas dos liderados (com auditoria no app) ----------
-- Antes: insert/delete apenas do próprio. Agora: can_manage (manager_id) e SA.
drop policy if exists "time_entries_insert" on public.time_entries;
create policy "time_entries_insert" on public.time_entries
  for insert to authenticated
  with check (employee_id = auth.uid() or public.can_manage(employee_id) or public.is_super_admin());

drop policy if exists "time_entries_delete" on public.time_entries;
create policy "time_entries_delete" on public.time_entries
  for delete to authenticated
  using (
    (employee_id = auth.uid() and occurred_at > now() - interval '2 hours') -- próprio: só até 2h
    or public.can_manage(employee_id)
    or public.is_super_admin()
  );

-- 3. Gestor lê/atualiza requires_punch dos liderados (via profiles_update_self
--    que já cobre can_manage) — nada a fazer para profiles.
--    companies: gestor gerencia a própria empresa (payroll_enabled).
drop policy if exists "companies_update" on public.companies;
create policy "companies_update" on public.companies
  for update to authenticated
  using (public.is_super_admin() or public.can_manage((select id from public.companies c limit 1)) or id in (
    select company_id from public.profiles where auth.uid() = id and role in ('gestor','super_admin')
  ))
  with check (id in (
    select company_id from public.profiles where auth.uid() = id and role in ('gestor','super_admin')
  ));

-- simplificação: gestor atualiza APENAS a própria empresa
drop policy if exists "companies_update" on public.companies;
create policy "companies_update" on public.companies
  for update to authenticated
  using (
    public.is_super_admin()
    or id = (select company_id from public.profiles where id = auth.uid())
  )
  with check (
    public.is_super_admin()
    or id = (select company_id from public.profiles where id = auth.uid())
  );

-- RPC load_heavy_data: atualizar para incluir colunas novas (recria a função)
CREATE OR REPLACE FUNCTION public.load_heavy_data()
RETURNS TABLE (
  pdis jsonb, feedbacks jsonb, vacancies jsonb, requests jsonb,
  request_attachments jsonb, vacations jsonb, time_entries jsonb,
  tasks jsonb, payrolls jsonb, hour_bank jsonb,
  vacation_history jsonb, day_offs jsonb
)
LANGUAGE sql SECURITY INVOKER STABLE
AS $$
  SELECT
    COALESCE((SELECT jsonb_agg(t ORDER BY t.id) FROM public.pdis t), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(t ORDER BY t.created_at DESC) FROM public.feedbacks t), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(t ORDER BY t.opened_at DESC) FROM public.vacancies t), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(t ORDER BY t.created_at DESC) FROM public.requests t), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(t) FROM public.request_attachments t), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(t ORDER BY t.created_at DESC) FROM public.vacation_requests t), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(t ORDER BY t.occurred_at DESC) FROM public.time_entries t), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(t ORDER BY t.created_at) FROM public.tasks t), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(t) FROM public.payrolls t), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(t ORDER BY t.created_at DESC) FROM public.hour_bank t), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(t ORDER BY t.period_start DESC) FROM public.vacation_history t), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(t ORDER BY t.day DESC) FROM public.day_off_requests t), '[]'::jsonb);
$$;

GRANT EXECUTE ON FUNCTION public.load_heavy_data() TO authenticated;

-- 4. Gestores existentes: NÃO batem ponto por padrão (pedido #2) --------
update public.profiles p
set requires_punch = false
where p.role = 'gestor'
  and not exists (
    select 1 from public.time_entries te
    where te.employee_id = p.id
  );

-- SA também não bate
update public.profiles set requires_punch = false where role = 'super_admin';
