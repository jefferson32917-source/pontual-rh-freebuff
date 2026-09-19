import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  Company,
  DayOffRequest,
  Feedback,
  GeoLocation,
  HourBankAdjustment,
  Pdi,
  PayrollRun,
  Request,
  TaskItem,
  TimeEntry,
  TimeEntryType,
  User,
  VacationHistoryItem,
  VacationRequest,
  Vacancy,
} from '../types'
import type { Assessment, AssessmentQuestion, PdiComment, PdiGoalQuestion, PdiStep, TimeEntryAdjustment } from '../types'
import * as api from './api'
import { getSupabase } from './supabase'
import { nextMatricula, pickAvatarColor } from './matricula'
import { localDayKey, localTodayKey } from './format'
import { markStart, markEnd } from './perf'
import { syncAvatarCache, logAvatarChainDiagnostics } from './avatarCache'
import { toast } from '../components/Toast'

/**
 * Camada de dados do app — agora com persistência real no Supabase.
 * A interface (HrStore) é a mesma da versão demo, então nenhuma página
 * precisou ser reescrita. As mutações atualizam o estado local de forma
 * otimista e persistem na nuvem; falhas revertem e propagam o erro.
 *
 * LAZY LOADING: reload() carrega em duas fases — o core (empresas +
 * usuários) primeiro, para o app abrir instantâneo, e as tabelas pesadas
 * (ponto, folha, férias…) em segundo plano, sem bloquear a navegação.
 */

export interface NewUserData {
  companyId: string
  role: 'gestor' | 'colaborador'
  name: string
  email: string
  jobTitle: string
  department: string
  baseSalary: number
  password: string
  admissionDate: string
  managerId?: string
  cpf?: string
  ctps?: string
  phone?: string
  address?: string
  cep?: string
  confidential?: string
  dependents?: number
}

export interface HrData {
  companies: Company[]
  users: User[]
  pdis: Pdi[]
  feedbacks: Feedback[]
  vacancies: Vacancy[]
  requests: Request[]
  vacations: VacationRequest[]
  vacationHistory: VacationHistoryItem[]
  dayOffs: DayOffRequest[]
  timeEntries: TimeEntry[]
  tasks: Record<string, TaskItem[]>
  payrolls: PayrollRun[]
  hourBank: HourBankAdjustment[]
  entryAdjustments: TimeEntryAdjustment[]
  assessments: Assessment[]
}

export type CreateResult = { ok: true; user: User } | { ok: false; error: string }

const emptyData: HrData = {
  companies: [],
  users: [],
  pdis: [],
  feedbacks: [],
  vacancies: [],
  requests: [],
  vacations: [],
  vacationHistory: [],
  dayOffs: [],
  timeEntries: [],
  tasks: {},
  payrolls: [],
  hourBank: [],
  entryAdjustments: [],
  assessments: [],
}

export function useHrData() {
  const [data, setData] = useState<HrData>(emptyData)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  void setLoading

  /** true enquanto a carga de dados pesados está em andamento (2ª fase). */
  const [heavyLoading, setHeavyLoading] = useState(false)

  const reload = useCallback(async () => {
    setError(null)
    setLoading(true)
    setHeavyLoading(true)
    try {
      // STALE-WHILE-REVALIDATE: hidrata do cache do sessionStorage na hora
      // (UI abre instantânea), e revalida contra o banco em paralelo.
      const cached = api.readCoreCache()
      if (cached && cached.users.length >= 0) {
        setData((d) => ({ ...d, ...cached }))
        setLoading(false)
        // revalidação em fundo (a rede continua abaixo)
      }
      // Fase 1: core (empresas + usuários) — abre o app imediatamente.
      markStart('core')
      const core = await api.loadCoreData()
      markEnd('core', 'core', cached ? '— revalidado do cache' : '')
      setData((d) => ({ ...d, ...core }))
      setLoading(false)
      // sincroniza o cache de avatares (SWR) e loga o estado das fotos
      syncAvatarCache(core.users)
      logAvatarChainDiagnostics(core.users)
      // Fase 2: tabelas pesadas em segundo plano. Falha aqui NÃO derruba
      // o app: o usuário já navega e pode tentar recarregar depois.
      markStart('heavy')
      void api
        .loadHeavyData()
        .then((heavy) => {
          markEnd('heavy', 'heavy')
          setData((d) => ({ ...d, ...heavy }))
        })
        .catch((e) => {
          console.warn('[store] carga de dados pesados falhou:', e instanceof Error ? e.message : e)
        })
        .finally(() => {
          setHeavyLoading(false)
          // Migração de fotos legadas (dataURL -> Storage) roda FORA do cadeado
          // de carga: não deve atrasar a entrada no app, só atualizar em fundo.
          void api.fetchLegacyPhotoUrls().then((legacy) => {
            for (const { id, url } of legacy) {
              void api.migrateLegacyPhoto(id, url).then((newUrl) => {
                if (newUrl) {
                  setData((cur) => ({
                    ...cur,
                    users: cur.users.map((x) => (x.id === id ? { ...x, photoDataUrl: newUrl } : x)),
                  }))
                }
              })
            }
          })
        })
    } catch (e) {
      setLoading(false)
      setError(e instanceof Error ? e.message : 'Falha ao carregar dados.')
    }
  }, [])

  // NÃO carrega as tabelas no mount: com RLS ativo, o visitor anônimo não
  // lê nada útil e seriam 12 queries jogadas fora. O App chama reload()
  // assim que há um usuário autenticado.
  // useEffect(() => { void reload() }, [reload])

  /**
   * Refresh periódico (60s) dos dados pesados enquanto há sessão: garante
   * que conteúdo publicado pelo gestor (holerite, feedback, requisição
   * aprovada…) apareça para o colaborador em <= 1 min, sem precisar de F5.
   */
  useEffect(() => {
    const id = window.setInterval(() => {
      // Pausa quando o usuário está INTERAGINDO (campo em foco ou tecla
      // pressionada): o swap de `data` re-renderiza as páginas e pode
      // descartar rascunhos de formulários longos (ex.: cadastro de PDI).
      const active = document.activeElement
      const typing =
        active instanceof HTMLElement &&
        (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT' || active.isContentEditable)
      if (typing || document.hidden) return
      // só consulta com sessão ativa (RLS); silencioso — a próxima volta tenta de novo
      void getSupabase()
        .auth.getSession()
        .then(({ data: s }: { data: { session: unknown } }) => {
          if (!s.session) return
          return api.loadHeavyData().then((heavy) => setData((d) => ({ ...d, ...heavy })))
        })
        .catch(() => void 0)
    }, 60_000)
    return () => window.clearInterval(id)
  }, [])

  // ============ Empresas (Super Admin) ============
  const createCompany = useCallback((name: string, cnpj: string): Company => {
    const words = name
      .trim()
      .toUpperCase()
      .split(/\s+/)
      .filter((w) => w.length > 2 && !['E', 'DA', 'DE', 'DO', 'DAS', 'DOS'].includes(w))
    const initials = (words[0]?.[0] ?? 'X') + (words[1]?.[0] ?? '')
    const company: Company = {
      id: `local_c${Date.now()}`,
      name: name.trim().slice(0, 120),
      initials,
      cnpj: cnpj.trim().slice(0, 20),
      address: '',
      cep: '',
      bairro: '',
      city: '',
      uf: '',
      stateRegistration: '',
      responsibleName: '',
      responsiblePhone: '',
      createdAt: new Date().toISOString(),
      active: true,
      payrollEnabled: true,
    }
    setData((d) => ({ ...d, companies: [...d.companies, company] }))
    void api
      .apiCreateCompany({
        name: company.name,
        initials: company.initials,
        cnpj: company.cnpj,
      })
      .then((created) => {
        setData((d) => ({
          ...d,
          companies: d.companies.map((c) => (c.id === company.id ? created : c)),
        }))
      })
      .catch(() => {
        setData((d) => ({ ...d, companies: d.companies.filter((c) => c.id !== company.id) }))
        void reload()
      })
    return company
  }, [reload])

  const updateCompany = useCallback((id: string, patch: Partial<Company>) => {
    setData((d) => ({
      ...d,
      companies: d.companies.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }))
    if (id.startsWith('local_')) return
    if (patch.payrollEnabled !== undefined) {
      void api.apiUpdateCompanyFlags(id, { payrollEnabled: patch.payrollEnabled }).catch(() => void reload())
    }
    void api.apiUpdateCompany(id, patch).catch(() => void reload())
  }, [reload])

  const deleteCompany = useCallback((id: string) => {
    const removed = data.companies.find((c) => c.id === id)
    setData((d) => ({
      ...d,
      companies: d.companies.filter((c) => c.id !== id),
      users: d.users.map((u) => (u.companyId === id ? { ...u, companyId: null, active: false } : u)),
    }))
    if (!removed || removed.id.startsWith('local_')) return
    void api.apiDeleteCompany(id).catch(() => void reload())
  }, [data.companies, reload])

  // ============ Usuários ============
  const createUser = useCallback((creator: User, input: NewUserData): CreateResult => {
    const company = data.companies.find((c) => c.id === input.companyId)
    if (!company || company.id.startsWith('local_')) return { ok: false, error: 'Empresa não encontrada.' }
    if (creator.role === 'gestor' && creator.companyId !== input.companyId) {
      return { ok: false, error: 'Você só pode cadastrar colaboradores da sua empresa.' }
    }
    if (creator.role === 'gestor' && input.role !== 'colaborador') {
      return { ok: false, error: 'Gestores cadastram apenas colaboradores.' }
    }
    if (data.users.some((u) => u.email.toLowerCase() === input.email.trim().toLowerCase())) {
      return { ok: false, error: 'Já existe um usuário com este e-mail.' }
    }
    if (input.password.length < 6) {
      return { ok: false, error: 'A senha deve ter pelo menos 6 caracteres.' }
    }
    const matricula = nextMatricula(company, input.role, data.users)
    const avatar = pickAvatarColor(input.email + matricula)
    // otimista
    const optimistic: User = {
      id: `local_u${Date.now()}`,
      companyId: input.companyId,
      matricula,
      name: input.name.trim().slice(0, 120),
      email: input.email.trim().toLowerCase().slice(0, 160),
      password: '',
      role: input.role,
      department: input.department.trim().slice(0, 80) || 'Geral',
      jobTitle: input.jobTitle.trim().slice(0, 80) || 'Colaborador',
      admissionDate: input.admissionDate || new Date().toISOString().slice(0, 10),
      managerId: input.managerId,
      avatarColor: avatar,
      vacationBalanceDays: 30,
      weeklySchedule: { seg: ['09:00', '18:00'], ter: ['09:00', '18:00'], qua: ['09:00', '18:00'], qui: ['09:00', '18:00'], sex: ['09:00', '17:00'] },
      baseSalary: Math.max(0, input.baseSalary),
      transportAllowance: false,
      cpf: input.cpf ?? '',
      ctps: input.ctps ?? '',
      dependents: input.dependents ?? 0,
      alimonyPercent: 0,
      active: true,
      // Gestores criados por padrão NÃO batem ponto (admin pode ligar depois)
      requiresPunch: input.role === 'colaborador',
    }
    setData((d) => ({ ...d, users: [...d.users, optimistic] }))

    void api
      .apiAdminCreateUser({
        email: optimistic.email,
        password: input.password,
        name: optimistic.name,
        role: input.role,
        companyId: input.companyId,
        matricula,
        jobTitle: optimistic.jobTitle,
        department: optimistic.department,
        baseSalary: optimistic.baseSalary,
        admissionDate: optimistic.admissionDate,
        managerId: input.managerId,
        avatarColor: avatar,
        weeklySchedule: optimistic.weeklySchedule,
        cpf: input.cpf,
        ctps: input.ctps,
        phone: input.phone,
        address: input.address,
        cep: input.cep,
        confidential: input.confidential,
        dependents: input.dependents,
      })
      .then((realId) => {
        setData((d) => ({
          ...d,
          users: d.users.map((u) => (u.id === optimistic.id ? { ...u, id: realId } : u)),
        }))
      })
      .catch(() => {
        setData((d) => ({ ...d, users: d.users.filter((u) => u.id !== optimistic.id) }))
        void reload()
      })

    return { ok: true, user: optimistic }
  }, [data.companies, data.users, reload])

  const updateUser = useCallback((id: string, patch: Partial<User>) => {
    setData((d) => ({
      ...d,
      users: d.users.map((u) => (u.id === id ? { ...u, ...patch } : u)),
    }))
    if (id.startsWith('local_')) return
    // Telefone próprio: qualquer usuário (inclusive colaborador) edita o seu —
    // RPC dedicada; admin_update_user nega colaborador por design.
    if (
      Object.keys(patch).length === 1 &&
      patch.phone !== undefined &&
      id === data.users.find((u) => u.id === id)?.id
    ) {
      void api.apiUpdateOwnPhone(patch.phone).catch(() => void reload())
      return
    }
    if (patch.requiresPunch !== undefined) {
      void api.apiUpdateUserFlags(id, { requiresPunch: patch.requiresPunch }).catch(() => void reload())
    }
    void api
      .apiAdminUpdateUser(id, {
        name: patch.name,
        email: patch.email,
        password: patch.password,
        jobTitle: patch.jobTitle,
        department: patch.department,
        baseSalary: patch.baseSalary,
        admissionDate: patch.admissionDate,
        managerId: patch.managerId ?? null,
        cpf: patch.cpf,
        ctps: patch.ctps,
        phone: patch.phone,
        address: patch.address,
        cep: patch.cep,
        confidential: patch.confidentialNotes,
        dependents: patch.dependents,
        alimonyPercent: patch.alimonyPercent,
        transportAllowance: patch.transportAllowance,
        active: patch.active,
      })
      .then(() => toast.success('Sucesso! Alteração confirmada com êxito.'))
      .catch(() => void reload())
  }, [reload])

  const deleteUser = useCallback((id: string) => {
    const snapshot = data
    setData((d) => ({
      ...d,
      users: d.users.filter((u) => u.id !== id && u.managerId !== id),
      timeEntries: d.timeEntries.filter((t) => t.employeeId !== id),
      requests: d.requests.filter((r) => r.employeeId !== id),
      vacations: d.vacations.filter((v) => v.employeeId !== id),
      pdis: d.pdis.filter((p) => p.employeeId !== id),
    }))
    if (id.startsWith('local_')) return
    void api.apiAdminDeleteUser(id).catch(() => {
      setData(snapshot)
      void reload()
    })
  }, [data, reload])

  // ============ Autenticação / perfil ============
  const changePassword = useCallback((userId: string, newPassword: string) => {
    void api
      .apiAdminUpdateUser(userId, { password: newPassword })
      .then(() => toast.success('Sucesso! Senha alterada com êxito.'))
      .catch(() => void reload())
  }, [reload])

  /**
   * Salva a foto do perfil. Retorna Promise para a página dar feedback real
   * (sucesso/erro) em vez de otimismo cego. Estratégia em duas camadas:
   * 1. Upload ao Storage (bucket `avatars`): URL curta cacheável.
   * 2. FALLBACK: se o Storage falhar (policies ausentes, rede…), grava a
   *    própria imagem comprimida (~10–30 KB) inline em `profiles.photo_url`
   *    — a foto nunca se perde por problema de Storage.
   */
  const updatePhoto = useCallback((userId: string, blob: Blob | undefined): Promise<void> => {
    if (!blob) {
      // remover foto: limpa perfil e Storage
      setData((d) => ({
        ...d,
        users: d.users.map((u) => (u.id === userId ? { ...u, photoDataUrl: undefined } : u)),
      }))
      void api.apiUpdatePhoto(userId, undefined).catch(() => void reload())
      void import('./photo').then(({ removeAvatar }) => removeAvatar(userId)).catch(() => {})
      return Promise.resolve()
    }
    return import('./photo')
      .then(({ uploadAvatar }) => uploadAvatar(userId, blob))
      .then((url) => {
        setData((d) => ({
          ...d,
          users: d.users.map((u) => (u.id === userId ? { ...u, photoDataUrl: url } : u)),
        }))
        return api.apiUpdatePhoto(userId, url).then(() => toast.success('Sucesso! Foto atualizada com êxito.'))
      })
      .catch(async (storageErr) => {
        // FALLBACK: Storage indisponível -> salva inline no banco (dataURL pequeno)
        console.warn('[store] upload ao Storage falhou, salvando foto inline no banco:', storageErr instanceof Error ? storageErr.message : storageErr)
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = () => reject(new Error('Falha ao ler a imagem.'))
          reader.readAsDataURL(blob)
        })
        if (dataUrl.length > 150_000) {
          throw new Error(
            'Falha no upload da foto (Storage indisponível) e a imagem é grande demais para o fallback. ' +
              'Verifique as policies do bucket avatars.',
          )
        }
        setData((d) => ({
          ...d,
          users: d.users.map((u) => (u.id === userId ? { ...u, photoDataUrl: dataUrl } : u)),
        }))
        await api.apiUpdatePhoto(userId, dataUrl)
      })
  }, [reload])

  // ============ Feedback / requisições / férias / ponto ============
  const addFeedback = useCallback((feedback: Feedback) => {
    setData((d) => ({ ...d, feedbacks: [feedback, ...d.feedbacks] }))
    void api
      .apiAddFeedback(feedback)
      .then(() => toast.success('Sucesso! Feedback enviado com êxito.'))
      .catch(() => void reload())
  }, [reload])

  /** Confirmação de leitura — só o destinatário dispara (botão do painel). */
  const markFeedbackRead = useCallback(
    (feedbackId: string) => {
      const readAt = new Date().toISOString()
      setData((d) => ({
        ...d,
        feedbacks: d.feedbacks.map((f) => (f.id === feedbackId ? { ...f, readAt } : f)),
      }))
      void api.apiMarkFeedbackRead(feedbackId).catch(() => void reload())
    },
    [reload],
  )

  // ============ Assessments (questionários e avaliações) ============
  const createAssessment = useCallback(
    (a: Omit<Assessment, 'id' | 'createdAt' | 'completedAt'>): Promise<void> => {
      const optimistic: Assessment = { ...a, id: `local_as${Date.now()}`, createdAt: new Date().toISOString() }
      setData((d) => ({ ...d, assessments: [optimistic, ...d.assessments] }))
      return api
        .apiCreateAssessment(a)
        .then((realId) => {
          setData((d) => ({
            ...d,
            assessments: d.assessments.map((x) => (x.id === optimistic.id ? { ...x, id: realId } : x)),
          }))
        })
        .catch((e) => {
          setData((d) => ({ ...d, assessments: d.assessments.filter((x) => x.id !== optimistic.id) }))
          throw e
        })
    },
    [],
  )

  /** Respostas do colaborador — salvas em tempo real, pergunta a pergunta. */
  const saveAssessmentAnswers = useCallback((id: string, questions: AssessmentQuestion[], completed: boolean) => {
    setData((d) => ({
      ...d,
      assessments: d.assessments.map((x) =>
        x.id === id ? { ...x, questions, completedAt: completed ? new Date().toISOString() : x.completedAt } : x,
      ),
    }))
    if (id.startsWith('local_')) return
    void api.apiSaveAssessmentAnswers(id, questions, completed).catch(() => void reload())
  }, [reload])

  const deleteAssessment = useCallback((id: string) => {
    const target = data.assessments.find((x) => x.id === id)
    setData((d) => ({ ...d, assessments: d.assessments.filter((x) => x.id !== id) }))
    if (!target || id.startsWith('local_')) return
    void api
      .apiTrashItem('assessments', id, target as unknown as Record<string, unknown>)
      .catch(() => void reload())
  }, [data.assessments, reload])

  /** Restaura uma avaliação/feedback estruturado da lixeira. */
  const restoreAssessment = useCallback((id: string) => {
    void api
      .apiRestoreFromTrash('assessments', id)
      .then(() => void reload())
      .catch(() => void reload())
  }, [reload])

  /** PDI criado pelo gestor com etapas. */
  const createPdi = useCallback(
    (p: {
      employeeId: string
      title: string
      description: string
      dueDate: string
      createdBy: string
      steps: PdiStep[]
      goalsEnabled?: boolean
      goalQuestions?: PdiGoalQuestion[]
    }): Promise<void> => {
      const optimistic: Pdi = {
        id: `local_pdi${Date.now()}`,
        employeeId: p.employeeId,
        title: p.title,
        description: p.description,
        status: 'em_andamento',
        dueDate: p.dueDate,
        progress: 0,
        createdBy: p.createdBy,
        steps: p.steps,
        goalsEnabled: p.goalsEnabled ?? false,
        goalQuestions: p.goalQuestions ?? [],
        managerComments: [],
      }
      setData((d) => ({ ...d, pdis: [optimistic, ...d.pdis] }))
      return api
        .apiCreatePdi(p)
        .then((realId) => {
          setData((d) => ({ ...d, pdis: d.pdis.map((x) => (x.id === optimistic.id ? { ...x, id: realId } : x)) }))
        })
        .catch((e) => {
          setData((d) => ({ ...d, pdis: d.pdis.filter((x) => x.id !== optimistic.id) }))
          throw e
        })
    },
    [],
  )

  /** Colaborador marca/desmarca etapa do PDI; progresso recalculado. */
  const togglePdiStep = useCallback(
    (pdiId: string, stepId: string) => {
      setData((d) => {
        const next = d.pdis.map((p) => {
          if (p.id !== pdiId || !p.steps) return p
          const now = new Date().toISOString()
          const steps = p.steps.map((s) =>
            s.id === stepId
              ? { ...s, done: !s.done, progress: !s.done ? 100 : 0, doneAt: !s.done ? now : undefined }
              : s,
          )
          const progress = steps.length > 0 ? Math.round(steps.reduce((acc, s) => acc + (s.progress ?? (s.done ? 100 : 0)), 0) / steps.length) : 0
          return {
            ...p,
            steps,
            progress,
            status: (progress >= 100 ? 'concluido' : 'em_andamento') as Pdi['status'],
          }
        })
        return { ...d, pdis: next }
      })
      if (pdiId.startsWith('local_')) return
      const current = data.pdis.find((p) => p.id === pdiId)
      if (current?.steps) {
        const steps = current.steps.map((s) =>
          s.id === stepId
            ? { ...s, done: !s.done, progress: !s.done ? 100 : 0, doneAt: !s.done ? new Date().toISOString() : undefined }
            : s,
        )
        void api.apiSavePdiSteps(pdiId, steps).catch(() => void reload())
      }
    },
    [data.pdis, reload],
  )

  /**
   * Colaborador avança o % de uma etapa (0–100 em passos de 10).
   * Ex.: treinamento de 10 módulos → cada módulo = +10%.
   * Marca done/doneAt automaticamente ao chegar em 100.
   */
  const setPdiStepProgress = useCallback(
    (pdiId: string, stepId: string, progress: number) => {
      const clamped = Math.max(0, Math.min(100, Math.round(progress)))
      const now = new Date().toISOString()
      setData((d) => {
        const next = d.pdis.map((p) => {
          if (p.id !== pdiId || !p.steps) return p
          const steps = p.steps.map((s) =>
            s.id === stepId
              ? { ...s, progress: clamped, done: clamped >= 100, doneAt: clamped >= 100 ? (s.doneAt ?? now) : undefined }
              : s,
          )
          const overall = steps.length > 0 ? Math.round(steps.reduce((acc, s) => acc + (s.progress ?? 0), 0) / steps.length) : 0
          return {
            ...p,
            steps,
            progress: overall,
            status: (overall >= 100 ? 'concluido' : 'em_andamento') as Pdi['status'],
          }
        })
        return { ...d, pdis: next }
      })
      if (pdiId.startsWith('local_')) return
      const current = data.pdis.find((p) => p.id === pdiId)
      if (current?.steps) {
        const steps = current.steps.map((s) =>
          s.id === stepId
            ? { ...s, progress: clamped, done: clamped >= 100, doneAt: clamped >= 100 ? (s.doneAt ?? now) : undefined }
            : s,
        )
        void api.apiSavePdiSteps(pdiId, steps).catch(() => void reload())
      }
    },
    [data.pdis, reload],
  )

  /** Gestor comenta no PDI em desenvolvimento (incentivo/orientação). */
  const addPdiComment = useCallback(
    (pdiId: string, authorId: string, message: string) => {
      const comment: PdiComment = {
        id: `c${Date.now()}`,
        authorId,
        message: message.trim().slice(0, 500),
        createdAt: new Date().toISOString(),
      }
      let comments: PdiComment[] = []
      setData((d) => {
        const next = d.pdis.map((p) => {
          if (p.id !== pdiId) return p
          comments = [...(p.managerComments ?? []), comment]
          return { ...p, managerComments: comments }
        })
        return { ...d, pdis: next }
      })
      if (pdiId.startsWith('local_')) return
      void api.apiAddPdiComment(pdiId, comments).catch(() => void reload())
      toast.success('Sucesso! Comentário enviado com êxito.')
    },
    [reload],
  )

  /** Gestor ativa/desativa as metas de um PDI. */
  const setPdiGoalsEnabled = useCallback(
    (pdiId: string, enabled: boolean) => {
      setData((d) => ({
        ...d,
        pdis: d.pdis.map((p) => (p.id === pdiId ? { ...p, goalsEnabled: enabled } : p)),
      }))
      if (pdiId.startsWith('local_')) return
      const current = data.pdis.find((p) => p.id === pdiId)
      void api.apiSavePdiGoals(pdiId, enabled, current?.goalQuestions ?? []).catch(() => void reload())
    },
    [data.pdis, reload],
  )

  /** Gestor cadastra/atualiza as perguntas de meta de um PDI. */
  const setPdiGoalQuestions = useCallback(
    (pdiId: string, questions: PdiGoalQuestion[]) => {
      setData((d) => ({
        ...d,
        pdis: d.pdis.map((p) => (p.id === pdiId ? { ...p, goalQuestions: questions } : p)),
      }))
      if (pdiId.startsWith('local_')) return
      const current = data.pdis.find((p) => p.id === pdiId)
      void api.apiSavePdiGoals(pdiId, current?.goalsEnabled ?? true, questions).catch(() => void reload())
    },
    [data.pdis, reload],
  )

  /** Colaborador responde uma pergunta de meta (sim/não ou opção). */
  const answerPdiGoal = useCallback(
    (pdiId: string, questionId: string, answer: string) => {
      const now = new Date().toISOString()
      let questions: PdiGoalQuestion[] = []
      setData((d) => {
        const next = d.pdis.map((p) => {
          if (p.id !== pdiId) return p
          questions = (p.goalQuestions ?? []).map((q) =>
            q.id === questionId ? { ...q, answer, answeredAt: now } : q,
          )
          return { ...p, goalQuestions: questions }
        })
        return { ...d, pdis: next }
      })
      if (pdiId.startsWith('local_')) return
      const current = data.pdis.find((p) => p.id === pdiId)
      void api.apiSavePdiGoals(pdiId, current?.goalsEnabled ?? true, questions).catch(() => void reload())
    },
    [data.pdis, reload],
  )

  const deletePdi = useCallback((pdiId: string) => {
    const target = data.pdis.find((p) => p.id === pdiId)
    setData((d) => ({ ...d, pdis: d.pdis.filter((p) => p.id !== pdiId) }))
    if (!target || pdiId.startsWith('local_')) return
    // SOFT DELETE: vai para a lixeira (restaurável por 30 dias)
    void api
      .apiTrashItem('pdis', pdiId, target as unknown as Record<string, unknown>)
      .catch(() => void reload())
  }, [data.pdis, reload])

  /** Restaura um PDI da lixeira. */
  const restorePdi = useCallback((pdiId: string) => {
    void api
      .apiRestoreFromTrash('pdis', pdiId)
      .then(() => void reload())
      .catch(() => void reload())
  }, [reload])

  /** Gestor exclui um feedback que enviou — vai para a lixeira (30 dias). */
  const deleteFeedback = useCallback((id: string) => {
    const target = data.feedbacks.find((f) => f.id === id)
    setData((d) => ({ ...d, feedbacks: d.feedbacks.filter((f) => f.id !== id) }))
    if (!target || id.startsWith('local_')) return
    void api
      .apiTrashItem('feedbacks', id, target as unknown as Record<string, unknown>)
      .catch(() => void reload())
  }, [data.feedbacks, reload])

  /** Restaura um feedback da lixeira. */
  const restoreFeedback = useCallback((id: string) => {
    void api
      .apiRestoreFromTrash('feedbacks', id)
      .then(() => void reload())
      .catch(() => void reload())
  }, [reload])

  const updateRequestStatus = useCallback((id: string, status: Request['status'], reviewNote?: string) => {
    setData((d) => ({
      ...d,
      requests: d.requests.map((r) => (r.id === id ? { ...r, status, reviewNote: reviewNote ?? r.reviewNote } : r)),
    }))
    toast.success(status === 'aprovado' ? 'Sucesso! Requisição aprovada.' : 'Requisição reprovada.')
    void api.apiUpdateRequestStatus(id, status, reviewNote).catch(() => void reload())
  }, [reload])

  /**
   * Cria requisição com upload dos anexos para o Storage.
   * Retorna promise para a página aguardar (feedback de progresso).
   */
  const createRequest = useCallback(
    (request: Request, files?: { fileName: string; mimeType: string; sizeBytes: number; file?: File }[]): Promise<void> => {
      const optimistic: Request = { ...request, id: `local_r${Date.now()}` }
      setData((d) => ({ ...d, requests: [optimistic, ...d.requests] }))
      return api
        .apiCreateRequest(request.employeeId, {
          type: request.type,
          period: request.period,
          justification: request.justification,
          attachments: (files ?? request.attachments.map((a) => ({ ...a, file: undefined }))).map((a) => ({
            fileName: a.fileName,
            mimeType: a.mimeType,
            sizeBytes: a.sizeBytes,
            file: (a as any).file,
          })),
        })
        .then(() => void reload())
        .catch((e) => {
          setData((d) => ({ ...d, requests: d.requests.filter((r) => r.id !== optimistic.id) }))
          throw e
        })
    },
    [reload],
  )

  // ============ Histórico de férias ============
  const addVacationHistory = useCallback(
    (item: Omit<VacationHistoryItem, 'id' | 'createdAt'>) => {
      const optimistic: VacationHistoryItem = { ...item, id: `local_vh${Date.now()}`, createdAt: new Date().toISOString() }
      setData((d) => ({ ...d, vacationHistory: [optimistic, ...d.vacationHistory] }))
      void api
        .apiAddVacationHistory(item)
        .then(() => void reload())
        .catch(() => {
          setData((d) => ({ ...d, vacationHistory: d.vacationHistory.filter((h) => h.id !== optimistic.id) }))
          void reload()
        })
    },
    [reload],
  )

  // ============ Folgas do espelho de ponto ============
  const createDayOff = useCallback(
    (employeeId: string, day: string, reason: string): Promise<void> => {
      const optimistic: DayOffRequest = {
        id: `local_do${Date.now()}`,
        employeeId,
        day,
        reason,
        status: 'pendente',
        createdAt: new Date().toISOString(),
      }
      setData((d) => ({ ...d, dayOffs: [optimistic, ...d.dayOffs] }))
      return api
        .apiCreateDayOff(employeeId, day, reason)
        .then(() => void reload())
        .catch((e) => {
          setData((d) => ({ ...d, dayOffs: d.dayOffs.filter((o) => o.id !== optimistic.id) }))
          throw e
        })
    },
    [reload],
  )

  const updateDayOffStatus = useCallback((id: string, status: 'aprovado' | 'reprovado') => {
    setData((d) => ({ ...d, dayOffs: d.dayOffs.map((o) => (o.id === id ? { ...o, status } : o)) }))
    if (id.startsWith('local_')) return
    void api.apiUpdateDayOffStatus(id, status).catch(() => void reload())
  }, [reload])

  const addVacation = useCallback((vacation: VacationRequest) => {
    const optimistic: VacationRequest = { ...vacation, id: `local_vac${Date.now()}` }
    setData((d) => ({ ...d, vacations: [optimistic, ...d.vacations] }))
    void api
      .apiAddVacation(vacation)
      .then(() => void reload())
      .catch(() => {
        setData((d) => ({ ...d, vacations: d.vacations.filter((v) => v.id !== optimistic.id) }))
        void reload()
      })
  }, [reload])

  const updateVacationStatus = useCallback((id: string, status: VacationRequest['status']) => {
    setData((d) => ({ ...d, vacations: d.vacations.map((v) => (v.id === id ? { ...v, status } : v)) }))
    if (id.startsWith('local_')) return
    void api.apiUpdateVacationStatus(id, status).catch(() => void reload())
  }, [reload])

  const addTimeEntry = useCallback((entry: TimeEntry) => {
    const optimistic: TimeEntry = { ...entry, id: `local_te${Date.now()}` }
    setData((d) => ({ ...d, timeEntries: [optimistic, ...d.timeEntries] }))
    void api
      .apiAddTimeEntry(entry.employeeId, entry.type, entry.occurredAt, entry.location)
      .then(() => void reload())
      .catch((e) => {
        setData((d) => ({ ...d, timeEntries: d.timeEntries.filter((t) => t.id !== optimistic.id) }))
        setError(e instanceof Error ? e.message : 'Falha ao registrar batida.')
      })
  }, [reload])

  const punchNext = useCallback(
    (userId: string, now: Date, location?: GeoLocation) => {
      const todays = data.timeEntries.filter((t) => t.employeeId === userId && localDayKey(t.occurredAt) === localTodayKey(now))
      const order: TimeEntryType[] = ['entrada', 'saida_almoco', 'volta_almoco', 'saida']
      const nextType = order[todays.length % order.length] ?? 'entrada'
      addTimeEntry({ id: `te${Date.now()}`, employeeId: userId, type: nextType, occurredAt: now.toISOString(), location })
    },
    [data.timeEntries, addTimeEntry],
  )

  const deleteTimeEntry = useCallback((entryId: string) => {
    setData((d) => ({ ...d, timeEntries: d.timeEntries.filter((t) => t.id !== entryId) }))
    if (entryId.startsWith('local_')) return
    void api.apiDeleteTimeEntry(entryId).catch(() => void reload())
  }, [reload])

  const setDayEntries = useCallback(
    (employeeId: string, day: string, entries: { type: TimeEntryType; time: string }[]) => {
      const snapshot = data.timeEntries
      setData((d) => ({
        ...d,
        timeEntries: [
          ...entries.map((e, i) => ({
            id: `local_te${Date.now()}${i}`,
            employeeId,
            type: e.type,
            occurredAt: `${day}T${e.time}:00.000`,
          })),
          ...d.timeEntries.filter((t) => !(t.employeeId === employeeId && localDayKey(t.occurredAt) === day)),
        ],
      }))
      void api.apiSetDayEntries(employeeId, day, entries).catch(() => {
        setData((d) => ({ ...d, timeEntries: snapshot }))
        setError('Não foi possível salvar a edição deste dia.')
      })
    },
    [data.timeEntries, reload],
  )

  /**
   * Ajuste de batidas de um colaborador PELO GESTOR, com justificativa
   * obrigatória (fica gravada em cada batida: auditoria + colaborador vê).
   */
  const adjustDayEntries = useCallback(
    (employeeId: string, day: string, entries: { type: TimeEntryType; time: string }[], note: string, adjustedByName: string): Promise<void> => {
      const snapshot = data.timeEntries
      setData((d) => ({
        ...d,
        timeEntries: [
          ...entries.map((e, i) => ({
            id: `local_adj${Date.now()}${i}`,
            employeeId,
            type: e.type,
            occurredAt: `${day}T${e.time}:00.000`,
            adjustmentNote: note,
            adjustedBy: adjustedByName,
          })),
          ...d.timeEntries.filter((t) => !(t.employeeId === employeeId && localDayKey(t.occurredAt) === day)),
        ],
        entryAdjustments: [
          { id: `local_ta${Date.now()}`, employeeId, day, note, adjustedBy: adjustedByName, adjustedAt: new Date().toISOString() },
          ...d.entryAdjustments,
        ],
      }))
      return api
        .apiAdjustDayEntries(employeeId, day, entries, note, adjustedByName)
        .catch((e) => {
          setData((d) => ({ ...d, timeEntries: snapshot }))
          throw e
        })
        .then(() => void reload())
    },
    [data.timeEntries, reload],
  )

  const toggleTask = useCallback((userId: string, taskId: string) => {
    const current = data.tasks[userId]?.find((t) => t.id === taskId)?.done ?? false
    setData((d) => {
      const userTasks = d.tasks[userId] ?? []
      return { ...d, tasks: { ...d.tasks, [userId]: userTasks.map((t) => (t.id === taskId ? { ...t, done: !t.done } : t)) } }
    })
    if (taskId.startsWith('local_')) return
    void api.apiToggleTask(userId, taskId, !current).catch(() => void reload())
  }, [data.tasks, reload])

  const addTask = useCallback((userId: string, label: string, due?: string) => {
    const optimistic: TaskItem = { id: `local_t${Date.now()}`, label, done: false, due }
    setData((d) => ({ ...d, tasks: { ...d.tasks, [userId]: [...(d.tasks[userId] ?? []), optimistic] } }))
    void api
      .apiAddTask(userId, label, due)
      .then(() => void reload())
      .catch(() => void reload())
  }, [reload])

  const updatePdiProgress = useCallback((pdiId: string, progress: number) => {
    setData((d) => ({
      ...d,
      pdis: d.pdis.map((p) =>
        p.id === pdiId
          ? { ...p, progress: Math.min(100, Math.max(0, progress)), status: progress >= 100 ? 'concluido' : progress > 0 ? 'em_andamento' : p.status }
          : p,
      ),
    }))
    if (pdiId.startsWith('local_')) return
    const current = data.pdis.find((p) => p.id === pdiId)
    void api.apiUpdatePdiProgress(pdiId, Math.min(100, Math.max(0, progress)), current?.status ?? 'em_andamento').catch(() => void reload())
  }, [data.pdis, reload])

  const updateSchedule = useCallback((userId: string, schedule: User['weeklySchedule']) => {
    setData((d) => ({ ...d, users: d.users.map((u) => (u.id === userId ? { ...u, weeklySchedule: schedule } : u)) }))
    void api.apiUpdateSchedule(userId, schedule).catch(() => void reload())
  }, [reload])

  const updateVacationBalance = useCallback((userId: string, days: number) => {
    setData((d) => ({ ...d, users: d.users.map((u) => (u.id === userId ? { ...u, vacationBalanceDays: days } : u)) }))
    void api.apiUpdateVacationBalance(userId, days).catch(() => void reload())
  }, [reload])

  // ============ Folha de pagamento ============
  const savePayroll = useCallback((run: PayrollRun) => {
    setData((d) => {
      const existing = d.payrolls.findIndex((p) => p.id === run.id)
      const payrolls = existing >= 0 ? d.payrolls.map((p) => (p.id === run.id ? run : p)) : [run, ...d.payrolls]
      return { ...d, payrolls }
    })
    void api
      .apiSavePayroll(run)
      .then((realId) => {
        setData((d) => ({ ...d, payrolls: d.payrolls.map((p) => (p.id === run.id ? { ...p, id: realId } : p)) }))
      })
      .catch(() => void reload())
  }, [reload])

  const registerPayroll = useCallback((run: PayrollRun): PayrollRun | null => {
    let replaced: PayrollRun | null = null
    const active = data.payrolls.find(
      (p) => p.userId === run.userId && p.reference === run.reference && !p.supersededBy && p.id !== run.id,
    )
    const archived = active ? { ...active, state: 'rascunho' as const, supersededBy: run.id } : null
    replaced = archived
    const maxVersion = data.payrolls
      .filter((p) => p.userId === run.userId && p.reference === run.reference)
      .reduce((acc, p) => Math.max(acc, p.version), 0)
    const withVersion: PayrollRun = { ...run, version: run.version > 0 ? run.version : maxVersion + 1 }
    setData((d) => ({
      ...d,
      payrolls: [withVersion, ...(archived ? [archived] : []), ...d.payrolls.filter((p) => p.id !== withVersion.id && p.id !== active?.id)],
    }))
    // FALHA VISÍVEL: se o INSERT falhar (RLS/rede), o gestor precisa SABER —
    // antes o erro era engolido e a folha nunca chegava ao colaborador.
    api
      .apiSavePayroll(withVersion)
      .then((realId) => {
        setData((d) => ({ ...d, payrolls: d.payrolls.map((p) => (p.id === withVersion.id ? { ...p, id: realId } : p)) }))
      })
      .catch((e) => {
        setData((d) => ({ ...d, payrolls: d.payrolls.filter((p) => p.id !== withVersion.id) }))
        toast.error(
          `FALHA AO PUBLICAR A FOLHA: ${e instanceof Error ? e.message : 'erro desconhecido'}. ` +
            'Verifique se a migration v12 foi aplicada no Supabase.',
        )
        void reload()
      })
    if (archived && !archived.id.startsWith('local_')) {
      void api.apiUpdatePayrollState(archived.id, { state: 'rascunho', supersededBy: withVersion.id }).catch(() => void reload())
    }
    return replaced
  }, [data.payrolls, reload])

  const restorePayroll = useCallback((id: string) => {
    const target = data.payrolls.find((p) => p.id === id)
    if (!target) return
    const current = data.payrolls.find((p) => p.userId === target.userId && p.reference === target.reference && p.id !== id && !p.supersededBy)
    const restored: PayrollRun = { ...target, state: 'publicada', publishedAt: new Date().toISOString(), supersededBy: undefined }
    const demoted: PayrollRun | null = current ? { ...current, state: 'rascunho', supersededBy: restored.id } : null
    setData((d) => ({
      ...d,
      payrolls: d.payrolls.map((p) => {
        if (p.id === restored.id) return restored
        if (demoted && p.id === demoted.id) return demoted
        return p
      }),
    }))
    void api.apiUpdatePayrollState(restored.id, { state: 'publicada', publishedAt: restored.publishedAt, supersededBy: null }).catch(() => void reload())
    if (demoted) void api.apiUpdatePayrollState(demoted.id, { state: 'rascunho', supersededBy: restored.id }).catch(() => void reload())
  }, [data.payrolls, reload])

  const publishPayroll = useCallback((id: string) => {
    const publishedAt = new Date().toISOString()
    setData((d) => ({
      ...d,
      payrolls: d.payrolls.map((p) => (p.id === id ? { ...p, state: 'publicada' as const, publishedAt } : p)),
    }))
    void api.apiUpdatePayrollState(id, { state: 'publicada', publishedAt }).catch(() => void reload())
  }, [reload])

  const unpublishPayroll = useCallback((id: string, reason: string) => {
    const unpublishedAt = new Date().toISOString()
    setData((d) => ({
      ...d,
      payrolls: d.payrolls.map((p) =>
        p.id === id ? { ...p, state: 'rascunho' as const, unpublishedAt, unpublishedReason: reason.slice(0, 200) } : p,
      ),
    }))
    void api.apiUpdatePayrollState(id, { state: 'rascunho', unpublishedAt, unpublishedReason: reason.slice(0, 200) }).catch(() => void reload())
  }, [reload])

  const deletePayroll = useCallback((id: string) => {
    const target = data.payrolls.find((p) => p.id === id)
    setData((d) => {
      const others = d.payrolls.filter((p) => p.id !== id)
      const nextActive = others
        .filter((p) => p.userId === target?.userId && p.reference === target?.reference)
        .sort((a, b) => b.version - a.version)[0]
      const promoted = nextActive ? { ...nextActive, supersededBy: undefined } : null
      return { ...d, payrolls: d.payrolls.map((p) => (promoted && p.id === promoted.id ? promoted : p)) }
    })
    void api.apiDeletePayroll(id).catch(() => void reload())
  }, [data.payrolls, reload])

  // ============ Banco de horas ============
  const addHourBankAdjustment = useCallback((adj: HourBankAdjustment) => {
    setData((d) => ({ ...d, hourBank: [adj, ...d.hourBank] }))
    void api.apiAddHourBankAdjustment(adj).catch(() => void reload())
  }, [reload])

  const resetData = useCallback(() => {
    // no modo Supabase não há reset local; recarrega do servidor
    void reload()
  }, [reload])

  return useMemo(
    () => ({
      data,
      loading,
      heavyLoading,
      error,
      reload,
      createCompany,
      updateCompany,
      deleteCompany,
      createUser,
      updateUser,
      deleteUser,
      changePassword,
      updatePhoto,
      addFeedback,
      markFeedbackRead,
      createAssessment,
      saveAssessmentAnswers,
      deleteAssessment,
      restoreAssessment,
      createPdi,
      togglePdiStep,
      setPdiStepProgress,
      addPdiComment,
      setPdiGoalsEnabled,
      setPdiGoalQuestions,
      answerPdiGoal,
      deletePdi,
      restorePdi,
      deleteFeedback,
      restoreFeedback,
      updateRequestStatus,
      createRequest,
      addVacation,
      updateVacationStatus,
      addVacationHistory,
      createDayOff,
      updateDayOffStatus,
      addTimeEntry,
      deleteTimeEntry,
      punchNext,
      toggleTask,
      addTask,
      updatePdiProgress,
      updateSchedule,
      updateVacationBalance,
      savePayroll,
      publishPayroll,
      unpublishPayroll,
      deletePayroll,
      registerPayroll,
      restorePayroll,
      addHourBankAdjustment,
      setDayEntries,
      adjustDayEntries,
      resetData,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, loading, heavyLoading, error],
  )
}

export type HrStore = ReturnType<typeof useHrData>
