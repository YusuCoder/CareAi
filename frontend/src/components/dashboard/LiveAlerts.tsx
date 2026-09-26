import { useState } from 'react'
import { Link } from 'react-router-dom'

import { EmergencyAlert } from './EmergencyAlert'
import { acknowledgeAlert, resolveAlert, useOpenAlerts, type Alert } from '../../lib/alerts'
import type { AlertKind } from '../../lib/database.types'
import { relativeTime, riskColor } from '../../lib/format'
import { riskLabel, t } from '../../lib/i18n'

const Sparkle = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor" aria-hidden className="shrink-0">
    <path d="M12 2.5l1.7 4.6 4.6 1.7-4.6 1.7L12 15.1l-1.7-4.6-4.6-1.7 4.6-1.7z" />
    <path d="M18.5 14.5l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9z" opacity=".6" />
  </svg>
)

const AlertCard: React.FC<{ alert: Alert; fresh: boolean }> = ({ alert, fresh }) => {
  const [busy, setBusy] = useState<boolean>(false)
  const [closing, setClosing] = useState<boolean>(false)
  const [note, setNote] = useState<string>('')
  const [failure, setFailure] = useState<string | null>(null)
  const color = riskColor[alert.level]

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setFailure(null)
    try {
      await action()
    } catch (caught) {
      setFailure(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <li
      className="px-4 py-3 transition-colors"
      style={fresh ? { backgroundColor: `color-mix(in oklab, ${color} 7%, transparent)` } : undefined}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span
          className="rounded-full px-2 py-0.5 text-[0.6875rem] font-medium text-white"
          style={{ backgroundColor: color }}
        >
          {alert.kind === 'RISK' ? riskLabel[alert.level] : t.alerts.kind.MISSED_CHECK_IN}
        </span>
        {fresh && (
          <span className="flex items-center gap-1 text-[0.6875rem] font-semibold" style={{ color }}>
            <span aria-hidden className="size-1.5 animate-pulse rounded-full" style={{ backgroundColor: color }} />
            {t.alerts.newAlert}
          </span>
        )}
        <Link
          to={`/patients/${alert.patient_id}`}
          className="min-w-0 truncate text-sm font-medium hover:text-primary"
        >
          {alert.patient ? `${alert.patient.last_name} ${alert.patient.first_name}` : t.common.dash}
        </Link>
        <span className="ml-auto text-xs text-ink-muted tabular">
          {alert.status === 'ACKNOWLEDGED' && `${t.alerts.status.ACKNOWLEDGED} · `}
          {relativeTime(alert.created_at)}
          {alert.check_in_id && ` · ${t.alerts.fromTelegram}`}
        </span>
      </div>

      {alert.reasons.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {alert.reasons.slice(0, 5).map((reason) => (
            <li key={`${reason.code}-${reason.source_id}`} className="flex gap-2 text-[0.8125rem] leading-snug">
              <span
                aria-hidden
                className="mt-1.5 size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: riskColor[reason.level] }}
              />
              <span>{reason.detail}</span>
            </li>
          ))}
        </ul>
      )}

      {alert.kind === 'RISK' && (
        <div className="mt-2 rounded-md bg-surface-sunken px-3 py-2">
          <p className="flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-primary">
            <Sparkle />
            {t.alerts.aiTitle}
          </p>
          {alert.ai_summary ? (
            <p className="mt-1 whitespace-pre-line text-[0.8125rem] leading-relaxed">{alert.ai_summary}</p>
          ) : alert.ai_error ? (
            <p className="mt-1 text-xs text-ink-muted">{t.alerts.aiFailed}: {alert.ai_error}</p>
          ) : (
            <p className="mt-1 animate-pulse text-xs text-ink-muted">{t.alerts.aiPending}</p>
          )}
          <p className="mt-1.5 text-[0.6875rem] leading-snug text-ink-muted">{t.alerts.aiDisclaimer}</p>
        </div>
      )}

      {closing ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t.alerts.resolveNote}
            className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2.5 py-1.5 text-[0.8125rem]"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => resolveAlert(alert.id, note))}
            className="rounded-md bg-primary px-3 py-1.5 text-[0.8125rem] font-medium text-white hover:bg-primary-hover disabled:opacity-50"
          >
            {t.alerts.confirmResolve}
          </button>
          <button
            type="button"
            onClick={() => setClosing(false)}
            className="px-2 py-1.5 text-[0.8125rem] text-ink-muted hover:text-ink"
          >
            {t.alerts.cancel}
          </button>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {alert.status === 'OPEN' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => acknowledgeAlert(alert.id))}
              className="rounded-md bg-primary-soft px-3 py-1.5 text-[0.8125rem] font-medium text-primary hover:bg-primary/15 disabled:opacity-50"
            >
              {t.alerts.acknowledge}
            </button>
          )}
          <button
            type="button"
            onClick={() => setClosing(true)}
            className="rounded-md border border-border px-3 py-1.5 text-[0.8125rem] hover:bg-surface-sunken"
          >
            {t.alerts.resolve}
          </button>
          <Link to={`/patients/${alert.patient_id}`} className="ml-auto text-xs text-ink-muted hover:text-primary">
            {t.alerts.openPatient} →
          </Link>
        </div>
      )}

      {failure && <p className="mt-1.5 text-xs text-risk-critical">{failure}</p>}
    </li>
  )
}

/** Тревоги движка риска и пропущенные опросы. Ничего не рисует, пока тревог нет. */
export const LiveAlerts: React.FC<{ kinds: AlertKind[] }> = ({ kinds }) => {
  const { data, loading, error, fresh } = useOpenAlerts(kinds)

  if (kinds.length === 0) return null
  if (loading || (data.length === 0 && !error)) return null
  const sos = data.some((alert) => alert.kind === 'EMERGENCY')

  return (
    <section
      className="overflow-hidden rounded-lg border bg-surface"
      style={{ borderColor: sos ? 'var(--color-risk-critical)' : 'var(--color-border)' }}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">
          {t.alerts.title} · {data.length}
        </h2>
        <span className="flex items-center gap-1.5 text-xs text-ink-muted">
          <span aria-hidden className="size-1.5 rounded-full bg-risk-low" />
          {t.alerts.live}
        </span>
      </header>
      {error && <p className="px-4 py-3 text-sm text-risk-critical">{error}</p>}
      <ul className="divide-y divide-border">
        {data.map((alert) =>
          alert.kind === 'EMERGENCY'
            ? <EmergencyAlert key={alert.id} alert={alert} fresh={fresh.has(alert.id)} />
            : <AlertCard key={alert.id} alert={alert} fresh={fresh.has(alert.id)} />,
        )}
      </ul>
    </section>
  )
}
