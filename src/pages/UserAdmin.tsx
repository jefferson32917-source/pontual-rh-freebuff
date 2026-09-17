import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { HrStore } from '../lib/store'
import { canCreateRole, canDeleteUser, canEditUser, isSuperAdmin } from '../lib/permissions'
import { useImpersonation } from '../lib/impersonation'
import type { Role, User } from '../types'
import { formatDate, roleLabels } from '../lib/format'
import { Avatar, EmptyState, SectionCard, StatusBadge } from '../components/ui'

export default function UserAdmin({ user, store }: { user: User; store: HrStore }) {
  const { data } = store
  const impersonation = useImpersonation()
  const [filterRole, setFilterRole] = useState<'all' | Role>('all')
  const [filterCompany, setFilterCompany] = useState<string>('all')
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  // form state
  const [fName, setFName] = useState('')
  const [fEmail, setFEmail] = useState('')
  const [fPassword, setFPassword] = useState('')
  const [fRoleCreate, setFRole] = useState<'gestor' | 'colaborador'>('colaborador')
  const [fCompanyId, setFCompanyId] = useState('')
  const [fJobTitle, setFJobTitle] = useState('')
  const [fDepartment, setFDepartment] = useState('')
  const [fBaseSalary, setFBaseSalary] = useState('')
  const [fManagerId, setFManagerId] = useState('')
  const [fCpf, setFCpf] = useState('')
  const [fCtps, setFCtps] = useState('')
  const [fPhone, setFPhone] = useState('')
  const [fAddress, setFAddress] = useState('')
  const [fCep, setFCep] = useState('')
  const [fConfidential, setFConfidential] = useState('')
  /** Nova promção/ajuste de cargo: colaborador -> gestor (apenas SA). */
  const [fRole, setFRoleEdit] = useState<'gestor' | 'colaborador' | null>(null)
  /** Bate ponto? (default true; gestor costuma ficar de fora) */
  const [fRequiresPunch, setFRequiresPunch] = useState(true)

  const companies = data.companies
  const companyOf = (id: string | null) => companies.find((c) => c.id === id)

  const visible = useMemo(() => {
    let list = data.users
    if (user.role === 'gestor') {
      list = list.filter((u) => u.companyId === user.companyId && u.role === 'colaborador')
    }
    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          (u.matricula ?? '').toLowerCase().includes(q),
      )
    }
    if (filterRole !== 'all') list = list.filter((u) => u.role === filterRole)
    if (isSuperAdmin(user) && filterCompany !== 'all') {
      list = list.filter((u) => u.companyId === filterCompany || (filterCompany === 'sa' && u.companyId === null))
    }
    return list
  }, [data.users, user, query, filterRole, filterCompany])

  const managers = useMemo(
    () => data.users.filter((u) => u.role === 'gestor' && u.companyId === (fCompanyId || user.companyId)),
    [data.users, fCompanyId, user.companyId],
  )

  function resetForm() {
    setFName(''); setFEmail(''); setFPassword(''); setFJobTitle(''); setFDepartment('')
    setFBaseSalary(''); setFManagerId(''); setFormError(null)
    setFCpf(''); setFCtps(''); setFPhone(''); setFAddress(''); setFCep(''); setFConfidential('')
  }

  function handleCreate(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    const companyId = user.role === 'gestor' ? user.companyId! : fCompanyId
    if (!companyId) {
      setFormError('Selecione a empresa.')
      return
    }
    const result = store.createUser(user, {
      companyId,
      role: fRoleCreate,
      name: fName,
      email: fEmail,
      jobTitle: fJobTitle,
      department: fDepartment,
      baseSalary: parseFloat(fBaseSalary.replace(',', '.')) || 0,
      password: fPassword,
      admissionDate: new Date().toISOString().slice(0, 10),
      managerId: fRoleCreate === 'colaborador' && fManagerId ? fManagerId : undefined,
    })
    if (!result.ok) {
      setFormError(result.error)
      return
    }
    // Dados adicionais (holerite/confidenciais) gravados direto no novo usuário
    store.updateUser(result.user.id, {
      cpf: fCpf.trim().slice(0, 20),
      ctps: fCtps.trim().slice(0, 30),
      phone: fPhone.trim().slice(0, 20),
      address: fAddress.trim().slice(0, 160),
      cep: fCep.trim().slice(0, 12),
      confidentialNotes: fConfidential.trim().slice(0, 500),
    })
    setCreating(false)
    resetForm()
  }

  const editing = data.users.find((u) => u.id === editingId) ?? null

  function startEdit(u: User) {
    setEditingId(u.id)
    setFName(u.name)
    setFEmail(u.email)
    setFJobTitle(u.jobTitle)
    setFDepartment(u.department)
    setFBaseSalary(String(u.baseSalary))
    setFManagerId(u.managerId ?? '')
    setFPassword('')
    setFCpf(u.cpf ?? '')
    setFCtps(u.ctps ?? '')
    setFPhone(u.phone ?? '')
    setFAddress(u.address ?? '')
    setFCep(u.cep ?? '')
    setFConfidential(u.confidentialNotes ?? '')
    setFRequiresPunch(u.requiresPunch)
    setFRoleEdit(null)
    setFormError(null)
  }

  function saveEdit() {
    if (!editing) return
    if (fName.trim().length < 2) {
      setFormError('Nome inválido.')
      return
    }
    const patch: Partial<User> = {
      name: fName.trim().slice(0, 120),
      email: fEmail.trim().toLowerCase().slice(0, 160),
      jobTitle: fJobTitle.trim().slice(0, 80),
      department: fDepartment.trim().slice(0, 80),
      baseSalary: Math.max(0, parseFloat(fBaseSalary.replace(',', '.')) || 0),
      managerId: fManagerId || undefined,
      cpf: fCpf.trim().slice(0, 20),
      ctps: fCtps.trim().slice(0, 30),
      phone: fPhone.trim().slice(0, 20),
      address: fAddress.trim().slice(0, 160),
      cep: fCep.trim().slice(0, 12),
      confidentialNotes: fConfidential.trim().slice(0, 500),
      requiresPunch: fRequiresPunch,
    }
    // PROMOÇÃO: colaborador -> gestor (apenas SA, aplicada junto ao salvar)
    if (fRole !== null && editing.role === 'colaborador' && fRole === 'gestor') {
      patch.role = 'gestor'
      patch.managerId = undefined
    }
    if (fPassword.length > 0) {
      if (fPassword.length < 6) {
        setFormError('Nova senha deve ter pelo menos 6 caracteres (ou deixe vazio para manter).')
        return
      }
      patch.password = fPassword
    }
    store.updateUser(editing.id, patch)
    setEditingId(null)
    resetForm()
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {user.role === 'gestor' ? 'Meus colaboradores' : 'Usuários'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {user.role === 'gestor'
              ? 'Cadastre e edite colaboradores da sua empresa. A matrícula é gerada automaticamente.'
              : 'Controle total: crie, edite e exclua gestores e colaboradores de todas as empresas.'}
          </p>
        </div>
        {(user.role === 'super_admin' || user.role === 'gestor') && (
          <button type="button" className="btn-primary" onClick={() => { setCreating(!creating); resetForm() }}>
            {creating ? 'Cancelar' : '+ Novo usuário'}
          </button>
        )}
      </header>

      {creating && (
        <SectionCard title="Cadastrar usuário" action={<StatusBadge tone="primary">matrícula automática</StatusBadge>}>
          <form onSubmit={handleCreate} className="grid gap-4 sm:grid-cols-2">
            {isSuperAdmin(user) && (
              <div className="sm:col-span-2">
                <label htmlFor="nu-company" className="mb-1.5 block text-sm font-medium text-slate-700">Empresa</label>
                <select id="nu-company" className="input" value={fCompanyId} onChange={(e) => setFCompanyId(e.target.value)} required>
                  <option value="">Selecione…</option>
                  {companies.filter((c) => c.active).map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.initials})</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label htmlFor="nu-role" className="mb-1.5 block text-sm font-medium text-slate-700">Perfil</label>
              <select id="nu-role" className="input" value={fRoleCreate} onChange={(e) => setFRole(e.target.value as 'gestor' | 'colaborador')}>                  {canCreateRole(user, 'gestor') && <option value="gestor">Gestor/RH (matrícula {(companyOf(fCompanyId || user.companyId)?.initials ?? '??')[0]}G…)</option>}                  <option value="colaborador">Colaborador (matrícula {(companyOf(fCompanyId || user.companyId)?.initials ?? '??')[0]}C…)</option>
                </select>
            </div>
            <div>
              <label htmlFor="nu-name" className="mb-1.5 block text-sm font-medium text-slate-700">Nome completo</label>
              <input id="nu-name" className="input" maxLength={120} value={fName} onChange={(e) => setFName(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="nu-email" className="mb-1.5 block text-sm font-medium text-slate-700">E-mail</label>
              <input id="nu-email" type="email" className="input" maxLength={160} value={fEmail} onChange={(e) => setFEmail(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="nu-pass" className="mb-1.5 block text-sm font-medium text-slate-700">Senha inicial</label>
              <input id="nu-pass" type="text" className="input" minLength={6} maxLength={64} value={fPassword} onChange={(e) => setFPassword(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="nu-job" className="mb-1.5 block text-sm font-medium text-slate-700">Cargo</label>
              <input id="nu-job" className="input" maxLength={80} value={fJobTitle} onChange={(e) => setFJobTitle(e.target.value)} />
            </div>
            <div>
              <label htmlFor="nu-dept" className="mb-1.5 block text-sm font-medium text-slate-700">Departamento</label>
              <input id="nu-dept" className="input" maxLength={80} value={fDepartment} onChange={(e) => setFDepartment(e.target.value)} />
            </div>
            <div>
              <label htmlFor="nu-salary" className="mb-1.5 block text-sm font-medium text-slate-700">Salário base (R$)</label>
              <input id="nu-salary" type="number" step="0.01" min="0" className="input" value={fBaseSalary} onChange={(e) => setFBaseSalary(e.target.value)} placeholder="0,00" />
            </div>
            <div>
              <label htmlFor="nu-cpf" className="mb-1.5 block text-sm font-medium text-slate-700">CPF</label>
              <input id="nu-cpf" className="input" maxLength={20} value={fCpf} onChange={(e) => setFCpf(e.target.value)} placeholder="000.000.000-00" />
            </div>
            <div>
              <label htmlFor="nu-ctps" className="mb-1.5 block text-sm font-medium text-slate-700">CTPS</label>
              <input id="nu-ctps" className="input" maxLength={30} value={fCtps} onChange={(e) => setFCtps(e.target.value)} placeholder="Nº/Série" />
            </div>
            <div>
              <label htmlFor="nu-phone" className="mb-1.5 block text-sm font-medium text-slate-700">Telefone</label>
              <input id="nu-phone" type="tel" className="input" maxLength={20} value={fPhone} onChange={(e) => setFPhone(e.target.value)} placeholder="(11) 99999-0000" />
            </div>
            <div>
              <label htmlFor="nu-cep" className="mb-1.5 block text-sm font-medium text-slate-700">CEP</label>
              <input id="nu-cep" className="input" maxLength={12} value={fCep} onChange={(e) => setFCep(e.target.value)} placeholder="00000-000" />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="nu-address" className="mb-1.5 block text-sm font-medium text-slate-700">Endereço</label>
              <input id="nu-address" className="input" maxLength={160} value={fAddress} onChange={(e) => setFAddress(e.target.value)} placeholder="Rua, número, complemento" />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="nu-conf" className="mb-1.5 block text-sm font-medium text-slate-700">Dados confidenciais (visíveis apenas para a empresa)</label>
              <textarea id="nu-conf" className="input min-h-[64px]" maxLength={500} value={fConfidential} onChange={(e) => setFConfidential(e.target.value)} placeholder="Alergias, restrições, documentos internos, observações restritas…" />
            </div>
            {fRole === 'colaborador' && (
              <div className="sm:col-span-2">
                <label htmlFor="nu-manager" className="mb-1.5 block text-sm font-medium text-slate-700">Gestor responsável</label>
                <select id="nu-manager" className="input" value={fManagerId} onChange={(e) => setFManagerId(e.target.value)}>
                  <option value="">Sem gestor direto</option>
                  {managers.map((m) => (
                    <option key={m.id} value={m.id}>{m.name} ({m.matricula})</option>
                  ))}
                </select>
              </div>
            )}
            {formError && (
              <p role="alert" className="sm:col-span-2 rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-700">
                {formError}
              </p>
            )}
            <div className="sm:col-span-2">
              <button type="submit" className="btn-primary w-full">Cadastrar</button>
            </div>
          </form>
        </SectionCard>
      )}

      <div className="card p-5">
        <div className="flex flex-wrap gap-3">
          <input
            type="search"
            className="input flex-1 min-w-[200px]"
            placeholder="Buscar por nome, e-mail ou matrícula…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Buscar usuários"
          />
          {isSuperAdmin(user) && (
            <select className="input w-auto" value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)} aria-label="Filtrar empresa">
              <option value="all">Todas as empresas</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
          <select className="input w-auto" value={filterRole} onChange={(e) => setFilterRole(e.target.value as 'all' | Role)} aria-label="Filtrar perfil">
            <option value="all">Todos os perfis</option>
            {isSuperAdmin(user) && <option value="super_admin">Super Admin</option>}
            <option value="gestor">Gestores</option>
            <option value="colaborador">Colaboradores</option>
          </select>
        </div>

        <ul className="mt-4 divide-y divide-slate-100">
          {visible.map((u) => {
            const editable = canEditUser(user, u)
            const deletable = canDeleteUser(user, u)
            const company = companyOf(u.companyId)
            return (
              <li key={u.id} className="flex flex-wrap items-center gap-3 py-4">
                <Avatar name={u.name} color={u.avatarColor} size={40} photoUrl={u.photoDataUrl} userId={u.id} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {u.name}
                    {u.matricula && <span className="badge ml-2 bg-slate-100 font-mono text-slate-600">{u.matricula}</span>}
                    {!u.active && <span className="badge ml-2 bg-rose-50 text-rose-600">inativo</span>}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {u.jobTitle} · {company?.name ?? '—'}
                    {u.email ? ` · ${u.email}` : ''}
                  </p>
                </div>
                <StatusBadge tone={u.role === 'super_admin' ? 'primary' : u.role === 'gestor' ? 'teal' : 'neutral'}>
                  {roleLabels[u.role]}
                </StatusBadge>
                <span className="hidden text-xs text-slate-400 sm:block">desde {formatDate(u.admissionDate)}</span>
                <div className="flex shrink-0 gap-2">
                  {isSuperAdmin(user) && (u.role === 'gestor' || u.role === 'colaborador') && (
                    <button
                      type="button"
                      className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                      title="Acessar o painel deste usuário com auditoria"
                      onClick={() => impersonation.start(user, u)}
                    >
                      Acessar como
                    </button>
                  )}
                  <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => (editingId === u.id ? setEditingId(null) : startEdit(u))} disabled={!editable}>
                    {editingId === u.id ? 'Fechar' : 'Editar'}
                  </button>
                  {deletable && (
                    <button
                      type="button"
                      className="rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                      onClick={() => {
                        if (window.confirm(`Excluir ${u.name} e seus registros?`)) {
                          store.deleteUser(u.id)
                        }
                      }}
                    >
                      Excluir
                    </button>
                  )}
                </div>

                {editingId === u.id && editable && (
                  <div className="w-full">
                    <div className="mt-2 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor={`ed-name-${u.id}`}>Nome</label>
                        <input id={`ed-name-${u.id}`} className="input" value={fName} maxLength={120} onChange={(e) => setFName(e.target.value)} />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor={`ed-email-${u.id}`}>E-mail</label>
                        <input id={`ed-email-${u.id}`} type="email" className="input" value={fEmail} maxLength={160} onChange={(e) => setFEmail(e.target.value)} />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor={`ed-job-${u.id}`}>Cargo</label>
                        <input id={`ed-job-${u.id}`} className="input" value={fJobTitle} maxLength={80} onChange={(e) => setFJobTitle(e.target.value)} />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor={`ed-dept-${u.id}`}>Departamento</label>
                        <input id={`ed-dept-${u.id}`} className="input" value={fDepartment} maxLength={80} onChange={(e) => setFDepartment(e.target.value)} />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor={`ed-salary-${u.id}`}>Salário base (R$)</label>
                        <input id={`ed-salary-${u.id}`} type="number" step="0.01" min="0" className="input" value={fBaseSalary} onChange={(e) => setFBaseSalary(e.target.value)} />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor={`ed-pass-${u.id}`}>Nova senha (opcional)</label>
                        <input id={`ed-pass-${u.id}`} type="text" className="input" minLength={6} maxLength={64} value={fPassword} onChange={(e) => setFPassword(e.target.value)} placeholder="Deixe vazio para manter" />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor={`ed-cpf-${u.id}`}>CPF</label>
                        <input id={`ed-cpf-${u.id}`} className="input" maxLength={20} value={fCpf} onChange={(e) => setFCpf(e.target.value)} placeholder="000.000.000-00" />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor={`ed-ctps-${u.id}`}>CTPS</label>
                        <input id={`ed-ctps-${u.id}`} className="input" maxLength={30} value={fCtps} onChange={(e) => setFCtps(e.target.value)} placeholder="Nº/Série" />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor={`ed-phone-${u.id}`}>Telefone</label>
                        <input id={`ed-phone-${u.id}`} type="tel" className="input" maxLength={20} value={fPhone} onChange={(e) => setFPhone(e.target.value)} placeholder="(11) 99999-0000" />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor={`ed-cep-${u.id}`}>CEP</label>
                        <input id={`ed-cep-${u.id}`} className="input" maxLength={12} value={fCep} onChange={(e) => setFCep(e.target.value)} placeholder="00000-000" />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor={`ed-address-${u.id}`}>Endereço</label>
                        <input id={`ed-address-${u.id}`} className="input" maxLength={160} value={fAddress} onChange={(e) => setFAddress(e.target.value)} placeholder="Rua, número, complemento" />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor={`ed-conf-${u.id}`}>Dados confidenciais (visíveis apenas para a empresa)</label>
                        <textarea id={`ed-conf-${u.id}`} className="input min-h-[64px]" maxLength={500} value={fConfidential} onChange={(e) => setFConfidential(e.target.value)} placeholder="Alergias, restrições, documentos internos, observações restritas…" />
                      </div>
                      {editing?.role === 'colaborador' && fRole !== 'gestor' && (
                        <div className="sm:col-span-2">
                          <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor={`ed-manager-${u.id}`}>Gestor responsável</label>
                          <select id={`ed-manager-${u.id}`} className="input" value={fManagerId} onChange={(e) => setFManagerId(e.target.value)}>
                            <option value="">Sem gestor direto</option>
                            {data.users
                              .filter((m) => m.role === 'gestor' && m.companyId === editing?.companyId)
                              .map((m) => (
                                <option key={m.id} value={m.id}>{m.name} ({m.matricula})</option>
                              ))}
                          </select>
                        </div>
                      )}
                      {/* PROMOÇÃO: colaborador -> gestor (só SA) */}
                      {isSuperAdmin(user) && editing?.role === 'colaborador' && (
                        <div className="sm:col-span-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3.5">
                          <p className="text-xs font-semibold text-amber-800">⬆ Promover a gestor</p>
                          <p className="mt-0.5 text-[11px] text-amber-700">
                            Concede poderes de aprovação, cadastro de colaboradores e visão da equipe. A matrícula permanece; o acesso/painel muda no próximo login.
                          </p>
                          <div className="mt-2 flex items-center gap-2">
                            <select
                              className="input w-auto flex-1 text-xs"
                              value={fRole ?? 'colaborador'}
                              onChange={(e) => setFRoleEdit(e.target.value as 'gestor' | 'colaborador')}
                              aria-label="Perfil do usuário"
                            >
                              <option value="colaborador">Continua colaborador</option>
                              <option value="gestor">Promover para gestor</option>
                            </select>
                          </div>
                        </div>
                      )}
                      {/* BATE PONTO? (admin decide; padrão: sim) */}
                      <div className="sm:col-span-2 rounded-xl border border-slate-200 p-3.5">
                        <label className="flex items-center justify-between gap-3" htmlFor={`ed-punch-${u.id}`}>
                          <span>
                            <span className="block text-xs font-semibold text-slate-700">Bate ponto</span>
                            <span className="block text-[11px] text-slate-500">
                              Desligue para gestores/_funções que não registram batidas. O painel dele deixa de mostrar o relógio de ponto.
                            </span>
                          </span>
                          <button
                            type="button"
                            id={`ed-punch-${u.id}`}
                            role="switch"
                            aria-checked={fRequiresPunch}
                            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${fRequiresPunch ? 'bg-primary-600' : 'bg-slate-300'}`}
                            onClick={() => setFRequiresPunch((v) => !v)}
                          >
                            <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${fRequiresPunch ? 'left-[22px]' : 'left-0.5'}`} />
                          </button>
                        </label>
                      </div>
                      {formError && (
                        <p role="alert" className="sm:col-span-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{formError}</p>
                      )}
                      <div className="flex gap-2 sm:col-span-2">
                        <button type="button" className="btn-primary flex-1 py-2 text-xs" onClick={saveEdit}>Salvar alterações</button>
                        <button type="button" className="btn-secondary flex-1 py-2 text-xs" onClick={() => setEditingId(null)}>Cancelar</button>
                      </div>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
          {visible.length === 0 && (
            <li className="py-8 text-center text-sm text-slate-500">
              <EmptyState message="Nenhum usuário encontrado com os filtros atuais." />
            </li>
          )}
        </ul>
      </div>
    </div>
  )
}
