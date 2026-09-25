import { dateShort, relativeTime } from '../../lib/format'
import { t } from '../../lib/i18n'
import type { TwinData } from '../../lib/twin'

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-baseline gap-3 border-b border-border py-[0.4375rem] last:border-b-0">
    <dt className="w-36 shrink-0 text-[0.75rem] text-ink-muted">{label}</dt>
    <dd className="min-w-0 flex-1 text-[0.8125rem] font-medium">{children}</dd>
  </div>
)

export const KeyInfoPanel: React.FC<{ data: TwinData }> = ({ data }) => {
  const primary = data.diagnoses.find((diagnosis) => diagnosis.type === 'PRIMARY')
  const chronic = data.diagnoses.filter((diagnosis) =>
    diagnosis.type === 'COMORBIDITY' && diagnosis.status === 'ACTIVE',
  )
  const procedure = data.procedures[0]
  const discharge = data.hospitalizations.find((h) => h.discharged_at)
  const plan = data.carePlans.find((p) => p.status === 'ACTIVE') ?? data.carePlans[0]
  const assignment = data.assignments.find((a) => ['PENDING', 'ACCEPTED', 'ACTIVE'].includes(a.status))
  const nurse = assignment?.assigned_user
    ? [assignment.assigned_user.last_name, assignment.assigned_user.first_name].filter(Boolean).join(' ')
    : null
  const lastPatientReport = data.observations.find((observation) => observation.source === 'PATIENT')

  return (
    <section className="rounded-xl border border-border p-4">
      <h3 className="text-[0.9375rem] font-semibold">{t.twin.keyInfo}</h3>

      <dl className="mt-1">
        <Row label={t.twin.key.primaryDiagnosis}>
          {primary ? (
            <>
              {primary.name}
              {primary.status === 'RESOLVED' && (
                <span className="ml-1 font-normal text-ink-muted">({t.twin.key.resolved})</span>
              )}
            </>
          ) : (
            <span className="font-normal text-ink-muted">{t.common.dash}</span>
          )}
        </Row>

        <Row label={t.twin.key.chronic}>
          {chronic.length > 0 ? (
            chronic.map((diagnosis) => diagnosis.name).join(', ')
          ) : (
            <span className="font-normal text-ink-muted">{t.common.dash}</span>
          )}
        </Row>

        <Row label={t.twin.key.recentProcedure}>
          {procedure ? procedure.name : <span className="font-normal text-ink-muted">{t.common.dash}</span>}
        </Row>

        <Row label={t.twin.key.discharged}>
          {discharge?.discharged_at ? (
            <>
              {dateShort(discharge.discharged_at)}{' '}
              <span className="font-normal text-ink-muted">
                ({relativeTime(discharge.discharged_at)})
              </span>
            </>
          ) : (
            <span className="font-normal text-ink-muted">{t.common.dash}</span>
          )}
        </Row>

        <Row label={t.twin.key.carePlan}>
          {plan ? plan.title : <span className="font-normal text-ink-muted">{t.common.dash}</span>}
        </Row>

        <Row label={t.twin.key.nurse}>
          {nurse ?? assignment?.organization?.name ?? (
            <span className="font-normal text-ink-muted">{t.twin.noResponsible}</span>
          )}
        </Row>

        <Row label={t.twin.key.nextCheckIn}>
          <span className="font-normal text-ink-muted">{t.twin.key.notScheduled}</span>
        </Row>

        <Row label={t.twin.key.lastCheckIn}>
          {lastPatientReport ? (
            <span className="text-primary">
              {relativeTime(lastPatientReport.recorded_at)}{' '}
              <span className="font-normal">({t.twin.key.viaTelegram})</span>
            </span>
          ) : (
            <span className="font-normal text-ink-muted">{t.common.dash}</span>
          )}
        </Row>
      </dl>
    </section>
  )
}
