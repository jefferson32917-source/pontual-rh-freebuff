import { useState } from 'react'
import type { FormEvent } from 'react'
import type { HrStore } from '../lib/store'
import type { Feedback, FeedbackKind, User } from '../types'
import { formatDate, formatDateTime, pdiStatusLabels } from '../lib/format'
import { Avatar, EmptyState, ProgressBar, SectionCard, StatusBadge } from '../components/ui'

export default function Development({ user, store }: { user: User; store: HrStore }) {
  const { data } = store

  const [toId, setToId] = useState('')
  const [kind, setKind] = useState<FeedbackKind>('positivo')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const myPdis = data.pdis.filter((p) => p.employeeId === user.id)
  const received = data.feedbacks.filter((f) => f.toId === user.id)
  const given = data.feedbacks.filter((f) => f.fromId === user.id)

  const colleagues = data.users.filter((u) => u.id !== user.id && u.companyId === user.companyId)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSent(false)
    const safeMessage = message.trim().slice(0, 400)
    if (!toId || !safeMessage) {
      setError('Selecione uma pessoa e escreva a mensagem do feedback.')
      return
    }
    const feedback: Feedback = {
      id: `f${Date.now()}`,
      fromId: user.id,
      toId,
      kind,
      message: safeMessage,
      createdAt: new Date().toISOString(),
      anonymous: false,
    }
    store.addFeedback(feedback)
    setMessage('')
    setSent(true)
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Meu desenvolvimento</h1>
        <p className="mt-1 text-sm text-slate-500">PDIs, feedbacks e evolução de carreira.</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Planos de desenvolvimento individual">
          {myPdis.length === 0 ? (
            <EmptyState message="Nenhum PDI ativo no momento." />
          ) : (
            <div className="space-y-4">
              {myPdis.map((pdi) => (
                <div key={pdi.id} className="rounded-xl border border-slate-100 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">{pdi.title}</p>
                    <StatusBadge
                      tone={pdi.status === 'atrasado' ? 'rose' : pdi.status === 'concluido' ? 'teal' : 'primary'}
                    >
                      {pdiStatusLabels[pdi.status]}
                    </StatusBadge>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">Prazo: {formatDate(pdi.dueDate)}</p>
                  <div className="mt-3">
                    <ProgressBar value={pdi.progress} />
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-500">{pdi.progress}%</span>
                      {pdi.status !== 'concluido' && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="btn-secondary px-3 py-1.5 text-xs"
                            onClick={() => store.updatePdiProgress(pdi.id, pdi.progress + 10)}
                          >
                            +10%
                          </button>
                          <button
                            type="button"
                            className="btn-primary px-3 py-1.5 text-xs"
                            onClick={() => store.updatePdiProgress(pdi.id, 100)}
                          >
                            Concluir
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Dar feedback">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="fb-to" className="mb-1.5 block text-sm font-medium text-slate-700">
                Para
              </label>
              <select id="fb-to" className="input" value={toId} onChange={(e) => setToId(e.target.value)}>
                <option value="">Selecione uma pessoa…</option>
                {colleagues.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.jobTitle}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Tipo</span>
              <div className="flex gap-2">
                {(['positivo', 'melhoria'] as FeedbackKind[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
                      kind === k
                        ? k === 'positivo'
                          ? 'border-teal-500 bg-teal-50 text-teal-700'
                          : 'border-amber-500 bg-amber-50 text-amber-700'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                    aria-pressed={kind === k}
                  >
                    {k === 'positivo' ? 'Positivo' : 'Melhoria'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="fb-msg" className="mb-1.5 block text-sm font-medium text-slate-700">
                Mensagem
              </label>
              <textarea
                id="fb-msg"
                className="input min-h-[90px] resize-y"
                maxLength={400}
                placeholder="Descreva uma situação concreta (máx. 400 caracteres)."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
            {error && (
              <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-700">
                {error}
              </p>
            )}
            {sent && !error && (
              <p role="status" className="rounded-xl bg-teal-50 px-3.5 py-2.5 text-sm font-medium text-teal-700">
                Feedback enviado com sucesso!
              </p>
            )}
            <button type="submit" className="btn-primary w-full">
              Enviar feedback
            </button>
          </form>
        </SectionCard>

        <SectionCard title="Feedbacks recebidos" action={<StatusBadge tone="primary">{received.length}</StatusBadge>}>
          {received.length === 0 ? (
            <EmptyState message="Nenhum feedback recebido ainda." />
          ) : (
            <ul className="space-y-3">
              {received.map((f) => {
                const from = data.users.find((u) => u.id === f.fromId)
                const name = f.anonymous ? 'Anônimo' : (from?.name ?? 'Colega')
                return (
                  <li key={f.id} className="flex items-start gap-3 rounded-xl border border-slate-100 p-4">
                    <Avatar name={name} color={from?.avatarColor ?? '#94A3B8'} photoUrl={from?.photoDataUrl} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">{name}</p>
                        <StatusBadge tone={f.kind === 'positivo' ? 'teal' : 'amber'}>
                          {f.kind === 'positivo' ? 'Positivo' : 'Melhoria'}
                        </StatusBadge>
                        <span className="text-xs text-slate-400">{formatDateTime(f.createdAt)}</span>
                      </div>
                      <p className="mt-1 text-sm leading-relaxed text-slate-600">{f.message}</p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Feedbacks enviados" action={<StatusBadge tone="neutral">{given.length}</StatusBadge>}>
          {given.length === 0 ? (
            <EmptyState message="Você ainda não enviou feedbacks." />
          ) : (
            <ul className="space-y-3">
              {given.map((f) => {
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
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">{f.message}</p>
                  </li>
                )
              })}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  )
}
