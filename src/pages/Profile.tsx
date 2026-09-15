import { useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import type { HrStore } from '../lib/store'
import { editableFields } from '../lib/permissions'
import { changePasswordSecure } from '../lib/auth'
import type { User, WeekDay } from '../types'
import { weekDayLabels } from '../types'
import { formatDate, initials, roleLabels } from '../lib/format'
import { SectionCard, StatusBadge } from '../components/ui'

const weekOrder: WeekDay[] = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom']

export default function Profile({ user, store, onUserUpdated }: { user: User; store: HrStore; onUserUpdated: () => void }) {
  const { data } = store
  const perms = editableFields(user, user)
  const fileRef = useRef<HTMLInputElement>(null)

  const current = data.users.find((u) => u.id === user.id) ?? user
  const company = data.companies.find((c) => c.id === current.companyId)

  const [name, setName] = useState(current.name)
  const [email, setEmail] = useState(current.email)
  const [jobTitle, setJobTitle] = useState(current.jobTitle)
  const [department, setDepartment] = useState(current.department)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  function handlePhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setMsg({ kind: 'error', text: 'Foto deve ser PNG, JPG ou WEBP.' })
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setMsg({ kind: 'error', text: 'Foto deve ter no máximo 5 MB.' })
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      store.updatePhoto(current.id, String(reader.result))
      setMsg({ kind: 'ok', text: 'Foto atualizada!' })
      onUserUpdated()
    }
    reader.readAsDataURL(file)
    if (fileRef.current) fileRef.current.value = ''
  }

  function handleProfile(e: FormEvent) {
    e.preventDefault()
    setMsg(null)
    if (name.trim().length < 2) {
      setMsg({ kind: 'error', text: 'Nome inválido.' })
      return
    }
    store.updateUser(current.id, {
      name: name.trim().slice(0, 120),
      email: email.trim().toLowerCase().slice(0, 160),
      jobTitle: jobTitle.trim().slice(0, 80),
      department: department.trim().slice(0, 80),
    })
    setMsg({ kind: 'ok', text: 'Dados atualizados!' })
    onUserUpdated()
  }

  async function handlePassword(e: FormEvent) {
    e.preventDefault()
    setMsg(null)
    if (newPassword.length < 6) {
      setMsg({ kind: 'error', text: 'Nova senha deve ter pelo menos 6 caracteres.' })
      return
    }
    if (newPassword !== confirmPassword) {
      setMsg({ kind: 'error', text: 'Confirmação não confere.' })
      return
    }
    const result = await changePasswordSecure(currentPassword, newPassword)
    if (!result.ok) {
      setMsg({ kind: 'error', text: result.error ?? 'Não foi possível alterar a senha.' })
      return
    }
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setMsg({ kind: 'ok', text: 'Senha alterada com sucesso!' })
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Meu perfil</h1>
        <p className="mt-1 text-sm text-slate-500">Seus dados, foto e senha de acesso.</p>
      </header>

      {msg && (
        <p
          role={msg.kind === 'error' ? 'alert' : 'status'}
          className={`rounded-xl px-3.5 py-2.5 text-sm font-medium ${
            msg.kind === 'error' ? 'bg-rose-50 text-rose-700' : 'bg-teal-50 text-teal-700'
          }`}
        >
          {msg.text}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <SectionCard title="Identidade">
          <div className="flex flex-col items-center text-center">
            {current.photoDataUrl ? (
              <img
                src={current.photoDataUrl}
                alt={`Foto de ${current.name}`}
                className="h-24 w-24 rounded-full object-cover ring-4 ring-primary-100"
              />
            ) : (
              <span
                className="inline-flex h-24 w-24 items-center justify-center rounded-full text-2xl font-semibold text-white ring-4 ring-primary-100"
                style={{ backgroundColor: current.avatarColor }}
                aria-hidden="true"
              >
                {initials(current.name)}
              </span>
            )}
            <p className="mt-3 text-base font-semibold text-slate-900">{current.name}</p>
            {current.matricula && (
              <p className="mt-0.5 font-mono text-sm text-primary-700">{current.matricula}</p>
            )}
            <p className="text-xs text-slate-500">
              {current.jobTitle} · {company?.name ?? 'Plataforma'}
            </p>
            <StatusBadge tone={current.role === 'super_admin' ? 'primary' : current.role === 'gestor' ? 'teal' : 'neutral'}>
              {roleLabels[current.role]}
            </StatusBadge>
            <label htmlFor="photo-upload" className="btn-secondary mt-4 cursor-pointer">
              {current.photoDataUrl ? 'Trocar foto' : 'Adicionar foto'}
            </label>
            <input
              ref={fileRef}
              id="photo-upload"
              type="file"
              accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={handlePhoto}
            />
            {current.photoDataUrl && (
              <button
                type="button"
                className="mt-2 text-xs font-semibold text-rose-500 hover:text-rose-700"
                onClick={() => {
                  store.updatePhoto(current.id, undefined)
                  onUserUpdated()
                }}
              >
                Remover foto
              </button>
            )}
            <p className="mt-3 text-[11px] text-slate-400">PNG, JPG ou WEBP — máx. 5 MB</p>
          </div>
        </SectionCard>

        <SectionCard title="Dados cadastrais">
          <form onSubmit={handleProfile} className="space-y-4">
            <div>
              <label htmlFor="pf-name" className="mb-1.5 block text-sm font-medium text-slate-700">Nome completo</label>
              <input id="pf-name" className="input" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} disabled={!perms.profile} />
            </div>
            <div>
              <label htmlFor="pf-email" className="mb-1.5 block text-sm font-medium text-slate-700">E-mail</label>
              <input id="pf-email" type="email" className="input" maxLength={160} value={email} onChange={(e) => setEmail(e.target.value)} disabled={!perms.profile} />
            </div>
            <div>
              <label htmlFor="pf-job" className="mb-1.5 block text-sm font-medium text-slate-700">Cargo</label>
              <input id="pf-job" className="input" maxLength={80} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} disabled={!perms.profile} />
            </div>
            <div>
              <label htmlFor="pf-dept" className="mb-1.5 block text-sm font-medium text-slate-700">Departamento</label>
              <input id="pf-dept" className="input" maxLength={80} value={department} onChange={(e) => setDepartment(e.target.value)} disabled={!perms.profile} />
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Admissão</p>
                <p className="font-semibold text-slate-800">{formatDate(current.admissionDate)}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Saldo de férias</p>
                <p className="font-semibold text-slate-800">{current.vacationBalanceDays} dias</p>
              </div>
            </div>
            {perms.profile ? (
              <button type="submit" className="btn-primary w-full">Salvar dados</button>
            ) : (
              <p className="rounded-xl bg-slate-100 px-3.5 py-2.5 text-xs text-slate-500">
                Colaboradores editam apenas senha e foto. Para alterar dados cadastrais, fale com seu gestor.
              </p>
            )}
          </form>
        </SectionCard>

        <div className="space-y-6">
          <SectionCard title="Alterar senha">
            <form onSubmit={handlePassword} className="space-y-4">
              <div>
                <label htmlFor="pf-curpass" className="mb-1.5 block text-sm font-medium text-slate-700">Senha atual</label>
                <input id="pf-curpass" type="password" className="input" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
              </div>
              <div>
                <label htmlFor="pf-newpass" className="mb-1.5 block text-sm font-medium text-slate-700">Nova senha</label>
                <input id="pf-newpass" type="password" className="input" autoComplete="new-password" minLength={6} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
              </div>
              <div>
                <label htmlFor="pf-confpass" className="mb-1.5 block text-sm font-medium text-slate-700">Confirmar nova senha</label>
                <input id="pf-confpass" type="password" className="input" autoComplete="new-password" minLength={6} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
              </div>
              <button type="submit" className="btn-primary w-full">Alterar senha</button>
            </form>
          </SectionCard>

          <SectionCard title="Meu quadro de horários">
            <ul className="space-y-1.5">
              {weekOrder.map((day) => {
                const shift = current.weeklySchedule[day]
                return (
                  <li key={day} className="flex items-center justify-between rounded-lg px-3 py-1.5 text-sm">
                    <span className="capitalize text-slate-600">{weekDayLabels[day]}</span>
                    <span className={shift ? 'font-semibold text-slate-800' : 'text-slate-400'}>
                      {shift ? `${shift[0]} – ${shift[1]}` : 'Folga'}
                    </span>
                  </li>
                )
              })}
            </ul>
            <p className="mt-2 text-[11px] text-slate-400">
              {weekOrder.filter((d) => current.weeklySchedule[d]).length} dias de jornada · alterações pelo seu gestor
            </p>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
