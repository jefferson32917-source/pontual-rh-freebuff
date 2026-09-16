import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, setSession } from '../lib/auth'
import type { User } from '../types'

export default function Login({ onLogin }: { onLogin: (user?: User) => void }) {
  const navigate = useNavigate()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function authenticate(identifier: string, password: string) {
    setError(null)
    setLoading(true)
    const result = await login(identifier, password)
    setLoading(false)
    if (result.ok) {
      setSession({ userId: result.user.id, role: result.user.role, issuedAt: new Date().toISOString() })
      onLogin(result.user)
      navigate('/painel', { replace: true })
    } else {
      setError(result.error)
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    void authenticate(identifier, password)
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center gap-10 px-4 py-10 lg:flex-row lg:gap-16">
        <div className="w-full max-w-lg text-center lg:text-left">
          <img src="/logo.svg" alt="Pontual RH Super" className="mx-auto h-12 w-auto lg:mx-0" />
          <h1 className="mt-8 text-3xl font-bold leading-tight text-slate-900 sm:text-4xl">
            Multiempresa, <span className="text-primary-600">férias</span> e ponto em um só lugar.
          </h1>
          <p className="mt-4 text-base leading-relaxed text-slate-600">
            Gestão multi-tenant com matrículas automáticas, folha de pagamento CLT e controle total por perfil.
          </p>
          <img
            src="/illustration.svg"
            alt=""
            aria-hidden="true"
            className="mt-8 w-full max-w-md mx-auto lg:mx-0 drop-shadow-sm"
          />
        </div>

        <div className="w-full max-w-md">
          <div className="card p-6 sm:p-8">
            <h2 className="text-xl font-bold text-slate-900">Acessar plataforma</h2>
            <p className="mt-1 text-sm text-slate-500">Use sua matrícula (SG001/SC001) ou e-mail.</p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
              <div>
                <label htmlFor="identifier" className="mb-1.5 block text-sm font-medium text-slate-700">
                  Matrícula ou e-mail
                </label>
                <input
                  id="identifier"
                  type="text"
                  autoComplete="username"
                  required
                  className="input"
                  placeholder="SG001 · SC002 · você@empresa.com"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-700">
                  Senha
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  minLength={4}
                  className="input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {error && (
                <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-700">
                  {error}
                </p>
              )}

              <button type="submit" className="btn-primary w-full" disabled={loading}>
                {loading ? 'Entrando…' : 'Entrar'}
              </button>
            </form>

          </div>
        </div>
      </div>
    </div>
  )
}
