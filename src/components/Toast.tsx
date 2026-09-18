import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * Toasts de sucesso do sistema — aparecem no canto inferior direito e
 * somem sozinhos após 3 segundos. Uso: `toast.success('mensagem')`.
 * Funciona fora do React (store chama de callbacks) via singleton.
 */

export type ToastKind = 'success' | 'error'

interface ToastItem {
  id: number
  kind: ToastKind
  message: string
}

type Listener = (items: ToastItem[]) => void

let items: ToastItem[] = []
let nextId = 1
const listeners = new Set<Listener>()

function emit() {
  for (const l of listeners) l(items)
}

function push(kind: ToastKind, message: string) {
  const item = { id: nextId++, kind, message }
  items = [...items, item]
  emit()
  // desaparece sozinho após 3s
  window.setTimeout(() => {
    items = items.filter((t) => t.id !== item.id)
    emit()
  }, 3000)
}

export const toast = {
  success: (message: string) => push('success', message),
  error: (message: string) => push('error', message),
}

const ToastContext = createContext<typeof toast | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ToastItem[]>(items)
  const timers = useRef<number[]>([])

  useEffect(() => {
    const listener: Listener = (next) => setState(next)
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), [])

  const value = useCallback(() => toast, [])()
  void value

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-[calc(100vw-2.5rem)] max-w-sm flex-col gap-2"
      >
        {state.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`toast-enter pointer-events-auto flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${
              t.kind === 'success' ? 'bg-teal-600 text-white' : 'bg-rose-600 text-white'
            }`}
          >
            <span aria-hidden="true">{t.kind === 'success' ? '✓' : '⚠'}</span>
            <span className="min-w-0 flex-1">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): typeof toast {
  const ctx = useContext(ToastContext)
  return ctx ?? toast
}
