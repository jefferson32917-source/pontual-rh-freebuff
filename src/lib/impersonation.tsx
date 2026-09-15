import { createContext, useCallback, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import type { User } from '../types'

interface ImpersonationState {
  /** Usuário real logado (sempre o Super Admin durante impersonation) */
  realUser: User | null
  /** Usuário "atuando como" */
  actingAs: User | null
}

interface ImpersonationContextValue extends ImpersonationState {
  start: (real: User, target: User) => void
  stop: () => void
  /** Se verdadeiro, a UI deve mostrar o banner de auditoria */
  isImpersonating: boolean
}

const ImpersonationContext = createContext<ImpersonationContextValue | null>(null)

const IMPERSONATION_KEY = 'pontual.impersonation'

export function ImpersonationProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ImpersonationState>(() => {
    try {
      const raw = sessionStorage.getItem(IMPERSONATION_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as ImpersonationState
        if (parsed.realUser && parsed.actingAs) return parsed
      }
    } catch {
      // ignore
    }
    return { realUser: null, actingAs: null }
  })

  const start = useCallback((real: User, target: User) => {
    const next = { realUser: real, actingAs: target }
    setState(next)
    try {
      sessionStorage.setItem(IMPERSONATION_KEY, JSON.stringify(next))
    } catch {
      // ignore
    }
  }, [])

  const stop = useCallback(() => {
    setState({ realUser: null, actingAs: null })
    sessionStorage.removeItem(IMPERSONATION_KEY)
  }, [])

  const value: ImpersonationContextValue = {
    ...state,
    start,
    stop,
    isImpersonating: state.actingAs != null,
  }

  return <ImpersonationContext.Provider value={value}>{children}</ImpersonationContext.Provider>
}

export function useImpersonation(): ImpersonationContextValue {
  const ctx = useContext(ImpersonationContext)
  if (!ctx) throw new Error('useImpersonation deve ser usado dentro de ImpersonationProvider')
  return ctx
}
