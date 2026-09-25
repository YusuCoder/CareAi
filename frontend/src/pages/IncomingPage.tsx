import { DashboardLayout } from '../components/layout/DashboardLayout'
import { EmptyState, Panel, PatientRow } from '../components/PatientRow'
import { useIncomingCases } from '../lib/queries'
import { t } from '../lib/i18n'

export const IncomingPage: React.FC = () => {
  const { data: cases, loading, error } = useIncomingCases()

  const sorted = [...cases].sort(
    (a, b) => (a.care_assignments?.length ?? 0) - (b.care_assignments?.length ?? 0),
  )

  return (
    <DashboardLayout title={t.incoming.title} subtitle={t.incoming.subtitle}>
      {error && (
        <p className="mb-4 border-l-2 border-risk-critical py-1 pl-3 text-sm text-risk-critical">{error}</p>
      )}

      <Panel>
        {loading && <EmptyState>{t.common.loading}</EmptyState>}
        {!loading && sorted.length === 0 && <EmptyState>{t.incoming.empty}</EmptyState>}

        <ul className="divide-y divide-border">
          {sorted.map((item) => {
            const assigned = (item.care_assignments?.length ?? 0) > 0
            return item.patient ? (
              <PatientRow
                key={item.id}
                patient={item.patient}
                meta={`${item.title} · ${assigned ? t.incoming.assigned : t.incoming.unassigned}`}
              />
            ) : null
          })}
        </ul>
      </Panel>
    </DashboardLayout>
  )
}
