import { Link } from 'react-router-dom'

import type { PatientWithTwin } from '../../lib/queries'
import { t } from '../../lib/i18n'

const SILENT_MS = 2 * 24 * 3600_000

interface Cell {
  label: string
  value: number
  to?: string
  alarming?: boolean
}

export const ContinuityStrip: React.FC<{ patients: PatientWithTwin[]; loading: boolean }> = ({
  patients,
  loading,
}) => {
  const twinOf = (patient: PatientWithTwin) => patient.digital_twins?.[0]

  const inHospital = patients.filter((p) => twinOf(p)?.current_status === 'HOSPITALIZED')
  const monitored = patients.filter((p) => twinOf(p)?.current_status === 'POST_DISCHARGE_MONITORING')
  const atRisk = patients.filter((p) => ['HIGH', 'CRITICAL'].includes(twinOf(p)?.risk_level ?? ''))
  const silent = monitored.filter((p) => {
    const updated = twinOf(p)?.last_updated_at
    return updated ? Date.now() - new Date(updated).getTime() > SILENT_MS : false
  })

  const cells: Cell[] = [
    { label: t.overview.inHospital, value: inHospital.length },
    { label: t.overview.monitored, value: monitored.length },
    { label: t.overview.needsAttention, value: atRisk.length, to: '/attention', alarming: atRisk.length > 0 },
    { label: t.overview.silent, value: silent.length, alarming: silent.length > 0 },
  ]

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold">{t.overview.continuity}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cells.map((cell) => {
          const body = (
            <>
              <p
                className="tabular text-2xl font-semibold"
                style={cell.alarming ? { color: 'var(--color-risk-high)' } : undefined}
              >
                {loading ? '—' : cell.value}
              </p>
              <p className="mt-0.5 text-xs leading-snug text-ink-muted">{cell.label}</p>
            </>
          )
          return cell.to ? (
            <Link
              key={cell.label}
              to={cell.to}
              className="rounded-lg border border-border px-4 py-3 transition-colors hover:bg-surface-sunken"
            >
              {body}
            </Link>
          ) : (
            <div key={cell.label} className="rounded-lg border border-border px-4 py-3">
              {body}
            </div>
          )
        })}
      </div>
    </section>
  )
}
