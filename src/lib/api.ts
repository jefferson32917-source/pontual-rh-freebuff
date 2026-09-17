import { getSupabase } from './supabase'
import type {
  Company,
  Feedback,
  GeoLocation,
  HourBankAdjustment,
  Pdi,
  PayrollRun,
  Request,
  RequestAttachment,
  TaskItem,
  TimeEntry,
  TimeEntryType,
  User,
  VacationRequest,
  Vacancy,
  WeeklySchedule,
} from '../types'

// ============================================================
// Mapeamento banco -> domínio
// ============================================================

interface DbProfile {
  id: string
  name: string
  email: string
  role: 'super_admin' | 'gestor' | 'colaborador'
  company_id: string | null
  matricula: string | null
  department: string
  job_title: string
  admission_date: string
  manager_id: string | null
  avatar_color: string
  vacation_balance_days: number
  weekly_schedule: WeeklySchedule
  base_salary: number | string
  transport_allowance: boolean
  cpf: string
  ctps: string
  phone: string
  address: string
  cep: string
  confidential_notes: string
  dependents: number
  alimony_percent: number | string
  photo_url: string | null
  active: boolean
}

interface DbCompany {
  id: string
  name: string
  initials: string
  cnpj: string
  address: string
  cep: string
  bairro: string
  city: string
  uf: string
  state_registration: string
  responsible_name: string
  responsible_phone: string
  created_at: string
  active: boolean
}

function toUser(p: DbProfile): User {
  return {
    id: p.id,
    companyId: p.company_id,
    matricula: p.matricula,
    name: p.name,
    email: p.email,
    // o app nunca expõe mais a senha: mantida vazia (auth real no Supabase)
    password: '',
    role: p.role,
    department: p.department,
    jobTitle: p.job_title,
    admissionDate: p.admission_date,
    managerId: p.manager_id ?? undefined,
    avatarColor: p.avatar_color,
    photoDataUrl: p.photo_url ?? undefined,
    vacationBalanceDays: p.vacation_balance_days,
    weeklySchedule: p.weekly_schedule ?? {},
    baseSalary: Number(p.base_salary ?? 0),
    transportAllowance: p.transport_allowance,
    cpf: p.cpf,
    ctps: p.ctps,
    phone: p.phone,
    address: p.address,
    cep: p.cep,
    confidentialNotes: p.confidential_notes,
    dependents: p.dependents,
    alimonyPercent: Number(p.alimony_percent ?? 0),
    active: p.active,
  }
}

function toCompany(c: DbCompany): Company {
  return {
    id: c.id,
    name: c.name,
    initials: c.initials,
    cnpj: c.cnpj,
    address: c.address,
    cep: c.cep,
    bairro: c.bairro,
    city: c.city,
    uf: c.uf,
    stateRegistration: c.state_registration,
    responsibleName: c.responsible_name,
    responsiblePhone: c.responsible_phone,
    createdAt: c.created_at,
    active: c.active,
  }
}

function toPdi(r: any): Pdi {
  return {
    id: r.id,
    employeeId: r.employee_id,
    title: r.title,
    description: r.description ?? '',
    status: r.status,
    dueDate: r.due_date,
    progress: r.progress,
  }
}

function toFeedback(r: any): Feedback {
  return {
    id: r.id,
    fromId: r.from_id,
    toId: r.to_id,
    kind: r.kind,
    message: r.message,
    createdAt: r.created_at,
    anonymous: r.anonymous,
  }
}

function toVacancy(r: any): Vacancy {
  return {
    id: r.id,
    title: r.title,
    department: r.department,
    status: r.status,
    openedAt: r.opened_at,
    candidates: r.candidates,
    companyId: '',
  }
}

function toRequest(r: any, attachments: RequestAttachment[]): Request {
  return {
    id: r.id,
    employeeId: r.employee_id,
    type: r.type,
    period: r.period,
    justification: r.justification,
    status: r.status,
    createdAt: r.created_at,
    attachments,
  }
}

function toVacation(r: any): VacationRequest {
  return {
    id: r.id,
    employeeId: r.employee_id,
    startDate: r.start_date,
    endDate: r.end_date,
    days: r.days,
    status: r.status,
    createdAt: r.created_at,
    note: r.note ?? undefined,
  }
}

function toTimeEntry(r: any): TimeEntry {
  return {
    id: r.id,
    employeeId: r.employee_id,
    type: r.entry_type,
    occurredAt: r.occurred_at,
    location:
      r.latitude != null && r.longitude != null
        ? { lat: r.latitude, lng: r.longitude, accuracy: r.accuracy ?? undefined }
        : undefined,
  }
}

function toPayroll(r: any): PayrollRun {
  const snap = (r.snapshot ?? {}) as Partial<PayrollRun>
  return {
    ...snap,
    id: r.id,
    reference: r.reference,
    userId: r.user_id,
    companyId: r.company_id,
    employee: snap.employee ?? { name: '', matricula: '', jobTitle: '', department: '', admissionDate: '', dependents: 0 },
    company: snap.company ?? { name: '', cnpj: '', initials: '' },
    baseSalary: Number(snap.baseSalary ?? 0),
    items: snap.items ?? [],
    extraHours: Number(snap.extraHours ?? 0),
    extraHoursRate: Number(snap.extraHoursRate ?? 50),
    gross: Number(snap.gross ?? 0),
    inssBase: Number(snap.inssBase ?? 0),
    inss: Number(snap.inss ?? 0),
    irrfBase: Number(snap.irrfBase ?? 0),
    irrf: Number(snap.irrf ?? 0),
    fgts: Number(snap.fgts ?? 0),
    fgtsBase: Number(snap.fgtsBase ?? 0),
    transportDeduction: Number(snap.transportDeduction ?? 0),
    familyAllowance: Number(snap.familyAllowance ?? 0),
    otherDeductions: Number(snap.otherDeductions ?? 0),
    netPay: Number(snap.netPay ?? 0),
    state: r.state as PayrollRun['state'],
    supersededBy: r.superseded_by ?? undefined,
    version: r.version,
    generatedAt: r.generated_at,
    publishedAt: r.published_at ?? undefined,
    unpublishedAt: r.unpublished_at ?? undefined,
    unpublishedReason: r.unpublished_reason ?? undefined,
  }
}

// ============================================================
// Carregamento de todos os dados
// ============================================================

export interface HrData {
  companies: Company[]
  users: User[]
  pdis: Pdi[]
  feedbacks: Feedback[]
  vacancies: Vacancy[]
  requests: Request[]
  vacations: VacationRequest[]
  vacationHistory: import('../types').VacationHistoryItem[]
  dayOffs: import('../types').DayOffRequest[]
  timeEntries: TimeEntry[]
  tasks: Record<string, TaskItem[]>
  payrolls: PayrollRun[]
  hourBank: HourBankAdjustment[]
}

/** Cache do core em sessionStorage: refresh da página abre instantâneo. */
const CORE_CACHE_KEY = 'pontual.core.v1'
const CORE_CACHE_TTL = 5 * 60_000

interface CoreCache {
  at: number
  companies: Company[]
  users: User[]
}

/** Lê o cache do core (stale-while-revalidate). null se vazio/expirado. */
export function readCoreCache(): Pick<HrData, 'companies' | 'users'> | null {
  try {
    const raw = sessionStorage.getItem(CORE_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CoreCache
    if (Date.now() - parsed.at > CORE_CACHE_TTL) return null
    return { companies: parsed.companies, users: parsed.users }
  } catch {
    return null
  }
}

function writeCoreCache(data: Pick<HrData, 'companies' | 'users'>): void {
  try {
    const payload: CoreCache = { at: Date.now(), companies: data.companies, users: data.users }
    sessionStorage.setItem(CORE_CACHE_KEY, JSON.stringify(payload))
  } catch {
    // quota: cache é best-effort
  }
}

export function clearCoreCache(): void {
  try {
    sessionStorage.removeItem(CORE_CACHE_KEY)
  } catch {
    /* ignore */
  }
}
export async function loadCoreData(): Promise<Pick<HrData, 'companies' | 'users'>> {
  const sb = getSupabase()
  const [companies, profiles] = await Promise.all([
    sb.from('companies').select('*').order('created_at'),
    sb.from('profiles').select('*').order('name'),
  ])
  const firstErr = [companies, profiles].find((r) => r.error)?.error
  if (firstErr) throw new Error(`Erro ao carregar dados: ${firstErr.message}`)
  const result = {
    companies: (companies.data ?? []).map(toCompany),
    // Fotos em URL do Storage passam sempre. DataURLs SÓ são cortados se
    // forem legados gigantes (> 150 KB): os pequenos (fallback inline,
    // ~10–30 KB) carregam normalmente — a foto nunca deixa de aparecer.
    users: (profiles.data ?? []).map(toUser).map((u) =>
      u.photoDataUrl?.startsWith('data:') && u.photoDataUrl.length > 150_000
        ? { ...u, photoDataUrl: undefined }
        : u,
    ),
  }
  writeCoreCache(result)
  return result
}

/** Perfis cuja foto ainda é dataURL legado (para migração ao Storage). */
export async function fetchLegacyPhotoUrls(): Promise<{ id: string; url: string }[]> {
  const sb = getSupabase()
  const { data, error } = await sb.from('profiles').select('id, photo_url').like('photo_url', 'data:%')
  if (error) return []
  return ((data ?? []) as { id: string; photo_url: string | null }[])
    .filter((r) => r.photo_url)
    .map((r) => ({ id: r.id, url: r.photo_url as string }))
}

/**
 * Dados pesados em UMA viagem de rede via RPC `load_heavy_data` (ver
 * supabase/migration_v4_load_heavy_data_rpc.sql). Se a RPC ainda não foi
 * aplicada ao banco, cai transparentemente para as queries paralelas.
 */
export async function loadHeavyData(): Promise<Omit<HrData, 'companies' | 'users'>> {
  const sb = getSupabase()
  try {
    const { data, error } = await sb.rpc('load_heavy_data')
    if (!error && data && typeof data === 'object') {
      const r = (Array.isArray(data) ? data[0] : data) as Record<string, unknown>
      if (r && typeof r === 'object') return mapHeavyRows(r)
    }
    if (error && !/Could not find the function|schema cache|404/i.test(error.message)) {
      // RPC existe mas falhou de verdade (RLS, permissão…): propaga
      throw new Error(error.message)
    }
    // função não existe ainda: fallback
  } catch {
    // fallback abaixo
  }
  return loadHeavyDataParallel()
}

function mapHeavyRows(r: Record<string, unknown>): Omit<HrData, 'companies' | 'users'> {
  const rows = (k: string): any[] => (Array.isArray(r[k]) ? (r[k] as any[]) : [])
  const attachMap = new Map<string, RequestAttachment[]>()
  for (const a of rows('request_attachments')) {
    const list = attachMap.get(a.request_id) ?? []
    list.push({
      id: a.id,
      fileName: a.file_name,
      mimeType: a.mime_type,
      sizeBytes: Number(a.size_bytes),
      storagePath: a.storage_path,
    } as RequestAttachment & { storagePath?: string })
    attachMap.set(a.request_id, list)
  }

  const tasksByUser: Record<string, TaskItem[]> = {}
  for (const t of rows('tasks')) {
    const list = tasksByUser[t.user_id] ?? []
    list.push({ id: t.id, label: t.label, done: t.done, due: t.due ?? undefined })
    tasksByUser[t.user_id] = list
  }

  return {
    pdis: rows('pdis').map(toPdi),
    feedbacks: rows('feedbacks').map(toFeedback),
    vacancies: rows('vacancies').map(toVacancy),
    requests: rows('requests').map((row) => toRequest(row, attachMap.get(row.id) ?? [])),
    vacations: rows('vacations').map(toVacation),
    vacationHistory: rows('vacation_history').map((row) => ({
      id: row.id,
      employeeId: row.employee_id,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      days: row.days,
      kind: row.kind,
      note: row.note ?? undefined,
      admissionDate: row.admission_date ?? undefined,
      createdAt: row.created_at,
    })),
    dayOffs: rows('day_offs').map((row) => ({
      id: row.id,
      employeeId: row.employee_id,
      day: row.day,
      reason: row.reason,
      status: row.status,
      createdAt: row.created_at,
    })),
    timeEntries: rows('time_entries').map(toTimeEntry),
    tasks: tasksByUser,
    payrolls: rows('payrolls').map(toPayroll),
    hourBank: rows('hour_bank').map((row: any): HourBankAdjustment => ({
      id: row.id,
      userId: row.user_id,
      hours: Number(row.hours),
      reason: row.reason,
      payrollId: row.payroll_id ?? '',
      createdAt: row.created_at,
    })),
  }
}

/** Fallback: as 12 queries em paralelo (usado até a RPC ser aplicada). */
async function loadHeavyDataParallel(): Promise<Omit<HrData, 'companies' | 'users'>> {
  const sb = getSupabase()
  const [pdis, feedbacks, vacancies, requests, attachments, vacations, timeEntries, tasks, payrolls, hourBank, vacationHistory, dayOffs] =
    await Promise.all([
      sb.from('pdis').select('*'),
      sb.from('feedbacks').select('*').order('created_at', { ascending: false }),
      sb.from('vacancies').select('*').order('opened_at', { ascending: false }),
      sb.from('requests').select('*').order('created_at', { ascending: false }),
      sb.from('request_attachments').select('*'),
      sb.from('vacation_requests').select('*').order('created_at', { ascending: false }),
      sb.from('time_entries').select('*').order('occurred_at', { ascending: false }),
      sb.from('tasks').select('*').order('created_at'),
      sb.from('payrolls').select('*'),
      sb.from('hour_bank').select('*').order('created_at', { ascending: false }),
      // falha em uma não derruba a carga: tabelas novas podem ainda não existir
      sb.from('vacation_history').select('*').order('period_start', { ascending: false }).then(
        (r) => (r.error ? { data: [], error: null } : r),
        () => ({ data: [], error: null }),
      ),
      sb.from('day_off_requests').select('*').order('day', { ascending: false }).then(
        (r) => (r.error ? { data: [], error: null } : r),
        () => ({ data: [], error: null }),
      ),
    ])

  const firstErr = [pdis, feedbacks, vacancies, requests, attachments, vacations, timeEntries, tasks, payrolls, hourBank].find(
    (r) => r.error,
  )?.error
  if (firstErr) throw new Error(`Erro ao carregar dados: ${firstErr.message}`)

  const attachMap = new Map<string, RequestAttachment[]>()
  for (const a of (attachments.data ?? []) as any[]) {
    const list = attachMap.get(a.request_id) ?? []
    list.push({
      id: a.id,
      fileName: a.file_name,
      mimeType: a.mime_type,
      sizeBytes: Number(a.size_bytes),
      storagePath: a.storage_path,
    } as RequestAttachment & { storagePath?: string })
    attachMap.set(a.request_id, list)
  }

  const tasksByUser: Record<string, TaskItem[]> = {}
  for (const t of (tasks.data ?? []) as any[]) {
    const list = tasksByUser[t.user_id] ?? []
    list.push({ id: t.id, label: t.label, done: t.done, due: t.due ?? undefined })
    tasksByUser[t.user_id] = list
  }

  return {
    pdis: (pdis.data ?? []).map(toPdi),
    feedbacks: (feedbacks.data ?? []).map(toFeedback),
    vacancies: (vacancies.data ?? []).map(toVacancy),
    requests: (requests.data ?? []).map((r) => toRequest(r, attachMap.get(r.id) ?? [])),
    vacations: (vacations.data ?? []).map(toVacation),
    vacationHistory: ((vacationHistory.data ?? []) as any[]).map((r) => ({
      id: r.id,
      employeeId: r.employee_id,
      periodStart: r.period_start,
      periodEnd: r.period_end,
      days: r.days,
      kind: r.kind,
      note: r.note ?? undefined,
      admissionDate: r.admission_date ?? undefined,
      createdAt: r.created_at,
    })),
    dayOffs: ((dayOffs.data ?? []) as any[]).map((r) => ({
      id: r.id,
      employeeId: r.employee_id,
      day: r.day,
      reason: r.reason,
      status: r.status,
      createdAt: r.created_at,
    })),
    timeEntries: (timeEntries.data ?? []).map(toTimeEntry),
    tasks: tasksByUser,
    payrolls: (payrolls.data ?? []).map(toPayroll),
    hourBank: (hourBank.data ?? []).map((r: any): HourBankAdjustment => ({
      id: r.id,
      userId: r.user_id,
      hours: Number(r.hours),
      reason: r.reason,
      payrollId: r.payroll_id ?? '',
      createdAt: r.created_at,
    })),
  }
}

// ============================================================
// Escrita: empresas
// ============================================================

export async function apiCreateCompany(input: { name: string; initials: string; cnpj: string; address?: string; cep?: string; bairro?: string; city?: string; uf?: string; stateRegistration?: string; responsibleName?: string; responsiblePhone?: string }): Promise<Company> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('companies')
    .insert({
      name: input.name,
      initials: input.initials,
      cnpj: input.cnpj,
      address: input.address ?? '',
      cep: input.cep ?? '',
      bairro: input.bairro ?? '',
      city: input.city ?? '',
      uf: input.uf ?? '',
      state_registration: input.stateRegistration ?? '',
      responsible_name: input.responsibleName ?? '',
      responsible_phone: input.responsiblePhone ?? '',
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return toCompany(data as DbCompany)
}

export async function apiUpdateCompany(id: string, patch: Partial<Company>): Promise<void> {
  const sb = getSupabase()
  const map: Record<string, string> = {
    stateRegistration: 'state_registration',
    responsibleName: 'responsible_name',
    responsiblePhone: 'responsible_phone',
  }
  const row: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(patch)) row[map[k] ?? k] = v
  const { error } = await sb.from('companies').update(row).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function apiDeleteCompany(id: string): Promise<void> {
  const sb = getSupabase()
  // usuários da empresa perdem o vínculo (não a conta)
  const { error } = await sb.from('profiles').update({ company_id: null, matricula: null, active: false }).eq('company_id', id)
  if (error) throw new Error(error.message)
  const { error: err2 } = await sb.from('companies').delete().eq('id', id)
  if (err2) throw new Error(err2.message)
}

// ============================================================
// Escrita: usuários
// ============================================================

export interface AdminCreateUserInput {
  email: string
  password: string
  name: string
  role: 'gestor' | 'colaborador'
  companyId: string
  matricula: string
  jobTitle: string
  department: string
  baseSalary: number
  admissionDate: string
  managerId?: string
  avatarColor: string
  weeklySchedule: WeeklySchedule
  cpf?: string
  ctps?: string
  phone?: string
  address?: string
  cep?: string
  confidential?: string
  dependents?: number
}

export async function apiAdminCreateUser(input: AdminCreateUserInput): Promise<string> {
  const sb = getSupabase()
  const { data, error } = await sb.rpc('admin_create_user', {
    p_email: input.email,
    p_password: input.password,
    p_name: input.name,
    p_role: input.role,
    p_company_id: input.companyId,
    p_matricula: input.matricula,
    p_job_title: input.jobTitle,
    p_department: input.department,
    p_base_salary: input.baseSalary,
    p_admission_date: input.admissionDate,
    p_manager_id: input.managerId ?? null,
    p_avatar_color: input.avatarColor,
    p_weekly_schedule: input.weeklySchedule,
    p_cpf: input.cpf ?? '',
    p_ctps: input.ctps ?? '',
    p_phone: input.phone ?? '',
    p_address: input.address ?? '',
    p_cep: input.cep ?? '',
    p_confidential: input.confidential ?? '',
    p_dependents: input.dependents ?? 0,
  })
  if (error) {
    if (error.message.includes('PERMISSION_DENIED')) return Promise.reject(new Error('Você não tem permissão para cadastrar este usuário.'))
    throw new Error(error.message)
  }
  return data as string
}

export interface AdminUpdateUserInput {
  name?: string
  email?: string
  password?: string
  jobTitle?: string
  department?: string
  baseSalary?: number
  managerId?: string | null
  cpf?: string
  ctps?: string
  phone?: string
  address?: string
  cep?: string
  confidential?: string
  dependents?: number
  alimonyPercent?: number
  transportAllowance?: boolean
  active?: boolean
}

export async function apiAdminUpdateUser(id: string, input: AdminUpdateUserInput): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.rpc('admin_update_user', {
    p_id: id,
    p_name: input.name ?? null,
    p_email: input.email ?? null,
    p_password: input.password ?? null,
    p_job_title: input.jobTitle ?? null,
    p_department: input.department ?? null,
    p_base_salary: input.baseSalary ?? null,
    p_manager_id: input.managerId ?? null,
    p_cpf: input.cpf ?? null,
    p_ctps: input.ctps ?? null,
    p_phone: input.phone ?? null,
    p_address: input.address ?? null,
    p_cep: input.cep ?? null,
    p_confidential: input.confidential ?? null,
    p_dependents: input.dependents ?? null,
    p_alimony: input.alimonyPercent ?? null,
    p_transport: input.transportAllowance ?? null,
    p_active: input.active ?? null,
  })
  if (error) {
    if (error.message.includes('PERMISSION_DENIED')) throw new Error('Você não tem permissão para editar este usuário.')
    throw new Error(error.message)
  }
}

export async function apiAdminDeleteUser(id: string): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.rpc('admin_delete_user', { p_id: id })
  if (error) throw new Error(error.message)
}

/** Perfil próprio (nome/email/cargo/departamento/foto) — RLS permite update do próprio. */
export async function apiUpdateOwnProfile(id: string, patch: { name?: string; email?: string; jobTitle?: string; department?: string }): Promise<void> {
  const sb = getSupabase()
  const row: Record<string, unknown> = {}
  if (patch.name != null) row.name = patch.name
  if (patch.email != null) row.email = patch.email.toLowerCase()
  if (patch.jobTitle != null) row.job_title = patch.jobTitle
  if (patch.department != null) row.department = patch.department
  const { error } = await sb.from('profiles').update(row).eq('id', id)
  if (error) throw new Error(error.message)
  if (patch.email != null) {
    const { error: authErr } = await sb.auth.updateUser({ email: patch.email })
    if (authErr) throw new Error(authErr.message)
  }
}

export async function apiUpdatePhoto(id: string, photoUrl: string | undefined): Promise<void> {
  const sb = getSupabase()
  // foto agora é uma URL curta do Supabase Storage (bucket público `avatars`),
  // servida por CDN — o payload de dados não carrega mais a imagem.
  const { error } = await sb.from('profiles').update({ photo_url: photoUrl ?? null }).eq('id', id)
  if (error) throw new Error(error.message)
}

/**
 * Migração única de fotos legadas: perfis cujo photo_url ainda é um dataURL
 * (base64, até vários MB) têm a imagem enviada ao Storage e substituída pela
 * URL pública. Roda automaticamente após a carga de dados.
 */
export async function migrateLegacyPhoto(userId: string, dataUrl: string): Promise<string | null> {
  try {
    const blob = await (await fetch(dataUrl)).blob()
    const { compressAvatar, uploadAvatar } = await import('./photo')
    // também comprime fotos legadas (256px WebP) antes de subir
    const compressed = await compressAvatar(blob)
    const url = await uploadAvatar(userId, compressed)
    await apiUpdatePhoto(userId, url)
    return url
  } catch {
    return null
  }
}

export async function apiUpdateSchedule(id: string, schedule: WeeklySchedule): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.from('profiles').update({ weekly_schedule: schedule }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function apiUpdateVacationBalance(id: string, days: number): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.from('profiles').update({ vacation_balance_days: days }).eq('id', id)
  if (error) throw new Error(error.message)
}

// ============================================================
// Escrita: PDIs, feedbacks, vagas
// ============================================================

export async function apiUpdatePdiProgress(pdiId: string, progress: number, currentStatus: string): Promise<void> {
  const sb = getSupabase()
  const status = progress >= 100 ? 'concluido' : progress > 0 ? 'em_andamento' : currentStatus
  const { error } = await sb.from('pdis').update({ progress, status }).eq('id', pdiId)
  if (error) throw new Error(error.message)
}

export async function apiAddFeedback(fb: Omit<Feedback, 'id'>): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.from('feedbacks').insert({
    from_id: fb.fromId,
    to_id: fb.toId,
    kind: fb.kind,
    message: fb.message,
    anonymous: fb.anonymous,
  })
  if (error) throw new Error(error.message)
}

export async function apiCreateVacancy(v: Omit<Vacancy, 'id' | 'companyId'>): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.from('vacancies').insert({
    title: v.title,
    department: v.department,
    status: v.status,
    opened_at: v.openedAt,
    candidates: v.candidates,
  })
  if (error) throw new Error(error.message)
}

// ============================================================
// Escrita: requisições + anexos (Storage)
// ============================================================

export interface RequestInput {
  type: string
  period: string
  justification: string
  attachments: { fileName: string; mimeType: string; sizeBytes: number; dataUrl?: string; file?: File }[]
}

export async function apiCreateRequest(employeeId: string, input: RequestInput): Promise<void> {
  const sb = getSupabase()
  const { data: req, error } = await sb
    .from('requests')
    .insert({ employee_id: employeeId, type: input.type, period: input.period, justification: input.justification, status: 'pendente' })
    .select('id')
    .single()
  if (error) throw new Error(error.message)

  for (const a of input.attachments) {
    let storagePath = ''
    if (a.file) {
      const path = `${employeeId}/${req.id}/${a.fileName}`
      const { error: upErr } = await sb.storage.from('request-docs').upload(path, a.file, { contentType: a.mimeType })
      if (upErr) throw new Error(`Falha no upload do anexo: ${upErr.message}`)
      storagePath = path
    }
    const { error: attErr } = await sb.from('request_attachments').insert({
      request_id: req.id,
      file_name: a.fileName,
      storage_path: storagePath,
      mime_type: a.mimeType,
      size_bytes: a.sizeBytes,
    })
    if (attErr) throw new Error(attErr.message)
  }
}

export async function apiUpdateRequestStatus(id: string, status: Request['status']): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.from('requests').update({ status, reviewed_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(error.message)
}

/** URL assinada para visualizar um anexo do bucket privado. */
export async function apiAttachmentUrl(storagePath: string): Promise<string | null> {
  if (!storagePath) return null
  const sb = getSupabase()
  const { data } = await sb.storage.from('request-docs').createSignedUrl(storagePath, 300)
  return data?.signedUrl ?? null
}

// ============================================================
// Escrita: férias
// ============================================================

export async function apiAddVacation(v: Omit<VacationRequest, 'id' | 'createdAt'>): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.from('vacation_requests').insert({
    employee_id: v.employeeId,
    start_date: v.startDate,
    end_date: v.endDate,
    days: v.days,
    status: v.status,
    note: v.note ?? null,
  })
  if (error) throw new Error(error.message)
}

export async function apiUpdateVacationStatus(id: string, status: VacationRequest['status']): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.from('vacation_requests').update({ status, reviewed_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(error.message)
}

// ============================================================
// Histórico de férias
// ============================================================

export async function apiListVacationHistory(employeeIds?: string[]): Promise<import('../types').VacationHistoryItem[]> {
  const sb = getSupabase()
  let q = sb.from('vacation_history').select('*').order('period_start', { ascending: false })
  if (employeeIds && employeeIds.length > 0) q = q.in('employee_id', employeeIds)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []).map((r: any) => ({
    id: r.id,
    employeeId: r.employee_id,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    days: r.days,
    kind: r.kind,
    note: r.note ?? undefined,
    admissionDate: r.admission_date ?? undefined,
    createdAt: r.created_at,
  }))
}

export async function apiAddVacationHistory(item: Omit<import('../types').VacationHistoryItem, 'id' | 'createdAt'>): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.from('vacation_history').insert({
    employee_id: item.employeeId,
    period_start: item.periodStart,
    period_end: item.periodEnd,
    days: item.days,
    kind: item.kind,
    note: item.note ?? null,
    admission_date: item.admissionDate ?? null,
  })
  if (error) throw new Error(error.message)
}

// ============================================================
// Folgas do espelho de ponto
// ============================================================

export async function apiListDayOffs(employeeIds?: string[]): Promise<import('../types').DayOffRequest[]> {
  const sb = getSupabase()
  let q = sb.from('day_off_requests').select('*').order('day', { ascending: false })
  if (employeeIds && employeeIds.length > 0) q = q.in('employee_id', employeeIds)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []).map((r: any) => ({
    id: r.id,
    employeeId: r.employee_id,
    day: r.day,
    reason: r.reason,
    status: r.status,
    createdAt: r.created_at,
  }))
}

export async function apiCreateDayOff(employeeId: string, day: string, reason: string): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.from('day_off_requests').insert({ employee_id: employeeId, day, reason })
  if (error) {
    if (error.code === '23505' || error.message.includes('duplicate')) {
      throw new Error('Já existe uma folga solicitada para este dia.')
    }
    throw new Error(error.message)
  }
}

export async function apiUpdateDayOffStatus(id: string, status: 'aprovado' | 'reprovado'): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.from('day_off_requests').update({ status, reviewed_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(error.message)
}

// ============================================================
// Escrita: ponto
// ============================================================

export async function apiAddTimeEntry(employeeId: string, type: TimeEntryType, occurredAt: string, location?: GeoLocation): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.from('time_entries').insert({
    employee_id: employeeId,
    entry_type: type,
    occurred_at: occurredAt,
    latitude: location?.lat ?? null,
    longitude: location?.lng ?? null,
    accuracy: location?.accuracy ?? null,
  })
  if (error) {
    if (error.code === '23505' || error.message.includes('uq_time_entries')) {
      throw new Error('Já existe uma batida deste tipo hoje. Use a edição manual do dia para ajustar.')
    }
    throw new Error(error.message)
  }
}

export async function apiDeleteTimeEntry(id: string): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.from('time_entries').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function apiSetDayEntries(employeeId: string, day: string, entries: { type: TimeEntryType; time: string }[]): Promise<void> {
  const sb = getSupabase()
  // Dia LOCAL de São Paulo (UTC-3 fixo): começa às 03:00 UTC do mesmo dia
  const startUtc = new Date(`${day}T00:00:00-03:00`).toISOString()
  const endUtc = new Date(new Date(`${day}T00:00:00-03:00`).getTime() + 24 * 3_600_000).toISOString()
  // Remove batidas do dia e reinsere (janela RLS permite delete até 2h atrás;
  // edições mais antigas falham com mensagem clara)
  const { data: existing, error: selErr } = await sb
    .from('time_entries')
    .select('id, occurred_at')
    .gte('occurred_at', startUtc)
    .lt('occurred_at', endUtc)
    .eq('employee_id', employeeId)
  if (selErr) throw new Error(selErr.message)
  const ids = (existing ?? []).map((e: any) => e.id)
  if (ids.length > 0) {
    const { error: delErr } = await sb.from('time_entries').delete().in('id', ids)
    if (delErr) throw new Error('Não foi possível editar este dia (batidas com mais de 2h exigem ajuste pelo RH).')
  }
  if (entries.length > 0) {
    const rows = entries.map((e) => ({
      employee_id: employeeId,
      entry_type: e.type,
      // -03:00 explícito: sem isso o Postgres interpretaria como UTC e
      // deslocaria o horário registrado em 3h
      occurred_at: `${day}T${e.time}:00-03:00`,
    }))
    const { error: insErr } = await sb.from('time_entries').insert(rows)
    if (insErr) throw new Error(insErr.message)
  }
}

// ============================================================
// Escrita: tarefas
// ============================================================

export async function apiToggleTask(userId: string, taskId: string, done: boolean): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.from('tasks').update({ done }).eq('id', taskId).eq('user_id', userId)
  if (error) throw new Error(error.message)
}

export async function apiAddTask(userId: string, label: string, due?: string): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.from('tasks').insert({ user_id: userId, label, due: due ?? null })
  if (error) throw new Error(error.message)
}

// ============================================================
// Escrita: folha de pagamento
// ============================================================

export async function apiSavePayroll(run: PayrollRun): Promise<string> {
  const sb = getSupabase()
  const snapshot = {
    employee: run.employee,
    company: run.company,
    baseSalary: run.baseSalary,
    items: run.items,
    extraHours: run.extraHours,
    extraHoursRate: run.extraHoursRate,
    gross: run.gross,
    inssBase: run.inssBase,
    inss: run.inss,
    irrfBase: run.irrfBase,
    irrf: run.irrf,
    fgts: run.fgts,
    fgtsBase: run.fgtsBase,
    transportDeduction: run.transportDeduction,
    familyAllowance: run.familyAllowance,
    otherDeductions: run.otherDeductions,
    netPay: run.netPay,
  }
  const { data: existing, error: selErr } = await sb
    .from('payrolls')
    .select('id, version')
    .eq('user_id', run.userId)
    .eq('reference', run.reference)
    .order('version', { ascending: false })
    .limit(1)
  if (selErr) throw new Error(selErr.message)
  const maxVersion = (existing?.[0] as any)?.version ?? 0
  const version = run.version > 0 ? run.version : maxVersion + 1

  const row = {
    reference: run.reference,
    user_id: run.userId,
    company_id: run.companyId,
    snapshot,
    version,
    state: run.state,
    superseded_by: run.supersededBy ?? null,
    published_at: run.publishedAt ?? null,
    unpublished_at: run.unpublishedAt ?? null,
    unpublished_reason: run.unpublishedReason ?? null,
    generated_at: run.generatedAt,
  }
  if (run.id && !run.id.startsWith('local_')) {
    const { error } = await sb.from('payrolls').update(row).eq('id', run.id)
    if (error) throw new Error(error.message)
    return run.id
  }
  const { data, error } = await sb.from('payrolls').insert(row).select('id').single()
  if (error) throw new Error(error.message)
  return (data as any).id as string
}

export async function apiUpdatePayrollState(
  id: string,
  patch: { state?: PayrollRun['state']; publishedAt?: string | null; unpublishedAt?: string | null; unpublishedReason?: string | null; supersededBy?: string | null },
): Promise<void> {
  const sb = getSupabase()
  const row: Record<string, unknown> = {}
  if (patch.state != null) row.state = patch.state
  if (patch.publishedAt !== undefined) row.published_at = patch.publishedAt
  if (patch.unpublishedAt !== undefined) row.unpublished_at = patch.unpublishedAt
  if (patch.unpublishedReason !== undefined) row.unpublished_reason = patch.unpublishedReason
  if (patch.supersededBy !== undefined) row.superseded_by = patch.supersededBy
  const { error } = await sb.from('payrolls').update(row).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function apiDeletePayroll(id: string): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.from('payrolls').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ============================================================
// Escrita: banco de horas
// ============================================================

export async function apiAddHourBankAdjustment(adj: Omit<HourBankAdjustment, 'id' | 'createdAt'>): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.from('hour_bank').insert({
    user_id: adj.userId,
    hours: adj.hours,
    reason: adj.reason,
    payroll_id: adj.payrollId || null,
  })
  if (error) throw new Error(error.message)
}
