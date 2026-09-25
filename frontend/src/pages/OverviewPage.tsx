import { AttentionList } from '../components/dashboard/AttentionList'
import { ContinuityStrip } from '../components/dashboard/ContinuityStrip'
import { ReadyToClose } from '../components/dashboard/ReadyToClose'
import { ShiftSummary } from '../components/dashboard/ShiftSummary'
import { DashboardLayout } from '../components/layout/DashboardLayout'
import { EmptyState, Panel, PatientRow } from '../components/PatientRow'
import { useAuth } from '../contexts/AuthContext'
import { dateTime } from '../lib/format'
import { t } from '../lib/i18n'
import { useAttention, useMyAssignments, usePatients, type PatientWithTwin } from '../lib/queries'

const NurseOverview: React.FC = () => {
  const { user } = useAuth()
  const { data: assignments, loading } = useMyAssignments(user?.id)
  const { data: events, loading: eventsLoading } = useAttention()

  const patients = assignments
    .map((assignment) => assignment.patient)
    .filter((patient): patient is PatientWithTwin => patient !== null)

  return (
    <DashboardLayout title={t.myPatients.title} subtitle={t.myPatients.subtitle}>
      <div className="space-y-6">
        <ShiftSummary />

        <AttentionList patients={patients} events={events} loading={loading || eventsLoading} />

        <Panel title={t.myPatients.title}>
          {loading && <EmptyState>{t.common.loading}</EmptyState>}
          {!loading && assignments.length === 0 && <EmptyState>{t.myPatients.empty}</EmptyState>}
          <ul className="divide-y divide-border">
            {assignments.map((assignment) =>
              assignment.patient ? (
                <PatientRow
                  key={assignment.id}
                  patient={assignment.patient}
                  meta={`${t.myPatients.since} ${dateTime(assignment.assigned_at)}`}
                />
              ) : null,
            )}
          </ul>
        </Panel>
      </div>
    </DashboardLayout>
  )
}

const StaffOverview: React.FC = () => {
  const { data: patients, loading } = usePatients()
  const { data: events, loading: eventsLoading } = useAttention()

  return (
    <DashboardLayout title={t.home.title} subtitle={t.home.subtitle}>
      <div className="space-y-6">
        <ShiftSummary />

        <ContinuityStrip patients={patients} loading={loading} />

        <AttentionList patients={patients} events={events} loading={loading || eventsLoading} />

        <ReadyToClose />
      </div>
    </DashboardLayout>
  )
}

export const OverviewPage: React.FC = () => {
  const { role } = useAuth()
  return role === 'NURSE' ? <NurseOverview /> : <StaffOverview />
}
