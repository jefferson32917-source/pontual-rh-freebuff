import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { HrStore } from '../lib/store'
import type { Assessment, AssessmentKind, Pdi, PdiGoalQuestion, PdiStep, User } from '../types'
import { formatDate, formatDateTime } from '../lib/format'
import { Avatar, EmptyState, ProgressBar, SectionCard, StatusBadge } from '../components/ui'
import { toast } from '../components/Toast'

/**
 * Painel de Desenvolvimento do GESTOR:
 * cria e aplica Questionários, Avaliações e PDIs para o time, e acompanha
 * respostas/evolução em tempo real.
 */
export default function DevelopmentAdmin({ user, store }: { user: User; store: HrStore }) {
  const { data } = store

  const team = useMemo(
    () => data.users.filter((u) => u.companyId === user.companyId && u.id !== user.id && u.role !== 'super_admin'),
    [data.users, user.companyId, user.id],
  )
  const teamIds = useMemo(() => new Set(team.map((u) => u.id)), [team])

  const assessments = data.assessments.filter((a) => a.createdBy === user.id || teamIds.has(a.assignedTo))
  const teamPdis = data.pdis.filter((p) => teamIds.has(p.employeeId))

  // ============ form: aplicar feedback/avaliação ============
  const [kind, setKind] = useState<AssessmentKind>('questionario')
  const [target, setTarget] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [questionsText, setQuestionsText] = useState('')
  /** tipo de resposta por pergunta (índice alinha com as perguntas do textarea) */
  const [questionTypes, setQuestionTypes] = useState<('aberta' | 'opcoes')[]>([])
  /** opções (uma por linha) por pergunta de múltipla escolha */
  const [questionOptions, setQuestionOptions] = useState<string[][]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // ============ form: novo PDI ============
  const [pdiTarget, setPdiTarget] = useState('')
  const [pdiTitle, setPdiTitle] = useState('')
  const [pdiDescription, setPdiDescription] = useState('')
  const [pdiDue, setPdiDue] = useState('')
  const [pdiStepsText, setPdiStepsText] = useState('')
  const [pdiError, setPdiError] = useState<string | null>(null)
  const [savingPdi, setSavingPdi] = useState(false)
  // ============ metas do PDI (apoio à aplicação do conhecimento) ============
  const [pdiGoalsEnabled, setPdiGoalsEnabled] = useState(false)
  const [pdiGoalsText, setPdiGoalsText] = useState('')
  const [pdiGoalTypes, setPdiGoalTypes] = useState<('sim_nao' | 'opcoes')[]>([])
  const [pdiGoalOptions, setPdiGoalOptions] = useState<string[][]>([])
  /** Comentário do gestor por PDI (modal de acompanhamento). */
  const [commentText, setCommentText] = useState('')

  /** Visualizador: respostas do questionário / etapas do PDI. */
  const [viewing, setViewing] = useState<{ type: 'assessment' | 'pdi'; id: string } | null>(null)

  async function handleApplyAssessment(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!target || !title.trim()) {
      setError('Selecione o colaborador e dê um título.')
      return
    }
    /**
     * FEEDBACK (questionario): sem perguntas — é a mensagem direta do gestor.
     * AVALIAÇÃO: perguntas com tipo (aberta ou opções).
     */
    let questions: { id: string; text: string; type?: 'aberta' | 'opcoes'; options?: string[] }[] = []
    if (kind === 'avaliacao') {
      questions = questionsText
        .split('\n')
        .map((q) => q.trim())
        .filter(Boolean)
        .map((text, i) => {
          const type = questionTypes[i] ?? 'aberta'
          const options = (questionOptions[i] ?? [])
            .map((o) => o.trim())
            .filter(Boolean)
            .slice(0, 10)
          return {
            id: `q${i + 1}`,
            text: text.slice(0, 300),
            type,
            ...(type === 'opcoes' && options.length >= 2 ? { options } : {}),
          }
        })
      if (questions.length === 0) {
        setError('Escreva ao menos uma pergunta da avaliação (uma por linha).')
        return
      }
      const badOption = questions.find((q) => q.type === 'opcoes' && (q.options?.length ?? 0) < 2)
      if (badOption) {
        setError(`A pergunta "${badOption.text.slice(0, 40)}…" é de opções — registre pelo menos 2 opções de resposta.`)
        return
      }
    }
    setSaving(true)
    try {
      await store.createAssessment({
        kind,
        title: title.trim().slice(0, 140),
        description:
          kind === 'questionario'
            ? description.trim().slice(0, 2000) || undefined // feedback: a mensagem vive aqui
            : description.trim().slice(0, 400) || undefined,
        createdBy: user.id,
        assignedTo: target,
        questions,
      })
      toast.success('Sucesso! Aplicado ao colaborador.')
      setTitle('')
      setDescription('')
      setQuestionsText('')
      setQuestionTypes([])
      setQuestionOptions([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao aplicar. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  async function handleCreatePdi(e: FormEvent) {
    e.preventDefault()
    setPdiError(null)
    const steps: PdiStep[] = pdiStepsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((label, i) => ({ id: `s${i + 1}`, label: label.slice(0, 200), done: false, progress: 0 }))
    if (!pdiTarget || !pdiTitle.trim() || !pdiDue || steps.length === 0) {
      setPdiError('Preencha colaborador, título, prazo e ao menos uma etapa (uma por linha).')
      return
    }
    // Metas: perguntas com tipo (sim/não ou opções)
    const gq: PdiGoalQuestion[] = pdiGoalsEnabled
      ? pdiGoalsText
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean)
          .map((text, i) => {
            const type = pdiGoalTypes[i] ?? 'sim_nao'
            const options = (pdiGoalOptions[i] ?? []).map((o) => o.trim()).filter(Boolean).slice(0, 10)
            return {
              id: `g${i + 1}`,
              text: text.slice(0, 300),
              type,
              ...(type === 'opcoes' && options.length >= 2 ? { options } : {}),
            }
          })
      : []
    const badGoal = gq.find((q) => q.type === 'opcoes' && (q.options?.length ?? 0) < 2)
    if (badGoal) {
      setPdiError(`A meta "${badGoal.text.slice(0, 40)}…" é de opções — registre pelo menos 2 opções.`)
      return
    }
    setSavingPdi(true)
    try {
      await store.createPdi({
        employeeId: pdiTarget,
        title: pdiTitle.trim().slice(0, 140),
        description: pdiDescription.trim().slice(0, 400),
        dueDate: pdiDue,
        createdBy: user.id,
        steps,
        goalsEnabled: pdiGoalsEnabled,
        goalQuestions: gq,
      })
      toast.success('Sucesso! PDI criado e disponibilizado ao colaborador.')
      setPdiTitle('')
      setPdiDescription('')
      setPdiStepsText('')
      setPdiDue('')
      setPdiGoalsText('')
      setPdiGoalTypes([])
      setPdiGoalOptions([])
      setPdiGoalsEnabled(false)
    } catch (err) {
      setPdiError(err instanceof Error ? err.message : 'Falha ao criar o PDI.')
    } finally {
      setSavingPdi(false)
    }
  }

  const viewedAssessment: Assessment | undefined = viewing?.type === 'assessment' ? data.assessments.find((a) => a.id === viewing.id) : undefined
  const viewedPdi: Pdi | undefined = viewing?.type === 'pdi' ? data.pdis.find((p) => p.id === viewing.id) : undefined

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Desenvolvimento do time</h1>
        <p className="mt-1 text-sm text-slate-500">Crie feedbacks estruturados, avaliações e PDIs — e acompanhe a evolução em tempo real.</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ============ Aplicar feedback/avaliação ============ */}
        <SectionCard title="Aplicar feedback ou avaliação">
          <form onSubmit={handleApplyAssessment} className="space-y-4">
            <div className="flex gap-2">
              {(['questionario', 'avaliacao'] as AssessmentKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
                    kind === k ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                  aria-pressed={kind === k}
                >
                  {k === 'questionario' ? 'Feedback' : 'Avaliação'}
                </button>
              ))}
            </div>
            <div>
              <label htmlFor="dev-target" className="mb-1.5 block text-sm font-medium text-slate-700">
                Colaborador
              </label>
              <select id="dev-target" className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">Selecione…</option>
                {team.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.jobTitle}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="dev-title" className="mb-1.5 block text-sm font-medium text-slate-700">
                Título
              </label>
              <input id="dev-title" className="input" maxLength={140} placeholder="Ex.: Autoavaliação trimestral" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <label htmlFor="dev-desc" className="mb-1.5 block text-sm font-medium text-slate-700">
                {kind === 'questionario' ? 'Feedback' : 'Instruções (opcional)'}
              </label>
              <textarea
                id="dev-desc"
                className="input min-h-[110px] resize-y"
                maxLength={kind === 'questionario' ? 2000 : 400}
                placeholder={kind === 'questionario' ? 'Escreva o feedback para o colaborador — ele recebe no painel e confirma a leitura.' : 'Opcional: contexto ou instruções para o colaborador.'}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            {kind === 'avaliacao' && (
              <div>
                <label htmlFor="dev-questions" className="mb-1.5 block text-sm font-medium text-slate-700">
                  Perguntas — uma por linha
                </label>
                <textarea
                  id="dev-questions"
                  className="input min-h-[110px] resize-y"
                  placeholder={'Como você avalia sua comunicação?\nQuais objetivos alcançou neste trimestre?'}
                  value={questionsText}
                  onChange={(e) => {
                    setQuestionsText(e.target.value)
                    // mantém os arrays paralelos alinhados com as perguntas
                    const count = e.target.value.split('\n').filter((l) => l.trim()).length
                    setQuestionTypes((prev) => Array.from({ length: count }, (_, i) => prev[i] ?? 'aberta'))
                    setQuestionOptions((prev) => Array.from({ length: count }, (_, i) => prev[i] ?? []))
                  }}
                />
              </div>
            )}
            {kind === 'avaliacao' && questionTypes.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-500">Tipo de resposta de cada pergunta:</p>
                {questionTypes.map((qt, i) => (
                  <div key={i} className="rounded-xl border border-slate-200 p-3">
                    <p className="truncate text-xs font-medium text-slate-700">{i + 1}. {questionsText.split('\n').filter((l) => l.trim())[i] ?? '—'}</p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setQuestionTypes((prev) => prev.map((v, j) => (j === i ? 'aberta' : v)))}
                        className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold ${qt === 'aberta' ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-slate-200 text-slate-600'}`}
                        aria-pressed={qt === 'aberta'}
                      >
                        ✍ Resposta aberta
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuestionTypes((prev) => prev.map((v, j) => (j === i ? 'opcoes' : v)))}
                        className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold ${qt === 'opcoes' ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-slate-200 text-slate-600'}`}
                        aria-pressed={qt === 'opcoes'}
                      >
                        ☑ Marcar opções
                      </button>
                    </div>
                    {qt === 'opcoes' && (
                      <div className="mt-2">
                        <label htmlFor={`qopt-${i}`} className="mb-1 block text-[11px] font-medium text-slate-500">
                          Opções de resposta — uma por linha (mín. 2)
                        </label>
                        <textarea
                          id={`qopt-${i}`}
                          className="input min-h-[64px] resize-y text-sm"
                          placeholder={'Ótimo\nBom\nPrecisa melhorar'}
                          value={(questionOptions[i] ?? []).join('\n')}
                          onChange={(e) => setQuestionOptions((prev) => prev.map((v, j) => (j === i ? e.target.value.split('\n') : v)))}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {error && (
              <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-700">
                {error}
              </p>
            )}
            <button type="submit" className="btn-primary w-full" disabled={saving}>
              {saving ? 'Aplicando…' : 'Aplicar ao colaborador'}
            </button>
          </form>
        </SectionCard>

        {/* ============ Criar PDI ============ */}
        <SectionCard title="Criar plano de desenvolvimento (PDI)">
          <form onSubmit={handleCreatePdi} className="space-y-4">
            <div>
              <label htmlFor="pdi-target" className="mb-1.5 block text-sm font-medium text-slate-700">
                Colaborador
              </label>
              <select id="pdi-target" className="input" value={pdiTarget} onChange={(e) => setPdiTarget(e.target.value)}>
                <option value="">Selecione…</option>
                {team.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.jobTitle}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="pdi-title" className="mb-1.5 block text-sm font-medium text-slate-700">
                Título do plano
              </label>
              <input id="pdi-title" className="input" maxLength={140} placeholder="Ex.: Trilha de liderança técnica" value={pdiTitle} onChange={(e) => setPdiTitle(e.target.value)} />
            </div>
            <div>
              <label htmlFor="pdi-desc" className="mb-1.5 block text-sm font-medium text-slate-700">
                Descrição
              </label>
              <textarea id="pdi-desc" className="input min-h-[56px] resize-y" maxLength={400} value={pdiDescription} onChange={(e) => setPdiDescription(e.target.value)} />
            </div>
            <div>
              <label htmlFor="pdi-due" className="mb-1.5 block text-sm font-medium text-slate-700">
                Prazo
              </label>
              <input id="pdi-due" type="date" className="input" value={pdiDue} onChange={(e) => setPdiDue(e.target.value)} />
            </div>
            <div>
              <label htmlFor="pdi-steps" className="mb-1.5 block text-sm font-medium text-slate-700">
                Metas / etapas — uma por linha
              </label>
              <textarea
                id="pdi-steps"
                className="input min-h-[110px] resize-y"
                placeholder={'Concluir curso de gestão de conflitos\nLiderar uma reunião de squad por mês'}
                value={pdiStepsText}
                onChange={(e) => setPdiStepsText(e.target.value)}
              />
            </div>
            {/* METAS: apoio para identificar se o conhecimento está sendo aplicado */}
            <div className="rounded-xl border border-slate-200 p-3.5">
              <label className="flex items-center justify-between gap-3" htmlFor="pdi-goals-toggle">
                <span>
                  <span className="block text-xs font-semibold text-slate-700">Ativar marcação de metas</span>
                  <span className="block text-[11px] text-slate-500">
                    Perguntas de acompanhamento (ex.: "Bateu meta?", satisfação com opções) que o colaborador responde durante o PDI.
                  </span>
                </span>
                <button
                  type="button"
                  id="pdi-goals-toggle"
                  role="switch"
                  aria-checked={pdiGoalsEnabled}
                  className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${pdiGoalsEnabled ? 'bg-primary-600' : 'bg-slate-300'}`}
                  onClick={() => setPdiGoalsEnabled((v) => !v)}
                >
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${pdiGoalsEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </label>
              {pdiGoalsEnabled && (
                <div className="mt-3 space-y-3">
                  <textarea
                    className="input min-h-[80px] resize-y"
                    placeholder={'Bateu meta?\nVocê conseguiu entender esse módulo?\nQual seu nível de satisfação com esse treinamento?'}
                    value={pdiGoalsText}
                    onChange={(e) => {
                      setPdiGoalsText(e.target.value)
                      const count = e.target.value.split('\n').filter((l) => l.trim()).length
                      setPdiGoalTypes((prev) => Array.from({ length: count }, (_, i) => prev[i] ?? 'sim_nao'))
                      setPdiGoalOptions((prev) => Array.from({ length: count }, (_, i) => prev[i] ?? []))
                    }}
                  />
                  <p className="text-[11px] text-slate-500">Uma pergunta por linha. Para cada uma, escolha o tipo de resposta:</p>
                  {pdiGoalTypes.map((gt, i) => (
                    <div key={i} className="rounded-xl border border-slate-200 p-3">
                      <p className="truncate text-xs font-medium text-slate-700">{i + 1}. {pdiGoalsText.split('\n').filter((l) => l.trim())[i] ?? '—'}</p>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => setPdiGoalTypes((prev) => prev.map((v, j) => (j === i ? 'sim_nao' : v)))}
                          className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold ${gt === 'sim_nao' ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-slate-200 text-slate-600'}`}
                          aria-pressed={gt === 'sim_nao'}
                        >
                          ✓ Sim / Não
                        </button>
                        <button
                          type="button"
                          onClick={() => setPdiGoalTypes((prev) => prev.map((v, j) => (j === i ? 'opcoes' : v)))}
                          className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold ${gt === 'opcoes' ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-slate-200 text-slate-600'}`}
                          aria-pressed={gt === 'opcoes'}
                        >
                          ☑ Opções de marcar
                        </button>
                      </div>
                      {gt === 'opcoes' && (
                        <div className="mt-2">
                          <label htmlFor={`gopt-${i}`} className="mb-1 block text-[11px] font-medium text-slate-500">
                            Opções — uma por linha (mín. 2)
                          </label>
                          <textarea
                            id={`gopt-${i}`}
                            className="input min-h-[64px] resize-y text-sm"
                            placeholder={'Péssimo\nRuim\nRegular\nBom\nExcelente'}
                            value={(pdiGoalOptions[i] ?? []).join('\n')}
                            onChange={(e) => setPdiGoalOptions((prev) => prev.map((v, j) => (j === i ? e.target.value.split('\n') : v)))}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {pdiError && (
              <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-700">
                {pdiError}
              </p>
            )}
            <button type="submit" className="btn-primary w-full" disabled={savingPdi}>
              {savingPdi ? 'Criando…' : 'Criar e disponibilizar PDI'}
            </button>
          </form>
        </SectionCard>
      </div>

      {/* ============ Acompanhamento dos questionários ============ */}
      <SectionCard title="Feedbacks e avaliações aplicados" action={<StatusBadge tone="primary">{assessments.length}</StatusBadge>}>
        {assessments.length === 0 ? (
          <EmptyState message="Nenhum feedback ou avaliação aplicado ainda." />
        ) : (
          <ul className="space-y-3">
            {assessments.map((a) => {
              const to = data.users.find((u) => u.id === a.assignedTo)
              const answered = a.questions.filter((q) => (q.answer ?? '').trim().length > 0).length
              const done = a.completedAt != null
              return (
                <li key={a.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-4">
                  <Avatar name={to?.name ?? '?'} color={to?.avatarColor ?? '#94A3B8'} photoUrl={to?.photoDataUrl} userId={to?.id} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{a.title}</p>
                    <p className="truncate text-xs text-slate-500">
                      {a.kind === 'questionario' ? 'Feedback' : 'Avaliação'} · {to?.name ?? '—'} · {formatDateTime(a.createdAt)}
                    </p>
                    <div className="mt-2 max-w-xs">
                      <ProgressBar value={a.questions.length > 0 ? Math.round((answered / a.questions.length) * 100) : 0} />
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        Respondido {answered} de {a.questions.length} perguntas{done ? ' · concluído' : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1.5">
                    <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setViewing({ type: 'assessment', id: a.id })}>
                      Ver respostas
                    </button>
                    <button type="button" className="btn-secondary px-3 py-1.5 text-xs text-rose-600" onClick={() => store.deleteAssessment(a.id)}>
                      Excluir
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </SectionCard>

      {/* ============ Acompanhamento dos PDIs ============ */}
      <SectionCard title="PDIs do time" action={<StatusBadge tone="teal">{teamPdis.length}</StatusBadge>}>
        {teamPdis.length === 0 ? (
          <EmptyState message="Nenhum PDI ativo para o time." />
        ) : (
          <ul className="space-y-3">
            {teamPdis.map((p) => {
              const owner = data.users.find((u) => u.id === p.employeeId)
              const doneSteps = p.steps?.filter((s) => s.done).length ?? 0
              return (
                <li key={p.id} className="rounded-xl border border-slate-100 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{p.title}</p>
                      <p className="truncate text-xs text-slate-500">
                        {owner?.name ?? '—'} · prazo {formatDate(p.dueDate)}
                        {p.steps && p.steps.length > 0 ? ` · ${doneSteps}/${p.steps.length} etapas` : ''}
                      </p>
                    </div>
                    <StatusBadge tone={p.status === 'atrasado' ? 'rose' : p.status === 'concluido' ? 'teal' : 'primary'}>
                      {p.status === 'em_andamento' ? 'Em andamento' : p.status === 'concluido' ? 'Concluído' : 'Atrasado'}
                    </StatusBadge>
                  </div>
                  <div className="mt-2 max-w-md">
                    <ProgressBar value={p.progress} />
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setViewing({ type: 'pdi', id: p.id })}>
                      Ver etapas e histórico
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </SectionCard>

      {/* ============ Visualizador: respostas / etapas ============ */}
      {viewing && (viewedAssessment || viewedPdi) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setViewing(null)}
        >
          <div className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
            {viewedAssessment && (
              <>
                <h2 className="text-lg font-bold text-slate-900">{viewedAssessment.title}</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {data.users.find((u) => u.id === viewedAssessment.assignedTo)?.name} ·{' '}
                  {viewedAssessment.completedAt ? `concluído em ${formatDateTime(viewedAssessment.completedAt)}` : 'em andamento — respostas em tempo real'}
                </p>
                <ul className="mt-4 space-y-4">
                  {viewedAssessment.questions.map((q, i) => (
                    <li key={q.id}>
                      <p className="text-sm font-semibold text-slate-800">
                        {i + 1}. {q.text}
                      </p>
                      {q.type === 'opcoes' && q.options && q.options.length > 0 && (
                        <p className="mt-1 text-[11px] text-slate-400">Opções: {q.options.join(' · ')}{q.answer ? ` — marcada: ${q.answer}` : ''}</p>
                      )}
                      <p className={`mt-1 rounded-xl px-3 py-2 text-sm ${q.answer ? 'bg-slate-50 text-slate-700' : 'bg-slate-50 italic text-slate-400'}`}>
                        {q.type === 'opcoes' && q.options ? q.answer || 'Aguardando marcação…' : q.answer || 'Sem resposta ainda'}
                      </p>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {viewedPdi && (
              <>
                <h2 className="text-lg font-bold text-slate-900">{viewedPdi.title}</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {data.users.find((u) => u.id === viewedPdi.employeeId)?.name} · prazo {formatDate(viewedPdi.dueDate)} ·{' '}
                  {viewedPdi.progress}% concluído
                </p>
                <div className="mt-3">
                  <ProgressBar value={viewedPdi.progress} />
                </div>
                <ul className="mt-4 space-y-2.5">
                  {(viewedPdi.steps ?? []).map((s) => {
                    const pct = s.progress ?? (s.done ? 100 : 0)
                    return (
                      <li key={s.id} className={`rounded-xl border p-3 ${pct >= 100 ? 'border-teal-200 bg-teal-50/50' : 'border-slate-100'}`}>
                        <div className="flex items-start gap-2.5">
                          <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${pct >= 100 ? 'bg-teal-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                            {pct >= 100 ? '✓' : `${pct}%`}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className={`text-sm ${pct >= 100 ? 'font-medium text-teal-800' : 'text-slate-700'}`}>{s.label}</p>
                            {pct >= 100 && s.doneAt && <p className="mt-0.5 text-xs text-teal-600">Concluída em {formatDateTime(s.doneAt)}</p>}
                            {pct < 100 && <div className="mt-1.5 max-w-[220px]"><ProgressBar value={pct} /></div>}
                          </div>
                        </div>
                      </li>
                    )
                  })}
                  {(!viewedPdi.steps || viewedPdi.steps.length === 0) && (
                    <li className="text-sm italic text-slate-400">Este PDI não tem etapas cadastradas (usa progresso manual).</li>
                  )}
                </ul>

                {/* Metas: respostas do colaborador em tempo real */}
                {viewedPdi.goalsEnabled && (viewedPdi.goalQuestions ?? []).length > 0 && (
                  <div className="mt-5 rounded-xl border border-primary-100 bg-primary-50/40 p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-primary-700">Metas — respostas do colaborador</p>
                    <ul className="mt-2.5 space-y-2">
                      {(viewedPdi.goalQuestions ?? []).map((gq) => (
                        <li key={gq.id} className="rounded-lg bg-white px-3 py-2">
                          <p className="text-sm font-medium text-slate-700">{gq.text}</p>
                          <p className={`mt-0.5 text-xs font-semibold ${gq.answer ? 'text-teal-700' : 'text-slate-400'}`}>
                            {gq.answer ? `→ ${gq.answer}${gq.answeredAt ? ` · ${formatDateTime(gq.answeredAt)}` : ''}` : 'Aguardando resposta…'}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Comentários do gestor: incentivo/orientação */}
                <div className="mt-5">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Mensagens do gestor</p>
                  {(viewedPdi.managerComments ?? []).length > 0 && (
                    <ul className="mt-2 space-y-2">
                      {(viewedPdi.managerComments ?? []).map((c) => (
                        <li key={c.id} className="rounded-lg bg-slate-50 px-3 py-2">
                          <p className="text-sm text-slate-700">{c.message}</p>
                          <p className="mt-0.5 text-[11px] text-slate-400">{formatDateTime(c.createdAt)}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-2 flex gap-2">
                    <input
                      className="input flex-1"
                      maxLength={500}
                      placeholder="Escreva uma mensagem de incentivo ou orientação…"
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn-primary px-4 py-2 text-sm"
                      disabled={!commentText.trim()}
                      onClick={() => {
                        if (!viewedPdi || !commentText.trim()) return
                        store.addPdiComment(viewedPdi.id, user.id, commentText)
                        setCommentText('')
                      }}
                    >
                      Comentar
                    </button>
                  </div>
                </div>
              </>
            )}
            <div className="mt-5 text-right">
              <button type="button" className="btn-secondary px-4 py-2 text-sm" onClick={() => setViewing(null)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
