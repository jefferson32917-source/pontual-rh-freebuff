import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import type { Role, User } from './types'
import { getAuthUser, clearSession, getSession, setSession, logout as authLogout } from './lib/auth'
import { clearCoreCache } from './lib/api'
import { markStart, markEnd } from './lib/perf'
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

  // marca o início do boot para a instrumentação de performance
  const bootMarked = useRef(false)
  if (!bootMarked.current) {
    bootMarked.current = true
    markStart('boot')
  }

  const [sessionTick, setSessionTick] = useState(0)
  const [authReady, setAuthReady] = useState(false)
  const [authUser, setAuthUser] = useState<User | null>(null)

  // refs "latest value" para ler estado dentro de effects sem depender deles
  const storeRef = useRef(store)
  storeRef.current = store
  const authUserRef = useRef<User | null>(null)
  authUserRef.current = authUser
  const lastLoadedUserId = useRef<string | null>(null)

  // resolve a sessão real do Supabase Auth na carga (e a cada refreshUser).
  // PERFIL DE PERFORMANCE: a resolução da sessão e a carga de dados rodam EM
  // PARALELO (a sessão já vive no storage e o cliente Supabase a usa), e o
  // login recém-concluído NÃO re-consulta a rede — o usuário já chega pronto.
  useEffect(() => {
    let alive = true
    void getSupabase().auth.getSession().then(({ data: localData }: { data: { session: unknown } }) => {
      if (!alive) return
      if (!localData.session) {
        // sem sessão: nem chama a rede
        setAuthUser(null)
        setAuthReady(true)
        return
      }
      // dispara a carga de dados já, em paralelo com a resolução do perfil
      if (lastLoadedUserId.current === null) {
        lastLoadedUserId.current = 'pending'
        void storeRef.current.reload()
      }
      // login recém-concluído já entregou o usuário — sem viagem de rede extra
      if (authUserRef.current) {
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

  // ao autenticar, carrega os dados COM a sessão ativa (RLS passa a aplicar).
  // Se a carga já foi disparada no boot paralelo ('pending'), não duplica.
  useEffect(() => {
    if (!authUser) return
    if (lastLoadedUserId.current === authUser.id) return
    const wasPending = lastLoadedUserId.current === 'pending'
    lastLoadedUserId.current = authUser.id
    if (!wasPending) void storeRef.current.reload()
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
    lastLoadedUserId.current = null // próximo login recarrega os dados
    clearCoreCache() // core não deve vazar entre contas
    void authLogout().then(() => setSessionTick((t) => t + 1))
  }, [impersonation])

  const refreshUser = useCallback((u?: User) => {
    // chamado pelo Login com o usuário já autenticado: resolve a sessão
    // localmente, sem nova viagem de rede (getAuthUser)
    if (u) setAuthUser(u)
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

  // Tela de carga: bloqueia até o CORE (empresas + usuários) chegar. Os dados
  // pesados têm uma tolerância de 2s — se demorarem mais, o app entra mesmo
  // assim e as listas preenchem em segundo plano (nunca travar >3s).
  // Sem sessão, o login aparece imediatamente.
  const [heavyGraceOver, setHeavyGraceOver] = useState(false)
  useEffect(() => {
    if (!store.heavyLoading) {
      setHeavyGraceOver(false)
      return
    }
    const t = window.setTimeout(() => setHeavyGraceOver(true), 2000)
    return () => window.clearTimeout(t)
  }, [store.heavyLoading])

  const booting =
    !authReady || (!!authUser && (store.loading || (store.heavyLoading && !heavyGraceOver)))

  // registra o tempo total do boot (do mount até a liberação da UI)
  const bootLogged = useRef(false)
  useEffect(() => {
    if (!booting && !bootLogged.current) {
      bootLogged.current = true
      markEnd('boot', 'boot', '— UI liberada')
    }
  }, [booting])

  if (booting) {
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
