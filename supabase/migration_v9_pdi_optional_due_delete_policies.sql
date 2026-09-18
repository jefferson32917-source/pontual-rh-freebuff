-- ============================================================
-- migration_v9: refinamentos do ecossistema de desenvolvimento
--   1. PDI: descrição e prazo OPCIONAIS (due_date nullable)
--   2. Gestor pode EXCLUIR PDIs do seu time e feedbacks que enviou
--
-- Aplicar no SQL Editor do Supabase. Idempotente.
-- ============================================================

-- 1. Prazo opcional no PDI -----------------------------------------------
alter table public.pdis alter column due_date drop not null;

-- 2. Exclusão pelo gestor ------------------------------------------------
-- PDIs: além do dono/RH (pdis_write), o gestor criador pode excluir.
drop policy if exists pdis_delete on public.pdis;
create policy pdis_delete on public.pdis
  for delete to authenticated
  using (
    created_by = auth.uid()
    or public.can_manage(employee_id)
    or public.is_super_admin()
  );

-- Feedbacks: o REMETENTE pode excluir o próprio feedback.
drop policy if exists feedbacks_delete on public.feedbacks;
create policy feedbacks_delete on public.feedbacks
  for delete to authenticated
  using (
    from_id = auth.uid()
    or public.can_manage(to_id)
    or public.is_super_admin()
  );
