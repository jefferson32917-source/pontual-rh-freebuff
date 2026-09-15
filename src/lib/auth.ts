/**
 * Autenticação real via Supabase Auth.
 * - Login por matrícula (SG001/SC001) ou e-mail: matrícula é resolvida
 *   para o e-mail pela RPC `lookup_login_email` e a senha é validada
 *   pelo Supabase Auth (bcrypt server-side).
 * - A sessão vive no localStorage padrão do supabase-js.
 * - O perfil (papel, empresa, matrícula) vem da tabela `profiles`.
 */
import { getSupabase, isSupabaseConfigured } from './supabase'
import type { User } from '../types'

export interface Session {
  userId: string
  role: User['role']
  issuedAt: string
}

/** Sessão derivada do Supabase Auth (usuário autenticado agora). */
export async function getAuthUser(): Promise<User | null> {
  if (!isSupabaseConfigured) return null
  const sb = getSupabase()
  const { data, error } = await sb.auth.getUser()
  if (error || !data.user) return null
  const { data: profile, error: pErr } = await sb.from('profiles').select('*').eq('id', data.user.id).single()
  if (pErr || !profile) return null
  return {
    id: profile.id,
    companyId: profile.company_id,
    matricula: profile.matricula,
    name: profile.name,
    email: profile.email,
    password: '',
    role: profile.role,
    department: profile.department,
    jobTitle: profile.job_title,
    admissionDate: profile.admission_date,
    managerId: profile.manager_id ?? undefined,
    avatarColor: profile.avatar_color,
    photoDataUrl: profile.photo_url ?? undefined,
    vacationBalanceDays: profile.vacation_balance_days,
    weeklySchedule: profile.weekly_schedule ?? {},
    baseSalary: Number(profile.base_salary ?? 0),
    transportAllowance: profile.transport_allowance,
    cpf: profile.cpf,
    ctps: profile.ctps,
    phone: profile.phone,
    address: profile.address,
    cep: profile.cep,
    confidentialNotes: profile.confidential_notes,
    dependents: profile.dependents,
    alimonyPercent: Number(profile.alimony_percent ?? 0),
    active: profile.active,
  }
}

export type LoginResult =
  | { ok: true; user: User }
  | { ok: false; error: string }

export async function login(identifier: string, password: string): Promise<LoginResult> {
  const id = identifier.trim()
  if (id.length === 0) return { ok: false, error: 'Informe matrícula ou e-mail.' }
  if (password.length < 4) return { ok: false, error: 'A senha deve ter pelo menos 4 caracteres.' }

  const sb = getSupabase()

  // matrícula (SG001) -> e-mail
  let email = id.toLowerCase()
  if (!email.includes('@')) {
    const { data, error } = await sb.rpc('lookup_login_email', { p_identifier: id })
    if (error || !data) {
      return { ok: false, error: 'Matrícula não encontrada.' }
    }
    email = data as string
  }

  const { data, error } = await sb.auth.signInWithPassword({ email, password })
  if (error || !data.user) {
    return { ok: false, error: 'Credenciais inválidas. Verifique e tente novamente.' }
  }

  const user = await getAuthUser()
  if (!user) return { ok: false, error: 'Perfil não encontrado. Procure o administrador.' }
  if (!user.active) {
    await sb.auth.signOut()
    return { ok: false, error: 'Usuário inativo. Procure o administrador.' }
  }
  return { ok: true, user }
}

export async function logout(): Promise<void> {
  if (!isSupabaseConfigured) return
  await getSupabase().auth.signOut()
}

// ---- Compat: componentes legados ainda leem getSession/clearSession ----
const SESSION_KEY = 'pontual.session.v2'

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    return JSON.parse(raw) as Session
  } catch {
    return null
  }
}

export function setSession(session: Session): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY)
}

/** Senha atual verificada pelo Auth (troca de senha no Perfil). */
export async function changePasswordSecure(currentPassword: string, newPassword: string): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured) return { ok: false, error: 'Supabase não configurado.' }
  const sb = getSupabase()
  const { data } = await sb.auth.getUser()
  const email = data.user?.email
  if (!email) return { ok: false, error: 'Sessão expirada.' }
  // valida a senha atual reautenticando
  const { error: reauthErr } = await sb.auth.signInWithPassword({ email, password: currentPassword })
  if (reauthErr) return { ok: false, error: 'Senha atual incorreta.' }
  const { error } = await sb.auth.updateUser({ password: newPassword })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
