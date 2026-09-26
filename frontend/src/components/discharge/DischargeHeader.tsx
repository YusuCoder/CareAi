import { ageFromBirthDate, dateShort } from '../../lib/format'
import { t, yearsLabel } from '../../lib/i18n'
import type { DischargeContext } from '../../lib/discharge'
import { Sparkle } from './ui'

/** Компактная шапка: кто, откуда, куда. Аллергии остаются на виду всегда. */
export const DischargeHeader: React.FC<{
  name: string
  patientNumber: number | null
  context: DischargeContext
  admittedAt: string
  dischargedAt: string
  admissionReason: string | null
}> = ({ name, patientNumber, context, admittedAt, dischargedAt, admissionReason }) => {
  const f = t.dischargeFlow
  const d = t.discharge
  const age = ageFromBirthDate(context.patient?.birth_date ?? null)
  const allergies = context.allergies.map((item) => item.substance).join(', ')
  const discharge = new Date(dischargedAt)

  const meta = [
    age === null ? null : yearsLabel(age),
    patientNumber === null ? null : `${t.twin.id} №${patientNumber}`,
    context.clinicName ?? `${d.clinic}: ${d.noClinicShort}`,
  ].filter(Boolean)

  return (
    <section className="flex flex-wrap items-start gap-x-8 gap-y-3 rounded-xl border border-border bg-surface px-5 py-4 shadow-[0_1px_2px_rgb(26_23_51/0.04)]">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="text-lg font-semibold tracking-tight">{name}</h2>
          <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[0.6875rem] font-medium text-primary">
            <Sparkle size={11} /> {f.twinActive}
          </span>
        </div>
        <p className="mt-0.5 text-[0.8125rem] text-ink-muted">{meta.join(' · ')}</p>
        {admissionReason && (
          <p className="mt-1.5 text-[0.8125rem]">
            <span className="text-ink-muted">{d.admissionReason}: </span>
            {admissionReason}
          </p>
        )}
      </div>

      <dl className="flex flex-wrap gap-x-6 gap-y-2 text-[0.8125rem]">
        <div>
          <dt className="text-[0.6875rem] text-ink-muted">{d.admitted}</dt>
          <dd className="tabular font-medium">{dateShort(admittedAt)}</dd>
        </div>
        <div>
          <dt className="text-[0.6875rem] text-ink-muted">{f.discharge}</dt>
          <dd className="tabular font-medium">
            {Number.isNaN(discharge.getTime()) ? t.common.dash : dateShort(discharge.toISOString())}
          </dd>
        </div>
        <div>
          <dt className="text-[0.6875rem] text-ink-muted">{d.allergies}</dt>
          <dd
            className="font-medium"
            style={allergies ? { color: 'var(--color-risk-critical)' } : undefined}
          >
            {allergies || d.noAllergies}
          </dd>
        </div>
      </dl>
    </section>
  )
}
