import { Link } from 'react-router-dom'

import { DashboardLayout } from '../components/layout/DashboardLayout'
import { EmptyState, Panel } from '../components/PatientRow'
import { useOpenAdmissions } from '../lib/discharge'
import { dateTime } from '../lib/format'
import { plural, t } from '../lib/i18n'

const DAY = 24 * 3600_000

export const AdmissionsPage: React.FC = () => {
  const { data, loading, error } = useOpenAdmissions()

  return (
    <DashboardLayout title={t.discharge.listTitle} subtitle={t.discharge.listSubtitle}>
      {error && (
        <p className="mb-4 border-l-2 border-risk-critical py-1 pl-3 text-sm text-risk-critical">{error}</p>
      )}

      <Panel>
        {loading && <EmptyState>{t.common.loading}</EmptyState>}
        {!loading && data.length === 0 && <EmptyState>{t.discharge.listEmpty}</EmptyState>}

        <ul className="divide-y divide-border">
          {data.map((admission) => {
            const days = Math.max(1, Math.floor((Date.now() - new Date(admission.admitted_at).getTime()) / DAY))
            return (
              <li key={admission.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <Link to={`/patients/${admission.patient_id}`} className="min-w-0 flex-1">
                  <span className="block truncate font-medium hover:text-primary">
                    {admission.patient
                      ? `${admission.patient.last_name} ${admission.patient.first_name}`
                      : t.common.dash}
                  </span>
                  <span className="block truncate text-xs text-ink-muted">
                    {admission.primary_diagnosis ?? admission.admission_reason ?? t.common.dash}
                  </span>
                </Link>

                <span className="tabular shrink-0 text-xs text-ink-muted">
                  {t.discharge.admitted}: {dateTime(admission.admitted_at)} · {days}{' '}
                  {plural(days, ['сутки', 'суток', 'суток'])}
                </span>

                <Link
                  to={`/discharge/${admission.id}`}
                  className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-hover"
                >
                  {t.discharge.open}
                </Link>
              </li>
            )
          })}
        </ul>
      </Panel>
    </DashboardLayout>
  )
}
