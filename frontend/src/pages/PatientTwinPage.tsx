import { useParams, useSearchParams } from 'react-router-dom'

import { DashboardLayout } from '../components/layout/DashboardLayout'
import { TwinTopBar } from '../components/twin/TwinTopBar'
import { ForecastTab } from '../components/twin/ForecastTab'
import { NowTab } from '../components/twin/NowTab'
import { HistoryTab } from '../components/twin/HistoryTab'
import { PlanTab } from '../components/twin/PlanTab'
import { ChronologyTab } from '../components/twin/ChronologyTab'
import { PatientHeader } from '../components/twin/PatientHeader'
import { ActiveCallBanner } from '../components/twin/ActiveCallBanner'
import { TelegramPanel } from '../components/twin/TelegramPanel'
import { useAuth } from '../contexts/AuthContext'
import { t } from '../lib/i18n'
import { seesTelegramFeed } from '../lib/telegram'
import { usePatientTwin } from '../lib/twin'

const TABS = [
  { id: 'now', label: t.twin.tabs.now },
  { id: 'forecast', label: t.forecast.tab },
  { id: 'trends', label: t.twin.tabs.trends },
  { id: 'history', label: t.twin.tabs.history },
  { id: 'plan', label: t.twin.tabs.plan },
  { id: 'timeline', label: t.twin.tabs.timeline },
  { id: 'devices', label: t.twin.tabs.devices },
] as const

type TabId = (typeof TABS)[number]['id']

export const PatientTwinPage: React.FC = () => {
  const { patientId } = useParams<{ patientId: string }>()
  const [params, setParams] = useSearchParams()
  const { role } = useAuth()
  const { data, loading, error } = usePatientTwin(patientId, { includeTelegram: seesTelegramFeed(role) })

  const active = (params.get('tab') as TabId) ?? 'now'

  if (!loading && !data.patient) {
    return (
      <DashboardLayout title={t.twin.tabs.now}>
        <p className="rounded-lg border border-border px-4 py-10 text-center text-sm text-ink-muted">
          {t.twin.notFound}
        </p>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout
        >
      {error && (
        <p className="mb-4 border-l-2 border-risk-critical py-1 pl-3 text-sm text-risk-critical">
          {error}
        </p>
      )}

      {data.patient && (
        <TwinTopBar name={`${data.patient.last_name} ${data.patient.first_name}`} />
      )}

      <div className="mt-4 space-y-3">
        {data.patient && <ActiveCallBanner patientId={data.patient.id} />}
        <PatientHeader data={data} />
      </div>

      <nav className="mt-5 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((tab) => {
          const isActive = tab.id === active
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setParams({ tab: tab.id }, { replace: true })}
              aria-current={isActive ? 'page' : undefined}
              className={[
                '-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'border-primary font-medium text-primary'
                  : 'border-transparent text-ink-muted hover:text-ink',
              ].join(' ')}
            >
              {tab.label}
            </button>
          )
        })}
      </nav>

      <div className="mt-5">
        {loading && <p className="py-10 text-center text-sm text-ink-muted">{t.common.loading}</p>}

        {!loading && active === 'now' && <NowTab data={data} />}

        {!loading && active === 'forecast' && <ForecastTab data={data} />}

        {!loading && active === 'history' && <HistoryTab data={data} />}

        {!loading && active === 'plan' && <PlanTab data={data} />}

        {!loading && active === 'timeline' && <ChronologyTab data={data} />}

        {!loading && active === 'devices' && <TelegramPanel data={data} />}

        {!loading && active === 'trends' && (
          <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
            <p className="text-sm font-medium">{t.pending.title}</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-ink-muted">{t.pending.body}</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
