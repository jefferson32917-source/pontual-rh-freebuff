-- ============================================================
-- MIGRACAO v3: folga no espelho de ponto + historico de ferias
-- Executar no SQL Editor do Supabase (idempotente).
-- ============================================================

-- 1) Tabela de folgas por dia (marcadas no espelho de ponto)
create table if not exists public.day_off_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  reason text not null default 'Folga programada - dia sem batidas' check (char_length(reason) <= 280),
  status request_status not null default 'pendente',
  reviewer_id uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_note text check (char_length(review_note) <= 280),
  created_at timestamptz not null default now(),
  unique (employee_id, day)
);

alter table public.day_off_requests enable row level security;

drop policy if exists day_off_select on public.day_off_requests;
create policy day_off_select on public.day_off_requests
  for select using (
    employee_id = auth.uid()
    or public.can_manage(employee_id)
  );

drop policy if exists day_off_insert on public.day_off_requests;
create policy day_off_insert on public.day_off_requests
  for insert with check (employee_id = auth.uid());

drop policy if exists day_off_update on public.day_off_requests;
create policy day_off_update on public.day_off_requests
  for update using (public.can_manage(employee_id))
  with check (public.can_manage(employee_id));

create index if not exists idx_day_off_employee on public.day_off_requests(employee_id, day);

-- 2) Tabela de historico de ferias (eventos concluidos/gozados)
create table if not exists public.vacation_history (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  days int not null check (days between 1 and 30),
  kind text not null default 'gozada' check (kind in ('gozada','venda','abono','ajuste')),
  note text check (char_length(note) <= 280),
  admission_date date,
  created_at timestamptz not null default now(),
  check (period_end >= period_start)
);

alter table public.vacation_history enable row level security;

drop policy if exists vac_hist_select on public.vacation_history;
create policy vac_hist_select on public.vacation_history
  for select using (
    employee_id = auth.uid()
    or public.can_manage(employee_id)
  );

drop policy if exists vac_hist_insert on public.vacation_history;
create policy vac_hist_insert on public.vacation_history
  for insert with check (public.can_manage(employee_id) or employee_id = auth.uid());

drop policy if exists vac_hist_delete on public.vacation_history;
create policy vac_hist_delete on public.vacation_history
  for delete using (public.can_manage(employee_id));

create index if not exists idx_vac_hist_employee on public.vacation_history(employee_id, period_start);

-- 3) Ao aprovar ferias, registra automaticamente no historico
create or replace function public.on_vacation_approved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'aprovada' and (old.status is distinct from 'aprovada') then
    insert into public.vacation_history (employee_id, period_start, period_end, days, kind, note, admission_date)
    select new.employee_id, new.start_date, new.end_date, new.days, 'gozada',
           coalesce(new.note, 'Aprovada via sistema'), p.admission_date
    from public.profiles p
    where p.id = new.employee_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_vacation_approved on public.vacation_requests;
create trigger trg_vacation_approved
  after insert or update of status on public.vacation_requests
  for each row execute function public.on_vacation_approved();

-- 4) Saldo de ferias calculado pela data de admissao (CLT simplificado):
--    30 dias apos 12 meses de empresa; pro-rata de 2 dias/mes antes;
--    menos os dias ja gozados registrados no historico.
create or replace function public.calc_vacation_balance(p_employee uuid)
returns int
language sql
stable
set search_path = public
as $$
  with emp as (
    select (current_date - admission_date) as days_employed
    from public.profiles where id = p_employee
  )
  select greatest(0,
    case
      when (select days_employed from emp) >= 365 then 30
      else least(30, floor((select days_employed from emp) / 30) * 2)::int
    end
    - coalesce((select sum(days) from public.vacation_history where employee_id = p_employee and kind = 'gozada'), 0)
  );
$$;
