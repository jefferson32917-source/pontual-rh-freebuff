/**
 * Instrumentação de performance (performance.now).
 * Mede e loga no console os tempos reais do boot do app:
 * - login (signInWithPassword + perfil)
 * - core (empresas + usuários)
 * - heavy (dados pesados)
 * - avatares (recuperação de cache vs rede, hit/miss)
 *
 * Log em [perf]: fácil de filtrar no DevTools.
 * Em produção os logs são discretos (uma linha por fase).
 */

type Phase =
  | 'boot'
  | 'login'
  | 'core'
  | 'heavy'
  | 'avatar.cache'
  | 'avatar.network'
  | 'avatar.render'
  | 'avatar.total'

const marks = new Map<string, number>()

const isProd = import.meta.env.PROD

/** Prefixo do log — filtre por `[perf]` no console. */
function log(phase: Phase, ms: number, extra?: string): void {
  const msg = `[perf] ${phase}: ${ms.toFixed(1)}ms${extra ? ` ${extra}` : ''}`
  if (isProd) {
    // Em produção, mantenho os logs (úteis para diagnóstico do usuário),
    // mas agrupados por fase para não poluir.
    console.info(msg)
  } else {
    console.debug(msg)
  }
}

export function markStart(key: string): void {
  marks.set(key, performance.now())
}

export function markEnd(key: string, phase: Phase, extra?: string): number {
  const start = marks.get(key)
  if (start == null) return -1
  const ms = performance.now() - start
  marks.delete(key)
  log(phase, ms, extra)
  return ms
}

/** Contador simples de cache hit/miss (avatares, core, heavy). */
const cacheCounters = { hits: 0, misses: 0 }

export function cacheHit(): void {
  cacheCounters.hits++
}

export function cacheMiss(): void {
  cacheCounters.misses++
}

/** Taxa de acerto do cache (0–1). */
export function cacheHitRate(): number {
  const total = cacheCounters.hits + cacheCounters.misses
  return total === 0 ? 0 : cacheCounters.hits / total
}

export function logCacheStats(): void {
  const { hits, misses } = cacheCounters
  const total = hits + misses
  if (total === 0) return
  log('avatar.cache', 0, `— cache: ${hits} hits, ${misses} misses (taxa ${(cacheHitRate() * 100).toFixed(0)}%)`)
}

/** Log de diagnóstico de erro na cadeia do avatar. */
export function logAvatarError(step: string, err?: unknown): void {
  const msg = err instanceof Error ? err.message : String(err ?? 'erro desconhecido')
  console.warn(`[perf][avatar] falha em "${step}": ${msg}`)
}
