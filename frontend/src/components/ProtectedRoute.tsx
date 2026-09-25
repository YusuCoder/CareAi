import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

import { useAuth } from '../contexts/AuthContext'
import type { MembershipRole } from '../lib/database.types'
import { roleLabel, t } from '../lib/i18n'

interface Props {
  children: ReactNode
  /** When set, the signed-in user must hold one of these roles. */
  allow?: MembershipRole[]
}

export const ProtectedRoute: React.FC<Props> = ({ children, allow }) => {
  const { session, role, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-ink-muted">
        {t.common.loading}
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  if (allow && (!role || !allow.includes(role))) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-md rounded-lg border border-border bg-surface p-6 text-center">
          <h1 className="text-lg font-semibold">{t.guard.deniedTitle}</h1>
          <p className="mt-2 text-sm text-ink-muted">
            {t.guard.deniedBody} {allow.map((r) => roleLabel[r]).join(', ')}.
          </p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
