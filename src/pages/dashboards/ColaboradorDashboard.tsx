import { useMemo, useState } from 'react'
import type { HrStore } from '../../lib/store'
import type { PayrollRun, User } from '../../types'
import { formatDate, formatDateTime, pdiStatusLabels, referenceShortLabel } from '../../lib/format'
import { Avatar, EmptyState, ProgressBar, SectionCard, StatCard, StatusBadge } from '../../components/ui'
import HoleriteSheet from '../../components/HoleriteSheet'
import { downloadPayrollPdf } from '../../lib/pdf'
import { printPayroll } from '../../lib/print'
import TaskList from '../../components/TaskList'

export default function ColaboradorDashboard({ user, store }: { user: User; store: HrStore }) {
  const { data } = store

  /** Holerite publicado mais recente — disponível direto no painel inicial. */
  const latestPayroll: PayrollRun | null = useMemo(
    () =>
      data.payrolls
        .filter((p) => p.userId === user.id && p.state === 'publicada' && !p.supersededBy)
        .sort((a, b) => b.reference.localeCompare(a.reference) || b.version - a.version)[0] ?? null,
    [data.payrolls, user.id],
  )
  const [showFullPayroll, setShowFullPayroll] = useState(false)

  const myPdis = useMemo(() => data.pdis.filter((p) => p.employeeId === user.id), [data, user.id])
  const myFeedbacks = useMemo(
    () => data.feedbacks.filter((f) => f.toId === user.id),
    [data, user.id],
  )
  const pendingRequests = data.requests.filter(
    (r) => r.employeeId === user.id && r.status === 'pendente',
  ).length

  const avgProgress =
    myPdis.length > 0
      ? Math.round(myPdis.reduce((acc, p) => acc + p.progress, 0) / myPdis.length)
      : 0

  const tasks = data.tasks[user.id] ?? []
  const openTasks = tasks.filter((t) => !t.done).length

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Olá, {user.name.split(' ')[0]} 👋</h1>
        <p className="mt-1 text-sm text-slate-500">
          {user.jobTitle} · {user.department}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Tarefas pendentes" value={openTasks} hint="na sua mesa" tone="amber" />
        <StatCard label="Progresso médio PDI" value={`${avgProgress}%`} hint="seu desenvolvimento" tone="teal" />
        <StatCard label="Feedbacks recebidos" value={myFeedbacks.length} hint="últimos meses" tone="primary" />
        <StatCard label="Solicitações em análise" value={pendingRequests} hint="aguardando gestor" tone="rose" />
      </div>

      {/* Holerite publicado — destaque no painel inicial */}
      {latestPayroll && !showFullPayroll && (
        <SectionCard
          title={`Holerite de ${referenceShortLabel(latestPayroll.reference)} disponível`}
          action={<StatusBadge tone="teal">v{latestPayroll.version} · publicado</StatusBadge>}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-slate-600">
                Salário líquido de <strong className="text-primary-700">{latestPayroll.netPay.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>{' '}
                referente a {referenceShortLabel(latestPayroll.reference)}, publicado em{' '}
                {formatDateTime(latestPayroll.publishedAt ?? latestPayroll.generatedAt)}.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-primary px-3 py-2 text-xs" onClick={() => downloadPayrollPdf(latestPayroll)}>
                ⬇ Baixar PDF
              </button>
              <button type="button" className="btn-secondary px-3 py-2 text-xs" onClick={() => setShowFullPayroll(true)}>
                Visualizar holerite
              </button>
              <button type="button" className="btn-secondary px-3 py-2 text-xs" onClick={() => printPayroll(latestPayroll)}>
                🖨 Imprimir
              </button>
            </div>
          </div>
        </SectionCard>
      )}

      {latestPayroll && showFullPayroll && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">
              Holerite de {referenceShortLabel(latestPayroll.reference)} · v{latestPayroll.version}
            </p>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => downloadPayrollPdf(latestPayroll)}>
                ⬇ PDF
              </button>
              <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => printPayroll(latestPayroll)}>
                🖨 Imprimir
              </button>
              <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setShowFullPayroll(false)}>
                Fechar
              </button>
            </div>
          </div>
          <HoleriteSheet run={latestPayroll} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Minhas tarefas">
          <TaskList tasks={tasks} onToggle={(taskId) => store.toggleTask(user.id, taskId)} />
        </SectionCard>

        <SectionCard title="Meu desenvolvimento (PDIs)">
          {myPdis.length === 0 ? (
            <EmptyState message="Nenhum PDI ativo. Combine metas com seu gestor." />
          ) : (
            <div className="space-y-5">
              {myPdis.map((pdi) => (
                <div key={pdi.id} className="rounded-xl border border-slate-100 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{pdi.title}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{pdi.description}</p>
                    </div>
                    <StatusBadge
                      tone={pdi.status === 'atrasado' ? 'rose' : pdi.status === 'concluido' ? 'teal' : 'primary'}
                    >
                      {pdiStatusLabels[pdi.status]}
                    </StatusBadge>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">Prazo: {formatDate(pdi.dueDate)}</p>
                  <div className="mt-3">
                    <div className="mb-1.5 flex justify-between text-xs font-semibold text-slate-500">
                      <span>Progresso</span>
                      <span>{pdi.progress}%</span>
                    </div>
                    <ProgressBar value={pdi.progress} />
                    {pdi.status !== 'concluido' && (
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          className="btn-secondary flex-1 py-2 text-xs"
                          onClick={() => store.updatePdiProgress(pdi.id, pdi.progress + 10)}
                        >
                          +10%
                        </button>
                        <button
                          type="button"
                          className="btn-primary flex-1 py-2 text-xs"
                          onClick={() => store.updatePdiProgress(pdi.id, 100)}
                        >
                          Concluir
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Feedbacks recebidos" action={<StatusBadge tone="primary">{myFeedbacks.length}</StatusBadge>}>
          {myFeedbacks.length === 0 ? (
            <EmptyState message="Nenhum feedback recebido ainda." />
          ) : (
            <ul className="space-y-3">
              {myFeedbacks.map((feedback) => {
                const from = data.users.find((u) => u.id === feedback.fromId)
                const senderName = feedback.anonymous ? 'Anônimo' : (from?.name ?? 'Colega')
                return (
                  <li key={feedback.id} className="flex items-start gap-3 rounded-xl border border-slate-100 p-4">
                    {feedback.anonymous ? (
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-500">
                        ?
                      </span>
                    ) : (
                      <Avatar name={senderName} color={from?.avatarColor ?? '#94A3B8'} photoUrl={from?.photoDataUrl} userId={from?.id} />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">{senderName}</p>
                        <StatusBadge tone={feedback.kind === 'positivo' ? 'teal' : 'amber'}>
                          {feedback.kind === 'positivo' ? 'Positivo' : 'Melhoria'}
                        </StatusBadge>
                        <span className="text-xs text-slate-400">{formatDateTime(feedback.createdAt)}</span>
                      </div>
                      <p className="mt-1 text-sm leading-relaxed text-slate-600">{feedback.message}</p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Bem-estar & próximos passos">
          <div className="space-y-3 text-sm text-slate-600">
            <div className="rounded-xl bg-primary-50 p-4">
              <p className="font-semibold text-primary-800">Ciclo de avaliação aberto</p>
              <p className="mt-1 text-sm text-primary-700">
                O ciclo trimestral encerra em 30/09. Responda sua autoavaliação até lá.
              </p>
            </div>
            <div className="rounded-xl bg-teal-50 p-4">
              <p className="font-semibold text-teal-700">Sugestão de carreira</p>
              <p className="mt-1 text-sm text-teal-700">
                Com base nos seus PDIs, a trilha “Liderança técnica” foi sugerida para o próximo ciclo.
              </p>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
