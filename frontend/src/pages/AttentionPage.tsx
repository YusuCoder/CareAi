import { Link } from 'react-router-dom'

import { DashboardLayout } from '../components/layout/DashboardLayout'
import { EmptyState, Panel } from '../components/PatientRow'
import { useAuth } from '../contexts/AuthContext'
import { useAttention } from '../lib/queries'
import { seesTelegramFeed } from '../lib/telegram'
import { dateTime } from '../lib/format'
import { t } from '../lib/i18n'

export const AttentionPage: React.FC = () => {
  const { role } = useAuth()
  const { data: events, loading, error } = useAttention({ includeTelegram: seesTelegramFeed(role) })

  return (
    <DashboardLayout title={t.attention.title} subtitle={t.attention.subtitle}>
      {error && (
        <p className="mb-4 border-l-2 border-risk-critical py-1 pl-3 text-sm text-risk-critical">{error}</p>
      )}

      <Panel>
        {loading && <EmptyState>{t.common.loading}</EmptyState>}
        {!loading && events.length === 0 && <EmptyState>{t.attention.empty}</EmptyState>}

        <ul className="divide-y divide-border">
          {events.map((event) => (
            <li key={event.id}>
              <Link
                to={event.patient ? `/patients/${event.patient.id}` : '#'}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-surface-sunken"
              >
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{
                    backgroundColor:
                      event.severity === 'CRITICAL'
                        ? 'var(--color-risk-critical)'
                        : 'var(--color-risk-high)',
                  }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{event.title}</span>
                  <span className="block truncate text-xs text-ink-muted">
                    {event.patient
                      ? `${event.patient.last_name} ${event.patient.first_name}`
                      : t.common.dash}
                  </span>
                </span>
                <span className="tabular text-xs text-ink-muted">{dateTime(event.occurred_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Panel>

      <p className="mt-4 text-xs text-ink-muted">{t.attention.note}</p>
    </DashboardLayout>
  )
}
