/**
 * Cache de avatares (stale-while-revalidate).
 *
 * Estratégia: a URL pública do Storage é persistida em localStorage.
 * Na renderização, o Avatar lê primeiro do cache (síncrono, sem flicker);
 * em paralelo, revalida contra o perfil no banco em segundo plano.
 * Se a URL mudou (foto trocada), o cache é atualizado e o componente
 * re-renderiza — sempre sem bloquear a UI.
 *
 * A foto em si é servida pelo Storage/CDN com cache HTTP, então o browser
 * resolve rápido; o cache local elimina a dependência da rede para saber
 * SE há foto e QUAL a URL.
 */

import { markEnd, cacheHit, cacheMiss, logAvatarError } from './perf'
import type { User } from '../types'

const KEY = 'pontual.avatars.v1'

type AvatarMap = Record<string, string>

let cachedMap: AvatarMap | null = null

function readMap(): AvatarMap {
  if (cachedMap) return cachedMap
  try {
    const raw = localStorage.getItem(KEY)
    cachedMap = raw ? (JSON.parse(raw) as AvatarMap) : {}
  } catch {
    cachedMap = {}
  }
  return cachedMap
}

function writeMap(map: AvatarMap): void {
  cachedMap = map
  try {
    // persiste de forma barata: apenas userId -> URL (alguns KB no máximo)
    localStorage.setItem(KEY, JSON.stringify(map))
  } catch {
    // quota cheia: não é crítico, o cache é best-effort
  }
}

/** Recuperação sincrona do cache — usada na renderização (0ms). */
export function getCachedAvatar(userId: string): string | undefined {
  const t0 = performance.now()
  const url = readMap()[userId]
  const dt = performance.now() - t0
  if (url) {
    cacheHit()
    markEnd(`avatar.read.${userId}`, 'avatar.cache', `— cache HIT (${dt.toFixed(1)}ms)`)
    return url
  }
  cacheMiss()
  markEnd(`avatar.read.${userId}`, 'avatar.cache', `— cache MISS (${dt.toFixed(1)}ms)`)
  return undefined
}

/** Grava/atualiza a URL de um avatar (chamado após a carga do banco). */
export function setCachedAvatar(userId: string, url: string | undefined): void {
  const map = readMap()
  if (url) {
    if (map[userId] === url) return
    map[userId] = url
  } else {
    if (!(userId in map)) return
    delete map[userId]
  }
  writeMap(map)
}

/** Sincroniza o cache com o estado do banco (após cada carga de dados). */
export function syncAvatarCache(users: User[]): void {
  const map = readMap()
  let changed = false
  const validIds = new Set<string>()
  for (const u of users) {
    const url = u.photoDataUrl
    // aceita URL do Storage E dataURL pequeno (fallback inline); ignora
    // dataURL gigante legado (> 150 KB) para não estourar a quota
    if (!url || (url.startsWith('data:') && url.length > 150_000)) continue
    validIds.add(u.id)
    if (map[u.id] !== url) {
      map[u.id] = url
      changed = true
    }
  }
  // remove avatares de usuários que não existem mais / removeram a foto
  for (const id of Object.keys(map)) {
    if (!validIds.has(id)) {
      delete map[id]
      changed = true
    }
  }
  if (changed) writeMap(map)
}

/**
 * Preload das fotos (Image() em idle): evita o flash "iniciais -> foto"
 * quando o usuário abre uma lista. Chamar após a carga core, com os IDs
 * mais relevantes primeiro (ex.: equipe do gestor, usuário logado).
 */
export function preloadAvatars(urls: string[]): () => void {
  if (urls.length === 0) return () => {}
  const run = () => {
    for (const url of urls) {
      if (typeof window === 'undefined') return
      const img = new Image()
      img.src = url
    }
  }
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void) => number
    cancelIdleCallback?: (id: number) => void
  }
  const id = w.requestIdleCallback ? w.requestIdleCallback(run) : window.setTimeout(run, 1500)
  return () => {
    if (w.cancelIdleCallback) w.cancelIdleCallback(id)
    else window.clearTimeout(id)
  }
}

/** Log de diagnóstico da cadeia completa do avatar (chamado no boot). */
export function logAvatarChainDiagnostics(users: User[]): void {
  const withPhoto = users.filter((u) => !!u.photoDataUrl)
  const withHttp = withPhoto.filter((u) => u.photoDataUrl!.startsWith('http'))
  const withData = withPhoto.filter((u) => u.photoDataUrl!.startsWith('data:'))
  const cached = Object.keys(readMap()).length
  console.info(
    `[perf][avatar] estado: ${users.length} usuários | ` +
      `${withHttp.length} com URL https | ${withData.length} com dataURL legado | ` +
      `${cached} no cache local`,
  )
  for (const u of withData) {
    logAvatarError(
      'photo_url ainda é dataURL (migração ao Storage pendente ou falhou) — avatar NÃO será exibido até migrar',
      `user=${u.id} (${u.name})`,
    )
  }
}
