-- ============================================================
-- migration_v12: folha visível de verdade
--
-- Bug: payrolls_write/payrolls_read dependiam de can_manage(user_id),
-- que só reconhece o gestor se ele for o manager_id DIRETO do
-- colaborador. Gestor sem vínculo direto → INSERT falha no RLS
-- (silenciosamente, no cliente) e a folha nunca é salva/publicada.
--
-- Correção: gestor/rh da MESMA EMPRESA do colaborador lê e escreve
-- folhas, independente de vínculo manager_id. Colaborador mantém
-- acesso ao próprio.
--
-- Aplicar no SQL Editor do Supabase. Idempotente.
-- ============================================================

drop policy if exists "payrolls_read" on public.payrolls;
create policy "payrolls_read" on public.payrolls
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_super_admin()
    or exists (
      select 1
      from public.profiles alvo, public.profiles me
      where alvo.id = payrolls.user_id
        and me.id = auth.uid()
        and me.role in ('gestor', 'rh')
        and me.company_id = alvo.company_id
    )
  );

drop policy if exists "payrolls_write" on public.payrolls;
create policy "payrolls_write" on public.payrolls
  for all to authenticated
  using (
    user_id = auth.uid()
    or public.is_super_admin()
    or exists (
      select 1
      from public.profiles alvo, public.profiles me
      where alvo.id = payrolls.user_id
        and me.id = auth.uid()
        and me.role in ('gestor', 'rh')
        and me.company_id = alvo.company_id
    )
  )
  with check (
    user_id = auth.uid()
    or public.is_super_admin()
    or exists (
      select 1
      from public.profiles alvo, public.profiles me
      where alvo.id = payrolls.user_id
        and me.id = auth.uid()
        and me.role in ('gestor', 'rh')
        and me.company_id = alvo.company_id
    )
  );
