import { Link } from 'react-router-dom'

import { ageFromBirthDate, relativeTime, riskColor } from '../lib/format'
import { riskLabel, t, twinStatusLabel, yearsLabel } from '../lib/i18n'
import type { PatientWithTwin } from '../lib/queries'

export const RiskBadge: React.FC<{ level: NonNullable<PatientWithTwin['digital_twins'][number]['risk_level']> }> = ({ level }) => (
  <span
    className="rounded-full px-2 py-0.5 text-[0.6875rem] font-medium text-white"
    style={{ backgroundColor: riskColor[level] }}
  >
    {riskLabel[level]}
  </span>
)

interface Props {
  patient: PatientWithTwin
  meta?: string
}

export const PatientRow: React.FC<Props> = ({ patient, meta }) => {
  const twin = patient.digital_twins?.[0]
  const age = ageFromBirthDate(patient.birth_date)

  return (
    <li>
      <Link
        to={`/patients/${patient.id}`}
        className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-surface-sunken"
      >
        <span className="tabular w-10 shrink-0 text-sm text-ink-muted">
          {t.patients.number}
          {patient.patient_number}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">
            {patient.last_name} {patient.first_name}
          </span>
          <span className="block truncate text-xs text-ink-muted">
            {[age !== null ? yearsLabel(age) : null, meta].filter(Boolean).join(' · ')}
          </span>
        </span>

        <span className="text-sm text-ink-muted">
          {twin ? twinStatusLabel[twin.current_status] : t.common.dash}
        </span>

        {twin?.risk_level && <RiskBadge level={twin.risk_level} />}

        <span className="tabular w-full text-xs text-ink-muted sm:w-28 sm:text-right">
          {twin ? relativeTime(twin.last_updated_at) : ''}
        </span>
      </Link>
    </li>
  )
}

export const EmptyState: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="px-4 py-10 text-center text-sm text-ink-muted">{children}</p>
)

export const Panel: React.FC<{ title?: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="overflow-hidden rounded-lg border border-border bg-surface">
    {title && (
      <header className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
      </header>
    )}
    {children}
  </section>
)
