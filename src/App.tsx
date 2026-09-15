import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import type { Role, User } from './types'
import { getAuthUser, clearSession, getSession, setSession, logout as authLogout } from './lib/auth'
import { useHrData } from './lib/store'
import { ImpersonationProvider, useImpersonation } from './lib/impersonation'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Companies from './pages/Companies'
import UserAdmin from './pages/UserAdmin'
import Profile from './pages/Profile'
import Payroll from './pages/Payroll'
import MyPayrolls from './pages/MyPayrolls'
import Vacations from './pages/Vacations'
import Timesheet from './pages/Timesheet'
import Requests from './pages/Requests'
import Development from './pages/Development'
import Team from './pages/Team'

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
  useEffect(() => {
    let alive = true
    void getAuthUser().then((u) => {
      if (!alive) return
      setAuthUser(u)
      setAuthReady(true)
    })
    return () => {
      alive = false
    }
  }, [sessionTick])

  // ao autenticar, recarrega os dados COM a sessão ativa (RLS passa a aplicar)
  useEffect(() => {
    if (authUser) void store.reload()
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
    clearSession()
    void authLogout()
    impersonation.stop()
    setAuthUser(null)
    setSessionTick((t) => t + 1)
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

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <img src="/logo.svg" alt="Pontual RH Super" className="mx-auto h-10 w-auto" />
          <p className="mt-4 text-sm text-slate-500">Carregando…</p>
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
  )
}

export default function App() {
  return (
    <ImpersonationProvider>
      <AppRoutes />
    </ImpersonationProvider>
  )
}
