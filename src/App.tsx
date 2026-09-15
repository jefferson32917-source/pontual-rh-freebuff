import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import type { Role, User } from './types'
import { getAuthUser, clearSession, getSession, setSession, logout as authLogout } from './lib/auth'
import { getSupabase } from './lib/supabase'
import { useHrData } from './lib/store'
import { ImpersonationProvider, useImpersonation } from './lib/impersonation'
import Layout from './components/Layout'
import Login from './pages/Login'

/**
 * Code-splitting: cada página vira um chunk JS carregado sob demanda
 * (lazy loading por rota). Login permanece eager por ser a primeira tela.
 */
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Companies = lazy(() => import('./pages/Companies'))
const UserAdmin = lazy(() => import('./pages/UserAdmin'))
const Profile = lazy(() => import('./pages/Profile'))
const Payroll = lazy(() => import('./pages/Payroll'))
const MyPayrolls = lazy(() => import('./pages/MyPayrolls'))
const Vacations = lazy(() => import('./pages/Vacations'))
const Timesheet = lazy(() => import('./pages/Timesheet'))
const Requests = lazy(() => import('./pages/Requests'))
const Development = lazy(() => import('./pages/Development'))
const Team = lazy(() => import('./pages/Team'))

/** Rotas por papel — Super Admin não tem painel próprio: só administração. */
const roleRoutes: Record<Role, string[]> = {
  super_admin: ['/empresas', '/admin', '/usuarios', '/perfil'],
  gestor: ['/painel', '/usuarios', '/ferias', '/ponto', '/folha', '/requisicoes', '/perfil'],
  colaborador: ['/painel', '/ponto', '/ferias', '/requisicoes', '/meus-holerites', '/meu-desenvolvimento', '/perfil'],
}

function AppRoutes() {
  const store = useHrData()
  const { data } = store
  const impersonation = useImpersonation()

  const [sessionTick, setSessionTick] = useState(0)
  const [authReady, setAuthReady] = useState(false)
  const [authUser, setAuthUser] = useState<User | null>(null)

  // resolve a sessão real do Supabase Auth na carga (e a cada refreshUser)
  // localGetSession evita uma viagem de rede quando não há sessão salva
  useEffect(() => {
    let alive = true
    const local = getSupabase().auth.getSession()
    void local.then(({ data: localData }: { data: { session: unknown } }) => {
      if (!alive) return
      if (!localData.session) {
        // sem sessão: nem chama a rede
        setAuthUser(null)
        setAuthReady(true)
        return
      }
      void getAuthUser().then((u) => {
        if (!alive) return
        setAuthUser(u)
        setAuthReady(true)
      })
    })
    return () => {
      alive = false
    }
  }, [sessionTick])

  // ao autenticar, recarrega os dados COM a sessão ativa (RLS passa a aplicar).
  // reload() já roda no mount; aqui só reexecuta se o usuário mudou de verdade.
  const lastLoadedUserId = useRef<string | null>(null)
  useEffect(() => {
    if (authUser && lastLoadedUserId.current !== authUser.id) {
      lastLoadedUserId.current = authUser.id
      void store.reload()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser?.id])

  // fallback compat: sessão antiga gravada localmente
  useEffect(() => {
    if (authUser) {
      const session = getSession()
      if (!session || session.userId !== authUser.id) {
        setSession({ userId: authUser.id, role: authUser.role, issuedAt: new Date().toISOString() })
      }
    }
  }, [authUser])

  const loggedUser = useMemo(() => {
    void sessionTick
    if (authUser) return data.users.find((u) => u.id === authUser.id && u.active) ?? authUser
    const session = getSession()
    if (!session) return null
    return data.users.find((u) => u.id === session.userId && u.active) ?? null
  }, [data.users, sessionTick, authUser])

  const location = useLocation()

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'pontual.session.v2') setSessionTick((t) => t + 1)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const logout = useCallback(() => {
    // Limpa o estado local SINCRONAMENTE (a UI sai imediatamente) e só
    // depois de o signOut terminar re-resolve a sessão. Re-resolver antes
    // causava o bug da "sessão fantasma": o effect lia a sessão ainda
    // existente no storage e relogava o usuário (tela pisca e volta).
    clearSession()
    impersonation.stop()
    setAuthUser(null)
    void authLogout().then(() => setSessionTick((t) => t + 1))
  }, [impersonation])

  const refreshUser = useCallback(() => {
    setSessionTick((t) => t + 1)
  }, [])

  /** Usuário efetivo: quem "está no comando" da UI agora. */
  const effectiveUser: User | null = impersonation.actingAs ?? loggedUser

  const allowed = useMemo(() => (effectiveUser ? roleRoutes[effectiveUser.role] : []), [effectiveUser])

  function Guard({ children }: { children: ReactNode }) {
    if (!loggedUser) return <Navigate to="/login" replace />
    if (!effectiveUser) return <Navigate to="/empresas" replace />
    if (!allowed.includes(location.pathname)) {
      // Super Admin (sem impersonation) só tem rotas administrativas
      return <Navigate to={allowed[0] ?? '/empresas'} replace />
    }
    return <>{children}</>
  }

  function requireUser(children: ReactNode): ReactNode {
    if (!loggedUser) return <Navigate to="/login" replace />
    return <Guard>{children}</Guard>
  }

  // Pré-carrega os chunks das páginas quando o browser está ocioso:
  // a carga inicial continua leve, mas a navegação fica instantânea.
  useEffect(() => {
    if (!loggedUser) return
    const prefetch = () => {
      void import('./pages/Dashboard')
      void import('./pages/Companies')
      void import('./pages/UserAdmin')
      void import('./pages/Profile')
      void import('./pages/Payroll')
      void import('./pages/MyPayrolls')
      void import('./pages/Vacations')
      void import('./pages/Timesheet')
      void import('./pages/Requests')
      void import('./pages/Development')
      void import('./pages/Team')
    }
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void) => number
      cancelIdleCallback?: (id: number) => void
    }
    const id = w.requestIdleCallback ? w.requestIdleCallback(prefetch) : window.setTimeout(prefetch, 2000)
    return () => {
      if (w.cancelIdleCallback) w.cancelIdleCallback(id)
      else window.clearTimeout(id)
    }
  }, [loggedUser?.id])

  if (!authReady || store.loading || store.heavyLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <img src="/logo.svg" alt="Pontual RH Super" className="mx-auto h-10 w-auto" />
          <div className="mt-4 flex items-center justify-center gap-3 text-sm text-slate-500">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-primary-600" aria-hidden="true" />
            Carregando…
          </div>
        </div>
      </div>
    )
  }

  if (store.error && !store.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="card max-w-md p-6 text-center">
          <h1 className="text-lg font-bold text-slate-900">Não foi possível conectar</h1>
          <p className="mt-2 text-sm text-slate-600">{store.error}</p>
          <button type="button" className="btn-primary mt-4" onClick={() => { store.reload(); setSessionTick((t) => t + 1) }}>
            Tentar novamente
          </button>
        </div>
      </div>
    )
  }

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
          <div className="flex items-center gap-3 text-sm text-slate-500">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-primary-600" aria-hidden="true" />
            Carregando…
          </div>
        </div>
      }
    >
    <Routes>
      <Route
        path="/login"
        element={loggedUser ? <Navigate to={loggedUser.role === 'super_admin' ? '/empresas' : '/painel'} replace /> : <Login onLogin={refreshUser} />}
      />
      <Route element={<Layout user={effectiveUser} loggedUser={loggedUser} onLogout={logout} />}>
        {/* Super Admin: administração */}
        <Route path="/admin" element={requireUser(loggedUser?.role === 'super_admin' ? <UserAdmin user={loggedUser} store={store} /> : null)} />
        <Route
          path="/empresas"
          element={requireUser(loggedUser?.role === 'super_admin' ? <Companies store={store} /> : null)}
        />
        <Route
          path="/usuarios"
          element={requireUser(effectiveUser && (effectiveUser.role === 'super_admin' || effectiveUser.role === 'gestor') ? <UserAdmin user={effectiveUser} store={store} /> : null)}
        />
        {/* Painéis do usuário efetivo (gestor/colaborador ou SA impersonando) */}
        <Route path="/painel" element={requireUser(effectiveUser && effectiveUser.role !== 'super_admin' ? <Dashboard user={effectiveUser} store={store} /> : null)} />
        <Route path="/folha" element={requireUser(effectiveUser && effectiveUser.role === 'gestor' ? <Payroll user={effectiveUser} store={store} /> : null)} />
        <Route path="/meus-holerites" element={requireUser(effectiveUser && effectiveUser.role === 'colaborador' ? <MyPayrolls user={effectiveUser} store={store} /> : null)} />
        <Route path="/perfil" element={requireUser(effectiveUser ? <Profile user={effectiveUser} store={store} onUserUpdated={refreshUser} /> : null)} />
        <Route path="/ferias" element={requireUser(effectiveUser ? <Vacations user={effectiveUser} store={store} /> : null)} />
        <Route path="/ponto" element={requireUser(effectiveUser ? <Timesheet user={effectiveUser} store={store} /> : null)} />
        <Route path="/requisicoes" element={requireUser(effectiveUser ? <Requests user={effectiveUser} store={store} /> : null)} />
        <Route
          path="/meu-desenvolvimento"
          element={requireUser(effectiveUser ? <Development user={effectiveUser} store={store} /> : null)}
        />
        <Route
          path="/equipes"
          element={requireUser(effectiveUser && (effectiveUser.role === 'gestor' || effectiveUser.role === 'super_admin') ? <Team user={effectiveUser} store={store} /> : null)}
        />
      </Route>
      <Route path="*" element={<Navigate to={loggedUser ? (loggedUser.role === 'super_admin' ? '/empresas' : '/painel') : '/login'} replace />} />
    </Routes>
    </Suspense>
  )
}

export default function App() {
  return (
    <ImpersonationProvider>
      <AppRoutes />
    </ImpersonationProvider>
  )
}
