import { LiveAlerts } from '../components/dashboard/LiveAlerts'
import { OverdueCalls } from '../components/dashboard/OverdueCalls'
import { OverviewDashboard } from '../components/dashboard/OverviewDashboard'
import { PatientAssistant } from '../components/dashboard/PatientAssistant'
import { ReadyToClose } from '../components/dashboard/ReadyToClose'
import { ShiftSummary } from '../components/dashboard/ShiftSummary'
import { DashboardLayout } from '../components/layout/DashboardLayout'
import { EmptyState, Panel, PatientRow } from '../components/PatientRow'
import { useAuth } from '../contexts/AuthContext'
import { dateTime } from '../lib/format'
import { roleLabel, t } from '../lib/i18n'
import { useAttention, useMyAssignments, usePatients, type PatientWithTwin } from '../lib/queries'
import { dashboardAlertKinds } from '../lib/telegram'

const NurseOverview: React.FC = () => {
  const { user, role, activeMembership } = useAuth()
  const { data: assignments, loading, error } = useMyAssignments(user?.id)
  const { data: events, loading: eventsLoading, error: eventsError } = useAttention({ includeTelegram: true })
  const patients = [...new Map(assignments
    .map(assignment => assignment.patient)
    .filter((patient): patient is PatientWithTwin => patient !== null)
    .map(patient => [patient.id, patient])).values()]

  return (
    <DashboardLayout>
      <OverviewDashboard
        nurse
        patients={patients}
        events={events}
        loading={loading}
        eventsLoading={eventsLoading}
        patientError={error}
        eventsError={eventsError}
        organization={activeMembership?.organization.name ?? 'CareTwin AI'}
        roleName={role ? roleLabel[role] : ''}
        alerts={<><LiveAlerts kinds={dashboardAlertKinds(role)} /><OverdueCalls /></>}
        summary={<ShiftSummary includeTelegram />}
        assistant={<PatientAssistant />}
        followUp={
          <Panel title={t.myPatients.title}>
            {loading && <EmptyState>{t.common.loading}</EmptyState>}
            {!loading && !error && assignments.length === 0 && <EmptyState>{t.myPatients.empty}</EmptyState>}
            {error && <p role="alert" className="overview-error">{error}</p>}
            <ul className="divide-y divide-border">
              {assignments.map(assignment => assignment.patient ? <PatientRow key={assignment.id} patient={assignment.patient} meta={`${t.myPatients.since} ${dateTime(assignment.assigned_at)}`} /> : null)}
            </ul>
          </Panel>
        }
      />
    </DashboardLayout>
  )
}

const StaffOverview: React.FC = () => {
  const { role, activeMembership } = useAuth()
  const { data: patients, loading, error } = usePatients()
  const { data: events, loading: eventsLoading, error: eventsError } = useAttention({ includeTelegram: false })

  return (
    <DashboardLayout>
      <OverviewDashboard
        patients={patients}
        events={events}
        loading={loading}
        eventsLoading={eventsLoading}
        patientError={error}
        eventsError={eventsError}
        organization={activeMembership?.organization.name ?? 'CareTwin AI'}
        roleName={role ? roleLabel[role] : ''}
        alerts={<><LiveAlerts kinds={dashboardAlertKinds(role)} /><OverdueCalls /></>}
        summary={<ShiftSummary includeTelegram={false} />}
        assistant={<PatientAssistant />}
        followUp={<ReadyToClose />}
      />
    </DashboardLayout>
  )
}

export const OverviewPage: React.FC = () => {
  const { role } = useAuth()
  return role === 'NURSE' ? <NurseOverview /> : <StaffOverview />
}
