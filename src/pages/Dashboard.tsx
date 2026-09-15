import type { HrStore } from '../lib/store'
import type { User } from '../types'
import RhDashboard from './dashboards/RhDashboard'
import GestorDashboard from './dashboards/GestorDashboard'
import ColaboradorDashboard from './dashboards/ColaboradorDashboard'

export default function Dashboard({ user, store }: { user: User; store: HrStore }) {
  switch (user.role) {
    case 'super_admin':
      return <RhDashboard user={user} store={store} />
    case 'gestor':
      return <GestorDashboard user={user} store={store} />
    case 'colaborador':
      return <ColaboradorDashboard user={user} store={store} />
  }
}
