-- ============================================================
-- migration_v7: ecossistema de desenvolvimento
--   - Tabela assessments (questionários e avaliações aplicados pelo gestor)
--   - Coluna steps nos PDIs (etapas marcadas pelo colaborador)
--   - Confirmação de leitura de feedbacks (read_at)
--   - RPC load_heavy_data atualizada com a tabela nova
--
-- Aplicar no SQL Editor do Supabase. Idempotente.
-- ============================================================

-- 1. Tabela assessments ------------------------------------------------
create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('questionario', 'avaliacao')),
  title text not null,
  description text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  assigned_to uuid not null references public.profiles(id) on delete cascade,
  questions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.assessments enable row level security;

drop policy if exists assessments_select on public.assessments;
create policy assessments_select on public.assessments
  for select to authenticated
  using (
    assigned_to = auth.uid()
    or created_by = auth.uid()
    or public.can_manage(assigned_to)
    or public.is_super_admin()
  );

drop policy if exists assessments_insert on public.assessments;
create policy assessments_insert on public.assessments
  for insert to authenticated
  with check (created_by = auth.uid() or public.is_super_admin());

drop policy if exists assessments_update on public.assessments;
create policy assessments_update on public.assessments
  for update to authenticated
  using (
    assigned_to = auth.uid()   -- colaborador responde
    or created_by = auth.uid() -- gestor edita/exclui o próprio
    or public.is_super_admin()
  )
  with check (
    assigned_to = auth.uid()
    or created_by = auth.uid()
    or public.is_super_admin()
  );

drop policy if exists assessments_delete on public.assessments;
create policy assessments_delete on public.assessments
  for delete to authenticated
  using (created_by = auth.uid() or public.is_super_admin());

-- 2. Coluna steps nos PDIs ----------------------------------------------
alter table public.pdis add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.pdis add column if not exists steps jsonb not null default '[]'::jsonb;

-- 3. Confirmação de leitura de feedbacks ---------------------------------
alter table public.feedbacks add column if not exists read_at timestamptz;

-- Somente o DESTINATÁRIO pode marcar como lido (não o remetente forjar)
drop policy if exists feedbacks_mark_read on public.feedbacks;
create policy feedbacks_mark_read on public.feedbacks
  for update to authenticated
  using (to_id = auth.uid())
  with check (to_id = auth.uid());

-- 4. RPC load_heavy_data inclui assessments ------------------------------
-- Se a função já existe com outra assinatura (TABLE vs jsonb), o
-- CREATE OR REPLACE falha com 42P13 — por isso o DROP explícito antes.
drop function if exists public.load_heavy_data();
create or replace function public.load_heavy_data()
returns jsonb
language sql
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'pdis', (select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at), '[]'::jsonb) from public.pdis p),
    'assessments', (select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc), '[]'::jsonb) from public.assessments a),
    'feedbacks', (select coalesce(jsonb_agg(to_jsonb(f) order by f.created_at desc), '[]'::jsonb) from public.feedbacks f),
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

-- 5. Fallback paralelo: assessments são tolerados como tabela opcional ---
-- (não requer mudança: loadHeavyDataParallel já trata tabela ausente)
