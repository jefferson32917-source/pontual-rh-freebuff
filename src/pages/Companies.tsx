import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { HrStore } from '../lib/store'
import type { Company } from '../types'
import { formatDate, whatsappLink } from '../lib/format'
import { SectionCard, StatCard, StatusBadge, EmptyState } from '../components/ui'

interface CompanyForm {
  name: string
  cnpj: string
  address: string
  cep: string
  bairro: string
  city: string
  uf: string
  stateRegistration: string
  responsibleName: string
  responsiblePhone: string
}

const emptyForm: CompanyForm = {
  name: '',
  cnpj: '',
  address: '',
  cep: '',
  bairro: '',
  city: '',
  uf: '',
  stateRegistration: '',
  responsibleName: '',
  responsiblePhone: '',
}

function toForm(c: Company): CompanyForm {
  return {
    name: c.name,
    cnpj: c.cnpj,
    address: c.address ?? '',
    cep: c.cep ?? '',
    bairro: c.bairro ?? '',
    city: c.city ?? '',
    uf: c.uf ?? '',
    stateRegistration: c.stateRegistration ?? '',
    responsibleName: c.responsibleName ?? '',
    responsiblePhone: c.responsiblePhone ?? '',
  }
}

const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']

/** Componente de campos desmontado/remontado causa perda de foco a cada tecla.
 *  Aqui os inputs são controlados por `value` estável e `onChange` que só
 *  atualiza o campo alterado — e CompanyFields é definido FORA do render
 *  principal para não ser recriado (remontado) a cada keystroke. */
function CompanyFields({ f, onSet, idPrefix }: { f: CompanyForm; onSet: (p: Partial<CompanyForm>) => void; idPrefix: string }) {
  const grid = 'grid grid-cols-1 gap-3 md:grid-cols-2'
  const label = 'mb-1.5 block text-sm font-medium text-slate-700'
  const input = 'input w-full text-base'
  return (
    <>
      <div className={grid}>
        <div>
          <label htmlFor={`${idPrefix}-name`} className={label}>
            Nome da empresa <span className="text-rose-600">*</span>
          </label>
          <input id={`${idPrefix}-name`} className={input} placeholder="Ex.: Silva Construções" maxLength={120} value={f.name} onChange={(e) => onSet({ name: e.target.value })} required />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-cnpj`} className={label}>
            CNPJ <span className="text-rose-600">*</span>
          </label>
          <input id={`${idPrefix}-cnpj`} className={input} placeholder="00.000.000/0001-00" maxLength={20} value={f.cnpj} onChange={(e) => onSet({ cnpj: e.target.value })} required />
        </div>
      </div>

      <details className="mt-3 rounded-xl border border-slate-100">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">
          Endereço, IE e responsável <span className="font-normal text-slate-400">(opcional — aparece no holerite)</span>
        </summary>
        <div className="space-y-3 border-t border-slate-100 p-4">
          <div className={grid}>
            <div className="md:col-span-2">
              <label htmlFor={`${idPrefix}-addr`} className={label}>Logradouro e número</label>
              <input id={`${idPrefix}-addr`} className={input} placeholder="Rua, avenida, nº" maxLength={160} value={f.address} onChange={(e) => onSet({ address: e.target.value })} />
            </div>
            <div>
              <label htmlFor={`${idPrefix}-bairro`} className={label}>Bairro</label>
              <input id={`${idPrefix}-bairro`} className={input} maxLength={60} value={f.bairro} onChange={(e) => onSet({ bairro: e.target.value })} />
            </div>
            <div>
              <label htmlFor={`${idPrefix}-cep`} className={label}>CEP</label>
              <input id={`${idPrefix}-cep`} className={input} placeholder="00000-000" maxLength={12} value={f.cep} onChange={(e) => onSet({ cep: e.target.value })} />
            </div>
            <div>
              <label htmlFor={`${idPrefix}-city`} className={label}>Cidade</label>
              <input id={`${idPrefix}-city`} className={input} maxLength={60} value={f.city} onChange={(e) => onSet({ city: e.target.value })} />
            </div>
            <div>
              <label htmlFor={`${idPrefix}-uf`} className={label}>UF</label>
              <select id={`${idPrefix}-uf`} className={input} value={f.uf} onChange={(e) => onSet({ uf: e.target.value })}>
                <option value="">—</option>
                {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor={`${idPrefix}-ie`} className={label}>Inscrição Estadual</label>
              <input id={`${idPrefix}-ie`} className={input} maxLength={25} value={f.stateRegistration} onChange={(e) => onSet({ stateRegistration: e.target.value })} />
            </div>
          </div>
          <div className={grid}>
            <div>
              <label htmlFor={`${idPrefix}-resp`} className={label}>Nome do responsável</label>
              <input id={`${idPrefix}-resp`} className={input} maxLength={100} value={f.responsibleName} onChange={(e) => onSet({ responsibleName: e.target.value })} />
            </div>
            <div>
              <label htmlFor={`${idPrefix}-phone`} className={label}>Telefone / WhatsApp</label>
              <input id={`${idPrefix}-phone`} type="tel" className={input} placeholder="(11) 99999-0000" maxLength={20} value={f.responsiblePhone} onChange={(e) => onSet({ responsiblePhone: e.target.value })} />
            </div>
          </div>
        </div>
      </details>
    </>
  )
}

export default function Companies({ store }: { store: HrStore }) {
  const { data } = store
  const [form, setForm] = useState<CompanyForm>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<CompanyForm>(emptyForm)
  const [error, setError] = useState<string | null>(null)

  const set = (patch: Partial<CompanyForm>) => setForm((f) => ({ ...f, ...patch }))
  const setEdit = (patch: Partial<CompanyForm>) => setEditForm((f) => ({ ...f, ...patch }))

  const stats = useMemo(() => {
    return data.companies.map((c) => {
      const staff = data.users.filter((u) => u.companyId === c.id)
      return {
        company: c,
        gestores: staff.filter((u) => u.role === 'gestor').length,
        colaboradores: staff.filter((u) => u.role === 'colaborador').length,
      }
    })
  }, [data])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (form.name.trim().length < 2) {
      setError('Informe o nome da empresa.')
      return
    }
    const company = store.createCompany(form.name.trim(), form.cnpj.trim())
    // Campos adicionais via update (createCompany é mínimo)
    store.updateCompany(company.id, {
      address: form.address.trim().slice(0, 160),
      cep: form.cep.trim().slice(0, 12),
      bairro: form.bairro.trim().slice(0, 60),
      city: form.city.trim().slice(0, 60),
      uf: form.uf.trim().toUpperCase().slice(0, 2),
      stateRegistration: form.stateRegistration.trim().slice(0, 25),
      responsibleName: form.responsibleName.trim().slice(0, 100),
      responsiblePhone: form.responsiblePhone.trim().slice(0, 20),
    })
    setForm(emptyForm)
  }

  function startEdit(c: Company) {
    setEditingId(c.id)
    setEditForm(toForm(c))
    setError(null)
  }

  function saveEdit() {
    if (!editingId) return
    if (editForm.name.trim().length < 2) {
      setError('Nome inválido.')
      return
    }
    store.updateCompany(editingId, {
      name: editForm.name.trim().slice(0, 120),
      cnpj: editForm.cnpj.trim().slice(0, 20),
      address: editForm.address.trim().slice(0, 160),
      cep: editForm.cep.trim().slice(0, 12),
      bairro: editForm.bairro.trim().slice(0, 60),
      city: editForm.city.trim().slice(0, 60),
      uf: editForm.uf.trim().toUpperCase().slice(0, 2),
      stateRegistration: editForm.stateRegistration.trim().slice(0, 25),
      responsibleName: editForm.responsibleName.trim().slice(0, 100),
      responsiblePhone: editForm.responsiblePhone.trim().slice(0, 20),
    })
    setEditingId(null)
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Empresas</h1>
        <p className="mt-1 text-sm text-slate-500">
          Cadastre as empresas do sistema. Só nome e CNPJ são obrigatórios; os demais dados aparecem no holerite e permitem contato via WhatsApp.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Empresas ativas" value={data.companies.filter((c) => c.active).length} hint="tenants" tone="primary" />
        <StatCard label="Gestores" value={data.users.filter((u) => u.role === 'gestor').length} hint="todas as empresas" tone="teal" />
        <StatCard label="Colaboradores" value={data.users.filter((u) => u.role === 'colaborador').length} hint="todas as empresas" tone="amber" />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="Nova empresa">
          <form onSubmit={handleSubmit} className="space-y-4">
            <CompanyFields f={form} onSet={set} idPrefix="co" />
            {error && (
              <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-700">
                {error}
              </p>
            )}
            <button type="submit" className="btn-primary w-full">
              Cadastrar empresa
            </button>
          </form>
        </SectionCard>

        <SectionCard title="Todas as empresas" action={<StatusBadge tone="neutral">{data.companies.length}</StatusBadge>}>
          {data.companies.length === 0 ? (
            <EmptyState message="Nenhuma empresa cadastrada ainda." />
          ) : (
            <ul className="space-y-3">
              {stats.map(({ company: c, gestores, colaboradores }) => {
                const wa = c.responsiblePhone ? whatsappLink(c.responsiblePhone, `Olá ${c.responsibleName || c.name}! Mensagem enviada pelo Pontual RH Super.`) : null
                return (
                  <li key={c.id} className="rounded-xl border border-slate-100 p-4">
                    {editingId === c.id ? (
                      <div className="space-y-3">
                        <CompanyFields f={editForm} onSet={setEdit} idPrefix="ed" />
                        <div className="flex gap-2">
                          <button type="button" className="btn-primary flex-1 py-2 text-xs" onClick={saveEdit}>
                            Salvar
                          </button>
                          <button type="button" className="btn-secondary flex-1 py-2 text-xs" onClick={() => setEditingId(null)}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">
                              <span className="badge mr-2 bg-primary-50 text-primary-700">{c.initials}</span>
                              {c.name}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              CNPJ {c.cnpj || '—'} · desde {formatDate(c.createdAt)}
                            </p>
                            {(c.address || c.city) && (
                              <p className="mt-0.5 text-xs text-slate-400">
                                {[c.address, c.bairro, c.city ? `${c.city}${c.uf ? '/' + c.uf : ''}` : ''].filter(Boolean).join(', ')}
                              </p>
                            )}
                            {c.responsibleName && (
                              <p className="mt-0.5 text-xs text-slate-400">
                                Resp.: {c.responsibleName}
                                {c.responsiblePhone ? ` · ${c.responsiblePhone}` : ''}
                              </p>
                            )}
                          </div>
                          <StatusBadge tone={c.active ? 'teal' : 'rose'}>{c.active ? 'Ativa' : 'Inativa'}</StatusBadge>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                          <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-medium text-slate-600">
                            {gestores} gestor{gestores === 1 ? '' : 'es'} ({c.initials}G…)
                          </span>
                          <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-medium text-slate-600">
                            {colaboradores} colaborador{colaboradores === 1 ? '' : 'es'} ({c.initials}C…)
                          </span>
                          <div className="ml-auto flex flex-wrap gap-2">
                            {wa && (
                              <a
                                href={wa}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-100"
                                title="Abrir conversa no WhatsApp com o responsável"
                              >
                                💬 WhatsApp
                              </a>
                            )}
                            <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => startEdit(c)}>
                              Editar
                            </button>
                            <button
                              type="button"
                              className="btn-secondary px-3 py-1.5 text-xs"
                              onClick={() => store.updateCompany(c.id, { active: !c.active })}
                            >
                              {c.active ? 'Desativar' : 'Ativar'}
                            </button>
                            <button
                              type="button"
                              className="rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                              onClick={() => {
                                if (window.confirm(`Excluir ${c.name} e todos os seus usuários?`)) {
                                  store.deleteCompany(c.id)
                                }
                              }}
                            >
                              Excluir
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  )
}
