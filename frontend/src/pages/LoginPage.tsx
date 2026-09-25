import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'

import { ContinuitySpine } from '../components/ContinuitySpine'
import { Logo } from '../components/Logo'
import { homeRouteForRole, useAuth } from '../contexts/AuthContext'
import { t } from '../lib/i18n'

/** Supabase speaks in API terms; people need to know what to do next. */
function readableAuthError(message: string): string {
  const normalized = message.toLowerCase()
  if (normalized.includes('invalid login credentials')) {
    return t.login.errors.invalidCredentials
  }
  if (normalized.includes('email not confirmed')) {
    return t.login.errors.notConfirmed
  }
  if (normalized.includes('failed to fetch') || normalized.includes('network')) {
    return t.login.errors.network
  }
  return message
}

export const LoginPage: React.FC = () => {
  const { session, role, loading, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState<string>('')
  const [password, setPassword] = useState<string>('')
  const [submitting, setSubmitting] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  if (session && !loading) {
    const from = (location.state as { from?: string } | null)?.from
    return <Navigate to={from ?? homeRouteForRole(role)} replace />
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      setSubmitting(true)
      setError(null)
      await signIn(email.trim(), password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(readableAuthError(err instanceof Error ? err.message : t.login.errors.generic))
    } finally {
      setSubmitting(false)
    }
  }

  const field =
    'mt-1.5 w-full rounded-md border border-border bg-surface px-3 py-2.5 text-[0.9375rem] ' +
    'outline-none transition-colors placeholder:text-ink-muted/60 ' +
    'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25'

  return (
    <div className="min-h-screen bg-surface lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      {/* The story panel. Deliberately not decoration: it is what the product
          claims, drawn as a journey that outlives the hospital stay. */}
      <section className="relative overflow-hidden bg-panel px-6 py-10 sm:px-10 lg:border-r lg:border-border lg:px-14 lg:py-14">
        <Logo size={34} wordmark />

        <div className="mx-auto flex h-full max-w-md flex-col justify-center lg:max-w-lg">
          <h2 className="mt-10 max-w-sm font-serif text-[1.75rem] leading-[1.25] text-panel-ink lg:mt-0 lg:text-[2.125rem]">
            {t.login.claim}
          </h2>

          <div className="mt-10 lg:mt-12">
            <ContinuitySpine />
          </div>

          <p className="max-w-sm text-[0.8125rem] leading-relaxed text-panel-muted">
            {t.login.support}
          </p>
        </div>
      </section>

      {/* The form. No card, no shadow: it sits on the paper it belongs to. */}
      <section className="flex items-center justify-center px-6 py-12 sm:px-10 lg:py-14">
        <div className="w-full max-w-sm">
          <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight">{t.login.heading}</h1>
          <p className="mt-2 text-sm text-ink-muted">
            {t.login.lead}
          </p>

          <form onSubmit={handleSubmit} className="mt-8" noValidate>
            <label className="block text-[0.8125rem] font-medium" htmlFor="email">
              {t.login.email}
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              autoFocus
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t.login.emailPlaceholder}
              className={field}
            />

            <label className="mt-5 block text-[0.8125rem] font-medium" htmlFor="password">
              {t.login.password}
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={field}
            />

            {error && (
              <p
                role="alert"
                className="mt-5 border-l-2 border-risk-critical py-1 pl-3 text-sm text-risk-critical"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="mt-7 w-full rounded-md bg-primary px-4 py-2.5 text-[0.9375rem] font-medium text-white transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60"
            >
              {submitting ? t.login.submitting : t.login.submit}
            </button>
          </form>

          <p className="mt-6 border-t border-border pt-5 text-[0.8125rem] leading-relaxed text-ink-muted">
            {t.login.noSelfRegistration}
          </p>

          {import.meta.env.DEV && (
            <div className="mt-6 rounded-md bg-surface-sunken p-3 text-[0.75rem] leading-relaxed text-ink-muted">
              <span className="font-medium text-ink">{t.login.devOnly}</span> {t.login.devAccounts}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
