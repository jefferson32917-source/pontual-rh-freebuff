import { useMemo, useState } from 'react'
import type { HrStore } from '../lib/store'
import type { User, WeekDay } from '../types'
import { weekDayLabels } from '../types'
import { formatDate, localDayKey, localTodayKey, roleLabels, weekDayShort, workedHours } from '../lib/format'
import { Avatar, SectionCard, StatusBadge } from '../components/ui'

const weekOrder: WeekDay[] = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom']

export default function Team({ user, store }: { user: User; store: HrStore }) {
  const { data } = store
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [scheduleDraft, setScheduleDraft] = useState<Record<string, string>>({})

  const people = useMemo(() => {
    let list = data.users
    if (user.role === 'gestor') {
      list = list.filter(
        (u) => u.companyId === user.companyId && (u.role === 'colaborador' || u.id === user.id),
      )
    }
    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          u.department.toLowerCase().includes(q) ||
          u.jobTitle.toLowerCase().includes(q),
      )
    }
    return list
  }, [data.users, user, query])

  const selected = data.users.find((u) => u.id === selectedId) ?? null
  const canEditSchedule =
    selected != null &&
    (user.role === 'super_admin' ||
      (user.role === 'gestor' && selected.companyId === user.companyId))

  const todayEntries = data.timeEntries.filter(
    (t) => localDayKey(t.occurredAt) === localTodayKey(),
  )

  function startEditing(person: User) {
    setSelectedId(person.id)
    const draft: Record<string, string> = {}
    for (const day of weekOrder) {
      const shift = person.weeklySchedule[day]
      draft[`${day}-in`] = shift?.[0] ?? ''
      draft[`${day}-out`] = shift?.[1] ?? ''
    }
    setScheduleDraft(draft)
  }

  function saveSchedule() {
    if (!selected) return
    const schedule: User['weeklySchedule'] = {}
    for (const day of weekOrder) {
      const inn = (scheduleDraft[`${day}-in`] ?? '').trim()
      const out = (scheduleDraft[`${day}-out`] ?? '').trim()
      if (/^\d{2}:\d{2}$/.test(inn) && /^\d{2}:\d{2}$/.test(out)) {
        schedule[day] = [inn, out]
      }
    }
    store.updateSchedule(selected.id, schedule)
    setSelectedId(null)
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Equipes</h1>
        <p className="mt-1 text-sm text-slate-500">
          Diretório, quadro de horários e saldos de férias.
        </p>
      </header>

      <div className="card p-5">
        <label htmlFor="team-search" className="sr-only">
          Buscar pessoa
        </label>
        <input
          id="team-search"
          type="search"
          className="input"
          placeholder="Buscar por nome, área ou cargo…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <ul className="mt-4 divide-y divide-slate-100">
          {people.map((person) => {
            const atRisk = data.pdis.some((p) => p.employeeId === person.id && p.status === 'atrasado')
            const hoursToday = workedHours(todayEntries.filter((t) => t.employeeId === person.id))
            return (
              <li key={person.id} className="flex flex-wrap items-center gap-4 py-4">
                <Avatar name={person.name} color={person.avatarColor} size={44} photoUrl={person.photoDataUrl} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {person.name}
                    {person.id === user.id && (
                      <span className="badge ml-2 bg-primary-50 text-primary-700">você</span>
                    )}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {person.jobTitle} · {person.department}
                  </p>
                </div>
                <div className="hidden shrink-0 text-right sm:block">
                  <p className="text-xs text-slate-400">Desde {formatDate(person.admissionDate)}</p>
                  <StatusBadge tone={person.role === 'super_admin' ? 'primary' : 'neutral'}>
                    {roleLabels[person.role]}
                  </StatusBadge>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs font-semibold text-slate-700">{person.vacationBalanceDays} dias</p>
                  <p className="text-[11px] text-slate-400">saldo férias</p>
                </div>
                <StatusBadge tone={hoursToday > 0 ? 'teal' : 'neutral'}>
                  {hoursToday > 0 ? `${hoursToday}h hoje` : 'sem ponto hoje'}
                </StatusBadge>
                <StatusBadge tone={atRisk ? 'rose' : 'teal'}>{atRisk ? 'Atenção' : 'Em dia'}</StatusBadge>
                <button
                  type="button"
                  className="btn-secondary px-3 py-1.5 text-xs"
                  onClick={() => (selectedId === person.id ? setSelectedId(null) : startEditing(person))}
                >
                  {selectedId === person.id ? 'Fechar' : 'Horários'}
                </button>
              </li>
            )
          })}
          {people.length === 0 && (
            <li className="py-8 text-center text-sm text-slate-500">Nenhuma pessoa encontrada.</li>
          )}
        </ul>
      </div>

      {selected && (
        <SectionCard
          title={`Quadro de horários — ${selected.name}`}
          action={
            <StatusBadge tone="primary">
              {canEditSchedule ? 'você pode editar' : 'somente leitura'}
            </StatusBadge>
          }
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {weekOrder.map((day) => {
              const shift = selected.weeklySchedule[day]
              return (
                <div key={day} className="rounded-xl border border-slate-100 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {weekDayShort[day]}
                  </p>
                  {canEditSchedule ? (
                    <div className="mt-2 space-y-1.5">
                      <input
                        type="time"
                        className="input px-2 py-1.5 text-xs"
                        value={scheduleDraft[`${day}-in`] ?? ''}
                        onChange={(e) => setScheduleDraft((d) => ({ ...d, [`${day}-in`]: e.target.value }))}
                        aria-label={`${weekDayLabels[day]} entrada`}
                      />
                      <input
                        type="time"
                        className="input px-2 py-1.5 text-xs"
                        value={scheduleDraft[`${day}-out`] ?? ''}
                        onChange={(e) => setScheduleDraft((d) => ({ ...d, [`${day}-out`]: e.target.value }))}
                        aria-label={`${weekDayLabels[day]} saída`}
                      />
                    </div>
                  ) : (
                    <p className="mt-2 text-sm font-medium text-slate-700">
                      {shift ? `${shift[0]} – ${shift[1]}` : 'Folga'}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
          {canEditSchedule && (
            <div className="mt-4 flex gap-2">
              <button type="button" className="btn-primary" onClick={saveSchedule}>
                Salvar quadro
              </button>
              <button type="button" className="btn-secondary" onClick={() => setSelectedId(null)}>
                Cancelar
              </button>
            </div>
          )}
        </SectionCard>
      )}

      <SectionCard title="Resumo rápido">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <SummaryTile label="Pessoas" value={people.length} />
          <SummaryTile label="PDIs ativos" value={data.pdis.filter((p) => p.status !== 'concluido').length} />
          <SummaryTile label="Férias pendentes" value={data.vacations.filter((v) => v.status === 'pendente').length} />
          <SummaryTile label="Feedbacks trocados" value={data.feedbacks.length} />
        </div>
      </SectionCard>
    </div>
  )
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  )
}
