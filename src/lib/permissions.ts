import type { Role, User } from '../types'

export function isSuperAdmin(user: User | null | undefined): boolean {
  return user?.role === 'super_admin'
}

export function isManagerLevel(user: User | null | undefined): boolean {
  return user?.role === 'super_admin' || user?.role === 'gestor'
}

/** Usuários visíveis para `viewer` considerando o tenant. */
export function visibleUsers(viewer: User, users: User[]): User[] {
  if (viewer.role === 'super_admin') return users
  if (viewer.role === 'gestor') {
    return users.filter(
      (u) => u.companyId === viewer.companyId && (u.role === 'colaborador' || u.id === viewer.id),
    )
  }
  return users.filter((u) => u.id === viewer.id)
}

/** Pode `viewer` editar os dados completos de `target`? */
export function canEditUser(viewer: User, target: User): boolean {
  if (viewer.role === 'super_admin') return true
  if (viewer.role === 'gestor') {
    return target.companyId === viewer.companyId && target.role === 'colaborador'
  }
  return false
}

/** Pode `viewer` excluir `target`? (apenas SA) */
export function canDeleteUser(viewer: User, target: User): boolean {
  return viewer.role === 'super_admin' && target.role !== 'super_admin' && target.id !== viewer.id
}

/** Pode `viewer` criar usuários de papel `role`? */
export function canCreateRole(viewer: User, role: Role): boolean {
  if (viewer.role === 'super_admin') return role !== 'super_admin'
  if (viewer.role === 'gestor') return role === 'colaborador'
  return false
}

/** Este usuário é obrigado a bater ponto? (padrão: sim, exceto gestor/SA sem flag) */
export function punchRequired(u: User): boolean {
  return u.requiresPunch
}

/** A empresa tem o módulo de folha habilitado? */
export function payrollEnabledFor(company: { payrollEnabled?: boolean } | undefined): boolean {
  return company?.payrollEnabled !== false // default ligado (empresas antigas)
}

/** Campos que `viewer` pode alterar em `target`. */
export interface EditableFields {
  profile: boolean // nome, cargo, departamento, salário, agenda etc.
  password: boolean
  photo: boolean
}

export function editableFields(viewer: User, target: User): EditableFields {
  if (viewer.id === target.id) {
    // Todos podem editar a própria senha e foto
    return { profile: viewer.role !== 'colaborador', password: true, photo: true }
  }
  return {
    profile: canEditUser(viewer, target),
    password: canEditUser(viewer, target),
    photo: canEditUser(viewer, target),
  }
}
