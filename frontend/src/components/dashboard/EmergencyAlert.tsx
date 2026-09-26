import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { acknowledgeAlert, resolveAlert, setVisitEta, type Alert } from '../../lib/alerts'
import { formatGap, useNow } from '../../lib/activeCalls'
import { relativeTime } from '../../lib/format'
import { t } from '../../lib/i18n'

const RED = 'var(--color-risk-critical)'
const ETA_OPTIONS = [15, 30, 60]

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString('ru-RU', { timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit' })

/** Небольшая карта OpenStreetMap без ключей и внешних скриптов. */
const MiniMap: React.FC<{ lat: number; lon: number }> = ({ lat, lon }) => {
  const d = 0.004
  const bbox = [lon - d, lat - d, lon + d, lat + d].join(',')
  return (
    <iframe
      title={t.alerts.sos.location}
      src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`}
      className="h-44 w-full rounded-md border border-border"
      loading="lazy"
    />
  )
}

/** Короткий сигнал при новом SOS. Браузер может заглушить звук до первого клика — это нормально. */
function playSosBeep(): void {
  try {
    const context = new AudioContext()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'square'
    oscillator.frequency.value = 880
    gain.gain.value = 0.06
    oscillator.connect(gain).connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.35)
    oscillator.onended = () => void context.close()
  } catch {
    // без звука панель всё равно подсвечивает тревогу
  }
}

export const EmergencyAlert: React.FC<{ alert: Alert; fresh: boolean }> = ({ alert, fresh }) => {
  const now = useNow(15_000)
  const [busy, setBusy] = useState<boolean>(false)
  const [closing, setClosing] = useState<boolean>(false)
  const [note, setNote] = useState<string>('')
  const [failure, setFailure] = useState<string | null>(null)
  const beeped = useRef<boolean>(false)

  useEffect(() => {
    if (fresh && !beeped.current) {
      beeped.current = true
      playSosBeep()
    }
  }, [fresh])

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

  const hasLocation = alert.latitude !== null && alert.longitude !== null
  const live = alert.live_location_until !== null && new Date(alert.live_location_until).getTime() > now
  const patientName = alert.patient ? `${alert.patient.last_name} ${alert.patient.first_name}` : t.common.dash
  const mapLink = hasLocation ? `https://www.google.com/maps?q=${alert.latitude},${alert.longitude}` : null

  return (
    <li
      className="border-l-4 px-4 py-3"
      style={{
        borderLeftColor: RED,
        backgroundColor: `color-mix(in oklab, ${RED} ${fresh ? 12 : 6}%, transparent)`,
      }}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.6875rem] font-bold text-white" style={{ backgroundColor: RED }}>
          <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-white" />
          SOS
        </span>
        <Link to={`/patients/${alert.patient_id}`} className="min-w-0 truncate text-sm font-semibold hover:text-primary">
          {patientName}
        </Link>
        <span className="ml-auto text-xs font-semibold tabular" style={{ color: RED }}>
          {t.alerts.sos.waiting} {formatGap(now - new Date(alert.created_at).getTime())}
        </span>
      </div>
      <p className="mt-1 text-[0.8125rem] font-medium" style={{ color: RED }}>{t.alerts.sos.title}</p>

      <div className="mt-2 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-1.5 text-[0.8125rem]">
          {alert.patient?.phone && (
            <a
              href={`tel:${alert.patient.phone.replace(/[^\d+]/g, '')}`}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium text-white"
              style={{ backgroundColor: RED }}
            >
              📞 {t.alerts.sos.call} {alert.patient.phone}
            </a>
          )}
          {alert.patient?.address && (
            <p><span className="text-ink-muted">{t.alerts.sos.address}:</span> {alert.patient.address}</p>
          )}
          {hasLocation ? (
            <p className="text-ink-muted">
              {t.alerts.sos.location}
              {alert.location_accuracy_m !== null && ` · ${t.alerts.sos.accuracy} ±${Math.round(alert.location_accuracy_m)} м`}
              {live && ` · ${t.alerts.sos.live}`}
              {alert.location_at && ` · ${t.alerts.sos.updated} ${relativeTime(alert.location_at)}`}
              {mapLink && (
                <>
                  {' · '}
                  <a href={mapLink} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                    {t.alerts.sos.openMap}
                  </a>
                </>
              )}
            </p>
          ) : (
            <p className="text-ink-muted">{t.alerts.sos.noLocation}</p>
          )}

          <div className="pt-1">
            {alert.visit_eta ? (
              <p className="font-semibold">
                {t.alerts.sos.etaSet} {clock(alert.visit_eta)}
                <span className="font-normal text-ink-muted"> · {t.alerts.sos.etaHint}</span>
              </p>
            ) : (
              <p className="text-xs text-ink-muted">{t.alerts.sos.etaTitle} {t.alerts.sos.etaHint}</p>
            )}
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {ETA_OPTIONS.map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => setVisitEta(alert, minutes))}
                  className="rounded-md border px-2.5 py-1 text-[0.8125rem] font-medium hover:bg-surface disabled:opacity-50"
                  style={{ borderColor: RED, color: RED }}
                >
                  {minutes} {t.alerts.sos.minutes}
                </button>
              ))}
              {alert.status === 'OPEN' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => acknowledgeAlert(alert.id))}
                  className="rounded-md bg-primary-soft px-2.5 py-1 text-[0.8125rem] font-medium text-primary hover:bg-primary/15 disabled:opacity-50"
                >
                  {t.alerts.sos.acknowledge}
                </button>
              )}
            </div>
          </div>
        </div>

        {hasLocation && <MiniMap lat={alert.latitude!} lon={alert.longitude!} />}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {closing ? (
          <>
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
            <button type="button" onClick={() => setClosing(false)} className="px-2 py-1.5 text-[0.8125rem] text-ink-muted hover:text-ink">
              {t.alerts.cancel}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setClosing(true)}
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-[0.8125rem] hover:bg-surface-sunken"
          >
            {t.alerts.resolve}
          </button>
        )}
        <Link to={`/patients/${alert.patient_id}`} className="ml-auto text-xs text-ink-muted hover:text-primary">
          {t.alerts.openPatient} →
        </Link>
      </div>

      {failure && <p className="mt-1.5 text-xs text-risk-critical">{failure}</p>}
    </li>
  )
}
