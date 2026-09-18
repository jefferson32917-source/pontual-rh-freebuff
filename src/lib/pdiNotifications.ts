/**
 * Badge de novidades do PDI para o colaborador.
 *
 * Detecta, por PDI, se surgiram coisas que o colaborador ainda não viu:
 * - novo comentário/mensagem do gestor;
 * - metas ativadas ou perguntas de meta novas/editadas.
 *
 * Estratégia: assinatura por PDI (comentários + metas) comparada com a
 * última assinatura vista, persistida em localStorage por usuário.
 * Ao abrir "Meu desenvolvimento", tudo é marcado como visto.
 */

import type { Pdi } from '../types'

const keyFor = (userId: string) => `pdi_seen_${userId}`

type SeenMap = Record<string, string> // pdiId -> assinatura já vista

function readSeen(userId: string): SeenMap {
  try {
    const raw = localStorage.getItem(keyFor(userId))
    return raw ? (JSON.parse(raw) as SeenMap) : {}
  } catch {
    return {}
  }
}

function writeSeen(userId: string, seen: SeenMap) {
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify(seen))
  } catch {
    /* quota cheia — badge apenas não persiste */
  }
}

/** Assinatura do conteúdo "visível ao colaborador" de um PDI. */
function signature(p: Pdi): string {
  const comments = p.managerComments ?? []
  const last = comments[comments.length - 1]
  const goals = p.goalsEnabled ? (p.goalQuestions ?? []) : []
  return [
    comments.length,
    last?.createdAt ?? '',
    goals.length,
    goals.map((q) => `${q.id}:${q.text}:${q.options?.join('|') ?? ''}`).join(';'),
  ].join('#')
}

/**
 * Quantos PDIs do colaborador têm novidades não vistas
 * (comentário novo do gestor OU metas ativadas/alteradas).
 */
export function countPdiNews(pdis: Pdi[], userId: string): number {
  const seen = readSeen(userId)
  return pdis.filter((p) => {
    if (p.employeeId !== userId) return false
    const hasNews = (p.managerComments?.length ?? 0) > 0 || (p.goalsEnabled && (p.goalQuestions?.length ?? 0) > 0)
    if (!hasNews) return false
    return seen[p.id] !== signature(p)
  }).length
}

/** Marca todos os PDIs atuais do usuário como vistos (ao abrir a aba). */
export function markAllPdisSeen(pdis: Pdi[], userId: string) {
  const seen = readSeen(userId)
  let changed = false
  for (const p of pdis) {
    if (p.employeeId !== userId) continue
    const sig = signature(p)
    if (seen[p.id] !== sig) {
      seen[p.id] = sig
      changed = true
    }
  }
  if (changed) writeSeen(userId, seen)
}
