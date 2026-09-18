import { useMemo, useState } from 'react'
import type { HrStore } from '../../lib/store'
import type { PayrollRun, User } from '../../types'
import { formatDate, formatDateTime, pdiStatusLabels, referenceShortLabel } from '../../lib/format'
import { Avatar, EmptyState, ProgressBar, SectionCard, StatCard, StatusBadge } from '../../components/ui'
import { Link } from 'react-router-dom'
import HoleriteSheet from '../../components/HoleriteSheet'
import { downloadPayrollPdf } from '../../lib/pdf'
import { printPayroll } from '../../lib/print'
import TaskList from '../../components/TaskList'
import QuickPunch from '../../components/QuickPunch'
import { countPdiNews } from '../../lib/pdiNotifications'

export default function ColaboradorDashboard({ user, store }: { user: User; store: HrStore }) {
  const { data } = store

  /** Holerite publicado mais recente — disponível direto no painel inicial. */
  const latestPayroll: PayrollRun | null = useMemo(() => {
    // módulo de folha desligado: colaborador não vê holerite no painel
    const company = data.companies.find((c) => c.id === user.companyId)
    if (company?.payrollEnabled === false) return null
    return (
      data.payrolls
        .filter((p) => p.userId === user.id && p.state === 'publicada' && !p.supersededBy)
        .sort((a, b) => b.reference.localeCompare(a.reference) || b.version - a.version)[0] ?? null
    )
  }, [data.payrolls, data.companies, user.id, user.companyId])
  const [showFullPayroll, setShowFullPayroll] = useState(false)

  const myPdis = useMemo(() => data.pdis.filter((p) => p.employeeId === user.id), [data, user.id])
  const myFeedbacks = useMemo(
    () => data.feedbacks.filter((f) => f.toId === user.id),
    [data, user.id],
  )
  /** Feedbacks aguardando confirmação de leitura (botão obrigatório). */
  const unreadFeedbacks = myFeedbacks.filter((f) => !f.readAt)
  /** Feedbacks estruturados/avaliações aplicados a mim (respondidos na aba Desenvolvimento). */
  const myAssessments = useMemo(() => data.assessments.filter((a) => a.assignedTo === user.id), [data.assessments, user.id])
  const pendingAssessments = myAssessments.filter((a) => !a.completedAt)
  /** PDIs com comentário/metas novos do gestor — badge de novidades. */
  const pdiNews = countPdiNews(data.pdis, user.id)
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

      {/* Bater ponto direto do painel — sem abrir a aba Ponto */}
      <QuickPunch user={user} store={store} />

      {/* Atalho: feedbacks estruturados / avaliações a responder */}
      {pdiNews > 0 && (
        <Link to="/meu-desenvolvimento" className="flex items-center justify-between gap-3 rounded-2xl border border-primary-100 bg-primary-50 px-4 py-3 transition-colors hover:bg-primary-100">
          <p className="text-sm font-semibold text-primary-900">
            <span aria-hidden="true">🔔 </span>
            Novidades no seu PDI — o gestor enviou mensagem ou metas
          </p>
          <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-rose-500 px-2 text-xs font-bold text-white">
            {pdiNews}
          </span>
        </Link>
      )}

      {/* Atalho: feedbacks estruturados / avaliações a responder */}
      {myAssessments.length > 0 && (
        <SectionCard
          title="Feedbacks e avaliações para responder"
          action={
            <StatusBadge tone={pendingAssessments.length > 0 ? 'amber' : 'teal'}>
              {pendingAssessments.length > 0 ? `${pendingAssessments.length} pendentes` : 'em dia'}
            </StatusBadge>
          }
        >
          <ul className="space-y-2">
            {myAssessments.map((a) => {
              const answered = a.questions.filter((q) => (q.answer ?? '').trim().length > 0).length
              return (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{a.title}</p>
                    <p className="text-xs text-slate-500">
                      Respondido {answered} de {a.questions.length} perguntas
                    </p>
                  </div>
                  {a.completedAt ? (
                    <StatusBadge tone="teal">Concluído</StatusBadge>
                  ) : (
                    <Link to="/meu-desenvolvimento" className="btn-primary px-3 py-1.5 text-xs">
                      Responder agora
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>
        </SectionCard>
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
                  {pdi.dueDate ? <p className="mt-2 text-xs text-slate-500">Prazo: {formatDate(pdi.dueDate)}</p> : null}
                  <div className="mt-3">
                    <div className="mb-1.5 flex justify-between text-xs font-semibold text-slate-500">
                      <span>Progresso</span>
                      <span>{pdi.progress}%</span>
                    </div>
                    <ProgressBar value={pdi.progress} />
                    {pdi.steps && pdi.steps.length > 0 ? (
                      <ul className="mt-3 space-y-1.5">
                        {pdi.steps.map((s) => {
                          const pct = s.progress ?? (s.done ? 100 : 0)
                          return (
                            <li key={s.id} className={`rounded-xl border p-2.5 ${pct >= 100 ? 'border-teal-200 bg-teal-50/50' : 'border-slate-100'}`}>
                              <div className="flex items-start justify-between gap-2">
                                <span className={`text-sm ${pct >= 100 ? 'font-medium text-teal-800' : 'text-slate-700'}`}>{s.label}</span>
                                <span className={`shrink-0 text-xs font-bold ${pct >= 100 ? 'text-teal-600' : 'text-slate-400'}`}>{pct >= 100 ? '✓' : `${pct}%`}</span>
                              </div>
                              {pct < 100 && (
                                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                  {[25, 50, 75, 100].map((v) => (
                                    <button
                                      key={v}
                                      type="button"
                                      className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${pct >= v ? 'border-primary-400 bg-primary-50 text-primary-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                                      onClick={() => store.setPdiStepProgress(pdi.id, s.id, v)}
                                    >
                                      {v === 100 ? '✓ Concluir' : `${v}%`}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    ) : (
                      pdi.status !== 'concluido' && (
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
                      )
                    )}
                  </div>

                  {/* METAS: perguntas de acompanhamento */}
                  {pdi.goalsEnabled && (pdi.goalQuestions ?? []).length > 0 && (
                    <div className="mt-3 rounded-xl border border-primary-100 bg-primary-50/40 p-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-primary-700">Metas — sua resposta</p>
                      <ul className="mt-2 space-y-2.5">
                        {(pdi.goalQuestions ?? []).map((gq) => (
                          <li key={gq.id}>
                            <p className="text-sm font-medium text-slate-700">{gq.text}</p>
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {(gq.type === 'sim_nao' ? ['Sim', 'Não'] : gq.options ?? []).map((opt) => (
                                <button
                                  key={opt}
                                  type="button"
                                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${gq.answer === opt ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-slate-200 text-slate-600 hover:bg-white'}`}
                                  aria-pressed={gq.answer === opt}
                                  onClick={() => store.answerPdiGoal(pdi.id, gq.id, opt)}
                                >
                                  {opt}
                                </button>
                              ))}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Mensagens do gestor */}
                  {(pdi.managerComments ?? []).length > 0 && (
                    <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50/50 p-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-amber-700">💬 Mensagens do seu gestor</p>
                      <ul className="mt-1.5 space-y-1.5">
                        {(pdi.managerComments ?? []).map((c) => (
                          <li key={c.id} className="rounded-lg bg-white px-3 py-2">
                            <p className="text-sm text-slate-700">{c.message}</p>
                            <p className="mt-0.5 text-[11px] text-slate-400">{formatDateTime(c.createdAt)}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Feedbacks recebidos"
          action={
            unreadFeedbacks.length > 0 ? <StatusBadge tone="amber">{unreadFeedbacks.length} p/ confirmar</StatusBadge> : <StatusBadge tone="primary">{myFeedbacks.length}</StatusBadge>
          }
        >
          {myFeedbacks.length === 0 ? (
            <EmptyState message="Nenhum feedback recebido ainda." />
          ) : (
            <ul className="space-y-3">
              {myFeedbacks.map((feedback) => {
                const from = data.users.find((u) => u.id === feedback.fromId)
                const senderName = feedback.anonymous ? 'Anônimo' : (from?.name ?? 'Colega')
                return (
                  <li key={feedback.id} className={`flex items-start gap-3 rounded-xl border p-4 ${feedback.readAt ? 'border-slate-100' : 'border-amber-300 bg-amber-50/40'}`}>
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
                      {feedback.readAt ? (
                        <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700">
                          ✓ Leitura confirmada em {formatDateTime(feedback.readAt)}
                        </p>
                      ) : (
                        <button
                          type="button"
                          className="btn-primary mt-2.5 px-3.5 py-2 text-xs"
                          onClick={() => store.markFeedbackRead(feedback.id)}
                        >
                          Confirmar que li este feedback
                        </button>
                      )}
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
