import { useEffect, useState } from 'react'

import { AppShell } from '../components/AppShell'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { ageFromBirthDate, dateTime, relativeTime, riskColor } from '../lib/format'
import { riskLabel, t, twinStatusLabel, yearsLabel } from '../lib/i18n'
import type { DigitalTwin, Patient, TwinEvent } from '../lib/database.types'

interface VisiblePatient extends Patient {
  digital_twins: DigitalTwin[]
}

/**
 * Connection check. Everything below is fetched with the anon key as the
 * signed-in user, so what appears here is exactly what RLS allows that person
 * to see — nothing is filtered in the browser.
 *
 * This page is scaffolding: replace it with the real dashboards as the designs
 * arrive.
 */
export const HomePage: React.FC = () => {
  const { activeMembership } = useAuth()
  const [patients, setPatients] = useState<VisiblePatient[]>([])
  const [events, setEvents] = useState<TwinEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(true)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)

      const [patientResult, eventResult] = await Promise.all([
        supabase
          .from('patients')
          .select('*, digital_twins(*)')
          .order('patient_number', { ascending: true }),
        supabase
          .from('twin_events')
          .select('*')
          .order('occurred_at', { ascending: false })
          .limit(8),
      ])

      if (cancelled) return

      if (patientResult.error) setError(patientResult.error.message)
      else setPatients((patientResult.data ?? []) as unknown as VisiblePatient[])

      if (eventResult.error) setError(eventResult.error.message)
      else setEvents(eventResult.data ?? [])

      setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [activeMembership?.id])

  return (
    <AppShell
      title={t.home.title}
      subtitle={t.home.subtitle}
    >
      {error && (
        <p className="mb-6 rounded-md border border-risk-critical/30 bg-risk-critical/10 px-3 py-2 text-sm text-risk-critical">
          {error}
        </p>
      )}

      <section className="rounded-lg border border-border bg-surface">
        <header className="flex items-baseline justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">{t.home.patientsHeading}</h2>
          <span className="tabular text-sm text-ink-muted">
            {loading ? '…' : patients.length}
          </span>
        </header>

        {!loading && patients.length === 0 && (
          <p className="px-4 py-6 text-sm text-ink-muted">{t.home.patientsEmpty}</p>
        )}

        <ul className="divide-y divide-border">
          {patients.map((patient) => {
            const twin = patient.digital_twins[0]
            const age = ageFromBirthDate(patient.birth_date)
            return (
              <li key={patient.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <span className="tabular w-12 text-sm text-ink-muted">#{patient.patient_number}</span>
                <span className="font-medium">
                  {patient.last_name} {patient.first_name}
                </span>
                {age !== null && <span className="text-sm text-ink-muted">{yearsLabel(age)}</span>}
                <span className="ml-auto text-sm text-ink-muted">
                  {twin ? twinStatusLabel[twin.current_status] : t.common.dash}
                </span>
                {twin?.risk_level && (
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                    style={{ backgroundColor: riskColor[twin.risk_level] }}
                  >
                    {riskLabel[twin.risk_level]}
                  </span>
                )}
                {twin && (
                  <span className="w-full text-xs text-ink-muted sm:w-auto">
                    {t.home.updated} {relativeTime(twin.last_updated_at)}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      <section className="mt-6 rounded-lg border border-border bg-surface">
        <header className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">{t.home.eventsHeading}</h2>
        </header>
        <ul className="divide-y divide-border">
          {events.map((event) => (
            <li key={event.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{
                  backgroundColor:
                    event.phase === 'HOSPITAL'
                      ? 'var(--color-phase-hospital)'
                      : 'var(--color-phase-home)',
                }}
                title={event.phase}
              />
              <span className="tabular w-32 shrink-0 text-xs text-ink-muted">
                {dateTime(event.occurred_at)}
              </span>
              <span className="text-sm">{event.title}</span>
              {event.severity !== 'INFO' && (
                <span className="ml-auto text-xs font-medium text-risk-high">{event.severity}</span>
              )}
            </li>
          ))}
          {!loading && events.length === 0 && (
            <li className="px-4 py-6 text-sm text-ink-muted">{t.home.eventsEmpty}</li>
          )}
        </ul>
      </section>
    </AppShell>
  )
}
