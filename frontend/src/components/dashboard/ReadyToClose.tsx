import { useState } from 'react'
import { Link } from 'react-router-dom'

import { completeCarePlan, extendCarePlan, useFollowUpCandidates } from '../../lib/closure'
import { dateShort } from '../../lib/format'
import { plural, t } from '../../lib/i18n'
import type { FollowUpCandidate } from '../../lib/database.types'

const Chip: React.FC<{ color: string; children: React.ReactNode }> = ({ color, children }) => (
  <span
    className="rounded-md px-2 py-0.5 text-[0.6875rem]"
    style={{ color, backgroundColor: `color-mix(in oklab, ${color} 12%, transparent)` }}
  >
    {children}
  </span>
)

const Row: React.FC<{ item: FollowUpCandidate; onChanged: () => void }> = ({ item, onChanged }) => {
  const [confirming, setConfirming] = useState(false)
  const [note, setNote] = useState('')
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

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="tabular w-10 shrink-0 text-sm text-ink-muted">№{item.patient_number}</span>

        <Link to={`/patients/${item.patient_id}`} className="min-w-0 flex-1">
          <span className="block truncate font-medium hover:text-primary">
            {item.last_name} {item.first_name}
          </span>
          <span className="block truncate text-xs text-ink-muted">
            {item.plan_title}
            {item.plan_end_date && ` · до ${dateShort(item.plan_end_date)}`}
          </span>
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          {item.ready && <Chip color="var(--color-risk-low)">{t.closure.ready}</Chip>}
          {item.plan_overdue && <Chip color="var(--color-risk-medium)">{t.closure.overdue}</Chip>}
          <span className="tabular text-xs text-ink-muted">
            {item.stable_days} {plural(item.stable_days, ['день', 'дня', 'дней'])} {t.closure.stableDays}
          </span>
          <span className="tabular text-xs text-ink-muted">
            {item.patient_reports} {t.closure.reports}
          </span>
        </div>

        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => void run(() => extendCarePlan(item.care_plan_id, item.plan_end_date))}
            disabled={busy}
            className="rounded-md border border-border px-2.5 py-1.5 text-xs text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink disabled:opacity-50"
          >
            {t.closure.extend}
          </button>
          <button
            type="button"
            onClick={() => setConfirming((value) => !value)}
            disabled={busy}
            className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            {t.closure.finish}
          </button>
        </div>
      </div>

      {confirming && (
        <div className="mt-3 rounded-lg border border-border bg-surface-sunken p-3">
          <p className="text-[0.8125rem] font-medium">{t.closure.confirmTitle}</p>
          <p className="mt-1 text-[0.75rem] leading-snug text-ink-muted">{t.closure.confirmBody}</p>

          <input
            type="text"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t.closure.note}
            className="mt-2.5 w-full rounded-md border border-border bg-surface px-3 py-2 text-[0.8125rem] outline-none focus-visible:border-primary"
          />

          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              onClick={() => void run(() => completeCarePlan(item.care_plan_id, note))}
              disabled={busy}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {busy ? t.closure.finishing : t.closure.finish}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-ink-muted"
            >
              {t.closure.cancel}
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

export const ReadyToClose: React.FC = () => {
  const { data, loading, error, refresh } = useFollowUpCandidates()

  const candidates = data
    .filter((item) => (item.ready || item.plan_overdue) && !item.silent)
    .sort((a, b) => Number(b.ready) - Number(a.ready))

  return (
    <section className="overflow-hidden rounded-lg border border-border">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">{t.closure.title}</h2>
        <p className="text-xs text-ink-muted">{t.closure.subtitle}</p>
      </header>

      {error && <p className="px-4 py-3 text-sm text-risk-critical">{error}</p>}
      {loading && <p className="px-4 py-8 text-center text-sm text-ink-muted">{t.common.loading}</p>}
      {!loading && candidates.length === 0 && (
        <p className="px-4 py-8 text-center text-sm text-ink-muted">{t.closure.empty}</p>
      )}

      <ul className="divide-y divide-border">
        {candidates.map((item) => (
          <Row key={item.care_plan_id} item={item} onChanged={refresh} />
        ))}
      </ul>
    </section>
  )
}
