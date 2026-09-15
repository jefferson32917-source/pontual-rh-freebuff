-- ============================================================
-- Pontual RH Super — Migration v2
-- Estende o schema para o modelo completo do app:
-- empresas, matrícula, folha, banco de horas, tarefas,
-- papel super_admin, RPCs administrativas e dados iniciais.
-- Usuários de exemplo são criados como CONTAS REAIS de Auth
-- (auth.users, bcrypt) — o login é via Supabase Auth.
-- ============================================================

-- ============================================================
-- 1. ENUMS — adiciona super_admin
-- ============================================================
alter type user_role add value if not exists 'super_admin';

-- ============================================================
-- 2. FUNÇÕES DE APOIO (antes de qualquer policy que as use)
-- ============================================================
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'super_admin'
  );
$$;

-- v1 usava role 'rh'; o app usa 'super_admin' — cobrimos ambos
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
      and (
        p.role in ('rh', 'super_admin')
        or p.id = (select manager_id from public.profiles where id = employee)
      )
  );
$$;

-- ============================================================
-- 3. TABELA DE EMPRESAS (tenant)
-- ============================================================
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  initials text not null unique check (char_length(initials) between 1 and 4),
  cnpj text not null check (char_length(cnpj) <= 20),
  address text not null default '',
  cep text not null default '',
  bairro text not null default '',
  city text not null default '',
  uf text not null default '',
  state_registration text not null default '',
  responsible_name text not null default '',
  responsible_phone text not null default '',
  created_at timestamptz not null default now(),
  active boolean not null default true
);
alter table public.companies enable row level security;
drop policy if exists "companies_read" on public.companies;
create policy "companies_read" on public.companies
  for select to authenticated using (true);
drop policy if exists "companies_admin" on public.companies;
create policy "companies_admin" on public.companies
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- ============================================================
-- 4. PROFILES — colunas do domínio completo do app
-- ============================================================
alter table public.profiles add column if not exists company_id uuid references public.companies(id) on delete set null;
alter table public.profiles add column if not exists matricula text;
alter table public.profiles add column if not exists photo_url text;
alter table public.profiles add column if not exists base_salary numeric(12,2) not null default 0;
alter table public.profiles add column if not exists transport_allowance boolean not null default false;
alter table public.profiles add column if not exists cpf text not null default '';
alter table public.profiles add column if not exists ctps text not null default '';
alter table public.profiles add column if not exists phone text not null default '';
alter table public.profiles add column if not exists address text not null default '';
alter table public.profiles add column if not exists cep text not null default '';
alter table public.profiles add column if not exists confidential_notes text not null default '';
alter table public.profiles add column if not exists dependents int not null default 0 check (dependents between 0 and 30);
alter table public.profiles add column if not exists alimony_percent numeric(5,2) not null default 0 check (alimony_percent between 0 and 100);
alter table public.profiles add column if not exists active boolean not null default true;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_matricula_unique') then
    alter table public.profiles add constraint profiles_matricula_unique unique (matricula);
  end if;
end $$;

-- ============================================================
-- 5. NOVAS TABELAS: tasks, payrolls, hour_bank
-- ============================================================
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 160),
  done boolean not null default false,
  due date,
  created_at timestamptz not null default now()
);
alter table public.tasks enable row level security;
drop policy if exists "tasks_rw" on public.tasks;
create policy "tasks_rw" on public.tasks
  for all to authenticated
  using (user_id = auth.uid() or public.is_super_admin())
  with check (user_id = auth.uid() or public.is_super_admin());

create table if not exists public.payrolls (
  id uuid primary key default gen_random_uuid(),
  reference text not null,                                    -- AAAA-MM
  user_id uuid not null references public.profiles(id) on delete cascade,
  company_id uuid not null references public.companies(id),
  snapshot jsonb not null default '{}',                        -- snapshot completo do holerite
  version int not null default 1,
  state text not null default 'rascunho' check (state in ('rascunho','publicada')),
  superseded_by uuid references public.payrolls(id),
  published_at timestamptz,
  unpublished_at timestamptz,
  unpublished_reason text,
  generated_at timestamptz not null default now(),
  unique (user_id, reference, version)
);
alter table public.payrolls enable row level security;
drop policy if exists "payrolls_read" on public.payrolls;
create policy "payrolls_read" on public.payrolls
  for select to authenticated
  using (user_id = auth.uid() or public.can_manage(user_id) or public.is_super_admin());
drop policy if exists "payrolls_write" on public.payrolls;
create policy "payrolls_write" on public.payrolls
  for all to authenticated
  using (user_id = auth.uid() or public.can_manage(user_id) or public.is_super_admin())
  with check (user_id = auth.uid() or public.can_manage(user_id) or public.is_super_admin());

create table if not exists public.hour_bank (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  hours numeric(7,2) not null,
  reason text not null check (char_length(reason) between 1 and 200),
  payroll_id uuid references public.payrolls(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.hour_bank enable row level security;
drop policy if exists "hour_bank_read" on public.hour_bank;
create policy "hour_bank_read" on public.hour_bank
  for select to authenticated
  using (user_id = auth.uid() or public.can_manage(user_id));
drop policy if exists "hour_bank_insert" on public.hour_bank;
create policy "hour_bank_insert" on public.hour_bank
  for insert to authenticated
  with check (user_id = auth.uid() or public.can_manage(user_id));

-- ============================================================
-- 6. RLS: super_admin enxerga e escreve tudo nas tabelas do app
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['profiles','pdis','feedbacks','vacancies','requests','request_attachments','vacation_requests','time_entries']
  loop
    execute format('drop policy if exists "sa_full_access" on public.%I', t);
    execute format(
      'create policy "sa_full_access" on public.%I for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin())',
      t
    );
  end loop;
end $$;

-- ============================================================
-- 7. RPCs ADMINISTRATIVAS (o browser não tem permissão direta
--    em auth.users; estas funções rodam como donas do banco)
-- ============================================================

-- Criar usuário completo: conta Auth + perfil
create or replace function public.admin_create_user(
  p_email text,
  p_password text,
  p_name text,
  p_role user_role,
  p_company_id uuid,
  p_matricula text,
  p_job_title text default 'Colaborador',
  p_department text default 'Geral',
  p_base_salary numeric default 0,
  p_admission_date date default current_date,
  p_manager_id uuid default null,
  p_avatar_color text default '#2563EB',
  p_vacation_balance int default 30,
  p_weekly_schedule jsonb default '{"seg":["09:00","18:00"],"ter":["09:00","18:00"],"qua":["09:00","18:00"],"qui":["09:00","18:00"],"sex":["09:00","18:00"]}',
  p_cpf text default '',
  p_ctps text default '',
  p_phone text default '',
  p_address text default '',
  p_cep text default '',
  p_confidential text default '',
  p_dependents int default 0,
  p_alimony numeric default 0,
  p_transport boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('super_admin','rh','gestor')
  ) then
    raise exception 'PERMISSION_DENIED';
  end if;
  if exists (select 1 from public.profiles where id = auth.uid() and role = 'gestor')
     and (p_role <> 'colaborador'
          or p_company_id is distinct from (select company_id from public.profiles where id = auth.uid())) then
    raise exception 'PERMISSION_DENIED';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  ) values (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    lower(p_email), crypt(p_password, gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('name', p_name)
  )
  returning id into v_uid;

  insert into public.profiles (
    id, name, email, role, company_id, matricula, job_title, department,
    admission_date, manager_id, avatar_color, vacation_balance_days,
    weekly_schedule, base_salary, transport_allowance, cpf, ctps, phone,
    address, cep, confidential_notes, dependents, alimony_percent, active
  ) values (
    v_uid, p_name, lower(p_email), p_role, p_company_id, p_matricula,
    p_job_title, p_department, p_admission_date, p_manager_id, p_avatar_color,
    p_vacation_balance, p_weekly_schedule, p_base_salary, p_transport, p_cpf,
    p_ctps, p_phone, p_address, p_cep, p_confidential, p_dependents,
    p_alimony, true
  );
  return v_uid;
end;
$$;

-- Atualizar usuário: perfil + credenciais (se informadas)
create or replace function public.admin_update_user(
  p_id uuid,
  p_name text default null,
  p_email text default null,
  p_password text default null,
  p_job_title text default null,
  p_department text default null,
  p_base_salary numeric default null,
  p_manager_id uuid default null,
  p_cpf text default null,
  p_ctps text default null,
  p_phone text default null,
  p_address text default null,
  p_cep text default null,
  p_confidential text default null,
  p_dependents int default null,
  p_alimony numeric default null,
  p_transport boolean default null,
  p_active boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('super_admin','rh','gestor')
  ) then
    raise exception 'PERMISSION_DENIED';
  end if;
  if exists (select 1 from public.profiles where id = auth.uid() and role = 'gestor')
     and not exists (
       select 1 from public.profiles alvo
       where alvo.id = p_id
         and alvo.role = 'colaborador'
         and alvo.company_id = (select company_id from public.profiles where id = auth.uid())
     ) then
    raise exception 'PERMISSION_DENIED';
  end if;

  update public.profiles set
    name = coalesce(p_name, name),
    email = coalesce(lower(p_email), email),
    job_title = coalesce(p_job_title, job_title),
    department = coalesce(p_department, department),
    base_salary = coalesce(p_base_salary, base_salary),
    manager_id = coalesce(p_manager_id, manager_id),
    cpf = coalesce(p_cpf, cpf),
    ctps = coalesce(p_ctps, ctps),
    phone = coalesce(p_phone, phone),
    address = coalesce(p_address, address),
    cep = coalesce(p_cep, cep),
    confidential_notes = coalesce(p_confidential, confidential_notes),
    dependents = coalesce(p_dependents, dependents),
    alimony_percent = coalesce(p_alimony, alimony_percent),
    transport_allowance = coalesce(p_transport, transport_allowance),
    active = coalesce(p_active, active)
  where id = p_id;

  if p_email is not null then
    update auth.users set email = lower(p_email), updated_at = now() where id = p_id;
  end if;
  if p_password is not null and char_length(p_password) > 0 then
    update auth.users
    set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now()
    where id = p_id;
  end if;
end;
$$;

-- Excluir usuário (conta Auth + perfil + dados em cascata)
create or replace function public.admin_delete_user(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from auth.users where id = p_id;
$$;

grant execute on function
  public.admin_create_user(text,text,text,user_role,uuid,text,text,text,numeric,date,uuid,text,int,jsonb,text,text,text,text,text,text,int,numeric,boolean),
  public.admin_update_user(uuid,text,text,text,text,text,numeric,uuid,text,text,text,text,text,text,int,numeric,boolean,boolean),
  public.admin_delete_user(uuid)
to authenticated;
revoke execute on function
  public.admin_create_user(text,text,text,user_role,uuid,text,text,text,numeric,date,uuid,text,int,jsonb,text,text,text,text,text,text,int,numeric,boolean),
  public.admin_update_user(uuid,text,text,text,text,text,numeric,uuid,text,text,text,text,text,text,int,numeric,boolean,boolean),
  public.admin_delete_user(uuid)
from anon;

-- ============================================================
-- 8. SEED — dados iniciais reais (idempotente)
-- ============================================================
do $$
declare
  c_sc uuid; c_mt uuid;
  sa uuid; g_rafael uuid; g_helena uuid;
  u_beatriz uuid; u_carlos uuid; u_fernanda uuid; u_pedro uuid;
begin
  if exists (select 1 from public.companies) then
    raise notice 'Seed pulado: já existem empresas.';
    return;
  end if;

  -- ---- Empresas ----
  insert into public.companies (name, initials, cnpj, address, cep, bairro, city, uf)
  values ('Silva Construções', 'SC', '12.345.678/0001-90', 'Av. das Obras, 1500', '04551-000', 'Vila Olímpia', 'São Paulo', 'SP')
  returning id into c_sc;
  insert into public.companies (name, initials, cnpj, city, uf)
  values ('Mariana Tech', 'MT', '98.765.432/0001-10', 'Campinas', 'SP')
  returning id into c_mt;

  -- ---- Contas Auth reais (bcrypt) ----
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    'admin@pontual.com', crypt('admin123', gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{"name":"Administrador Pontual"}'::jsonb)
  returning id into sa;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    'rafael.almeida@silvaconstrucoes.com', crypt('pulsar123', gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{"name":"Rafael Almeida"}'::jsonb)
  returning id into g_rafael;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    'helena.souza@marianatech.com', crypt('pulsar123', gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{"name":"Helena Souza"}'::jsonb)
  returning id into g_helena;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    'beatriz.lima@silvaconstrucoes.com', crypt('pulsar123', gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{"name":"Beatriz Lima"}'::jsonb)
  returning id into u_beatriz;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    'carlos.nunes@silvaconstrucoes.com', crypt('pulsar123', gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{"name":"Carlos Nunes"}'::jsonb)
  returning id into u_carlos;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    'fernanda.dias@silvaconstrucoes.com', crypt('pulsar123', gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{"name":"Fernanda Dias"}'::jsonb)
  returning id into u_fernanda;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    'pedro.rocha@marianatech.com', crypt('pulsar123', gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{"name":"Pedro Rocha"}'::jsonb)
  returning id into u_pedro;

  -- ---- Perfis ----
  insert into public.profiles (id, name, email, role, company_id, matricula, department, job_title, admission_date, avatar_color, vacation_balance_days, weekly_schedule, base_salary, transport_allowance, dependents)
  values (sa, 'Administrador Pontual', 'admin@pontual.com', 'super_admin', null, null, 'Diretoria', 'Super Administrador', '2023-01-02', '#1E293B', 0, '{}', 0, false, 0);

  insert into public.profiles (id, name, email, role, company_id, matricula, department, job_title, admission_date, avatar_color, vacation_balance_days, weekly_schedule, base_salary, transport_allowance, dependents)
  values (g_rafael, 'Rafael Almeida', 'rafael.almeida@silvaconstrucoes.com', 'gestor', c_sc, 'SG001', 'Engenharia', 'Gerente de Obras', '2018-07-02', '#0D9488', 22,
    '{"seg":["08:00","17:00"],"ter":["08:00","17:00"],"qua":["08:00","17:00"],"qui":["08:00","17:00"],"sex":["08:00","16:00"]}', 9500, true, 1);

  insert into public.profiles (id, name, email, role, company_id, matricula, department, job_title, admission_date, avatar_color, vacation_balance_days, weekly_schedule, base_salary, transport_allowance, dependents)
  values (g_helena, 'Helena Souza', 'helena.souza@marianatech.com', 'gestor', c_mt, 'MG001', 'Tecnologia', 'Gerente de Produto', '2021-02-08', '#9333EA', 28,
    '{"seg":["09:00","18:00"],"ter":["09:00","18:00"],"qua":["09:00","18:00"],"qui":["09:00","18:00"],"sex":["09:00","17:00"]}', 12000, false, 0);

  insert into public.profiles (id, name, email, role, company_id, matricula, department, job_title, admission_date, manager_id, avatar_color, vacation_balance_days, weekly_schedule, base_salary, transport_allowance, dependents)
  values (u_beatriz, 'Beatriz Lima', 'beatriz.lima@silvaconstrucoes.com', 'colaborador', c_sc, 'SC001', 'Engenharia', 'Técnica de Segurança do Trabalho', '2022-01-17', g_rafael, '#7C3AED', 30,
    '{"seg":["09:00","18:00"],"ter":["09:00","18:00"],"qua":["09:00","18:00"],"qui":["09:00","18:00"],"sex":["09:00","17:00"]}', 4200, true, 0);

  insert into public.profiles (id, name, email, role, company_id, matricula, department, job_title, admission_date, manager_id, avatar_color, vacation_balance_days, weekly_schedule, base_salary, transport_allowance, dependents)
  values (u_carlos, 'Carlos Nunes', 'carlos.nunes@silvaconstrucoes.com', 'colaborador', c_sc, 'SC002', 'Obras', 'Mestre de Obras', '2020-09-14', g_rafael, '#DB2777', 12,
    '{"seg":["07:00","16:00"],"ter":["07:00","16:00"],"qua":["07:00","16:00"],"qui":["07:00","16:00"],"sex":["07:00","15:00"]}', 3100, true, 2);

  insert into public.profiles (id, name, email, role, company_id, matricula, department, job_title, admission_date, manager_id, avatar_color, vacation_balance_days, weekly_schedule, base_salary, transport_allowance, dependents)
  values (u_fernanda, 'Fernanda Dias', 'fernanda.dias@silvaconstrucoes.com', 'colaborador', c_sc, 'SC003', 'Comercial', 'Executiva de Contas', '2021-05-03', g_rafael, '#EA580C', 25,
    '{"seg":["09:00","18:00"],"ter":["09:00","18:00"],"qua":["09:00","18:00"],"qui":["09:00","18:00"],"sex":["09:00","17:00"]}', 3800, false, 0);

  insert into public.profiles (id, name, email, role, company_id, matricula, department, job_title, admission_date, manager_id, avatar_color, vacation_balance_days, weekly_schedule, base_salary, transport_allowance, dependents)
  values (u_pedro, 'Pedro Rocha', 'pedro.rocha@marianatech.com', 'colaborador', c_mt, 'MC001', 'Tecnologia', 'Desenvolvedor Pleno', '2023-04-10', g_helena, '#0284C7', 30,
    '{"seg":["09:00","18:00"],"ter":["09:00","18:00"],"qua":["09:00","18:00"],"qui":["09:00","18:00"],"sex":["09:00","17:00"]}', 7800, true, 1);

  -- ---- PDIs ----
  insert into public.pdis (employee_id, title, description, status, due_date, progress) values
    (u_beatriz, 'Certificação NR-35 (Trabalho em Altura)', 'Reciclagem anual obrigatória com parte prática.', 'em_andamento', '2026-10-30', 65),
    (u_beatriz, 'Liderança de canteiro', 'Assumir a coordenação do canteiro da obra Centro.', 'atrasado', '2026-08-15', 40),
    (u_carlos, 'Mentoria de aprendizes', 'Mentorear dois aprendizes durante o primeiro trimestre.', 'em_andamento', '2026-11-20', 55),
    (u_fernanda, 'Curso de negociação avançada', 'Finalizar trilha de negociações e apresentar case interno.', 'concluido', '2026-07-31', 100);

  -- ---- Feedbacks ----
  insert into public.feedbacks (from_id, to_id, kind, message, created_at, anonymous) values
    (g_rafael, u_beatriz, 'positivo', 'Excelente condução do incidente da semana passada, comunicação clara com o cliente.', '2026-09-01T14:30:00Z', false),
    (g_rafael, u_carlos, 'melhoria', 'Priorizar revisões de checklist antes de liberar as etapas da obra.', '2026-08-28T10:00:00Z', false),
    (u_fernanda, u_beatriz, 'positivo', 'Muito parceira na migração do relatório, ajudou fora do horário.', '2026-09-05T18:45:00Z', false);

  -- ---- Vagas ----
  insert into public.vacancies (title, department, status, opened_at, candidates) values
    ('Engenheiro Civil', 'Engenharia', 'aberta', '2026-08-10', 23),
    ('Auxiliar Administrativo', 'Administrativo', 'em_processo', '2026-07-22', 41),
    ('Designer de Produto', 'Produto', 'fechada', '2026-06-05', 67);

  -- ---- Requisições ----
  insert into public.requests (employee_id, type, period, justification, status, created_at) values
    (u_beatriz, 'atestado', '10/09/2026', 'Consulta médica com retorno no mesmo dia. Atestado em anexo.', 'pendente', '2026-09-10T08:05:00Z'),
    (u_fernanda, 'folga', '25/09/2026', 'Compensação de horas extras do fechamento do trimestre.', 'aprovado', '2026-08-30T16:40:00Z');

  -- ---- Férias ----
  insert into public.vacation_requests (employee_id, start_date, end_date, days, status, created_at) values
    (u_beatriz, '2026-12-10', '2026-12-24', 15, 'pendente', '2026-09-08T09:20:00Z'),
    (u_carlos, '2026-10-05', '2026-10-16', 12, 'aprovada', '2026-08-15T11:00:00Z'),
    (u_fernanda, '2026-11-02', '2026-11-06', 5, 'pendente', '2026-09-09T15:30:00Z');

  -- ---- Ponto (batidas recentes) ----
  insert into public.time_entries (employee_id, entry_type, occurred_at) values
    (u_beatriz, 'entrada', '2026-09-11T09:02:00-03:00'),
    (u_beatriz, 'saida_almoco', '2026-09-11T12:05:00-03:00'),
    (u_beatriz, 'volta_almoco', '2026-09-11T13:04:00-03:00'),
    (u_beatriz, 'saida', '2026-09-11T18:10:00-03:00'),
    (u_carlos, 'entrada', '2026-09-11T08:01:00-03:00'),
    (u_carlos, 'saida_almoco', '2026-09-11T12:00:00-03:00'),
    (u_carlos, 'volta_almoco', '2026-09-11T13:02:00-03:00'),
    (u_carlos, 'saida', '2026-09-11T17:05:00-03:00'),
    (u_beatriz, 'entrada', '2026-09-10T09:00:00-03:00'),
    (u_beatriz, 'saida_almoco', '2026-09-10T12:10:00-03:00'),
    (u_beatriz, 'volta_almoco', '2026-09-10T13:05:00-03:00'),
    (u_beatriz, 'saida', '2026-09-10T18:03:00-03:00'),
    (u_carlos, 'entrada', '2026-09-10T08:03:00-03:00'),
    (u_carlos, 'saida_almoco', '2026-09-10T12:02:00-03:00'),
    (u_carlos, 'volta_almoco', '2026-09-10T13:00:00-03:00'),
    (u_carlos, 'saida', '2026-09-10T17:02:00-03:00');

  -- ---- Tarefas ----
  insert into public.tasks (user_id, label, done, due) values
    (g_rafael, 'Validar PDI da Beatriz', false, '2026-09-15'),
    (g_rafael, '1:1 com Carlos e Fernanda', false, '2026-09-17'),
    (u_beatriz, 'Renovar certificação NR-35', false, '2026-09-18'),
    (u_beatriz, 'Enviar feedback para Fernanda', true, null);

  raise notice 'Seed concluído.';
end $$;
