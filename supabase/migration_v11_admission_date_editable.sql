-- ============================================================
-- migration_v11: data de admissão EXATA editável pelo gestor
--
-- A data de admissão é a base do cálculo proporcional de férias
-- (2,5 dias/mês). O admin_update_user não tinha parâmetro para ela:
-- aqui a função é recriada com p_admission_date.
--
-- Aplicar no SQL Editor do Supabase. Idempotente.
-- ============================================================

create or replace function public.admin_update_user(
  p_id uuid,
  p_name text default null,
  p_email text default null,
  p_password text default null,
  p_job_title text default null,
  p_department text default null,
  p_base_salary numeric default null,
  p_admission_date date default null,
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
declare
  caller_role user_role;
  caller_company uuid;
begin
  select role, company_id into caller_role, caller_company
  from public.profiles where id = auth.uid();

  if caller_role is null or caller_role not in ('super_admin','rh','gestor') then
    raise exception 'PERMISSION_DENIED';
  end if;

  -- Gestor só edita COLABORADOR da própria empresa
  if caller_role = 'gestor' then
    if not exists (
      select 1 from public.profiles alvo
      where alvo.id = p_id
        and alvo.role = 'colaborador'
        and alvo.company_id = caller_company
    ) then
      raise exception 'PERMISSION_DENIED';
    end if;
  end if;

  update public.profiles set
    name = coalesce(p_name, name),
    email = coalesce(lower(p_email), email),
    job_title = coalesce(p_job_title, job_title),
    department = coalesce(p_department, department),
    base_salary = coalesce(p_base_salary, base_salary),
    admission_date = coalesce(p_admission_date, admission_date),
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
end;
$$;

-- Permissões de execução (reafirma as originais após o replace)
revoke execute on function
  public.admin_update_user(uuid,text,text,text,text,text,numeric,date,uuid,text,text,text,text,text,int,numeric,boolean,boolean)
from anon;
grant execute on function
  public.admin_update_user(uuid,text,text,text,text,text,numeric,date,uuid,text,text,text,text,text,int,numeric,boolean,boolean)
to authenticated;

-- Nota: como adicionamos um parâmetro, o Postgres cria uma função NOVA e a
-- antiga (sem date) permanece. O app chama a nova (com p_admission_date).
-- Removemos a antiga para evitar ambiguidade de resolução:
drop function if exists public.admin_update_user(uuid,text,text,text,text,text,numeric,uuid,text,text,text,text,text,text,int,numeric,boolean,boolean);
