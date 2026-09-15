import type { PdiStatus, RequestType, Role, TimeEntryType, VacationStatus, VacancyStatus, WeekDay } from '../types'

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

/** "2026-09" -> "Setembro/2026" */
export function referenceShortLabel(ref: string): string {
  const [y, m] = ref.split('-').map(Number)
  return `${MONTHS[(m ?? 1) - 1]}/${y}`
}

export const referenceMonthOptions = MONTHS.map((m, i) => ({ value: String(i + 1).padStart(2, '0'), label: m }))

export const roleLabels: Record<Role, string> = {
  super_admin: 'Super Admin',
  gestor: 'Gestor',
  colaborador: 'Colaborador',
}

export const requestTypeLabels: Record<RequestType, string> = {
  ferias: 'Férias',
  folga: 'Folga',
  home_office: 'Home Office',
  atestado: 'Atestado',
  outro: 'Outro',
}

export const pdiStatusLabels: Record<PdiStatus, string> = {
  em_andamento: 'Em andamento',
  concluido: 'Concluído',
  atrasado: 'Atrasado',
}

export const vacancyStatusLabels: Record<VacancyStatus, string> = {
  aberta: 'Aberta',
  em_processo: 'Em processo',
  fechada: 'Fechada',
}

export const vacationStatusLabels: Record<VacationStatus, string> = {
  pendente: 'Pendente',
  aprovada: 'Aprovada',
  reprovada: 'Reprovada',
  gozada: 'Gozada',
}

export const timeEntryLabels: Record<TimeEntryType, string> = {
  entrada: 'Entrada',
  saida_almoco: 'Saída almoço',
  volta_almoco: 'Volta almoço',
  saida: 'Saída',
}

export const weekDayShort: Record<WeekDay, string> = {
  seg: 'Seg',
  ter: 'Ter',
  qua: 'Qua',
  qui: 'Qui',
  sex: 'Sex',
  sab: 'Sáb',
  dom: 'Dom',
}

export function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

/**
 * Dia LOCAL (America/Sao_Paulo, UTC-3 fixo) de um timestamp ISO.
 * `iso.slice(0, 10)` devolve a data UTC — batidas após 21h locais cairiam
 * no dia seguinte. Brasil não tem horário de verão desde 2019, então o
 * offset fixo -3h é seguro.
 */
export function localDayKey(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 3 * 3_600_000)
  return d.toISOString().slice(0, 10)
}

/** Dia local de hoje (yyyy-mm-dd no fuso de São Paulo). */
export function localTodayKey(now: Date = new Date()): string {
  return localDayKey(now.toISOString())
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Calcula horas trabalhadas num dia a partir das batidas (pares entrada/saída). */
export function workedHours(entries: { type: TimeEntryType; occurredAt: string }[]): number {
  const sorted = [...entries].sort(
    (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
  )
  const byTime = (t: TimeEntryType) => sorted.find((e) => e.type === t)
  const entrada = byTime('entrada')
  const saidaAlmoco = byTime('saida_almoco')
  const voltaAlmoco = byTime('volta_almoco')
  const saida = byTime('saida')
  if (!entrada) return 0
  let ms = 0
  const t = (e: { occurredAt: string } | undefined) => (e ? new Date(e.occurredAt).getTime() : null)
  const lunchEnd = t(voltaAlmoco) ?? t(saida)
  if (t(saidaAlmoco) && lunchEnd) {
    ms += t(saidaAlmoco)! - t(entrada)!
    ms += t(saida) ? t(saida)! - lunchEnd : 0
  } else if (t(saida)) {
    ms += t(saida)! - t(entrada)!
  }
  return Math.max(0, Math.round((ms / 3_600_000) * 100) / 100)
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('')
}

/** Formata um telefone BR para o formato WhatsApp (55 + dígitos). Retorna null se inválido. */
export function whatsappLink(phone: string, message?: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 10 || digits.length > 13) return null
  const withCountry = digits.startsWith('55') ? digits : `55${digits}`
  const base = `https://wa.me/${withCountry}`
  return message ? `${base}?text=${encodeURIComponent(message)}` : base
}
