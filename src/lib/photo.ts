import { getSupabase } from './supabase'

/**
 * Fotos de perfil:
 * - Compressão no cliente: redimensiona para 256x256 (cover) e codifica em
 *   WebP (~10–30 KB, contra 1–5 MB de um dataURL original).
 * - Armazenamento no bucket público `avatars` do Supabase Storage, servido
 *   por CDN com cache — a foto não viaja mais dentro do payload de dados.
 */

const AVATAR_SIZE = 256

/** Comprime a imagem escolhida: 256x256 cover, WebP qualidade 0.82. */
export async function compressAvatar(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = AVATAR_SIZE
  canvas.height = AVATAR_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas não suportado neste navegador.')
  // recorte central (cover)
  const side = Math.min(bitmap.width, bitmap.height)
  const sx = (bitmap.width - side) / 2
  const sy = (bitmap.height - side) / 2
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE)
  bitmap.close?.()
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', 0.82),
  )
  if (!blob) throw new Error('Não foi possível processar a imagem.')
  return blob
}

const AVATARS_BUCKET = 'avatars'

/** Envia a foto comprimida ao Storage e devolve a URL pública cacheável. */
export async function uploadAvatar(userId: string, blob: Blob): Promise<string> {
  const sb = getSupabase()
  const path = `${userId}/avatar.webp`
  // upsert: sobrescreve a foto anterior (mesma URL, cache invalidado pela CDN)
  const { error } = await sb.storage
    .from(AVATARS_BUCKET)
    .upload(path, blob, { contentType: 'image/webp', upsert: true })
  if (error) throw new Error(`Falha no upload da foto: ${error.message}`)
  const { data } = sb.storage.from(AVATARS_BUCKET).getPublicUrl(path)
  // bust de cache: a CDN pode ter versão anterior sob a mesma URL
  return `${data.publicUrl}?v=${Date.now()}`
}

/** Remove a foto do Storage (usado ao excluir a foto do perfil). */
export async function removeAvatar(userId: string): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.storage.from(AVATARS_BUCKET).remove([`${userId}/avatar.webp`])
  if (error) throw new Error(`Falha ao remover a foto: ${error.message}`)
}
