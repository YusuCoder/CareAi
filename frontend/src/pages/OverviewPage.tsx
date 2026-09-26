import { AttentionList } from '../components/dashboard/AttentionList'
import { LiveAlerts } from '../components/dashboard/LiveAlerts'
import { OverdueCalls } from '../components/dashboard/OverdueCalls'
import { PatientAssistant } from '../components/dashboard/PatientAssistant'
import { ContinuityStrip } from '../components/dashboard/ContinuityStrip'
import { ReadyToClose } from '../components/dashboard/ReadyToClose'
import { ShiftSummary } from '../components/dashboard/ShiftSummary'
import { DashboardLayout } from '../components/layout/DashboardLayout'
import { EmptyState, Panel, PatientRow } from '../components/PatientRow'
import { useAuth } from '../contexts/AuthContext'
import { dateTime } from '../lib/format'
import { t } from '../lib/i18n'
import { useAttention, useMyAssignments, usePatients, type PatientWithTwin } from '../lib/queries'
import { dashboardAlertKinds } from '../lib/telegram'

const NurseOverview: React.FC = () => {
  const { user, role } = useAuth()
  const { data: assignments, loading } = useMyAssignments(user?.id)
  const { data: events, loading: eventsLoading } = useAttention({ includeTelegram: true })

  const patients = assignments
    .map((assignment) => assignment.patient)
    .filter((patient): patient is PatientWithTwin => patient !== null)

  return (
    <DashboardLayout title={t.myPatients.title} subtitle={t.myPatients.subtitle}>
      <div className="space-y-6">
        <LiveAlerts kinds={dashboardAlertKinds(role)} />

        <PatientAssistant />

        <OverdueCalls />

        <ShiftSummary includeTelegram />

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

// Врачи и администраторы: без данных из Telegram. Администратору — только SOS.
const StaffOverview: React.FC = () => {
  const { role } = useAuth()
  const { data: patients, loading } = usePatients()
  const { data: events, loading: eventsLoading } = useAttention({ includeTelegram: false })

  return (
    <DashboardLayout title={t.home.title} subtitle={t.home.subtitle}>
      <div className="space-y-6">
        <LiveAlerts kinds={dashboardAlertKinds(role)} />

        <PatientAssistant />

        <OverdueCalls />

        <ShiftSummary includeTelegram={false} />

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
