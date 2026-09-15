import type { Company, Role, User } from '../types'

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/**
 * Extrai a sigla da empresa: "Silva Construções" -> "SC".
 * Primeira letra das duas primeiras palavras significativas.
 */
export function companyInitials(name: string): string {
  const words = stripAccents(name)
    .toUpperCase()
    .split(/\s+/)
    .filter((w) => w.length > 2 && !['E', 'DA', 'DE', 'DO', 'DAS', 'DOS'].includes(w))
  const initials = (words[0]?.[0] ?? 'X') + (words[1]?.[0] ?? '')
  return initials
}

/**
 * Gera a próxima matrícula da empresa para o papel:
 * - gestor:  <letra da empresa>G001, SG002…  (S de Silva, G de gestor)
 * - colaborador: <letra da empresa>C001…     (S de Silva, C de colaborador)
 */
export function nextMatricula(
  company: Company,
  role: Extract<Role, 'gestor' | 'colaborador'>,
  users: User[],
): string {
  const letter = role === 'gestor' ? 'G' : 'C'
  const prefix = `${company.initials[0]}${letter}`
  const existing = users
    .map((u) => u.matricula)
    .filter((m): m is string => typeof m === 'string' && m.startsWith(prefix))
    .map((m) => parseInt(m.slice(prefix.length), 10))
    .filter((n) => Number.isFinite(n))
  const next = (existing.length > 0 ? Math.max(...existing) : 0) + 1
  return `${prefix}${String(next).padStart(3, '0')}`
}

/** Cores fixas para avatares novos. */
const palette = ['#2563EB', '#0D9488', '#7C3AED', '#DB2777', '#EA580C', '#0284C7', '#9333EA', '#16A34A']
export function pickAvatarColor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0
  return palette[Math.abs(hash) % palette.length]!
}
