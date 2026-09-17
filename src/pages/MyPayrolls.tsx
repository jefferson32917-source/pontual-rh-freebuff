import { useState } from 'react'
import type { HrStore } from '../lib/store'
import type { PayrollRun, User } from '../types'
import { formatDateTime } from '../lib/format'
import { downloadPayrollPdf } from '../lib/pdf'
import { printPayroll } from '../lib/print'
import HoleriteSheet from '../components/HoleriteSheet'
import { EmptyState, SectionCard, StatusBadge } from '../components/ui'

function referenceLabel(ref: string): string {
  const [y, m] = ref.split('-').map(Number)
  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
  return `${months[(m ?? 1) - 1]} de ${y}`
}

export default function MyPayrolls({ user, store }: { user: User; store: HrStore }) {
  const { data } = store

  // Módulo de folha desligado pelo gestor: nada aparece para o colaborador
  const company = data.companies.find((c) => c.id === user.companyId)
  if (company?.payrollEnabled === false) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-slate-900">Meus holerites</h1>
          <p className="mt-1 text-sm text-slate-500">O módulo de folha está desativado para sua empresa no momento.</p>
        </header>
        <EmptyState message="Seu gestor desativou temporariamente a ferramenta de folha. Fale com ele se precisar de um holerite." />
      </div>
    )
  }

  /** Apenas folhas PUBLICADAS ficam visíveis para o colaborador (1 ativa por mês). */
  const myPayrolls = data.payrolls
    .filter((p) => p.userId === user.id && p.state === 'publicada' && !p.supersededBy)
    .sort((a, b) => b.reference.localeCompare(a.reference))

  const myAdjustments = data.hourBank.filter((a) => a.userId === user.id)

  const [selectedId, setSelectedId] = useState<string>(myPayrolls[0]?.id ?? '')
  const selected: PayrollRun | undefined = myPayrolls.find((p) => p.id === selectedId) ?? myPayrolls[0]

  const bankBalance = myAdjustments.reduce((acc, a) => acc + a.hours, 0)

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Meus holerites</h1>
        <p className="mt-1 text-sm text-slate-500">Folhas publicadas pelo seu gestor e seu banco de horas.</p>
      </header>

      {myPayrolls.length === 0 ? (
        <EmptyState message="Nenhum holerite publicado ainda. Assim que sua folha for processada, aparecerá aqui." />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <SectionCard title="Holerites disponíveis" action={<StatusBadge tone="teal">{myPayrolls.length}</StatusBadge>}>
            <ul className="space-y-2">
              {myPayrolls.map((run) => (
                <li key={run.id}>
                  <button
                    type="button"
                    className={`w-full rounded-xl border p-3.5 text-left transition-colors ${
                      selected?.id === run.id ? 'border-primary-300 bg-primary-50' : 'border-slate-100 hover:bg-slate-50'
                    }`}
                    onClick={() => setSelectedId(run.id)}
                  >
                    <p className="text-sm font-semibold text-slate-900">
                      {referenceLabel(run.reference)}
                      <span className="badge ml-2 bg-slate-100 text-slate-600">v{run.version}</span>
                    </p>
                    <p className="text-xs text-slate-500">
                      Líquido <strong className="text-primary-700">{run.netPay.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-400">Publicado em {formatDateTime(run.publishedAt ?? run.generatedAt)}</p>
                  </button>
                </li>
              ))}
            </ul>
          </SectionCard>

          <div className="lg:col-span-2">
            {selected && (
              <>
                <HoleriteSheet run={selected} />
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" className="btn-primary" onClick={() => downloadPayrollPdf(selected)}>
                    ⬇ Baixar PDF
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => printPayroll(selected)}>🖨 Imprimir</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <SectionCard
        title="Banco de horas"
        action={<StatusBadge tone={bankBalance > 0.25 ? 'teal' : bankBalance < -0.25 ? 'rose' : 'neutral'}>{bankBalance > 0 ? '+' : ''}{bankBalance}h</StatusBadge>}
      >
        {myAdjustments.length === 0 ? (
          <EmptyState message="Nenhum ajuste de banco de horas registrado." />
        ) : (
          <ul className="space-y-2">
            {myAdjustments.map((adj) => (
              <li key={adj.id} className="rounded-xl border border-slate-100 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <StatusBadge tone={adj.hours > 0 ? 'teal' : 'amber'}>
                    {adj.hours > 0 ? `+${adj.hours}h` : `${adj.hours}h`}
                  </StatusBadge>
                  <span className="text-xs text-slate-400">{formatDateTime(adj.createdAt)}</span>
                </div>
                <p className="mt-1.5 text-sm text-slate-600">{adj.reason}</p>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  )
}
