import { vacancyStatusLabels } from '../lib/format'
import { SectionCard, StatCard, StatusBadge, EmptyState } from '../components/ui'
import type { HrStore } from '../lib/store'

export default function Vacancies({ store }: { store: HrStore }) {
  const { data } = store
  const open = data.vacancies.filter((v) => v.status === 'aberta').length
  const inProcess = data.vacancies.filter((v) => v.status === 'em_processo').length
  const total = data.vacancies.reduce((acc, v) => acc + v.candidates, 0)

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Recrutamento</h1>
        <p className="mt-1 text-sm text-slate-500">Acompanhe vagas e candidatos no funil.</p>
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Vagas abertas" value={open} hint="publicadas" tone="primary" />
        <StatCard label="Em processo" value={inProcess} hint="entrevistas em curso" tone="teal" />
        <StatCard label="Candidatos" value={total} hint="volume total" tone="amber" />
      </div>

      <SectionCard title="Todas as vagas">
        {data.vacancies.length === 0 ? (
          <EmptyState message="Nenhuma vaga cadastrada." />
        ) : (
          <ul className="space-y-3">
            {data.vacancies.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 p-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{v.title}</p>
                  <p className="text-xs text-slate-500">
                    {v.department} · aberta em {v.openedAt}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-primary-700">{v.candidates} candidatos</span>
                  <StatusBadge
                    tone={v.status === 'aberta' ? 'primary' : v.status === 'em_processo' ? 'teal' : 'neutral'}
                  >
                    {vacancyStatusLabels[v.status]}
                  </StatusBadge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  )
}
