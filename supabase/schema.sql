-- ============================================================
-- Pontual RH Super — Supabase schema
-- Run this in the Supabase SQL editor (or via migrations).
-- All tables have Row Level Security enabled: the anon key can
-- do nothing until a user is authenticated and policies grant access.
-- ============================================================

create extension if not exists "pgcrypto";

-- ============================================================
-- RESET — remove sobras de execuções anteriores (seguro num
-- projeto novo; não apaga usuários do Supabase Auth).
-- ORDEM IMPORTA: tabelas primeiro — ao caírem levam consigo as
-- policies que dependem de can_manage; funções por último.
-- ============================================================
drop table if exists public.request_attachments cascade;
drop table if exists public.time_entries cascade;
drop table if exists public.vacation_requests cascade;
drop table if exists public.requests cascade;
drop table if exists public.vacancies cascade;
drop table if exists public.feedbacks cascade;
drop table if exists public.pdis cascade;
drop table if exists public.profiles cascade;
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.can_manage(uuid) cascade;
drop type if exists entry_type;
drop type if exists vacation_status;
drop type if exists request_status;
drop type if exists request_type;
drop type if exists vacancy_status;
drop type if exists feedback_kind;
drop type if exists pdi_status;
drop type if exists user_role;

-- ============ Enums ============
create type user_role as enum ('rh', 'gestor', 'colaborador');
create type pdi_status as enum ('em_andamento', 'concluido', 'atrasado');
create type feedback_kind as enum ('positivo', 'melhoria');
create type vacancy_status as enum ('aberta', 'em_processo', 'fechada');
create type request_type as enum ('ferias', 'folga', 'home_office', 'atestado', 'outro');
create type request_status as enum ('pendente', 'aprovado', 'reprovado');
create type vacation_status as enum ('pendente', 'aprovada', 'reprovada', 'gozada');
create type entry_type as enum ('entrada', 'saida_almoco', 'volta_almoco', 'saida');

-- ============ Profiles ============
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null unique,
  role user_role not null default 'colaborador',
  department text not null default 'Geral',
  job_title text not null default 'Colaborador',
  admission_date date not null default current_date,
  manager_id uuid references public.profiles(id),
  avatar_color text not null default '#2563EB',
  vacation_balance_days int not null default 30 check (vacation_balance_days between 0 and 60),
  weekly_schedule jsonb not null default '{"seg":["09:00","18:00"],"ter":["09:00","18:00"],"qua":["09:00","18:00"],"qui":["09:00","18:00"],"sex":["09:00","18:00"]}',
  created_at timestamptz not null default now()
);

-- ============ PDIs / Feedbacks / Vagas ============
create table public.pdis (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text not null default '',
  status pdi_status not null default 'em_andamento',
  due_date date not null,
  progress int not null default 0 check (progress between 0 and 100),
  created_at timestamptz not null default now()
);

create table public.feedbacks (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references public.profiles(id) on delete cascade,
  to_id uuid not null references public.profiles(id) on delete cascade,
  kind feedback_kind not null,
  message text not null check (char_length(message) <= 400),
  anonymous boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.vacancies (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  department text not null,
  status vacancy_status not null default 'aberta',
  opened_at date not null default current_date,
  candidates int not null default 0 check (candidates >= 0),
  created_at timestamptz not null default now()
);

-- ============ Requests (documents / justifications) ============
create table public.requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  type request_type not null,
  period text not null check (char_length(period) <= 80),
  justification text not null check (char_length(justification) <= 280),
  status request_status not null default 'pendente',
  reviewer_id uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_note text check (char_length(review_note) <= 280),
  created_at timestamptz not null default now()
);

-- Attachments: atestados e documentos das requisições
create table public.request_attachments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  file_name text not null check (char_length(file_name) <= 200),
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes <= 5242880),  -- 5 MB
  created_at timestamptz not null default now()
);

-- ============ Férias ============
create table public.vacation_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  days int not null check (days between 1 and 30),
  status vacation_status not null default 'pendente',
  reviewer_id uuid references public.profiles(id),
  reviewed_at timestamptz,
  note text check (char_length(note) <= 280),
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

-- ============ Ponto (quadro de horários) ============
create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  entry_type entry_type not null,
  occurred_at timestamptz not null,
  source text not null default 'web' check (source in ('web','mobile','import')),
  -- local da batida (opcional; visível para gestores/RH)
  latitude double precision,
  longitude double precision,
  accuracy double precision,
  created_at timestamptz not null default now()
);

-- Uma batida de cada tipo por dia. O dia é ancorado no fuso LOCAL de São
-- Paulo (UTC-3 fixo; Brasil sem horário de verão desde 2019) via offset
-- imutável — batidas após 21h locais não caem no "dia seguinte" UTC.
create unique index uq_time_entries_employee_type_day
  on public.time_entries (employee_id, entry_type, ((occurred_at at time zone interval '-3 hours')::date));

-- ============ Helper: quem pode ver um colaborador ============
create or replace function public.can_manage(employee uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role = 'rh' or p.id = (select manager_id from public.profiles where id = employee))
  );
$$;

-- ============ RLS ============
alter table public.profiles enable row level security;
alter table public.pdis enable row level security;
alter table public.feedbacks enable row level security;
alter table public.vacancies enable row level security;
alter table public.requests enable row level security;
alter table public.request_attachments enable row level security;
alter table public.vacation_requests enable row level security;
alter table public.time_entries enable row level security;

-- Profiles: todos autenticados leem o diretório; cada um edita só o próprio perfil (exceto RH)
create policy "profiles_read" on public.profiles
  for select to authenticated using (true);
create policy "profiles_update_self" on public.profiles
  for update to authenticated using (id = auth.uid() or public.can_manage(id));

-- PDIs: dono e gestores leem; dono e RH escrevem
create policy "pdis_read" on public.pdis
  for select to authenticated using (employee_id = auth.uid() or public.can_manage(employee_id));
create policy "pdis_write" on public.pdis
  for all to authenticated using (employee_id = auth.uid() or auth.uid() in (select id from public.profiles where role = 'rh'))
  with check (employee_id = auth.uid() or auth.uid() in (select id from public.profiles where role = 'rh'));

-- Feedbacks: remetente/destinatário e RH leem; qualquer autenticado cria
create policy "feedbacks_read" on public.feedbacks
  for select to authenticated using (from_id = auth.uid() or to_id = auth.uid() or auth.uid() in (select id from public.profiles where role = 'rh'));
create policy "feedbacks_insert" on public.feedbacks
  for insert to authenticated with check (from_id = auth.uid());

-- Vagas: todos autenticados leem; só RH escreve
create policy "vacancies_read" on public.vacancies
  for select to authenticated using (true);
create policy "vacancies_write" on public.vacancies
  for all to authenticated using (auth.uid() in (select id from public.profiles where role = 'rh'))
  with check (auth.uid() in (select id from public.profiles where role = 'rh'));

-- Requisições: dono e gestores competentes leem; dono cria; gestor/RH avalia
create policy "requests_read" on public.requests
  for select to authenticated using (employee_id = auth.uid() or public.can_manage(employee_id));
create policy "requests_insert" on public.requests
  for insert to authenticated with check (employee_id = auth.uid());
create policy "requests_update" on public.requests
  for update to authenticated using (public.can_manage(employee_id));

-- Anexos: herdam a visibilidade da requisição; dono insere
create policy "attachments_read" on public.request_attachments
  for select to authenticated using (
    exists (select 1 from public.requests r where r.id = request_id and (r.employee_id = auth.uid() or public.can_manage(r.employee_id)))
  );
create policy "attachments_insert" on public.request_attachments
  for insert to authenticated with check (
    exists (select 1 from public.requests r where r.id = request_id and r.employee_id = auth.uid())
  );

-- Férias: dono e gestores leem; dono cria; gestor/RH avalia
create policy "vacations_read" on public.vacation_requests
  for select to authenticated using (employee_id = auth.uid() or public.can_manage(employee_id));
create policy "vacations_insert" on public.vacation_requests
  for insert to authenticated with check (employee_id = auth.uid());
create policy "vacations_update" on public.vacation_requests
  for update to authenticated using (public.can_manage(employee_id));

-- Ponto: cada um vê/registrar o próprio; gestores leem da equipe
create policy "time_entries_read" on public.time_entries
  for select to authenticated using (employee_id = auth.uid() or public.can_manage(employee_id));
create policy "time_entries_insert" on public.time_entries
  for insert to authenticated with check (employee_id = auth.uid());
create policy "time_entries_delete" on public.time_entries
  for delete to authenticated using (employee_id = auth.uid() and occurred_at > now() - interval '2 hours');

-- ============ Storage bucket (anexos) ============
insert into storage.buckets (id, name, public) values ('request-docs', 'request-docs', false)
  on conflict (id) do nothing;

-- Projetos novos do Supabase não permitem criar policies em storage.objects
-- pelo SQL Editor ("must be owner of table objects"). Tentamos; se o Supabase
-- recusar, seguimos em frente (crie-as depois em Storage > Policies).
do $$
begin
  execute $p$drop policy if exists "docs_read" on storage.objects$p$;
  execute $p$drop policy if exists "docs_insert" on storage.objects$p$;
  execute $p$create policy "docs_read" on storage.objects
    for select to authenticated using (bucket_id = 'request-docs')$p$;
  execute $p$create policy "docs_insert" on storage.objects
    for insert to authenticated with check (bucket_id = 'request-docs')$p$;
exception
  when insufficient_privilege then
    raise notice 'Policies do bucket request-docs nao criadas via SQL. Crie em Storage > Policies.';
end $$;

-- ============ Trigger: cria perfil no signup ============
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', 'Novo usuário'), new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ Índices ============
create index idx_pdis_employee on public.pdis(employee_id);
create index idx_requests_employee on public.requests(employee_id, status);
create index idx_vacations_employee on public.vacation_requests(employee_id, status);
create index idx_time_entries_day on public.time_entries(employee_id, occurred_at desc);
