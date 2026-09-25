import type { ReactNode } from 'react'

import { useAuth } from '../contexts/AuthContext'
import { fullName } from '../lib/format'
import { roleLabel, t } from '../lib/i18n'
import { Logo } from './Logo'

interface Props {
  title: string
  subtitle?: string
  children: ReactNode
}

export const AppShell: React.FC<Props> = ({ title, subtitle, children }) => {
  const { profile, memberships, activeMembership, setActiveMembership, signOut } = useAuth()

  return (
    <div className="min-h-screen bg-surface-muted">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
          <div className="mr-auto flex items-center gap-3">
            <Logo size={30} />
            <div>
              <div className="text-sm font-semibold tracking-tight">{t.brand}</div>
              <div className="text-xs text-ink-muted">
                {activeMembership?.organization.name ?? t.common.noOrganization}
              </div>
            </div>
          </div>

          {memberships.length > 1 && (
            <select
              value={activeMembership?.id ?? ''}
              onChange={(event) => setActiveMembership(event.target.value)}
              className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
            >
              {memberships.map((membership) => (
                <option key={membership.id} value={membership.id}>
                  {membership.organization.name} — {roleLabel[membership.role]}
                </option>
              ))}
            </select>
          )}

          <div className="text-right text-sm">
            <div className="font-medium">{fullName(profile)}</div>
            <div className="text-xs text-ink-muted">
              {activeMembership ? roleLabel[activeMembership.role] : t.common.dash}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void signOut()}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-sunken"
          >
            {t.common.signOut}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </main>
    </div>
  )
}
