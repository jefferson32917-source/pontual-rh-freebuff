import { useMemo } from 'react'
import type { HrStore } from '../../lib/store'
import type { User } from '../../types'
import { formatDate, requestTypeLabels } from '../../lib/format'
import { ProgressBar, SectionCard, StatCard, StatusBadge, EmptyState } from '../../components/ui'
import TaskList from '../../components/TaskList'

export default function RhDashboard({ user, store }: { user: User; store: HrStore }) {
  const { data } = store

  const stats = useMemo(() => {
    const pendingRequests = data.requests.filter((r) => r.status === 'pendente').length
    const pendingVacations = data.vacations.filter((v) => v.status === 'pendente').length
    const atRiskPdis = data.pdis.filter((p) => p.status === 'atrasado').length
    const openVacancies = data.vacancies.filter((v) => v.status !== 'fechada').length
    return { pendingRequests, pendingVacations, atRiskPdis, openVacancies }
  }, [data])

  const pendingList = data.requests.filter((r) => r.status === 'pendente')

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Olá, {user.name.split(' ')[0]} 👋</h1>
        <p className="mt-1 text-sm text-slate-500">
          Visão geral de pessoas e processos — Recursos Humanos.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Requisições pendentes" value={stats.pendingRequests} hint="com anexos" tone="amber" />
        <StatCard label="Férias para aprovar" value={stats.pendingVacations} hint="da equipe" tone="primary" />
        <StatCard label="PDIs atrasados" value={stats.atRiskPdis} hint="risco de evasão" tone="rose" />
        <StatCard label="Vagas ativas" value={stats.openVacancies} hint="em recrutamento" tone="teal" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Tarefas do RH">
          <TaskList
            tasks={data.tasks[user.id] ?? []}
            onToggle={(taskId) => store.toggleTask(user.id, taskId)}
          />
        </SectionCard>

        <SectionCard
          title="Solicitações para aprovação"
          action={<StatusBadge tone="amber">{stats.pendingRequests} pendentes</StatusBadge>}
        >
          {pendingList.length === 0 ? (
            <EmptyState message="Nenhuma solicitação pendente. Bom trabalho!" />
          ) : (
            <ul className="space-y-3">
              {pendingList.map((request) => {
                return (
                  <li key={request.id} className="rounded-xl border border-slate-100 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {requestTypeLabels[request.type]} — {request.period}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {request.justification}
                          {request.attachments.length > 0 && (
                            <span className="ml-1.5 font-semibold text-primary-600">
                              📎 {request.attachments.length}
                            </span>
                          )}
                        </p>
                      </div>
                      <StatusBadge tone="neutral">{formatDate(request.createdAt)}</StatusBadge>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        className="btn-primary flex-1 py-2 text-xs"
                        onClick={() => store.updateRequestStatus(request.id, 'aprovado')}
                      >
                        Aprovar
                      </button>
                      <button
                        type="button"
                        className="btn-secondary flex-1 py-2 text-xs"
                        onClick={() => store.updateRequestStatus(request.id, 'reprovado')}
                      >
                        Reprovar
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Progresso dos PDIs" action={<span className="text-xs text-slate-400">média geral</span>}>
          <div className="space-y-4">
            {data.pdis.map((pdi) => (
              <div key={pdi.id}>
                <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                  <span className="truncate font-medium text-slate-800">{pdi.title}</span>
                  <span className="shrink-0 text-xs font-semibold text-slate-500">{pdi.progress}%</span>
                </div>
                <ProgressBar
                  value={pdi.progress}
                  tone={pdi.status === 'atrasado' ? 'primary' : 'teal'}
                />
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Funil de recrutamento">
          <div className="space-y-3">
            {data.vacancies.map((v) => (
              <div key={v.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{v.title}</p>
                  <p className="text-xs text-slate-500">{v.department}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-primary-700">{v.candidates}</p>
                  <StatusBadge
                    tone={
                      v.status === 'aberta' ? 'primary' : v.status === 'em_processo' ? 'teal' : 'neutral'
                    }
                  >
                    {v.status === 'aberta' ? 'Aberta' : v.status === 'em_processo' ? 'Em processo' : 'Fechada'}
                  </StatusBadge>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
