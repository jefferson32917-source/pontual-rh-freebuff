export type Role = 'super_admin' | 'gestor' | 'colaborador'

/** Empresa tenant. Super Admin gerencia; gestores/colaboradores pertencem a uma. */
export interface Company {
  id: string
  name: string
  /** Sigla usada nas matrículas (ex.: "Silva Construções" -> "SC") */
  initials: string
  cnpj: string
  /** Dados legais/comerciais — aparecem no holerite e permitem contato direto */
  address?: string
  cep?: string
  bairro?: string
  city?: string
  uf?: string
  /** Inscrição Estadual */
  stateRegistration?: string
  responsibleName?: string
  responsiblePhone?: string
  createdAt: string
  active: boolean
  /** Módulo de folha habilitado para esta empresa (gestor pode desligar) */
  payrollEnabled: boolean
}

export interface User {
  id: string
  companyId: string | null // null = super admin (cross-tenant)
  /** Matrícula de acesso: SG001 (gestor) / SC001 (colaborador); SA não usa */
  matricula: string | null
  name: string
  email: string
  /** Senha de acesso (demo local; produção: hash no backend) */
  password: string
  role: Role
  department: string
  jobTitle: string
  /** ISO date string */
  admissionDate: string
  managerId?: string
  avatarColor: string
  /** Foto do perfil (dataURL; produção: Supabase Storage) */
  photoDataUrl?: string
  /** Saldo de dias de férias disponíveis */
  vacationBalanceDays: number
  /** Quadro de horários: dia da semana -> [entrada, saída] */
  weeklySchedule: WeeklySchedule
  /** Dados para folha de pagamento (CLT) */
  baseSalary: number
  /** Vale-transporte (desconto opcional ~6%) */
  transportAllowance: boolean
  /** Documentos trabalhistas (holerite) */
  cpf?: string
  ctps?: string
  /** Telefone de contato */
  phone?: string
  /** Endereço residencial */
  address?: string
  cep?: string
  /** Dados confidenciais visíveis apenas para a empresa (gestor/RH/SA) */
  confidentialNotes?: string
  /** Dependentes para IRPF */
  dependents: number
  /** Outras margens: pensão alimentícia (% do salário bruto) */
  alimonyPercent: number
  active: boolean
  /** Este usuário precisa bater ponto (padrão: true; gestores costumam ficar de fora) */
  requiresPunch: boolean
}

export type WeekDay = 'seg' | 'ter' | 'qua' | 'qui' | 'sex' | 'sab' | 'dom'
export type WeeklySchedule = Partial<Record<WeekDay, [string, string]>>

export const weekDayLabels: Record<WeekDay, string> = {
  seg: 'Segunda',
  ter: 'Terça',
  qua: 'Quarta',
  qui: 'Quinta',
  sex: 'Sexta',
  sab: 'Sábado',
  dom: 'Domingo',
}

export interface Pdi {
  id: string
  employeeId: string
  title: string
  description: string
  status: PdiStatus
  dueDate: string
  progress: number // 0-100
  /** Quem criou o PDI (gestor) */
  createdBy?: string
  /** Etapas do plano — o colaborador marca cada uma como concluída */
  steps?: PdiStep[]
}

export interface PdiStep {
  id: string
  label: string
  done: boolean
  /** ISO datetime da conclusão (rastreabilidade) */
  doneAt?: string
}

export type PdiStatus = 'em_andamento' | 'concluido' | 'atrasado'

/** Questionário ou avaliação aplicada pelo gestor a um colaborador. */
export type AssessmentKind = 'questionario' | 'avaliacao'

export interface AssessmentQuestion {
  id: string
  text: string
  /** Resposta do colaborador (salva em tempo real, pergunta a pergunta) */
  answer?: string
}

export interface Assessment {
  id: string
  kind: AssessmentKind
  title: string
  description?: string
  /** gestor que criou */
  createdBy: string
  /** colaborador que responde */
  assignedTo: string
  questions: AssessmentQuestion[]
  createdAt: string
  /** preenchido quando o colaborador finaliza */
  completedAt?: string
}

export type FeedbackKind = 'positivo' | 'melhoria'

export interface Feedback {
  id: string
  fromId: string
  toId: string
  kind: FeedbackKind
  message: string
  createdAt: string
  anonymous: boolean
  /** Confirmação de leitura: ISO datetime de quando o destinatário confirmou */
  readAt?: string
}

export type VacancyStatus = 'aberta' | 'em_processo' | 'fechada'

export interface Vacancy {
  id: string
  title: string
  department: string
  status: VacancyStatus
  openedAt: string
  candidates: number
  companyId: string
}

export type RequestType = 'ferias' | 'folga' | 'home_office' | 'atestado' | 'outro'
export type RequestStatus = 'pendente' | 'aprovado' | 'reprovado'

export interface Request {
  id: string
  employeeId: string
  type: RequestType
  /** Descrição curta do período — ou datas estruturadas de atestado (ver abaixo) */
  period: string
  justification: string
  status: RequestStatus
  createdAt: string
  /** Metadados dos anexos (arquivos em si ficam no Supabase Storage; em demo, base64 no localStorage) */
  attachments: RequestAttachment[]
  /** Atestado: data inicial (YYYY-MM-DD) */
  startDate?: string
  /** Atestado: data final (YYYY-MM-DD) */
  endDate?: string
  /** Atestado: quantidade de dias */
  daysCount?: number
  /** Atestado: data de retorno ao trabalho (YYYY-MM-DD) */
  returnDate?: string
  /** Atestado: CID (opcional, sigla médica) */
  cid?: string
  /** Observação da avaliação do gestor (aprovado/reprovado) */
  reviewNote?: string
}

export interface RequestAttachment {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
  /** apenas em modo demo (base64); em produção, path no bucket */
  dataUrl?: string
}

export type VacationStatus = 'pendente' | 'aprovada' | 'reprovada' | 'gozada'

export interface VacationRequest {
  id: string
  employeeId: string
  startDate: string
  endDate: string
  days: number
  status: VacationStatus
  createdAt: string
  note?: string
}

/** Evento do histórico de férias (gozo, venda, abono, ajuste). */
export interface VacationHistoryItem {
  id: string
  employeeId: string
  periodStart: string
  periodEnd: string
  days: number
  kind: 'gozada' | 'venda' | 'abono' | 'ajuste'
  note?: string
  admissionDate?: string
  createdAt: string
}

/** Folga de um dia, marcada no espelho de ponto e aprovada pelo gestor. */
export interface DayOffRequest {
  id: string
  employeeId: string
  /** YYYY-MM-DD */
  day: string
  reason: string
  status: 'pendente' | 'aprovado' | 'reprovado'
  createdAt: string
}

export type TimeEntryType = 'entrada' | 'saida_almoco' | 'volta_almoco' | 'saida'

export interface GeoLocation {
  /** latitude */
  lat: number
  /** longitude */
  lng: number
  /** precisão em metros (opcional) */
  accuracy?: number
}

export interface TimeEntry {
  id: string
  employeeId: string
  type: TimeEntryType
  /** ISO datetime */
  occurredAt: string
  /** Local da batida (visível apenas para gestores/RH) */
  location?: GeoLocation
  /** Justificativa de ajuste (quando editado pelo gestor) — visível ao colaborador */
  adjustmentNote?: string
  /** Nome de quem ajustou a batida (auditoria) */
  adjustedBy?: string
}

/** Justificativa de ajuste de um dia de batidas (auditoria + colaborador vê). */
export interface TimeEntryAdjustment {
  id: string
  employeeId: string
  /** YYYY-MM-DD */
  day: string
  note: string
  adjustedBy: string
  adjustedAt: string
}

export interface TaskItem {
  id: string
  label: string
  done: boolean
  due?: string
}

/** Item variável da folha: bônus, gratificação, comissão, desconto etc. */
export interface PayrollItem {
  id: string
  label: string
  /** valor em R$ (positivo = provento, negativo = desconto direto) */
  amount: number
  kind: 'bonus' | 'gratificacao' | 'comissao' | 'desconto'
}

export type PayrollState = 'rascunho' | 'publicada'

/** Registro de ajuste de banco de horas (rastreabilidade para o colaborador). */
export interface HourBankAdjustment {
  id: string
  userId: string
  /** horas ajustadas (positivo = crédito, negativo = débito) */
  hours: number
  reason: string
  /** referência da folha que gerou o ajuste */
  payrollId: string
  createdAt: string
}

export interface PayrollRun {
  id: string
  /** Referência AAAA-MM */
  reference: string
  userId: string
  companyId: string
  /** Snapshot dos dados no momento do cálculo */
  employee: {
    name: string
    matricula: string
    jobTitle: string
    department: string
    admissionDate: string
    dependents: number
    cpf?: string
    ctps?: string
    phone?: string
    address?: string
    cep?: string
  }
  company: {
    name: string
    cnpj: string
    initials: string
    address?: string
    cep?: string
    bairro?: string
    city?: string
    uf?: string
    stateRegistration?: string
    responsibleName?: string
    responsiblePhone?: string
  }
  baseSalary: number
  items: PayrollItem[]
  /** Horas extras importadas do ponto */
  extraHours: number
  extraHoursRate: number
  gross: number
  inssBase: number
  inss: number
  irrfBase: number
  irrf: number
  fgts: number
  fgtsBase: number
  transportDeduction: number
  familyAllowance: number
  otherDeductions: number
  netPay: number
  state: PayrollState
  /** id da folha que substituiu esta (histórico de versões) */
  supersededBy?: string
  /** versão dentro do mês (1, 2, 3…) */
  version: number
  generatedAt: string
  publishedAt?: string
  unpublishedAt?: string
  unpublishedReason?: string
}
