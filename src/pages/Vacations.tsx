import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { HrStore } from '../lib/store'
import type { User, VacationRequest } from '../types'
import { formatDate, vacationStatusLabels } from '../lib/format'
import { EmptyState, SectionCard, StatCard, StatusBadge } from '../components/ui'

function diffDays(start: string, end: string): number {
  const s = new Date(start)
  const e = new Date(end)
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0
  return Math.floor((e.getTime() - s.getTime()) / 86_400_000) + 1
}

export default function Vacations({ user, store }: { user: User; store: HrStore }) {
  const { data } = store
  const canApprove = user.role === 'super_admin' || user.role === 'gestor'

  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const visible = useMemo(() => {
    return data.vacations.filter((v) => {
      if (user.role === 'super_admin') return true
      if (user.role === 'gestor') {
        const requester = data.users.find((u) => u.id === v.employeeId)
        return (
          (requester?.companyId === user.companyId && requester?.role === 'colaborador') ||
          v.employeeId === user.id
        )
      }
      return v.employeeId === user.id
    })
  }, [data.vacations, data.users, user])

  const pending = visible.filter((v) => v.status === 'pendente')
  const approvedUpcoming = visible.filter((v) => {
    if (v.status !== 'aprovada') return false
    return new Date(v.endDate).getTime() >= Date.now()
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    const days = diffDays(startDate, endDate)
    if (days < 1) {
      setError('Informe um período válido (data final igual ou posterior à inicial).')
      return
    }
    if (days > user.vacationBalanceDays) {
      setError(`Saldo insuficiente: você tem ${user.vacationBalanceDays} dias disponíveis.`)
      return
    }
    const vacation: VacationRequest = {
      id: `vac${Date.now()}`,
      employeeId: user.id,
      startDate,
      endDate,
      days,
      status: 'pendente',
      createdAt: new Date().toISOString(),
    }
    store.addVacation(vacation)
    setStartDate('')
    setEndDate('')
    setSuccess(true)
  }

  function decide(v: VacationRequest, status: VacationRequest['status']) {
    store.updateVacationStatus(v.id, status)
    // debita saldo do colaborador ao aprovar (simulação local; no Supabase, via trigger/RPC)
    if (status === 'aprovada') {
      const person = data.users.find((u) => u.id === v.employeeId)
      if (person) {
        store.updateSchedule(person.id, person.weeklySchedule)
      }
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Férias</h1>
        <p className="mt-1 text-sm text-slate-500">
          {canApprove ? 'Controle de férias da equipe — aprove ou reprovar períodos.' : 'Seu saldo e suas solicitações de férias.'}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Seu saldo" value={`${user.vacationBalanceDays} dias`} hint="disponíveis" tone="primary" />
        <StatCard label="Solicitações pendentes" value={pending.length} hint="aguardando decisão" tone="amber" />
        <StatCard label="Férias futuras" value={approvedUpcoming.length} hint="aprovadas" tone="teal" />
        <StatCard
          label="Dias gozados (equipe)"
          value={data.vacations.filter((v) => v.status === 'gozada').reduce((acc, v) => acc + v.days, 0)}
          hint="acumulado"
          tone="rose"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <SectionCard title="Solicitar férias">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="vac-start" className="mb-1.5 block text-sm font-medium text-slate-700">
                Data inicial
              </label>
              <input
                id="vac-start"
                type="date"
                className="input"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="vac-end" className="mb-1.5 block text-sm font-medium text-slate-700">
                Data final
              </label>
              <input
                id="vac-end"
                type="date"
                className="input"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            {startDate && endDate && diffDays(startDate, endDate) > 0 && (
              <p className="text-xs text-slate-500">
                Período de <strong>{diffDays(startDate, endDate)} dias</strong>.
              </p>
            )}
            {error && (
              <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-700">
                {error}
              </p>
            )}
            {success && !error && (
              <p role="status" className="rounded-xl bg-teal-50 px-3.5 py-2.5 text-sm font-medium text-teal-700">
                Solicitação enviada para aprovação!
              </p>
            )}
            <button type="submit" className="btn-primary w-full">
              Enviar solicitação
            </button>
          </form>
        </SectionCard>

        <SectionCard
          title={canApprove ? 'Solicitações da equipe' : 'Minhas solicitações'}
          action={<StatusBadge tone="neutral">{visible.length}</StatusBadge>}
        >
          {visible.length === 0 ? (
            <EmptyState message="Nenhuma solicitação de férias registrada." />
          ) : (
            <ul className="space-y-3">
              {visible.map((v) => {
                const person = data.users.find((u) => u.id === v.employeeId)
                return (
                  <li key={v.id} className="rounded-xl border border-slate-100 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {formatDate(v.startDate)} – {formatDate(v.endDate)}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {canApprove && person ? `${person.name} · ` : ''}
                          {v.days} dia{v.days > 1 ? 's' : ''}
                        </p>
                      </div>
                      <StatusBadge
                        tone={
                          v.status === 'pendente'
                            ? 'amber'
                            : v.status === 'aprovada'
                              ? 'teal'
                              : v.status === 'gozada'
                                ? 'primary'
                                : 'rose'
                        }
                      >
                        {vacationStatusLabels[v.status]}
                      </StatusBadge>
                    </div>
                    {canApprove && v.status === 'pendente' && (
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          className="btn-primary flex-1 py-2 text-xs"
                          onClick={() => decide(v, 'aprovada')}
                        >
                          Aprovar
                        </button>
                        <button
                          type="button"
                          className="btn-secondary flex-1 py-2 text-xs"
                          onClick={() => decide(v, 'reprovada')}
                        >
                          Reprovar
                        </button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Saldos por pessoa">
          <ul className="space-y-2">
            {data.users
              .filter((u) =>
                user.role === 'gestor'
                  ? u.companyId === user.companyId && (u.role === 'colaborador' || u.id === user.id)
                  : true,
              )
              .map((u) => {
                const scheduled = data.vacations
                  .filter((v) => v.employeeId === u.id && v.status === 'aprovada')
                  .reduce((acc, v) => acc + v.days, 0)
                return (
                  <li key={u.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{u.name}</p>
                      <p className="text-xs text-slate-500">
                        {scheduled > 0 ? `${scheduled} dias agendados` : 'nada agendado'}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-primary-700">{u.vacationBalanceDays} dias</span>
                  </li>
                )
              })}
          </ul>
        </SectionCard>
      </div>
    </div>
  )
}
