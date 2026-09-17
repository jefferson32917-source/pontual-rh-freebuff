import { useMemo } from 'react'
import type { HrStore } from '../../lib/store'
import type { User } from '../../types'
import { formatDate, pdiStatusLabels, requestTypeLabels } from '../../lib/format'
import { Avatar, EmptyState, ProgressBar, SectionCard, StatCard, StatusBadge } from '../../components/ui'
import TaskList from '../../components/TaskList'
import QuickPunch from '../../components/QuickPunch'

export default function GestorDashboard({ user, store }: { user: User; store: HrStore }) {
  const { data } = store

  const directReports = useMemo(
    () => data.users.filter((u) => u.companyId === user.companyId && u.role === 'colaborador'),
    [data.users, user.companyId],
  )

  const teamIds = directReports.map((u) => u.id)

  const stats = useMemo(() => {
    const teamPdis = data.pdis.filter((p) => teamIds.includes(p.employeeId))
    const atRisk = teamPdis.filter((p) => p.status === 'atrasado').length
    const avgProgress =
      teamPdis.length > 0
        ? Math.round(teamPdis.reduce((acc, p) => acc + p.progress, 0) / teamPdis.length)
        : 0
    const pending = data.requests.filter(
      (r) => teamIds.includes(r.employeeId) && r.status === 'pendente',
    ).length
    return { atRisk, avgProgress, pending, teamSize: directReports.length }
  }, [data, teamIds, directReports.length])

  const teamRequests = data.requests.filter((r) => teamIds.includes(r.employeeId))

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Olá, {user.name.split(' ')[0]} 👋</h1>
        <p className="mt-1 text-sm text-slate-500">Sua equipe, indicadores e pendências em um só lugar.</p>
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Liderados diretos" value={stats.teamSize} hint="time ativo" tone="primary" />
        <StatCard label="Progresso médio PDI" value={`${stats.avgProgress}%`} hint="desenvolvimento" tone="teal" />
        <StatCard label="PDIs em risco" value={stats.atRisk} hint="precisam de atenção" tone="rose" />
        <StatCard label="Aprovações pendentes" value={stats.pending} hint="da equipe" tone="amber" />
      </div>

      {/* Bater ponto direto do painel — sem abrir a aba Ponto */}
      <QuickPunch user={user} store={store} />

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Suas tarefas">
          <TaskList
            tasks={data.tasks[user.id] ?? []}
            onToggle={(taskId) => store.toggleTask(user.id, taskId)}
          />
        </SectionCard>

        <SectionCard title="Minha equipe">
          <ul className="space-y-3">
            {directReports.map((member) => {
              const memberPdis = data.pdis.filter((p) => p.employeeId === member.id)
              const memberPending = data.requests.filter(
                (r) => r.employeeId === member.id && r.status === 'pendente',
              ).length
              return (
                <li key={member.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3.5">
                  <Avatar name={member.name} color={member.avatarColor} photoUrl={member.photoDataUrl} userId={member.id} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{member.name}</p>
                    <p className="truncate text-xs text-slate-500">{member.jobTitle}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {memberPending > 0 && <StatusBadge tone="amber">{memberPending} pend.</StatusBadge>}
                    <StatusBadge tone={memberPdis.some((p) => p.status === 'atrasado') ? 'rose' : 'teal'}>
                      {memberPdis.some((p) => p.status === 'atrasado') ? 'Atenção' : 'Em dia'}
                    </StatusBadge>
                  </div>
                </li>
              )
            })}
            {directReports.length === 0 && <EmptyState message="Nenhum liderado direto cadastrado." />}
          </ul>
        </SectionCard>

        <SectionCard title="Solicitações da equipe">
          {teamRequests.length === 0 ? (
            <EmptyState message="Nenhuma solicitação da equipe." />
          ) : (
            <ul className="space-y-3">
              {teamRequests.map((request) => (
                <li key={request.id} className="rounded-xl border border-slate-100 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {requestTypeLabels[request.type]} — {request.period}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">{request.justification}</p>
                    </div>
                    <StatusBadge
                      tone={
                        request.status === 'pendente'
                          ? 'amber'
                          : request.status === 'aprovado'
                            ? 'teal'
                            : 'rose'
                      }
                    >
                      {request.status === 'pendente'
                        ? 'Pendente'
                        : request.status === 'aprovado'
                          ? 'Aprovado'
                          : 'Reprovado'}
                    </StatusBadge>
                  </div>
                  {request.status === 'pendente' && (
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
                  )}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="PDIs dos liderados">
          <div className="space-y-4">
            {data.pdis
              .filter((p) => teamIds.includes(p.employeeId))
              .map((pdi) => {
                const owner = data.users.find((u) => u.id === pdi.employeeId)
                return (
                  <div key={pdi.id}>
                    <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                      <span className="truncate font-medium text-slate-800">{pdi.title}</span>
                      <StatusBadge
                        tone={
                          pdi.status === 'atrasado' ? 'rose' : pdi.status === 'concluido' ? 'teal' : 'primary'
                        }
                      >
                        {pdiStatusLabels[pdi.status]}
                      </StatusBadge>
                    </div>
                    <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
                      <span>{owner?.name ?? '—'} · prazo {formatDate(pdi.dueDate)}</span>
                      <span className="font-semibold">{pdi.progress}%</span>
                    </div>
                    <ProgressBar value={pdi.progress} />
                  </div>
                )
              })}
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
