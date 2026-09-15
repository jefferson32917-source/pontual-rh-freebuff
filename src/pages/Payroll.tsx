import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { HrStore } from '../lib/store'
import { calculatePayroll, formatBRL, PAYROLL_PARAMS } from '../lib/payroll'
import type { PayrollItem, PayrollRun, User } from '../types'
import { localDayKey, referenceMonthOptions, referenceShortLabel, workedHours } from '../lib/format'
import { downloadPayrollPdf } from '../lib/pdf'
import { printPayroll } from '../lib/print'
import HoleriteSheet from '../components/HoleriteSheet'
import { EmptyState, SectionCard, StatusBadge } from '../components/ui'

const kindLabels: Record<PayrollItem['kind'], string> = {
  bonus: 'Bônus',
  gratificacao: 'Gratificação',
  comissao: 'Comissão',
  desconto: 'Desconto',
}

const currentYear = new Date().getFullYear()
const YEARS = [currentYear + 1, currentYear, currentYear - 1, currentYear - 2]

export default function Payroll({ user, store }: { user: User; store: HrStore }) {
  const { data } = store
  const employees = useMemo(
    () => data.users.filter((u) => u.companyId === user.companyId && u.role === 'colaborador' && u.active),
    [data.users, user.companyId],
  )

  const [selectedId, setSelectedId] = useState<string>(employees[0]?.id ?? '')
  const selected = data.users.find((u) => u.id === selectedId) ?? employees[0] ?? null
  const company = data.companies.find((c) => c.id === user.companyId)

  const now = new Date()
  const [refMonth, setRefMonth] = useState(String(now.getMonth() + 1).padStart(2, '0'))
  const [refYear, setRefYear] = useState(String(now.getFullYear()))
  const reference = `${refYear}-${refMonth}`

  const [baseSalary, setBaseSalary] = useState('')
  const [extraHours, setExtraHours] = useState('')
  const [items, setItems] = useState<PayrollItem[]>([])
  const [newLabel, setNewLabel] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [newKind, setNewKind] = useState<PayrollItem['kind']>('bonus')
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  /** Folha ATIVA do colaborador no mês selecionado (máx. 1 por mês). */
  const activePayroll: PayrollRun | null = useMemo(
    () => data.payrolls.find((p) => p.userId === selected?.id && p.reference === reference && !p.supersededBy) ?? null,
    [data.payrolls, selected, reference],
  )

  const versions = useMemo(
    () =>
      data.payrolls
        .filter((p) => p.userId === selected?.id && p.reference === reference)
        .sort((a, b) => b.version - a.version),
    [data.payrolls, selected, reference],
  )

  const companyPayrolls = useMemo(
    () => data.payrolls.filter((p) => p.companyId === user.companyId),
    [data.payrolls, user.companyId],
  )
  const [filterMonth, setFilterMonth] = useState('all')
  const [filterYear, setFilterYear] = useState(String(now.getFullYear()))
  const [filterEmp, setFilterEmp] = useState('all')
  const filteredPayrolls = useMemo(
    () =>
      companyPayrolls
        .filter((p) => !p.supersededBy)
        .filter((p) => (filterMonth === 'all' ? true : p.reference === `${filterYear}-${filterMonth}`))
        .filter((p) => (filterEmp === 'all' ? true : p.userId === filterEmp))
        .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt)),
    [companyPayrolls, filterMonth, filterYear, filterEmp],
  )

  // ===== Pré-preenchimento: herda itens variáveis do último holerite do colaborador =====
  const lastPayroll = useMemo(() => {
    if (!selected) return null
    return (
      data.payrolls
        .filter((p) => p.userId === selected.id && !p.supersededBy && p.reference !== reference)
        .sort((a, b) => b.reference.localeCompare(a.reference))[0] ?? null
    )
  }, [data.payrolls, selected, reference])

  useEffect(() => {
    setBaseSalary('')
    setExtraHours('')
    setItems(lastPayroll ? lastPayroll.items.map((i) => ({ ...i })) : [])
  }, [lastPayroll])

  const availableExtras = useMemo(() => {
    if (!selected) return 0
    const byDay = new Map<string, typeof data.timeEntries>()
    for (const e of data.timeEntries.filter((t) => t.employeeId === selected.id)) {
      const day = localDayKey(e.occurredAt)
      byDay.set(day, [...(byDay.get(day) ?? []), e])
    }
    const results: number[] = []
    for (const [day, entries] of byDay) {
      const worked = workedHours(entries)
      const weekday = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'][new Date(day + 'T12:00:00').getDay()] as keyof typeof selected.weeklySchedule
      const shift = selected.weeklySchedule[weekday]
      if (!shift) {
        if (worked > 0) results.push(worked)
      } else {
        const [inH = 0, inM = 0] = shift[0].split(':').map(Number)
        const [outH = 0, outM = 0] = shift[1].split(':').map(Number)
        const expected = (outH * 60 + outM - (inH * 60 + inM) - 60) / 60
        if (worked > expected + 0.25) results.push(Math.round((worked - expected) * 100) / 100)
      }
    }
    const bankBalance = data.hourBank.filter((a) => a.userId === selected.id).reduce((acc, a) => acc + a.hours, 0)
    let consumed = Math.max(0, -bankBalance)
    let total = 0
    for (const extra of results) {
      const payable = Math.max(0, extra - consumed)
      consumed = Math.max(0, consumed - extra)
      total += payable
    }
    return Math.round(total * 100) / 100
  }, [selected, data.timeEntries, data.hourBank])

  const effectiveExtra = extraHours === '' ? 0 : Math.max(0, parseFloat(extraHours.replace(',', '.')) || 0)
  const effectiveBase = selected ? (baseSalary === '' ? selected.baseSalary : Math.max(0, parseFloat(baseSalary.replace(',', '.')) || 0)) : 0

  const result = useMemo(() => {
    if (!selected) return null
    return calculatePayroll(
      { baseSalary: effectiveBase, transportAllowance: selected.transportAllowance, dependents: selected.dependents, alimonyPercent: selected.alimonyPercent },
      { items, extraHours: effectiveExtra },
    )
  }, [selected, effectiveBase, items, effectiveExtra])

  function importHours() {
    if (availableExtras <= 0) return
    setExtraHours(String(availableExtras))
  }

  function addItem(e: FormEvent) {
    e.preventDefault()
    const amount = parseFloat(newAmount.replace(',', '.'))
    const label = newLabel.trim().slice(0, 60)
    if (!label || !Number.isFinite(amount) || amount === 0) return
    const item: PayrollItem = { id: `pi${Date.now()}`, label, amount: newKind === 'desconto' ? -Math.abs(amount) : Math.abs(amount), kind: newKind }
    setItems((prev) => [...prev, item])
    setNewLabel('')
    setNewAmount('')
  }

  /** Registra a folha do mês: substitui a ativa (arquivada no histórico de versões). */
  function registerRun(publish: boolean) {
    if (!selected || !result || !company) return
    const previousVersions = data.payrolls.filter((p) => p.userId === selected.id && p.reference === reference)
    const run: PayrollRun = {
      id: `pr${Date.now()}`,
      version: previousVersions.length + 1,
      reference,
      userId: selected.id,
      companyId: selected.companyId ?? '',
      employee: {
        name: selected.name,
        matricula: selected.matricula ?? '—',
        jobTitle: selected.jobTitle,
        department: selected.department,
        admissionDate: selected.admissionDate,
        dependents: selected.dependents,
        cpf: selected.cpf,
        ctps: selected.ctps,
        phone: selected.phone,
        address: selected.address,
        cep: selected.cep,
      },
      company: {
        name: company.name,
        cnpj: company.cnpj,
        initials: company.initials,
        address: company.address,
        cep: company.cep,
        bairro: company.bairro,
        city: company.city,
        uf: company.uf,
        stateRegistration: company.stateRegistration,
        responsibleName: company.responsibleName,
        responsiblePhone: company.responsiblePhone,
      },
      baseSalary: result.baseSalary,
      items,
      extraHours: result.extraHours,
      extraHoursRate: result.extraHoursRate,
      gross: result.gross,
      inssBase: result.inssBase,
      inss: result.inss,
      irrfBase: result.irrfBase,
      irrf: result.irrf,
      fgts: result.fgts,
      fgtsBase: result.fgtsBase,
      transportDeduction: result.transportDeduction,
      familyAllowance: result.familyAllowance,
      otherDeductions: result.otherDeductions,
      netPay: result.netPay,
      state: publish ? 'publicada' : 'rascunho',
      generatedAt: new Date().toISOString(),
      publishedAt: publish ? new Date().toISOString() : undefined,
    }
    const replaced = store.registerPayroll(run)

    if (result.extraHours > 0 && publish) {
      store.addHourBankAdjustment({
        id: `hb${Date.now()}`,
        userId: selected.id,
        hours: -result.extraHours,
        reason: `Horas extras pagas na folha de ${referenceShortLabel(reference)} (${formatBRL(result.extraHours * result.extraHoursRate)}). Registrada por ${user.name}.`,
        payrollId: run.id,
        createdAt: new Date().toISOString(),
      })
    }

    setMsg({
      kind: 'ok',
      text: publish
        ? replaced
          ? `Holerite de ${referenceShortLabel(reference)} atualizado (v${run.version}) para ${selected.name}. A versão anterior ficou arquivada e pode ser restaurada.`
          : `Holerite de ${referenceShortLabel(reference)} publicado para ${selected.name} — já disponível no painel dele.`
        : `Rascunho v${run.version} salvo para ${selected.name}. Publique quando estiver pronto.`,
    })
  }

  if (!employees.length || !company) {
    return <EmptyState message="Nenhum colaborador na sua empresa ainda. Cadastre em Colaboradores." />
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Folha de pagamento</h1>
        <p className="mt-1 text-sm text-slate-500">
          Um holerite por colaborador/mês. Novos registros no mesmo mês viram nova versão; itens variáveis são herdados do mês anterior.
        </p>
      </header>

      {msg && (
        <p role={msg.kind === 'error' ? 'alert' : 'status'} className={`rounded-xl px-3.5 py-2.5 text-sm font-medium ${msg.kind === 'error' ? 'bg-rose-50 text-rose-700' : 'bg-teal-50 text-teal-700'}`}>
          {msg.text}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <SectionCard title="Competência e colaborador">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="pay-month" className="mb-1.5 block text-sm font-medium text-slate-700">Mês</label>
                  <select id="pay-month" className="input" value={refMonth} onChange={(e) => setRefMonth(e.target.value)}>
                    {referenceMonthOptions.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="pay-year" className="mb-1.5 block text-sm font-medium text-slate-700">Ano</label>
                  <select id="pay-year" className="input" value={refYear} onChange={(e) => setRefYear(e.target.value)}>
                    {YEARS.map((y) => <option key={y} value={String(y)}>{y}</option>)}
                  </select>
                </div>
              </div>
              {activePayroll && (
                <p className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-xs font-medium text-amber-800">
                  ⚠️ Já existe holerite {activePayroll.state === 'publicada' ? 'publicado' : 'em rascunho'} (v{activePayroll.version}) deste mês para {selected?.name}. Um novo registro substitui o atual.
                </p>
              )}
              <div>
                <label htmlFor="pay-emp" className="mb-1.5 block text-sm font-medium text-slate-700">Colaborador</label>
                <select id="pay-emp" className="input" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
                  {employees.map((u) => (
                    <option key={u.id} value={u.id}>{u.matricula ? `${u.matricula} · ` : ''}{u.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Remuneração">
            <div className="space-y-4">
              <div>
                <label htmlFor="pay-base" className="mb-1.5 block text-sm font-medium text-slate-700">Salário base (R$)</label>
                <input id="pay-base" type="number" step="0.01" min="0" className="input" placeholder={formatBRL(selected?.baseSalary ?? 0)} value={baseSalary} onChange={(e) => setBaseSalary(e.target.value)} />
                <p className="mt-1 text-[11px] text-slate-400">Contratual: {formatBRL(selected?.baseSalary ?? 0)}</p>
              </div>
              <div>
                <label htmlFor="pay-extra" className="mb-1.5 block text-sm font-medium text-slate-700">Horas extras</label>
                <input id="pay-extra" type="number" step="0.25" min="0" className="input" placeholder="0" value={extraHours} onChange={(e) => setExtraHours(e.target.value)} />
                <p className="mt-1 text-[11px] text-slate-400">Hora extra: {formatBRL((effectiveBase / 220) * (1 + PAYROLL_PARAMS.extraHoursPremium))} (+50%)</p>
                {availableExtras > 0 && (
                  <button type="button" className="btn-secondary mt-2 w-full py-2 text-xs" onClick={importHours}>
                    📥 Importar {availableExtras}h do ponto
                  </button>
                )}
              </div>

              <div className="rounded-xl border border-slate-100 p-3.5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Bônus e descontos
                  {lastPayroll && items.length > 0 && <span className="ml-1 font-normal normal-case text-teal-600">· herdados de {referenceShortLabel(lastPayroll.reference)}</span>}
                </p>
                <form onSubmit={addItem} className="space-y-2">
                  <input className="input" placeholder="Descrição (ex.: Bônus trimestral)" maxLength={60} value={newLabel} onChange={(e) => setNewLabel(e.target.value)} aria-label="Descrição do item" />
                  <div className="flex gap-2">
                    <select className="input w-auto flex-1" value={newKind} onChange={(e) => setNewKind(e.target.value as PayrollItem['kind'])} aria-label="Tipo">
                      <option value="bonus">Bônus</option>
                      <option value="gratificacao">Gratificação</option>
                      <option value="comissao">Comissão</option>
                      <option value="desconto">Desconto</option>
                    </select>
                    <input className="input w-28" type="number" step="0.01" placeholder="R$ 0,00" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} aria-label="Valor" />
                    <button type="submit" className="btn-primary px-3">+</button>
                  </div>
                </form>
                {items.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {items.map((item) => (
                      <li key={item.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs">
                        <span className="truncate"><strong className="capitalize text-slate-700">{kindLabels[item.kind]}:</strong> {item.label}</span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className={item.amount > 0 ? 'font-semibold text-teal-600' : 'font-semibold text-rose-600'}>
                            {item.amount > 0 ? '+' : ''}{formatBRL(item.amount)}
                          </span>
                          <button type="button" className="text-rose-500 hover:text-rose-700" onClick={() => setItems((prev) => prev.filter((i) => i.id !== item.id))} aria-label={`Remover ${item.label}`}>×</button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Folhas registradas" action={<StatusBadge tone="neutral">{filteredPayrolls.length}</StatusBadge>}>
            <div className="mb-3 grid grid-cols-3 gap-2">
              <select className="input text-xs" value={filterEmp} onChange={(e) => setFilterEmp(e.target.value)} aria-label="Filtrar colaborador">
                <option value="all">Todos</option>
                {employees.map((u) => <option key={u.id} value={u.id}>{u.matricula ?? u.name}</option>)}
              </select>
              <select className="input text-xs" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} aria-label="Filtrar mês">
                <option value="all">Mês: todos</option>
                {referenceMonthOptions.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              <select className="input text-xs" value={filterYear} onChange={(e) => setFilterYear(e.target.value)} aria-label="Filtrar ano">
                {YEARS.map((y) => <option key={y} value={String(y)}>{y}</option>)}
              </select>
            </div>
            {filteredPayrolls.length === 0 ? (
              <EmptyState message="Nenhuma folha registrada com esses filtros." />
            ) : (
              <ul className="max-h-96 space-y-2 overflow-y-auto pr-1">
                {filteredPayrolls.slice(0, 40).map((run) => {
                  const person = data.users.find((u) => u.id === run.userId)
                  const isActive = !run.supersededBy
                  return (
                    <li key={run.id} className={`rounded-xl border p-3.5 ${isActive ? 'border-slate-100' : 'border-slate-100 bg-slate-50/60'}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {person?.name ?? run.employee.name} · {referenceShortLabel(run.reference)}
                            <span className="badge ml-2 bg-slate-100 text-slate-600">v{run.version}</span>
                          </p>
                          <p className="text-xs text-slate-500">Bruto {formatBRL(run.gross)} · Líquido {formatBRL(run.netPay)}</p>
                        </div>
                        <StatusBadge tone={isActive ? (run.state === 'publicada' ? 'teal' : 'amber') : 'neutral'}>
                          {isActive ? (run.state === 'publicada' ? 'Publicada' : 'Rascunho') : 'Arquivada'}
                        </StatusBadge>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {isActive && run.state === 'rascunho' && (
                          <button type="button" className="btn-primary px-3 py-1.5 text-xs" onClick={() => store.publishPayroll(run.id)}>
                            Publicar
                          </button>
                        )}
                        {isActive && run.state === 'publicada' && (
                          <button
                            type="button"
                            className="btn-secondary px-3 py-1.5 text-xs"
                            onClick={() => {
                              const reason = window.prompt('Motivo da despublicação (o colaborador deixa de vê-la):')
                              if (reason && reason.trim()) store.unpublishPayroll(run.id, reason.trim())
                            }}
                          >
                            Despublicar
                          </button>
                        )}
                        {!isActive && (
                          <button
                            type="button"
                            className="btn-secondary px-3 py-1.5 text-xs"
                            onClick={() => {
                              if (window.confirm(`Restaurar a versão v${run.version} de ${referenceShortLabel(run.reference)}? Ela volta a ser o holerite ativo do mês.`)) {
                                store.restorePayroll(run.id)
                              }
                            }}
                          >
                            ⟲ Restaurar
                          </button>
                        )}
                        <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => downloadPayrollPdf(run)}>
                          ⬇ Baixar PDF
                        </button>
                        <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => printPayroll(run)}>
                          🖨 Imprimir
                        </button>
                        {isActive && (
                          <button
                            type="button"
                            className="rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                            onClick={() => {
                              const next = versions.find((v) => v.id !== run.id && v.version < run.version)
                              if (window.confirm(next ? `Excluir v${run.version}? A v${next.version} (arquivada) volta a ser o holerite do mês.` : 'Excluir esta folha definitivamente?')) {
                                store.deletePayroll(run.id)
                              }
                            }}
                          >
                            Excluir
                          </button>
                        )}
                      </div>
                      {run.unpublishedReason && isActive && (
                        <p className="mt-1.5 text-[11px] text-amber-700">Despublicada: {run.unpublishedReason}</p>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </SectionCard>
        </div>

        <div className="lg:col-span-2">
          {/* Demonstrativo de Pagamento — modelo clássico (prévia) */}
          {selected && result && (
            <HoleriteSheet
              run={{
                id: 'preview',
                version: activePayroll ? activePayroll.version + 1 : 1,
                reference,
                userId: selected.id,
                companyId: selected.companyId ?? '',
                employee: {
                  name: selected.name,
                  matricula: selected.matricula ?? '—',
                  jobTitle: selected.jobTitle,
                  department: selected.department,
                  admissionDate: selected.admissionDate,
                  dependents: selected.dependents,
                  cpf: selected.cpf,
                  ctps: selected.ctps,
                  phone: selected.phone,
                  address: selected.address,
                  cep: selected.cep,
                },
                company: company,
                baseSalary: result.baseSalary,
                items: result.items,
                extraHours: result.extraHours,
                extraHoursRate: result.extraHoursRate,
                gross: result.gross,
                inssBase: result.inssBase,
                inss: result.inss,
                irrfBase: result.irrfBase,
                irrf: result.irrf,
                fgts: result.fgts,
                fgtsBase: result.fgtsBase,
                transportDeduction: result.transportDeduction,
                familyAllowance: result.familyAllowance,
                otherDeductions: result.otherDeductions,
                netPay: result.netPay,
                state: 'rascunho',
                generatedAt: new Date().toISOString(),
              }}
              id="holerite-sheet"
            />
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn-primary" onClick={() => registerRun(true)} disabled={items.length === 0 && (result?.gross ?? 0) <= 0}>
              Registrar e publicar
            </button>
            <button type="button" className="btn-secondary" onClick={() => registerRun(false)} disabled={items.length === 0 && (result?.gross ?? 0) <= 0}>
              Salvar como rascunho
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() =>
                selected &&
                result &&
                printPayroll({
                  id: 'preview',
                  version: activePayroll ? activePayroll.version + 1 : 1,
                  reference,
                  userId: selected.id,
                  companyId: selected.companyId ?? '',
                  employee: {
                    name: selected.name,
                    matricula: selected.matricula ?? '—',
                    jobTitle: selected.jobTitle,
                    department: selected.department,
                    admissionDate: selected.admissionDate,
                    dependents: selected.dependents,
                    cpf: selected.cpf,
                    ctps: selected.ctps,
                    phone: selected.phone,
                    address: selected.address,
                    cep: selected.cep,
                  },
                  company: company,
                  baseSalary: result.baseSalary,
                  items: result.items,
                  extraHours: result.extraHours,
                  extraHoursRate: result.extraHoursRate,
                  gross: result.gross,
                  inssBase: result.inssBase,
                  inss: result.inss,
                  irrfBase: result.irrfBase,
                  irrf: result.irrf,
                  fgts: result.fgts,
                  fgtsBase: result.fgtsBase,
                  transportDeduction: result.transportDeduction,
                  familyAllowance: result.familyAllowance,
                  otherDeductions: result.otherDeductions,
                  netPay: result.netPay,
                  state: 'rascunho',
                  generatedAt: new Date().toISOString(),
                })
              }
            >
              Imprimir
            </button>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
            Tabelas: INSS progressivo até teto ({formatBRL(PAYROLL_PARAMS.inssCeilingContribution)}); IRRF com dedução
            simplificada de {formatBRL(PAYROLL_PARAMS.irrfSimplifiedDeduction)} quando mais vantajosa; dedução de{' '}
            {formatBRL(PAYROLL_PARAMS.dependentDeduction)} por dependente. Ao registrar, horas extras pagas são debitadas
            do banco de horas com justificativa visível ao colaborador. Simulação educativa — valide com a contabilidade.
          </p>
        </div>
      </div>
    </div>
  )
}
