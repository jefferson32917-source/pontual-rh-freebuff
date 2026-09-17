import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { initials } from '../lib/format'
import { getCachedAvatar } from '../lib/avatarCache'

/**
 * Avatar com stale-while-revalidate:
 * 1. Tenta o cache local (síncrono) — foto aparece imediatamente, sem rede.
 * 2. Se o prop photoUrl chegar depois (dados revalidando), atualiza por cima.
 * 3. Se a imagem falhar ao carregar (URL expirada, 404), cai para as
 *    iniciais — fallback real, nunca um <img> quebrado.
 */
export function Avatar({ name, color, size = 40, photoUrl, userId }: { name: string; color: string; size?: number; photoUrl?: string; userId?: string }) {
  // estado inicial: prop > cache local (leitura síncrona, custo ~0ms)
  const cacheKey = userId ?? name
  const [resolved, setResolved] = useState<string | undefined>(() => photoUrl ?? getCachedAvatar(cacheKey))
  const [failed, setFailed] = useState(false)

  // re-resolve quando o prop muda (dados do banco chegando/atualizando)
  const [lastKey, setLastKey] = useState<string | null>(null)
  if ((photoUrl ?? null) !== (lastKey ?? null)) {
    setLastKey(photoUrl ?? null)
    setResolved(photoUrl ?? undefined)
    setFailed(false)
  }

  // se não veio no prop, consulta o cache uma única vez (leve, já memoizado no módulo)
  useEffect(() => {
    if (!resolved && !failed) {
      const fromCache = getCachedAvatar(cacheKey)
      if (fromCache) setResolved(fromCache)
    }
  }, [resolved, failed, cacheKey])

  if (resolved && !failed) {
    return (
      <img
        src={resolved}
        alt={`Foto de ${name}`}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
        onError={() => setFailed(true)}
      />
    )
  }
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ backgroundColor: color, width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  )
}

export function SectionCard({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="card p-5">
      <header className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  )
}

export function StatCard({
  label,
  value,
  hint,
  tone = 'primary',
}: {
  label: string
  value: string | number
  hint?: string
  tone?: 'primary' | 'teal' | 'amber' | 'rose'
}) {
  const tones: Record<string, string> = {
    primary: 'bg-primary-50 text-primary-700',
    teal: 'bg-teal-50 text-teal-600',
    amber: 'bg-amber-50 text-amber-600',
    rose: 'bg-rose-50 text-rose-600',
  }
  return (
    <div className="card relative overflow-hidden p-5">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage: 'url(/pattern.svg)',
          backgroundSize: '240px',
          backgroundRepeat: 'repeat',
        }}
        aria-hidden="true"
      />
      <div className="relative">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
        {hint && (
          <span className={`badge mt-3 ${tones[tone]}`}>{hint}</span>
        )}
      </div>
    </div>
  )
}

const badgeTones: Record<string, string> = {
  neutral: 'bg-slate-100 text-slate-600',
  primary: 'bg-primary-50 text-primary-700',
  teal: 'bg-teal-50 text-teal-600',
  amber: 'bg-amber-50 text-amber-700',
  rose: 'bg-rose-50 text-rose-700',
}

export function StatusBadge({ tone, children }: { tone: keyof typeof badgeTones; children: ReactNode }) {
  return <span className={`badge ${badgeTones[tone]}`}>{children}</span>
}

export function ProgressBar({ value, tone = 'primary' }: { value: number; tone?: 'primary' | 'teal' }) {
  const clamped = Math.min(100, Math.max(0, Math.round(value)))
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className={`h-full rounded-full transition-all ${tone === 'teal' ? 'bg-teal-500' : 'bg-primary-600'}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
      {message}
    </div>
  )
}
