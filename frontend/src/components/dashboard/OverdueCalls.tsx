import { Link } from 'react-router-dom'

import { formatGap, isOverdue, useActiveCalls, useNow } from '../../lib/activeCalls'
import { t } from '../../lib/i18n'

/** Renders nothing when nobody is late — an empty state here would be noise. */
export const OverdueCalls: React.FC = () => {
  const { data } = useActiveCalls()
  const now = useNow(30_000)

  const breached = data
    .filter((call) => isOverdue(call, now))
    .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime())

  if (breached.length === 0) return null

  return (
    <section
      className="overflow-hidden rounded-lg border"
      style={{
        borderColor: 'var(--color-risk-critical)',
        backgroundColor: 'color-mix(in oklab, var(--color-risk-critical) 5%, transparent)',
      }}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--color-risk-critical)' }}>
          {t.calls.overdueTitle} · {breached.length}
        </h2>
        <Link to="/active-calls" className="text-xs text-ink-muted hover:text-primary">
          {t.calls.openAll}
        </Link>
      </header>

      <ul className="divide-y" style={{ borderColor: 'color-mix(in oklab, var(--color-risk-critical) 20%, transparent)' }}>
        {breached.slice(0, 5).map((call) => (
          <li key={call.id}>
            <Link
              to={`/patients/${call.patient_id}`}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 transition-colors hover:bg-surface-sunken"
            >
              <span className="min-w-0 flex-1 truncate text-sm">
                {call.patient ? `${call.patient.last_name} ${call.patient.first_name}` : t.common.dash}
              </span>
              <span className="tabular text-xs font-semibold" style={{ color: 'var(--color-risk-critical)' }}>
                {t.calls.overdueBy} {formatGap(now - new Date(call.due_at).getTime())}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
