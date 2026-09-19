import { useEffect } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import type { Role, User } from '../types'
import type { HrStore } from '../lib/store'
import { roleLabels } from '../lib/format'
import { Avatar } from './ui'
import { useImpersonation } from '../lib/impersonation'
import { preloadAvatars } from '../lib/avatarCache'
import { countPdiNews, markAllPdisSeen } from '../lib/pdiNotifications'

interface NavItem {
  to: string
  label: string
  icon: string
}

const iconPaths = {
  admin: 'M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3Z',
  empresas: 'M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01',
  usuarios: 'M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0ZM4 21a8 8 0 0 1 16 0',
  painel: 'M3 12h4l2-6 4 12 2-6h6',
  ferias: 'M8 2v4m8-4v4M3 10h18M5 6h14v15H5zM9 15l2 2 4-4',
  ponto: 'M12 8v4l3 3M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  requisicoes: 'M5 5h14v15H5zM8 9h8M8 13h8M8 17h5',
  desenvolvimentoTime: 'M4 19V9m6 10V5m6 14v-7m3-7 2-3 3 4',
  folha: 'M3 6h18v12H3zM3 10h18M7 15h4',
  desenvolvimento: 'M4 19V9m6 10V5m6 14v-7',
  perfil: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 9a8 8 0 0 1 16 0',
}

function navFor(role: Role): NavItem[] {
  if (role === 'super_admin') {
    return [
      { to: '/empresas', label: 'Empresas', icon: iconPaths.empresas },
      { to: '/admin', label: 'Administração', icon: iconPaths.admin },
      { to: '/perfil', label: 'Perfil', icon: iconPaths.perfil },
    ]
  }
  if (role === 'gestor') {
    return [
      { to: '/painel', label: 'Painel', icon: iconPaths.painel },
      { to: '/usuarios', label: 'Colaboradores', icon: iconPaths.usuarios },
      { to: '/ferias', label: 'Férias', icon: iconPaths.ferias },
      { to: '/ponto', label: 'Ponto', icon: iconPaths.ponto },
      { to: '/folha', label: 'Folha', icon: iconPaths.folha },
      { to: '/requisicoes', label: 'Requisições', icon: iconPaths.requisicoes },
      { to: '/desenvolvimento-time', label: 'Desenvolvimento', icon: iconPaths.desenvolvimentoTime },
      { to: '/perfil', label: 'Perfil', icon: iconPaths.perfil },
    ]
  }
  return [
    { to: '/painel', label: 'Painel', icon: iconPaths.painel },
    { to: '/ponto', label: 'Ponto', icon: iconPaths.ponto },
    { to: '/ferias', label: 'Férias', icon: iconPaths.ferias },
    { to: '/requisicoes', label: 'Requisições', icon: iconPaths.requisicoes },
    { to: '/meus-holerites', label: 'Holerites', icon: iconPaths.folha },
    { to: '/meu-desenvolvimento', label: 'Desenvolvimento', icon: iconPaths.desenvolvimento },
    { to: '/perfil', label: 'Perfil', icon: iconPaths.perfil },
  ]
}

export default function Layout({
  user,
  loggedUser,
  onLogout,
  store,
}: {
  user: User | null
  loggedUser: User | null
  onLogout: () => void
  store?: HrStore
}) {
  const navigate = useNavigate()
  const impersonation = useImpersonation()

  if (!user) return <Outlet />

  const items = navFor(user.role)

  /** Badge: PDIs do colaborador com comentário/metas novos do gestor. */
  const pdiNews =
    user.role === 'colaborador' && store
      ? countPdiNews(store.data.pdis, user.id)
      : 0
  const markDevSeen = () => {
    if (store && user.role === 'colaborador') markAllPdisSeen(store.data.pdis, user.id)
  }

  // Preload das fotos (idle): evita o flash "iniciais -> foto" ao abrir listas.
  // Prioriza o próprio usuário; as demais URLs vêm do cache (já hidratado
  // pela sincronização pós-carga do core).
  useEffect(() => {
    const urls = user.photoDataUrl?.startsWith('http') ? [user.photoDataUrl] : []
    const cancel = preloadAvatars(urls)
    return () => cancel?.()
  }, [user.id, user.photoDataUrl])

  function handleLogout() {
    onLogout()
    navigate('/login')
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Banner de auditoria durante impersonação */}
      {impersonation.isImpersonating && impersonation.realUser && (
        <div className="sticky top-0 z-30 bg-amber-400 px-4 py-2 text-center text-xs font-semibold text-amber-950">
          <span aria-hidden="true">⚠️ </span>
          Acesso administrativo: {impersonation.realUser.name} está atuando como{' '}
          <strong>
            {impersonation.actingAs?.name} ({roleLabels[impersonation.actingAs!.role]}
            {impersonation.actingAs?.matricula ? ` · ${impersonation.actingAs.matricula}` : ''})
          </strong>
          . Todas as ações são registradas para auditoria.{' '}
          <button
            type="button"
            className="ml-1 rounded-md bg-amber-950 px-2 py-0.5 text-[11px] font-bold text-amber-50 hover:bg-amber-900"
            onClick={() => {
              impersonation.stop()
              navigate('/empresas')
            }}
          >
            Sair do acesso
          </button>
        </div>
      )}

      <header className="sticky top-0 z-20 border-b border-slate-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <NavLink to={user.role === 'super_admin' ? '/empresas' : '/painel'} className="flex items-center" aria-label="Pontual RH Super — início">
            <img src="/logo.svg" alt="Pontual RH Super" className="h-9 w-auto" />
          </NavLink>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Navegação principal">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={item.to === '/meu-desenvolvimento' ? markDevSeen : undefined}
                className={({ isActive }) =>
                  `relative flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`
                }
              >
                <svg viewBox="0 0 24 24" style={{ width: 18, height: 18 }} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={item.icon} />
                </svg>
                {item.label}
                {item.to === '/meu-desenvolvimento' && pdiNews > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                    {pdiNews}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="hidden min-w-0 items-center gap-3 sm:flex">
            <div className="min-w-0 max-w-[180px] text-right">
              <p className="truncate text-sm font-semibold leading-tight text-slate-900">{user.name}</p>
              <p className="text-xs text-slate-500">
                {roleLabels[user.role]}
                {user.matricula ? ` · ${user.matricula}` : ''}
                {loggedUser && loggedUser.id !== user.id && (
                  <span className="font-semibold text-amber-600"> (via admin)</span>
                )}
              </p>
            </div>
            <NavLink to="/perfil" aria-label="Meu perfil">
              <Avatar name={user.name} color={user.avatarColor} size={36} photoUrl={user.photoDataUrl} userId={user.id} />
            </NavLink>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-rose-600"
              title="Encerrar sessão"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-24 pt-6 md:pb-10">
        <Outlet />
      </main>

      {/* mobile-first bottom navigation */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-100 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        aria-label="Navegação principal"
      >
        <div className="mx-auto flex max-w-xl items-stretch justify-start">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={item.to === '/meu-desenvolvimento' ? markDevSeen : undefined}
              className={({ isActive }) =>
                `relative flex min-w-[64px] flex-1 flex-col items-center gap-1 px-1 py-2.5 text-[10px] font-medium transition-colors ${
                  isActive ? 'text-primary-600' : 'text-slate-500'
                }`
              }
            >
              <svg viewBox="0 0 24 24" style={{ width: 20, height: 20 }} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={item.icon} />
              </svg>
              {item.label}
              {item.to === '/meu-desenvolvimento' && pdiNews > 0 && (
                <span className="absolute right-2 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
                  {pdiNews}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
