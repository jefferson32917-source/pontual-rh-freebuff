/**
 * Saldo de férias PROPORCIONAL (acréscimo diário).
 *
 * Regra CLT-adaptada: o colaborador adquire 30 dias ao longo de 12 meses
 * de trabalho — ou seja, 2,5 dias por mês (~0,082/dia). O saldo exibido
 * é o proporcional adquirido menos os dias já gozados/aprovados, nunca
 * acima de 30.
 */

const MAX_DAYS = 30

/** Dias proporcionais adquiridos desde a admissão (teto 30). */
export function earnedVacationDays(admissionDate: string, now = new Date()): number {
  if (!admissionDate) return 0
  const adm = new Date(admissionDate + 'T12:00:00')
  if (Number.isNaN(adm.getTime())) return 0
  const daysWorked = Math.max(0, (now.getTime() - adm.getTime()) / 86_400_000)
  // 2,5 dias por mês de trabalho (30 dias / 12 meses)
  return Math.min(MAX_DAYS, Math.floor((daysWorked / 365) * MAX_DAYS * 100) / 100)
}

/**
 * Saldo EFETIVO do colaborador: proporcional adquirido MENOS os dias
 * govados/aprovados registrados no histórico, teto 30, piso 0.
 */
export function effectiveVacationBalance(
  admissionDate: string,
  usedDays: number,
  now = new Date(),
): number {
  const earned = earnedVacationDays(admissionDate, now)
  return Math.max(0, Math.min(MAX_DAYS, Math.floor((earned - Math.max(0, usedDays)) * 100) / 100))
}

/** Data (pt-BR) em que o saldo chega ao teto de 30 dias = admissão + 12 meses. */
export function fullBalanceDate(admissionDate: string): string {
  if (!admissionDate) return '—'
  const adm = new Date(admissionDate + 'T12:00:00')
  if (Number.isNaN(adm.getTime())) return '—'
  const full = new Date(adm)
  full.setFullYear(full.getFullYear() + 1)
  return full.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Rótulo amigável do acúmulo atual (ex.: "+18,5 de 30 dias"). */
export function accrualLabel(admissionDate: string, now = new Date()): string {
  const earned = earnedVacationDays(admissionDate, now)
  return `${String(earned).replace('.', ',')} de ${MAX_DAYS} dias`
}
