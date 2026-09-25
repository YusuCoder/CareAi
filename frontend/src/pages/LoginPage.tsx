import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'

import { CareTwinStory } from '../components/auth/CareTwinStory'
import { CARE_CURVE, CurvedDivider } from '../components/auth/CurvedDivider'
import { useStorySequence } from '../components/auth/storySequence'
import { Logo } from '../components/Logo'
import { homeRouteForRole, useAuth } from '../contexts/AuthContext'
import { t } from '../lib/i18n'

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
  const story = useStorySequence()

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
    'outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-ink-muted/60 ' +
    'focus-visible:border-primary focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-primary)_18%,transparent)]'

  return (
    <div className="min-h-screen bg-surface lg:grid lg:grid-cols-[minmax(0,1.04fr)_minmax(0,1fr)]">
      <svg aria-hidden className="absolute size-0" focusable="false">
        <defs>
          <clipPath id="careCurve" clipPathUnits="objectBoundingBox">
            <path d={`M0,0 H0.94 ${CARE_CURVE.replace(/^M[\d.,\s]+/, '')} H0 Z`} />
          </clipPath>
        </defs>
      </svg>

      <section className="relative z-10 flex items-center justify-center px-6 py-12 sm:px-10 lg:order-2 lg:py-14 lg:pl-24">
        <div className="w-full max-w-sm">
          <Logo size={34} wordmark className="logo-in" />

          <h1 className="mt-10 text-[1.75rem] font-semibold leading-tight tracking-tight">
            {t.login.heading}
          </h1>
          <p className="mt-2 text-sm text-ink-muted">{t.login.lead}</p>

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
              className="mt-7 w-full rounded-md bg-primary px-4 py-2.5 text-[0.9375rem] font-medium text-white transition-colors duration-200 hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60"
            >
              {submitting ? t.login.submitting : t.login.submit}
            </button>
          </form>

          <p className="mt-6 border-t border-border pt-5 text-[0.8125rem] leading-relaxed text-ink-muted">
            {t.login.noSelfRegistration}
          </p>
        </div>
      </section>

      <div className="relative lg:order-1 lg:w-[calc(100%+4rem)]">
        <section className="brand-panel relative flex h-full flex-col justify-center rounded-t-[2rem] px-6 py-12 sm:px-10 lg:rounded-none lg:py-16 lg:pl-14 lg:pr-24">
          <h2 className="max-w-md font-serif text-[1.625rem] leading-[1.28] text-panel-ink lg:text-[2rem]">
            {t.login.claim}
          </h2>

          <div className="mt-9 lg:mt-11">
            <CareTwinStory stage={story.stage} leaving={story.leaving} />
          </div>

          <p className="mt-9 max-w-sm text-[0.8125rem] leading-relaxed text-panel-muted">
            {t.login.support}
          </p>
        </section>

        <CurvedDivider pulse={story.pulse} animated={story.animated} />
      </div>
    </div>
  )
}
