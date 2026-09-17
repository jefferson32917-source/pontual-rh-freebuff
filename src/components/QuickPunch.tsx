import { useEffect, useState } from 'react'
import type { HrStore } from '../lib/store'
import type { TimeEntryType, User } from '../types'
import { formatTime, localDayKey, timeEntryLabels, workedHours } from '../lib/format'
import { useGeoConsent } from '../lib/geo'
import { SectionCard } from './ui'

const entryOrder: TimeEntryType[] = ['entrada', 'saida_almoco', 'volta_almoco', 'saida']

/**
 * Relógio de ponto rápido para o painel inicial: relógio ao vivo, próxima
 * batida, botão grande de bater ponto (com geolocalização) e as batidas
 * de hoje com opção de estorno. Mesma lógica da aba Ponto, em formato
 * compacto — praticidade sem abrir outra tela.
 */
export default function QuickPunch({ user, store }: { user: User; store: HrStore }) {
  const { data } = store
  const [now, setNow] = useState(() => new Date())
  const [geoBusy, setGeoBusy] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)

  const geo = useGeoConsent(user.id)

  // relógio ao vivo (atualiza a cada segundo)
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(t)
  }, [])

  const today = localDayKey(now.toISOString())
  const todayEntries = data.timeEntries
    .filter((t) => t.employeeId === user.id && localDayKey(t.occurredAt) === today)
    .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime())
  const nextType: TimeEntryType = entryOrder[todayEntries.length % entryOrder.length] ?? 'entrada'
  const hoursToday = workedHours(todayEntries)
  const canPunch = todayEntries.length === 0 || todayEntries[todayEntries.length - 1]!.type !== 'saida'

  async function punch() {
    setGeoBusy(true)
    setFlash(null)
    try {
      let loc = geo.status === 'granted' ? await geo.capture() : await geo.requestConsent()
      if (geo.status !== 'granted' && !loc) {
        setFlash('Para registrar o ponto, é necessário permitir a localização.')
        return
      }
      store.punchNext(user.id, new Date(), loc ?? undefined)
      setFlash(`✓ ${timeEntryLabels[nextType]} registrada às ${formatTime(new Date().toISOString())}`)
    } catch (e) {
      setFlash(e instanceof Error ? e.message : 'Falha ao registrar a batida.')
    } finally {
      setGeoBusy(false)
    }
  }

  return (
    <SectionCard
      title="Ponto de hoje"
      action={
        <span className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
          {hoursToday}h registradas hoje
        </span>
      }
    >
      <div className="text-center">
        <p className="text-4xl font-bold tabular-nums text-slate-900">{formatTime(now.toISOString())}</p>
        <p className="mt-1 text-xs text-slate-500">
          Próxima batida: <strong>{timeEntryLabels[nextType]}</strong>
        </p>
        <button
          type="button"
          className={`mt-4 w-full py-3 text-base font-semibold text-white transition-colors ${
            canPunch ? 'btn-primary' : 'btn-secondary cursor-not-allowed opacity-60'
          }`}
          onClick={punch}
          disabled={!canPunch || geoBusy}
        >
          {geoBusy
            ? '📍 Obtendo localização…'
            : canPunch
              ? `⏱ Bater ponto — ${timeEntryLabels[nextType]}`
              : '✓ Ciclo do dia completo'}
        </button>
        {flash && (
          <p
            role="status"
            className={`mt-3 rounded-xl px-3 py-2 text-xs font-medium ${
              flash.startsWith('✓') ? 'bg-teal-50 text-teal-700' : 'bg-rose-50 text-rose-700'
            }`}
          >
            {flash}
          </p>
        )}
        {geo.status !== 'granted' && !flash && (
          <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-800">
            {geo.error ?? 'A primeira batida pede permissão de localização (fica visível apenas para seu gestor).'}
          </p>
        )}
        {todayEntries.length > 0 && (
          <ul className="mt-4 space-y-1.5 text-left">
            {todayEntries.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5">
                <span className="text-xs font-medium text-slate-600">{timeEntryLabels[entry.type]}</span>
                <span className="flex items-center gap-2">
                  <span className="text-xs font-semibold tabular-nums text-slate-900">{formatTime(entry.occurredAt)}</span>
                  <button
                    type="button"
                    className="text-[11px] font-semibold text-rose-500 hover:text-rose-700"
                    onClick={() => store.deleteTimeEntry(entry.id)}
                    title="Estornar batida"
                  >
                    estornar
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SectionCard>
  )
}
