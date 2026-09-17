-- ============================================================
-- Policies do bucket público `avatars` (fotos de perfil).
--
-- SEM ISSO, O UPLOAD FALHA COM 403: o bucket foi criado, mas nenhum
-- usuário autenticado tinha permissão de INSERT/UPDATE/SELECT nos
-- objetos — as fotos não salvam e não aparecem.
--
-- Estratégia: cada usuário grava apenas na própria pasta `{user_id}/`
-- (padrão de path usado pelo app em photo.ts). Leitura é pública
-- (bucket público) para a foto aparecer para todos os usuários.
--
-- NOTA: se o SQL Editor recusar ("must be owner of table objects"),
-- crie as policies manualmente em Storage > Policies > avatars com as
-- mesmas expressões abaixo.
-- ============================================================

do $$
begin
  -- Leitura: pública (o bucket é público; policy alinha com o acesso via URL)
  execute $p$create policy "avatars_read"
    on storage.objects for select
    using (bucket_id = 'avatars')$p$;

  -- Inserção: usuário autenticado só na PRÓPRIA pasta (storage.foldername)
  execute $p$create policy "avatars_insert"
    on storage.objects for insert to authenticated
    with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)$p$;

  -- Atualização (upsert da foto: sobrescreve o avatar.webp anterior)
  execute $p$create policy "avatars_update"
    on storage.objects for update to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
    with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)$p$;

  -- Remoção (ao excluir a foto do perfil)
  execute $p$create policy "avatars_delete"
    on storage.objects for delete to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)$p$;

  exception
  when duplicate_object then
    raise notice 'Policies do bucket avatars ja existem.';
  when insufficient_privilege then
    raise notice 'Policies do bucket avatars nao criadas via SQL. Crie em Storage > Policies.';
end $$;
