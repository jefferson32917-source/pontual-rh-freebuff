import { useEffect, useMemo, useState } from 'react'
import type { HrStore } from '../lib/store'
import type { TimeEntryType, User } from '../types'
import { formatTime, localDayKey, timeEntryLabels, weekDayShort, workedHours } from '../lib/format'
import { weekDayLabels } from '../types'
import { EmptyState, SectionCard, StatCard, StatusBadge } from '../components/ui'
import { formatGeo, geoMapLink, reverseGeocode, useGeoConsent } from '../lib/geo'

const entryOrder: TimeEntryType[] = ['entrada', 'saida_almoco', 'volta_almoco', 'saida']

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Batidas do dia ordenadas e completadas até 4 posições (null = faltante). */
function dayPunches(entries: { type: TimeEntryType; occurredAt: string }[]): (string | null)[] {
  const sorted = [...entries].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime())
  const result: (string | null)[] = [null, null, null, null]
  for (let i = 0; i < Math.min(4, sorted.length); i++) {
    result[i] = formatTime(sorted[i]!.occurredAt)
  }
  return result
}

function missingPunches(entries: { type: TimeEntryType; occurredAt: string }[]): number {
  return 4 - Math.min(4, entries.length)
}

export default function Timesheet({ user, store }: { user: User; store: HrStore }) {
  const { data } = store
  const [now, setNow] = useState(() => new Date())
  const [range, setRange] = useState<7 | 15 | 30>(7)
  const [editingDay, setEditingDay] = useState<string | null>(null)
  const [dayOffDay, setDayOffDay] = useState<string | null>(null)
  const [dayOffReason, setDayOffReason] = useState('')
  const [dayOffError, setDayOffError] = useState<string | null>(null)
  const [dayOffBusy, setDayOffBusy] = useState(false)
  const [geoBusy, setGeoBusy] = useState(false)
  /** Colaborador em visualização (gestor): null = o próprio usuário. */
  const [viewingId, setViewingId] = useState<string | null>(null)
  /** Ajuste pelo gestor: dia em edição + justificativa digitada */
  const [adjustingDay, setAdjustingDay] = useState<string | null>(null)
  const [adjustNote, setAdjustNote] = useState('')
  const [adjustError, setAdjustError] = useState<string | null>(null)
  const [adjustBusy, setAdjustBusy] = useState(false)
  /** Endereços legíveis por coordenada (cache local da página) */
  const [addrMap, setAddrMap] = useState<Record<string, string>>({})
  const today = dayKey(now)

  // Resolve endereços legíveis para todas as batidas com localização (uma vez)
  const locKey = data.timeEntries
    .filter((t) => t.location)
    .map((t) => `${t.location!.lat.toFixed(5)},${t.location!.lng.toFixed(5)}`)
    .join('|')
  useEffect(() => {
    if (!locKey) return
    let alive = true
    const coords = [...new Set(locKey.split('|'))]
    for (const c of coords) {
      if (addrMap[c]) continue
      const [lat, lng] = c.split(',').map(Number) as [number, number]
      void reverseGeocode({ lat, lng }).then((addr) => {
        if (alive && addr) setAddrMap((m) => ({ ...m, [c]: addr }))
      })
    }
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locKey])

  const geo = useGeoConsent(user.id)

  const isManager = user.role === 'super_admin' || user.role === 'gestor'
  const teamIds = useMemo(
    () =>
      isManager
        ? data.users
            .filter((u) =>
              user.role === 'super_admin'
                ? u.companyId !== null && u.id !== user.id
                : u.companyId === user.companyId && u.role === 'colaborador',
            )
            .map((u) => u.id)
        : [],
    [data.users, user, isManager],
  )

  /** Pessoa cujo espelho está sendo exibido (o próprio ou o colaborador selecionado). */
  const subject: User =
    (viewingId && viewingId !== user.id
      ? data.users.find((u) => u.id === viewingId && teamIds.includes(u.id))
      : null) ?? user
  const isViewingOther = subject.id !== user.id

  const todayEntries = data.timeEntries.filter(
    (t) => t.employeeId === subject.id && localDayKey(t.occurredAt) === today,
  )
  const nextType: TimeEntryType = entryOrder[todayEntries.length % entryOrder.length] ?? 'entrada'
  const hoursToday = workedHours(todayEntries)

  // Espelho de ponto: últimos N dias com consistência de 4 batidas
  const mirror = useMemo(() => {
    const days: {
      key: string
      label: string
      hours: number
      punches: (string | null)[]
      missing: number
      isWorkday: boolean
    }[] = []
    for (let i = 0; i < range; i++) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const key = dayKey(d)
      const entries = data.timeEntries.filter((t) => t.employeeId === subject.id && localDayKey(t.occurredAt) === key)
      const weekday = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'][d.getDay()] as keyof typeof weekDayLabels
      days.push({
        key,
        label: `${weekDayShort[weekday]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
        hours: workedHours(entries),
        punches: dayPunches(entries),
        missing: missingPunches(entries),
        isWorkday: !!subject.weeklySchedule[weekday],
      })
    }
    return days
  }, [data.timeEntries, subject, now, range])

  const inconsistentDays = mirror.filter((d) => d.missing > 0 && (d.isWorkday || d.hours > 0)).length
  const periodTotal = mirror.reduce((acc, d) => acc + d.hours, 0)

  // folgas dos dias exibidos no espelho (do próprio usuário)
  const dayOffByKey = useMemo(() => {
    const map = new Map<string, { status: string; reason: string; id: string }>()
    for (const o of data.dayOffs) {
      if (o.employeeId === subject.id) map.set(o.day, { status: o.status, reason: o.reason, id: o.id })
    }
    return map
  }, [data.dayOffs, subject.id])

  // folgas pendentes da equipe (para o gestor aprovar)
  const pendingDayOffs = useMemo(() => {
    if (!isManager) return []
    return data.dayOffs.filter(
      (o) => o.status === 'pendente' && o.employeeId !== user.id && teamIds.includes(o.employeeId),
    )
  }, [data.dayOffs, isManager, teamIds, user.id])

  // visão da equipe (hoje)
  const teamToday = useMemo(() => {
    if (!isManager) return []
    return data.users
      .filter((u) => teamIds.includes(u.id) && u.id !== user.id)
      .map((u) => ({
        person: u,
        entries: data.timeEntries
          .filter((t) => t.employeeId === u.id && localDayKey(t.occurredAt) === today)
          .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()),
      }))
  }, [data.users, data.timeEntries, teamIds, isManager, user.id, today])

  async function punch() {
    setGeoBusy(true)
    try {
      // Localização opcional: negar NÃO impede a batida (fica sem geo).
      const loc = geo.status === 'granted' ? await geo.capture() : await geo.requestConsent()
      store.punchNext(user.id, new Date(), loc ?? undefined)
      setNow(new Date())
    } finally {
      setGeoBusy(false)
    }
  }

  const canPunch =    (nextType === 'entrada' && todayEntries.length === 0) ||
    (todayEntries.length > 0 && todayEntries[todayEntries.length - 1]!.type !== 'saida')

  const editingEntries = editingDay ? data.timeEntries.filter((t) => t.employeeId === user.id && localDayKey(t.occurredAt) === editingDay) : []

  function submitDayOff() {
    if (!dayOffDay) return
    setDayOffBusy(true)
    setDayOffError(null)
    store
      .createDayOff(user.id, dayOffDay, dayOffReason.trim() || 'Folga programada — dia sem batidas')
      .then(() => {
        setDayOffDay(null)
        setDayOffReason('')
      })
      .catch((e) => setDayOffError(e instanceof Error ? e.message : 'Falha ao solicitar folga.'))
      .finally(() => setDayOffBusy(false))
  }

  const canEditSubject = !isViewingOther // próprio espelho: edição simples
  const canAdjustOthers = isViewingOther && (user.role === 'super_admin' || user.role === 'gestor')

  /** Justificativas de ajuste do sujeito em exibição, por dia. */
  const adjustmentsByDay = useMemo(() => {
    const map = new Map<string, { note: string; adjustedBy: string }>()
    for (const a of data.entryAdjustments) {
      if (a.employeeId === subject.id) map.set(a.day, { note: a.note, adjustedBy: a.adjustedBy })
    }
    return map
  }, [data.entryAdjustments, subject.id])

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Ponto</h1>
          <p className="mt-1 text-sm text-slate-500">
            {isViewingOther
              ? `Visualizando o espelho de ${subject.name} (somente leitura).`
              : 'Bata o ponto, acompanhe seu espelho e corrija dias com batidas faltantes.'}
          </p>
        </div>
        {isManager && (
          <div className="min-w-[240px]">
            <label htmlFor="ts-subject" className="mb-1 block text-xs font-medium text-slate-500">
              Espelho de ponto de
            </label>
            <select
              id="ts-subject"
              className="input py-2 text-sm"
              value={subject.id}
              onChange={(e) => {
                setViewingId(e.target.value === user.id ? null : e.target.value)
                setEditingDay(null)
                setDayOffDay(null)
              }}
            >
              <option value={user.id}>Eu — {user.name}</option>
              {data.users
                .filter((u) => teamIds.includes(u.id) && u.id !== user.id)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </select>
          </div>
        )}
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Horas hoje" value={`${hoursToday}h`} hint="registradas" tone="primary" />
        <StatCard label={`Total ${range} dias`} value={`${Math.round(periodTotal * 10) / 10}h`} hint="acumulado" tone="teal" />
        <StatCard
          label="Jornada de hoje"
          value={(() => {
            const wd = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'][new Date().getDay()] as keyof typeof user.weeklySchedule
            const shift = user.weeklySchedule[wd]
            return shift ? `${shift[0]}–${shift[1]}` : 'Folga'
          })()}
          hint="conforme quadro"
          tone="amber"
        />
        <StatCard label="Dias inconsistentes" value={inconsistentDays} hint="menos de 4 batidas" tone={inconsistentDays > 0 ? 'rose' : 'teal'} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <SectionCard title={isViewingOther ? `Batidas de hoje — ${subject.name.split(' ')[0]}` : 'Relógio de ponto'}>
          <div className="text-center">
            <p className="text-4xl font-bold tabular-nums text-slate-900">{formatTime(now.toISOString())}</p>
            <p className="mt-1 text-xs text-slate-500">
              Próxima batida: <strong>{timeEntryLabels[nextType]}</strong>
            </p>
            {geo.status === 'granted' ? (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-teal-50 px-2.5 py-1 text-[11px] font-medium text-teal-700">
                📍 Localização ativa — registrada apenas para seu gestor
              </p>
            ) : (
              <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-800">
                Sem localização autorizada: a batida é registrada, porém fica marcada como “sem localização”.
              </p>
            )}
            {isViewingOther ? (
              <p className="mt-5 rounded-xl bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-500">
                {todayEntries.length === 0
                  ? 'Nenhuma batida hoje para este colaborador.'
                  : `${todayEntries.length} batida(s) registrada(s) hoje.`}
              </p>
            ) : (            <button
              type="button"
              className="btn-primary mt-5 w-full py-3 text-base"
              onClick={punch}
              disabled={!canPunch || geoBusy}
            >
              {geoBusy
                ? 'Registrando…'
                : canPunch
                  ? geo.status === 'granted'
                    ? `Registrar ${timeEntryLabels[nextType]}`
                    : `Registrar ${timeEntryLabels[nextType]} (sem localização)`
                  : 'Ciclo do dia completo ✓'}
              </button>
            )}
            {todayEntries.length > 0 && (
              <ul className="mt-5 space-y-2 text-left">
                {[...todayEntries]
                  .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime())
                  .map((entry) => (
                    <li key={entry.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-2.5">
                      <span className="text-sm font-medium text-slate-700">{timeEntryLabels[entry.type]}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-semibold tabular-nums text-slate-900">
                          {formatTime(entry.occurredAt)}
                        </span>
                        {canEditSubject && (
                          <button
                            type="button"
                            className="text-xs font-semibold text-rose-500 hover:text-rose-700"
                            onClick={() => store.deleteTimeEntry(entry.id)}
                            title="Estornar batida"
                          >
                            estornar
                          </button>
                        )}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </SectionCard>

        <div className="lg:col-span-2">
          <SectionCard
            title="Meu espelho de ponto"
            action={
              <select
                className="input w-auto py-1.5 text-xs"
                value={range}
                onChange={(e) => setRange(Number(e.target.value) as 7 | 15 | 30)}
                aria-label="Período do espelho"
              >
                <option value={7}>Últimos 7 dias</option>
                <option value={15}>Últimos 15 dias</option>
                <option value={30}>Últimos 30 dias</option>
              </select>
            }
          >
            <p className="mb-3 text-xs text-slate-400">
              {canAdjustOthers
                ? `Ajuste dias com batidas erradas de ${subject.name.split(' ')[0]} — a justificativa fica registrada e visível para o colaborador.`
                : 'Todo dia trabalhado deve ter as 4 batidas (entrada, saída almoço, volta, saída). Clique em Editar para corrigir ou completar um dia.'}
            </p>
            <ul className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {mirror.map((day) => {
                const hasIssue = day.missing > 0 && (day.isWorkday || day.hours > 0)
                return (
                  <li key={day.key} className={`rounded-xl border p-3 ${hasIssue ? 'border-amber-200 bg-amber-50/50' : 'border-slate-100'}`}>
                    {dayOffDay === day.key ? (
                      <div className="space-y-3">
                        <p className="text-xs font-semibold text-slate-600">
                          Solicitar folga para {day.label} — o dia ficará sinalizado como folga (sem batidas) e o gestor irá aprovar.
                        </p>
                        <input
                          type="text"
                          className="input text-sm"
                          placeholder="Motivo (opcional): ex. banco de horas, compensação…"
                          maxLength={280}
                          value={dayOffReason}
                          onChange={(e) => setDayOffReason(e.target.value)}
                        />
                        {dayOffError && (
                          <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{dayOffError}</p>
                        )}
                        <div className="flex gap-2">
                          <button type="button" className="btn-primary flex-1 py-2 text-xs" onClick={submitDayOff} disabled={dayOffBusy}>
                            {dayOffBusy ? 'Enviando…' : 'Enviar solicitação'}
                          </button>
                          <button type="button" className="btn-secondary flex-1 py-2 text-xs" onClick={() => { setDayOffDay(null); setDayOffError(null) }}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : editingDay === day.key && canEditSubject ? (
                      <DayEditor
                        day={day}
                        entries={editingEntries}
                        onCancel={() => setEditingDay(null)}
                        onSave={(times) => {
                          const typed = times
                            .map((time, i) => ({ type: entryOrder[i]!, time }))
                            .filter((t) => t.time !== '')
                          store.setDayEntries(user.id, day.key, typed)
                          setEditingDay(null)
                        }}
                      />
                    ) : adjustingDay === day.key && canAdjustOthers ? (
                      <div className="space-y-3">
                        <p className="text-xs font-semibold text-slate-600">
                          Ajustando {day.label} de <strong>{subject.name}</strong> — informe as batidas corretas.
                        </p>
                        <DayEditor
                          day={day}
                          entries={editingEntries}
                          onCancel={() => {
                            setAdjustingDay(null)
                            setAdjustNote('')
                            setAdjustError(null)
                          }}
                          onSave={(times) => {
                            if (adjustNote.trim().length < 5) {
                              setAdjustError('Descreva o motivo do ajuste (mín. 5 caracteres) — o colaborador verá esta justificativa.')
                              return
                            }
                            const typed = times
                              .map((time, i) => ({ type: entryOrder[i]!, time }))
                              .filter((t) => t.time !== '')
                            setAdjustBusy(true)
                            setAdjustError(null)
                            store
                              .adjustDayEntries(subject.id, day.key, typed, adjustNote.trim(), user.name)
                              .then(() => {
                                setAdjustingDay(null)
                                setAdjustNote('')
                              })
                              .catch((e) => setAdjustError(e instanceof Error ? e.message : 'Falha ao ajustar o dia.'))
                              .finally(() => setAdjustBusy(false))
                          }}
                        />
                        <div>
                          <label htmlFor={`adj-note-${day.key}`} className="mb-1 block text-xs font-medium text-slate-600">
                            Justificativa do ajuste * (visível para o colaborador)
                          </label>
                          <textarea
                            id={`adj-note-${day.key}`}
                            className="input min-h-[56px] text-sm"
                            maxLength={280}
                            placeholder="Ex.: esquecimento de batida de saída, confirmado presença até 18h; correção de horário registrada errado no espelho…"
                            value={adjustNote}
                            onChange={(e) => setAdjustNote(e.target.value)}
                          />
                          {adjustError && (
                            <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{adjustError}</p>
                          )}
                        </div>
                        {adjustBusy && <p className="text-xs text-slate-500">Salvando ajuste…</p>}
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium capitalize text-slate-700">{day.label}</span>
                        {(() => {
                          const adj = adjustmentsByDay.get(day.key)
                          if (!adj) return null
                          return (
                            <span
                              className="w-full rounded-lg bg-primary-50 px-2.5 py-1.5 text-[11px] text-primary-800"
                              title={`Ajustado por ${adj.adjustedBy}`}
                            >
                              🛠 Ajustado por <strong>{adj.adjustedBy}</strong>: {adj.note}
                            </span>
                          )
                        })()}
                        <div className="flex flex-wrap items-center gap-1.5">
                          {day.punches.map((p, i) => (
                            <span
                              key={i}
                              className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
                                p === null
                                  ? 'bg-rose-50 text-rose-400'
                                  : 'bg-slate-100 text-slate-700 tabular-nums'
                              }`}
                              title={p === null ? `Falta ${timeEntryLabels[entryOrder[i]!]}` : timeEntryLabels[entryOrder[i]!]}
                            >
                              {p ?? '--:--'}
                            </span>
                          ))}
                          {hasIssue && (
                            <StatusBadge tone="amber">
                              ⚠ {day.missing === 3 ? 'só entrada' : `${day.missing} batida${day.missing > 1 ? 's' : ''} faltando`}
                            </StatusBadge>
                          )}
                          {(() => {
                            const off = dayOffByKey.get(day.key)
                            if (!off) return null
                            return (
                              <StatusBadge tone={off.status === 'aprovado' ? 'teal' : off.status === 'pendente' ? 'amber' : 'rose'}>
                                {off.status === 'aprovado' ? '🌴 Folga aprovada' : off.status === 'pendente' ? '🌴 Folga pendente' : '🌴 Folga recusada'}
                              </StatusBadge>
                            )
                          })()}
                          <span className="ml-1 text-sm font-semibold tabular-nums text-slate-900">{day.hours}h</span>
                          {canEditSubject && (
                            <>
                              <button
                                type="button"
                                className="btn-secondary px-2.5 py-1 text-[11px]"
                                onClick={() => setDayOffDay(dayOffDay === day.key ? null : day.key)}
                                title="Marcar este dia como folga (sem batidas), sujeito à aprovação do gestor"
                              >
                                🌴 Folga
                              </button>
                              <button type="button" className="btn-secondary px-2.5 py-1 text-[11px]" onClick={() => setEditingDay(day.key)}>
                                ✏️ Editar
                              </button>
                            </>
                          )}
                          {canAdjustOthers && (
                            <button
                              type="button"
                              className="btn-secondary border-amber-200 px-2.5 py-1 text-[11px] text-amber-700"
                              onClick={() => {
                                setAdjustingDay(adjustingDay === day.key ? null : day.key)
                                setAdjustNote(adjustmentsByDay.get(day.key)?.note ?? '')
                                setAdjustError(null)
                              }}
                              title="Corrigir as batidas deste dia com justificativa"
                            >
                              🛠 Ajustar
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </SectionCard>
        </div>

        <SectionCard
          title={isManager ? 'Equipe hoje' : 'Meu quadro de horários'}
          action={isManager ? <StatusBadge tone="neutral">{teamToday.length} pessoas</StatusBadge> : undefined}
        >
          {isManager && pendingDayOffs.length > 0 && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
              <p className="text-xs font-semibold text-amber-800">🌴 Solicitações de folga aguardando aprovação</p>
              <ul className="mt-2 space-y-2">
                {pendingDayOffs.map((o) => {
                  const person = data.users.find((u) => u.id === o.employeeId)
                  return (
                    <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-100 bg-white px-3 py-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {person?.name ?? 'Colaborador'} — {o.day.split('-').reverse().join('/')}
                        </p>
                        <p className="text-[11px] text-slate-500">{o.reason}</p>
                      </div>
                      <div className="flex gap-1.5">
                        <button type="button" className="btn-primary px-3 py-1.5 text-[11px]" onClick={() => store.updateDayOffStatus(o.id, 'aprovado')}>
                          Aprovar
                        </button>
                        <button type="button" className="btn-secondary px-3 py-1.5 text-[11px]" onClick={() => store.updateDayOffStatus(o.id, 'reprovado')}>
                          Recusar
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
          {isManager ? (
            teamToday.length === 0 ? (
              <EmptyState message="Nenhuma pessoa na sua equipe." />
            ) : (
              <ul className="space-y-3">
                {teamToday.map(({ person, entries }) => {
                  const last = entries[entries.length - 1]
                  const status = entries.length === 0 ? 'sem batida' : last!.type === 'saida' ? 'fora' : 'presente'
                  const lastLoc = last?.location
                  return (
                    <li key={person.id} className="rounded-xl border border-slate-100 p-3.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-slate-900">{person.name}</p>
                        <StatusBadge tone={status === 'presente' ? 'teal' : status === 'fora' ? 'neutral' : 'rose'}>
                          {status === 'presente' ? 'Presente' : status === 'fora' ? 'Encerrou o dia' : 'Sem batida'}
                        </StatusBadge>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] text-slate-500">
                        {entries.length === 0 ? (
                          <span>Nenhuma batida hoje</span>
                        ) : (
                          entries.map((e) => (
                            <span
                              key={e.id}
                              className="rounded-md bg-slate-100 px-1.5 py-0.5 font-medium"
                              title={e.location ? `Local: ${addrMap[`${e.location.lat.toFixed(5)},${e.location.lng.toFixed(5)}`] ?? formatGeo(e.location)}` : 'Batida sem localização autorizada'}
                            >
                              {timeEntryLabels[e.type].slice(0, 3)}: {formatTime(e.occurredAt)}{e.location ? ' 📍' : ' ⛌'}
                            </span>
                          ))
                        )}
                      </div>
                      {lastLoc && (
                        <p className="mt-1.5 text-[11px] text-slate-500">
                          📍 Última localização:{' '}
                          <a href={geoMapLink(lastLoc)} target="_blank" rel="noopener noreferrer" className="font-medium text-primary-600 hover:underline">
                            {addrMap[`${lastLoc.lat.toFixed(5)},${lastLoc.lng.toFixed(5)}`] ?? formatGeo(lastLoc)}
                          </a>
                        </p>
                      )}
                      <p className="mt-1 text-xs font-semibold text-slate-600">
                        Total: {workedHours(entries)}h
                      </p>
                    </li>
                  )
                })}
              </ul>
            )
          ) : (
            <ul className="space-y-2">
              {(['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'] as const).map((day) => {
                const shift = user.weeklySchedule[day]
                return (
                  <li
                    key={day}
                    className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-2.5"
                  >
                    <span className="text-sm font-medium capitalize text-slate-700">{weekDayLabels[day]}</span>
                    <span className={`text-sm font-semibold ${shift ? 'text-slate-900' : 'text-slate-400'}`}>
                      {shift ? `${shift[0]} – ${shift[1]}` : 'Folga'}
                    </span>
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

/** Editor de um dia do espelho: 4 campos HH:MM (vazio remove a batida). */
function DayEditor({
  day,
  entries,
  onSave,
  onCancel,
}: {
  day: { key: string; label: string; punches: (string | null)[]; isWorkday: boolean }
  entries: { id: string; type: TimeEntryType; occurredAt: string }[]
  onSave: (times: string[]) => void
  onCancel: () => void
}) {
  const initial = dayPunches(entries)
  const [times, setTimes] = useState<string[]>(() => entryOrder.map((_, i) => initial[i] ?? ''))

  const filled = times.filter((t) => t !== '').length

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-slate-600">
        Editando {day.label} {day.isWorkday ? '(dia útil)' : '(folga)'} — informe as 4 batidas:
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {entryOrder.map((type, i) => (
          <div key={type}>
            <label htmlFor={`punch-${day.key}-${i}`} className="mb-1 block text-[11px] font-medium text-slate-500">
              {timeEntryLabels[type]}
            </label>
            <input
              id={`punch-${day.key}-${i}`}
              type="time"
              className="input px-2 py-1.5 text-sm"
              value={times[i] ?? ''}
              onChange={(e) => setTimes((prev) => prev.map((t, j) => (j === i ? e.target.value : t)))}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button type="button" className="btn-primary flex-1 py-2 text-xs" onClick={() => onSave(times)} disabled={filled === 0}>
          Salvar batidas ({filled}/4)
        </button>
        <button type="button" className="btn-secondary flex-1 py-2 text-xs" onClick={onCancel}>
          Cancelar
        </button>
      </div>
      <p className="text-[11px] text-slate-400">Deixe um campo vazio para remover aquela batida.</p>
    </div>
  )
}
