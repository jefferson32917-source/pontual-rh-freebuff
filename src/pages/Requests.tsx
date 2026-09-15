import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import type { HrStore } from '../lib/store'
import type { Request, RequestAttachment, RequestType, User } from '../types'
import { apiAttachmentUrl } from '../lib/api'
import { formatBytes, formatDateTime, requestTypeLabels } from '../lib/format'
import { EmptyState, SectionCard, StatusBadge } from '../components/ui'

const typeOptions: RequestType[] = ['atestado', 'ferias', 'folga', 'home_office', 'outro']

const ALLOWED_MIME = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
]
const MAX_FILE_BYTES = 5 * 1024 * 1024 // 5 MB

export default function Requests({ user, store }: { user: User; store: HrStore }) {
  const { data } = store
  const canApprove = user.role === 'super_admin' || user.role === 'gestor'
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [type, setType] = useState<RequestType>('atestado')
  const [period, setPeriod] = useState('')
  const [justification, setJustification] = useState('')
  const [attachments, setAttachments] = useState<RequestAttachment[]>([])
  /** Arquivos reais aguardando upload (persistidos no Supabase Storage). */
  const [pendingFiles, setPendingFiles] = useState<Map<string, File>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  /** Requisição em avaliação pelo gestor (painel de detalhe). */
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  /** Anexo aberto no visualizador (imagem/PDF). */
  const [viewing, setViewing] = useState<RequestAttachment | null>(null)
  const [reviewNote, setReviewNote] = useState('')

  const visible = data.requests.filter((r) => {
    if (user.role === 'super_admin') return true
    if (user.role === 'gestor') {
      const requester = data.users.find((u) => u.id === r.employeeId)
      return (
        (requester?.companyId === user.companyId && requester?.role === 'colaborador') ||
        r.employeeId === user.id
      )
    }
    return r.employeeId === user.id
  })

  const reviewing: Request | null = visible.find((r) => r.id === reviewingId) ?? null

  function handleFiles(e: ChangeEvent<HTMLInputElement>) {
    setError(null)
    const files = Array.from(e.target.files ?? [])
    const accepted: RequestAttachment[] = []
    const pending = new Map<string, File>()
    for (const file of files) {
      if (!ALLOWED_MIME.includes(file.type)) {
        setError(`Formato não permitido: ${file.name}. Use PDF, PNG, JPG ou WEBP.`)
        continue
      }
      if (file.size > MAX_FILE_BYTES) {
        setError(`Arquivo muito grande: ${file.name} (máx. 5 MB).`)
        continue
      }
      accepted.push({
        id: `a${Date.now()}${Math.random().toString(36).slice(2, 7)}`,
        fileName: file.name.slice(0, 200),
        mimeType: file.type,
        sizeBytes: file.size,
      })
      pending.set(accepted[accepted.length - 1]!.id, file)
    }
    setPendingFiles((prev) => new Map([...prev, ...pending]))
    setAttachments((prev) => [...prev, ...accepted].slice(0, 5))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
    setPendingFiles((prev) => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const safePeriod = period.trim().slice(0, 80)
    const safeJustification = justification.trim().slice(0, 280)
    if (!safePeriod || !safeJustification) {
      setError('Preencha o período e a justificativa da solicitação.')
      return
    }
    if (type === 'atestado' && attachments.length === 0) {
      setError('Solicitações de atestado exigem o documento anexado.')
      return
    }
    setSubmitting(true)
    try {
      await store.createRequest(
        {
          id: `r${Date.now()}`,
          employeeId: user.id,
          type,
          period: safePeriod,
          justification: safeJustification,
          status: 'pendente',
          createdAt: new Date().toISOString(),
          attachments,
        },
        attachments.map((a) => ({
          fileName: a.fileName,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
          file: pendingFiles.get(a.id),
        })),
      )
      setPeriod('')
      setJustification('')
      setAttachments([])
      setPendingFiles(new Map())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao enviar a solicitação.')
    } finally {
      setSubmitting(false)
    }
  }

  function decide(status: 'aprovado' | 'reprovado') {
    if (!reviewing) return
    store.updateRequestStatus(reviewing.id, status)
    setReviewingId(null)
    setReviewNote('')
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Requisições</h1>
        <p className="mt-1 text-sm text-slate-500">
          {canApprove
            ? 'Avalie o motivo e os anexos da equipe antes de aprovar ou reprovar.'
            : 'Envie documentos e justificativas (atestados, folgas) para aprovação.'}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        {!canApprove && (
          <SectionCard title="Nova requisição">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="req-type" className="mb-1.5 block text-sm font-medium text-slate-700">
                  Tipo
                </label>
                <select
                  id="req-type"
                  className="input"
                  value={type}
                  onChange={(e) => setType(e.target.value as RequestType)}
                >
                  {typeOptions.map((t) => (
                    <option key={t} value={t}>
                      {requestTypeLabels[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="req-period" className="mb-1.5 block text-sm font-medium text-slate-700">
                  Período / data
                </label>
                <input
                  id="req-period"
                  className="input"
                  placeholder="Ex.: 12/10/2026"
                  maxLength={80}
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="req-just" className="mb-1.5 block text-sm font-medium text-slate-700">
                  Justificativa
                </label>
                <textarea
                  id="req-just"
                  className="input min-h-[90px] resize-y"
                  maxLength={280}
                  placeholder="Descreva brevemente o motivo (máx. 280 caracteres)."
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                />
              </div>

              <div>
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  Anexos {type === 'atestado' && <span className="text-rose-600">*</span>}
                </span>
                <label
                  htmlFor="req-files"
                  className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-200 px-4 py-6 text-center transition-colors hover:border-primary-300 hover:bg-primary-50/50"
                >
                  <svg viewBox="0 0 24 24" style={{ width: 22, height: 22 }} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-primary-600" aria-hidden="true">
                    <path d="M12 5v14m-7-7h14" />
                  </svg>
                  <span className="text-sm font-medium text-slate-600">
                    PDF, PNG, JPG ou WEBP — até 5 MB
                  </span>
                </label>
                <input
                  ref={fileInputRef}
                  id="req-files"
                  type="file"
                  multiple
                  accept=".pdf,image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={handleFiles}
                />
                {attachments.length > 0 && (
                  <ul className="mt-2 space-y-1.5">
                    {attachments.map((a) => (
                      <li key={a.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs">
                        <span className="truncate font-medium text-slate-700">
                          {a.fileName} <span className="text-slate-400">({formatBytes(a.sizeBytes)})</span>
                        </span>
                        <button
                          type="button"
                          className="shrink-0 font-semibold text-rose-500 hover:text-rose-700"
                          onClick={() => removeAttachment(a.id)}
                        >
                          remover
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {error && (
                <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-700">
                  {error}
                </p>
              )}
              <button type="submit" className="btn-primary w-full" disabled={submitting}>
                {submitting ? 'Enviando…' : 'Enviar requisição'}
              </button>
            </form>
          </SectionCard>
        )}

        <SectionCard
          title={canApprove ? 'Requisições da equipe' : 'Minhas requisições'}
          action={<StatusBadge tone="neutral">{visible.length}</StatusBadge>}
        >
          {visible.length === 0 ? (
            <EmptyState message="Nenhuma requisição registrada." />
          ) : (
            <ul className="space-y-3">
              {visible.map((request) => {
                const requester = data.users.find((u) => u.id === request.employeeId)
                const isReviewing = reviewingId === request.id
                return (
                  <li key={request.id} className={`rounded-xl border p-4 ${isReviewing ? 'border-primary-300 bg-primary-50/40' : 'border-slate-100'}`}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">
                          {requestTypeLabels[request.type]} — {request.period}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {requester ? `${requester.name} · ` : ''}
                          {formatDateTime(request.createdAt)}
                        </p>
                        <p className="mt-1.5 line-clamp-2 text-sm text-slate-600">{request.justification}</p>
                        {request.attachments.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {request.attachments.map((a) => (
                              <button
                                key={a.id}
                                type="button"
                                className="inline-flex items-center gap-1.5 rounded-lg bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700 hover:bg-primary-100"
                                title={`Ver anexo: ${a.mimeType} · ${formatBytes(a.sizeBytes)}`}
                                onClick={() => setViewing(a)}
                              >
                                <svg viewBox="0 0 24 24" style={{ width: 12, height: 12 }} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M21 12.8 12.8 21a5.5 5.5 0 0 1-7.8-7.8l8.5-8.5a3.7 3.7 0 0 1 5.2 5.2l-8.5 8.5a1.8 1.8 0 0 1-2.6-2.6l7.8-7.8" />
                                </svg>
                                {a.fileName}
                              </button>
                            ))}
                          </div>
                        )}
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
                    {canApprove && request.status === 'pendente' && (
                      <div className="mt-3">
                        {isReviewing ? (
                          <div className="space-y-3 rounded-xl border border-primary-100 bg-white p-3.5">
                            <p className="text-xs font-bold uppercase tracking-wide text-primary-700">Avaliação</p>
                            <div className="rounded-lg bg-slate-50 p-3">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Justificativa completa</p>
                              <p className="mt-1 text-sm text-slate-700">{request.justification}</p>
                            </div>
                            {request.attachments.length > 0 ? (
                              <ul className="space-y-1.5">
                                {request.attachments.map((a) => (
                                  <li key={a.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs">
                                    <span className="truncate font-medium text-slate-700">{a.fileName}</span>
                                    <button type="button" className="shrink-0 font-semibold text-primary-600 hover:underline" onClick={() => setViewing(a)}>
                                      {a.mimeType.startsWith('image/') ? '👁 Visualizar' : '📄 Abrir PDF'}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-xs text-slate-400">Nenhum anexo nesta solicitação.</p>
                            )}
                            <textarea
                              className="input min-h-[56px] text-sm"
                              maxLength={200}
                              placeholder="Observação da avaliação (opcional, fica no histórico)…"
                              value={reviewNote}
                              onChange={(e) => setReviewNote(e.target.value)}
                              aria-label="Observação da avaliação"
                            />
                            <div className="flex gap-2">
                              <button type="button" className="btn-primary flex-1 py-2 text-xs" onClick={() => decide('aprovado')}>
                                ✓ Aprovar
                              </button>
                              <button type="button" className="btn-secondary flex-1 py-2 text-xs border-rose-200 text-rose-600 hover:bg-rose-50" onClick={() => decide('reprovado')}>
                                ✕ Reprovar
                              </button>
                              <button type="button" className="btn-secondary py-2 text-xs" onClick={() => { setReviewingId(null); setReviewNote('') }}>
                                Fechar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="btn-secondary w-full py-2 text-xs"
                            onClick={() => setReviewingId(request.id)}
                          >
                            🔍 Avaliar solicitação
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </SectionCard>

        {canApprove && (
          <SectionCard title="Pendências por pessoa">
            <ul className="space-y-2">
              {data.users
                .filter((u) =>
                  user.role === 'super_admin'
                    ? u.role !== 'super_admin'
                    : u.companyId === user.companyId && u.role === 'colaborador',
                )
                .map((u) => {
                  const count = data.requests.filter(
                    (r) => r.employeeId === u.id && r.status === 'pendente',
                  ).length
                  return (
                    <li key={u.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3">
                      <span className="text-sm font-medium text-slate-800">{u.name}</span>
                      <StatusBadge tone={count > 0 ? 'amber' : 'neutral'}>
                        {count > 0 ? `${count} pendente${count > 1 ? 's' : ''}` : 'em dia'}
                      </StatusBadge>
                    </li>
                  )
                })}
            </ul>
          </SectionCard>
        )}
      </div>

      {/* Visualizador de anexos (imagem inline / PDF em nova aba) — busca URL assinada no Storage */}
      {viewing && <AttachmentViewer viewing={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}

/** Visualizador que resolve a URL assinada do anexo no bucket privado. */
function AttachmentViewer({ viewing, onClose }: { viewing: RequestAttachment; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    void apiAttachmentUrl((viewing as RequestAttachment & { storagePath?: string }).storagePath ?? '').then((signed) => {
      if (!alive) return
      setUrl(signed ?? viewing.dataUrl ?? null)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [viewing])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Visualizando ${viewing.fileName}`}
      onClick={onClose}
    >
      <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-sm font-semibold text-slate-900">{viewing.fileName}</p>
          <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={onClose}>
            Fechar
          </button>
        </div>
        {loading ? (
          <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">Carregando anexo…</p>
        ) : viewing.mimeType.startsWith('image/') ? (
          url ? (
            <img src={url} alt={viewing.fileName} className="max-h-[70vh] w-full rounded-xl object-contain" />
          ) : (
            <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">Anexo não encontrado no storage.</p>
          )
        ) : (
          <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">
            {url ? (
              <a href={url} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary-600 hover:underline">
                📄 Abrir PDF em nova aba
              </a>
            ) : (
              'Anexo não encontrado no storage.'
            )}
          </p>
        )}
        <p className="mt-3 text-center text-xs text-slate-400">
          {viewing.mimeType} · {formatBytes(viewing.sizeBytes)}
        </p>
      </div>
    </div>
  )
}
