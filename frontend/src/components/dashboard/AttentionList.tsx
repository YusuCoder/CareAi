import { Link } from 'react-router-dom'

import { RiskBadge } from '../PatientRow'
import { relativeTime } from '../../lib/format'
import { t } from '../../lib/i18n'
import type { AttentionEvent, PatientWithTwin } from '../../lib/queries'
import type { RiskLevel } from '../../lib/database.types'

const RANK: Record<RiskLevel, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }

interface Card {
  patientId: string
  name: string
  number: number
  risk: RiskLevel | null
  latest: AttentionEvent | null
}

export const AttentionList: React.FC<{
  patients: PatientWithTwin[]
  events: AttentionEvent[]
  loading: boolean
}> = ({ patients, events, loading }) => {
  const cards = new Map<string, Card>()

  for (const patient of patients) {
    const risk = patient.digital_twins?.[0]?.risk_level ?? null
    if (risk === 'HIGH' || risk === 'CRITICAL') {
      cards.set(patient.id, {
        patientId: patient.id,
        name: `${patient.last_name} ${patient.first_name}`,
        number: patient.patient_number,
        risk,
        latest: null,
      })
    }
  }

  for (const event of events) {
    if (!event.patient) continue
    const existing = cards.get(event.patient.id)
    if (existing) {
      if (!existing.latest) existing.latest = event
    } else {
      cards.set(event.patient.id, {
        patientId: event.patient.id,
        name: `${event.patient.last_name} ${event.patient.first_name}`,
        number: event.patient.patient_number,
        risk: null,
        latest: event,
      })
    }
  }

  const ordered = [...cards.values()].sort((a, b) => {
    const byRisk = (a.risk ? RANK[a.risk] : 9) - (b.risk ? RANK[b.risk] : 9)
    if (byRisk !== 0) return byRisk
    const at = a.latest ? new Date(a.latest.occurred_at).getTime() : 0
    const bt = b.latest ? new Date(b.latest.occurred_at).getTime() : 0
    return bt - at
  })

  return (
    <section className="overflow-hidden rounded-lg border border-border">
      <header className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">{t.overview.attentionHeading}</h2>
      </header>

      {loading && <p className="px-4 py-8 text-center text-sm text-ink-muted">{t.common.loading}</p>}
      {!loading && ordered.length === 0 && (
        <p className="px-4 py-8 text-center text-sm text-ink-muted">{t.overview.attentionEmpty}</p>
      )}

      <ul className="divide-y divide-border">
        {ordered.slice(0, 8).map((card) => (
          <li key={card.patientId}>
            <Link
              to={`/patients/${card.patientId}`}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-surface-sunken"
            >
              <span className="tabular w-10 shrink-0 text-sm text-ink-muted">№{card.number}</span>

              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{card.name}</span>
                {card.latest && (
                  <span className="block truncate text-xs text-ink-muted">
                    {t.overview.changed}: {card.latest.title}
                  </span>
                )}
              </span>

              {card.risk && <RiskBadge level={card.risk} />}

              <span className="tabular w-full text-xs text-ink-muted sm:w-28 sm:text-right">
                {card.latest ? relativeTime(card.latest.occurred_at) : ''}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
