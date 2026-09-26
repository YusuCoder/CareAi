import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { DashboardLayout } from '../components/layout/DashboardLayout'
import { EmptyState, Panel } from '../components/PatientRow'
import {
  acknowledgeCall,
  completeCall,
  formatGap,
  isOverdue,
  useActiveCalls,
  useNow,
  type ActiveCall,
  type ActiveCallOutcome,
  type ActiveCallStats,
} from '../lib/activeCalls'
import { dateTime } from '../lib/format'
import { t } from '../lib/i18n'

const OUTCOMES: ActiveCallOutcome[] = [
  'CONTACTED',
  'VISITED',
  'UNREACHABLE',
  'REFUSED',
  'ESCALATED',
]

type Filter = 'open' | 'overdue' | 'all'

const statusColor = (call: ActiveCall, now: number): string => {
  if (isOverdue(call, now)) return 'var(--color-risk-critical)'
  if (call.status === 'COMPLETED') return 'var(--color-risk-low)'
  if (call.status === 'ACKNOWLEDGED') return 'var(--color-risk-medium)'
  if (call.status === 'CANCELLED') return 'var(--color-ink-muted)'
  return 'var(--color-risk-high)'
}

const statusText = (call: ActiveCall, now: number): string => {
  if (isOverdue(call, now)) return t.calls.overdue
  if (call.status === 'COMPLETED') return t.calls.completed
  if (call.status === 'ACKNOWLEDGED') return t.calls.acknowledged
  if (call.status === 'CANCELLED') return t.calls.cancelled
  return t.calls.pending
}

const Chip: React.FC<{ color: string; children: React.ReactNode }> = ({ color, children }) => (
  <span
    className="shrink-0 rounded-md px-2 py-0.5 text-[0.6875rem] font-medium"
    style={{ color, backgroundColor: `color-mix(in oklab, ${color} 12%, transparent)` }}
  >
    {children}
  </span>
)

/** The 24-hour clock, ticking. It is the whole point of the screen. */
const Countdown: React.FC<{ call: ActiveCall; now: number }> = ({ call, now }) => {
  if (call.status === 'COMPLETED' && call.completed_at) {
    const took = new Date(call.completed_at).getTime() - new Date(call.created_at).getTime()
    const late = new Date(call.completed_at).getTime() > new Date(call.due_at).getTime()
    return (
      <span className="tabular text-xs" style={{ color: late ? 'var(--color-risk-medium)' : 'var(--color-risk-low)' }}>
        {t.calls.took}: {formatGap(took)}
      </span>
    )
  }
  if (call.status === 'CANCELLED') return <span className="text-xs text-ink-muted">{t.common.dash}</span>

  const remaining = new Date(call.due_at).getTime() - now
  const late = remaining <= 0
  return (
    <span
      className="tabular text-sm font-semibold"
      style={{ color: late ? 'var(--color-risk-critical)' : 'var(--color-ink)' }}
    >
      {late ? t.calls.overdueBy : t.calls.due} {formatGap(Math.abs(remaining))}
    </span>
  )
}

const StatsStrip: React.FC<{ stats: ActiveCallStats }> = ({ stats }) => {
  const items: Array<{ label: string; value: string; color?: string }> = [
    { label: t.calls.stats.total, value: String(stats.total) },
    { label: t.calls.stats.pending, value: String(stats.pending) },
    {
      label: t.calls.stats.overdue,
      value: String(stats.overdue),
      color: stats.overdue > 0 ? 'var(--color-risk-critical)' : undefined,
    },
    {
      label: t.calls.stats.within,
      value: stats.completed > 0 ? `${stats.within_24h}/${stats.completed}` : t.common.dash,
      color: 'var(--color-risk-low)',
    },
    {
      label: t.calls.stats.median,
      value:
        stats.median_hours === null
          ? t.common.dash
          : `${stats.median_hours.toLocaleString('ru-RU')} ${t.calls.stats.hours}`,
    },
  ]

  return (
    <dl className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-5">
      {items.map((item) => (
        <div key={item.label} className="bg-surface px-4 py-3">
          <dt className="text-[0.6875rem] leading-tight text-ink-muted">{item.label}</dt>
          <dd className="tabular mt-1 text-lg font-semibold" style={item.color ? { color: item.color } : undefined}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

const Row: React.FC<{ call: ActiveCall; now: number; onChanged: () => void }> = ({
  call,
  now,
  onChanged,
}) => {
  const [confirming, setConfirming] = useState(false)
  const [outcome, setOutcome] = useState<ActiveCallOutcome>('CONTACTED')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (action: () => Promise<void>) => {
    try {
      setBusy(true)
      setError(null)
      await action()
      setConfirming(false)
      onChanged()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось выполнить действие.')
    } finally {
      setBusy(false)
    }
  }

  const open = call.status === 'PENDING' || call.status === 'ACKNOWLEDGED'
  const color = statusColor(call, now)

  return (
    <li className="px-4 py-3" data-overdue={isOverdue(call, now) || undefined}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />

        <Link to={`/patients/${call.patient_id}`} className="min-w-0 flex-1">
          <span className="block truncate font-medium hover:text-primary">
            {call.patient ? `${call.patient.last_name} ${call.patient.first_name}` : t.common.dash}
          </span>
          <span className="tabular block truncate text-xs text-ink-muted">
            {call.patient && `№${call.patient.patient_number} · `}
            {t.calls.dischargedAt}: {dateTime(call.created_at)}
          </span>
        </Link>

        <Chip color={color}>{statusText(call, now)}</Chip>

        <div className="w-40 shrink-0 text-right">
          <Countdown call={call} now={now} />
        </div>

        <div className="flex shrink-0 gap-2">
          {call.status === 'PENDING' && (
            <button
              type="button"
              onClick={() => void run(() => acknowledgeCall(call.id))}
              disabled={busy}
              className="rounded-md border border-border px-2.5 py-1.5 text-xs text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink disabled:opacity-50"
            >
              {t.calls.take}
            </button>
          )}
          {open && (
            <button
              type="button"
              onClick={() => setConfirming((value) => !value)}
              disabled={busy}
              className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
            >
              {t.calls.confirm}
            </button>
          )}
        </div>
      </div>

      {!open && call.outcome && (
        <p className="mt-1.5 pl-6 text-xs text-ink-muted">
          {t.calls.outcomes[call.outcome]}
          {call.notes && ` — ${call.notes}`}
        </p>
      )}

      {confirming && (
        <div className="mt-3 rounded-lg border border-border bg-surface-sunken p-3">
          <p className="text-[0.8125rem] font-medium">{t.calls.confirm}</p>

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {OUTCOMES.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setOutcome(option)}
                className="rounded-md border px-2.5 py-1.5 text-xs transition-colors"
                style={
                  outcome === option
                    ? { borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }
                    : { borderColor: 'var(--color-border)', color: 'var(--color-ink-muted)' }
                }
              >
                {t.calls.outcomes[option]}
              </button>
            ))}
          </div>

          <input
            type="text"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder={t.calls.notes}
            className="mt-2.5 w-full rounded-md border border-border bg-surface px-3 py-2 text-[0.8125rem] outline-none focus-visible:border-primary"
          />

          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              onClick={() => void run(() => completeCall(call.id, outcome, notes))}
              disabled={busy}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {busy ? t.calls.confirming : t.calls.confirm}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-ink-muted"
            >
              {t.calls.cancel}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-2 border-l-2 border-risk-critical pl-2 text-xs text-risk-critical">{error}</p>
      )}
    </li>
  )
}

export const ActiveCallsPage: React.FC = () => {
  const { data, stats, loading, error, refresh } = useActiveCalls()
  const [filter, setFilter] = useState<Filter>('open')
  const now = useNow()

  const calls = useMemo(() => {
    const open = (call: ActiveCall) => call.status === 'PENDING' || call.status === 'ACKNOWLEDGED'
    const visible =
      filter === 'all'
        ? data
        : filter === 'overdue'
          ? data.filter((call) => isOverdue(call, now))
          : data.filter(open)

    // breached first, then by how little time is left
    return [...visible].sort((a, b) => {
      if (open(a) !== open(b)) return open(a) ? -1 : 1
      return new Date(a.due_at).getTime() - new Date(b.due_at).getTime()
    })
  }, [data, filter, now])

  return (
    <DashboardLayout title={t.calls.title} subtitle={t.calls.subtitle}>
      {error && (
        <p className="mb-4 border-l-2 border-risk-critical py-1 pl-3 text-sm text-risk-critical">{error}</p>
      )}

      {stats && <StatsStrip stats={stats} />}

      <div className="mb-3 flex gap-1.5">
        {(['open', 'overdue', 'all'] as Filter[]).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setFilter(option)}
            className="rounded-md border px-2.5 py-1.5 text-xs transition-colors"
            style={
              filter === option
                ? { borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }
                : { borderColor: 'var(--color-border)', color: 'var(--color-ink-muted)' }
            }
          >
            {t.calls.filters[option]}
          </button>
        ))}
      </div>

      <Panel>
        {loading && <EmptyState>{t.common.loading}</EmptyState>}
        {!loading && calls.length === 0 && <EmptyState>{t.calls.empty}</EmptyState>}

        <ul className="divide-y divide-border">
          {calls.map((call) => (
            <Row key={call.id} call={call} now={now} onChanged={refresh} />
          ))}
        </ul>
      </Panel>
    </DashboardLayout>
  )
}
