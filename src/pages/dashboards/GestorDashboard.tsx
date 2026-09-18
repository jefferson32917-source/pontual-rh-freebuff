import { useMemo, useState } from 'react'
import type { HrStore } from '../../lib/store'
import type { User } from '../../types'
import { formatDate, formatDateTime, pdiStatusLabels, requestTypeLabels } from '../../lib/format'
import { apiAttachmentUrl } from '../../lib/api'
import { Avatar, EmptyState, ProgressBar, SectionCard, StatCard, StatusBadge } from '../../components/ui'
import TaskList from '../../components/TaskList'
import QuickPunch from '../../components/QuickPunch'

export default function GestorDashboard({ user, store }: { user: User; store: HrStore }) {
  const { data } = store
  /** Anexo aberto no visualizador (URL assinada resolvida sob demanda). */
  const [viewingAttachment, setViewingAttachment] = useState<{ name: string; path: string; mime: string } | null>(null)
  const [viewingUrl, setViewingUrl] = useState<string | null>(null)

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
  const pendingRequests = teamRequests.filter((r) => r.status === 'pendente')
  /** Feedbacks enviados por mim — com status de confirmação de leitura. */
  const givenFeedbacks = data.feedbacks.filter((f) => f.fromId === user.id)

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

      {/* Aprovações rápidas: requisições pendentes da equipe direto no painel */}
      {pendingRequests.length > 0 && (
        <SectionCard
          title="Aprovações pendentes"
          action={<StatusBadge tone="amber">{pendingRequests.length} aguardando</StatusBadge>}
        >
          <ul className="space-y-3">
            {pendingRequests.map((request) => {
              const requester = data.users.find((u) => u.id === request.employeeId)
              return (
                <li key={request.id} className="rounded-xl border border-amber-100 bg-amber-50/40 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">
                        {requestTypeLabels[request.type]} — {request.period}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {requester?.name ?? 'Colaborador'} · {formatDateTime(request.createdAt)}
                      </p>
                      <p className="mt-1.5 text-sm text-slate-600">{request.justification}</p>
                      {request.attachments.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {request.attachments.map((a) => (
                            <button
                              key={a.id}
                              type="button"
                              className="inline-flex items-center gap-1.5 rounded-lg bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700 hover:bg-primary-100"
                              onClick={() => {
                                const path = (a as typeof a & { storagePath?: string }).storagePath ?? ''
                                setViewingAttachment({ name: a.fileName, path, mime: a.mimeType })
                                setViewingUrl(null)
                              }}
                            >
                              📎 {a.fileName}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button type="button" className="btn-primary flex-1 py-2 text-xs" onClick={() => store.updateRequestStatus(request.id, 'aprovado')}>
                      ✓ Aprovar
                    </button>
                    <button type="button" className="btn-secondary flex-1 py-2 text-xs border-rose-200 text-rose-600 hover:bg-rose-50" onClick={() => store.updateRequestStatus(request.id, 'reprovado')}>
                      ✕ Reprovar
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </SectionCard>
      )}

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

        <SectionCard
          title="Feedbacks que enviei"
          action={<StatusBadge tone="primary">{givenFeedbacks.length}</StatusBadge>}
        >
          {givenFeedbacks.length === 0 ? (
            <EmptyState message="Envie feedbacks pela aba Desenvolvimento (seu painel de desenvolvimento)." />
          ) : (
            <ul className="space-y-3">
              {givenFeedbacks.slice(0, 6).map((f) => {
                const to = data.users.find((u) => u.id === f.toId)
                return (
                  <li key={f.id} className="rounded-xl border border-slate-100 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">{to?.name ?? '—'}</p>
                      <StatusBadge tone={f.kind === 'positivo' ? 'teal' : 'amber'}>
                        {f.kind === 'positivo' ? 'Positivo' : 'Melhoria'}
                      </StatusBadge>
                      <span className="text-xs text-slate-400">{formatDateTime(f.createdAt)}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-600">{f.message}</p>
                    {f.readAt ? (
                      <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700">
                        ✓ Lido por {to?.name?.split(' ')[0] ?? 'colaborador'} em {formatDateTime(f.readAt)}
                      </p>
                    ) : (
                      <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
                        ⏳ Aguardando confirmação de leitura
                      </p>
                    )}
                  </li>
                )
              })}
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

      {/* Visualizador de anexo (imagem inline / PDF em nova aba) */}
      {viewingAttachment && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Visualizando ${viewingAttachment.name}`}
          onClick={() => setViewingAttachment(null)}
        >
          <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="min-w-0 truncate text-sm font-semibold text-slate-900">{viewingAttachment.name}</p>
              <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setViewingAttachment(null)}>
                Fechar
              </button>
            </div>
            {viewingUrl == null ? (
              <AttachmentLoader attachment={viewingAttachment} onUrl={setViewingUrl} />
            ) : viewingAttachment.mime.startsWith('image/') ? (
              <img src={viewingUrl} alt={viewingAttachment.name} className="max-h-[70vh] w-full rounded-xl object-contain" />
            ) : (
              <p className="rounded-xl bg-slate-50 p-6 text-center text-sm">
                <a href={viewingUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary-600 hover:underline">
                  📄 Abrir PDF em nova aba
                </a>
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** Resolve a URL assinada do anexo (uma vez por abertura). */
function AttachmentLoader({
  attachment,
  onUrl,
}: {
  attachment: { name: string; path: string; mime: string }
  onUrl: (url: string | null) => void
}) {
  useMemo(() => {
    void apiAttachmentUrl(attachment.path).then((url) => onUrl(url))
  }, [attachment.path, onUrl])
  return <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">Carregando anexo…</p>
}
