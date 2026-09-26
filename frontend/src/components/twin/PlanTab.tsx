import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { VisitList } from './VisitList'
import { tint } from '../../lib/visits'
import { buildEpisodes } from '../../lib/episodes'
import { dateShort, dateTime, decimal, fullName } from '../../lib/format'
import { medicationFrequencyLabel, t } from '../../lib/i18n'
import type { CarePlan, CarePlanStatus } from '../../lib/database.types'
import type { TwinData } from '../../lib/twin'

const DAY = 86_400_000

const STATUS_COLOR: Record<CarePlanStatus, string> = {
  ACTIVE: 'var(--color-phase-home)',
  COMPLETED: 'var(--color-ink-muted)',
  DRAFT: 'var(--color-risk-medium)',
  PENDING_APPROVAL: 'var(--color-risk-medium)',
  CANCELLED: 'var(--color-ink-muted)',
}

const order: Record<CarePlanStatus, number> = { ACTIVE: 0, PENDING_APPROVAL: 1, DRAFT: 2, COMPLETED: 3, CANCELLED: 4 }

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-muted">{children}</p>
)

const PlanCard: React.FC<{ plan: CarePlan; data: TwinData; episodeNumber: number | null; initiallyOpen: boolean }> = ({
  plan, data, episodeNumber, initiallyOpen,
}) => {
  const [open, setOpen] = useState(initiallyOpen)
  const [now] = useState(() => Date.now())
  const p = t.plan
  const org = (id: string | null) => (id ? data.organizationNames[id] : null) ?? '—'

  const visits = data.visits.filter((v) => v.care_plan_id === plan.id)
    .sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for))
  const done = visits.filter((v) => v.status === 'COMPLETED').length
  const nurse = data.assignments.find((a) => a.care_plan_id === plan.id && a.status !== 'CANCELLED')
  const call = data.activeCalls.find((c) => c.care_plan_id === plan.id)
  const meds = data.medications.filter((m) => m.care_plan_id === plan.id)
  const readings = data.observations.filter((o) => o.care_plan_id === plan.id)
  const abnormal = readings.filter((o) => o.is_abnormal)

  // сколько дней плана прошло
  const start = plan.start_date ? new Date(plan.start_date).getTime() : null
  const end = plan.end_date ? new Date(plan.end_date).getTime() : null
  const total = start && end ? Math.max(1, Math.round((end - start) / DAY)) : null
  const elapsed = start && total
    ? Math.min(total, Math.max(0, Math.round(((plan.completed_at ? new Date(plan.completed_at).getTime() : now) - start) / DAY)))
    : null

  const callText = !call
    ? p.noCall
    : call.status === 'COMPLETED'
      ? `${t.calls.outcomes[call.outcome ?? 'CONTACTED']} · ${dateTime(call.completed_at ?? call.due_at)}`
      : call.status === 'CANCELLED'
        ? p.callCancelled
        : now > new Date(call.due_at).getTime()
          ? `${p.callOverdue} ${dateTime(call.due_at)}`
          : `${p.callWaiting} ${dateTime(call.due_at)}`
  const callBad = call && ((call.status !== 'COMPLETED' && call.status !== 'CANCELLED' && now > new Date(call.due_at).getTime())
    || call.outcome === 'UNREACHABLE' || call.outcome === 'REFUSED')

  const color = STATUS_COLOR[plan.status]
  const missed = visits.filter((v) => v.status === 'MISSED').length

  return (
    <article
      className="rounded-xl border bg-surface"
      style={{ borderColor: plan.status === 'ACTIVE' ? tint(color, 45) : 'var(--color-border)' }}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-5 py-4 text-left"
      >
        <span
          className="rounded-full px-2 py-0.5 text-[0.6875rem] font-medium"
          style={{ color, backgroundColor: tint(color, 12) }}
        >
          {p.status[plan.status]}
        </span>
        <span className="text-[0.9375rem] font-semibold">{plan.title}</span>
        <span className="tabular ml-auto text-[0.75rem] text-ink-muted">
          {plan.start_date ? dateShort(plan.start_date) : '—'} — {plan.end_date ? dateShort(plan.end_date) : '—'}
        </span>
        <span className="w-full text-[0.75rem] text-ink-muted">
          {visits.length > 0 && `${p.visits}: ${done} ${p.of} ${visits.length}`}
          {missed > 0 && <span style={{ color: 'var(--color-risk-critical)' }}> · {p.missed}: {missed}</span>}
          {abnormal.length > 0 && <span style={{ color: 'var(--color-risk-medium)' }}> · {p.abnormal}: {abnormal.length}</span>}
        </span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-border px-5 py-4">
          {total !== null && elapsed !== null && (
            <div>
              <div className="flex justify-between text-[0.75rem] text-ink-muted">
                <span>{p.day} {elapsed} {p.of} {total}</span>
                {plan.hospitalization_id && episodeNumber !== null && (
                  <Link
                    to={`?tab=history&episode=${plan.hospitalization_id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {p.fromEpisode} {episodeNumber} →
                  </Link>
                )}
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-border">
                <div className="h-full rounded-full" style={{ width: `${(elapsed / total) * 100}%`, backgroundColor: color }} />
              </div>
            </div>
          )}

          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {([
              [p.sentBy, org(plan.source_organization_id)],
              [p.clinic, org(plan.receiving_organization_id)],
              [p.nurse, nurse ? fullName(nurse.assigned_user) : p.notAssigned],
              [p.call, <span key="call" style={callBad ? { color: 'var(--color-risk-critical)' } : undefined}>{callText}</span>],
            ] as [string, React.ReactNode][]).map(([label, value]) => (
              <div key={label}>
                <dt className="text-[0.6875rem] uppercase tracking-wide text-ink-muted">{label}</dt>
                <dd className="text-[0.8125rem]">{value}</dd>
              </div>
            ))}
          </dl>

          {(plan.summary || plan.instructions) && (
            <div className="space-y-1 text-[0.8125rem] leading-relaxed">
              {plan.summary && <p>{plan.summary}</p>}
              {plan.instructions && <p className="text-ink-muted">{plan.instructions}</p>}
            </div>
          )}

          {visits.length > 0 && (
            <div>
              <Label>{p.visits} · {done} {p.of} {visits.length}</Label>
              <div className="mt-1.5"><VisitList visits={visits} /></div>
            </div>
          )}

          {meds.length > 0 && (
            <div>
              <Label>{p.medications}</Label>
              <ul className="mt-1 space-y-0.5 text-[0.8125rem]">
                {meds.map((m) => (
                  <li key={m.id}>
                    {m.name}
                    <span className="text-ink-muted">
                      {' '}{[m.dose !== null ? `${m.dose} ${m.dose_unit ?? ''}`.trim() : null,
                        m.frequency_text || (m.frequency ? medicationFrequencyLabel[m.frequency] : null),
                        m.instructions].filter(Boolean).join(' · ')}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {readings.length > 0 && (
            <div>
              <Label>{p.readings} · {readings.length}</Label>
              <ul className="mt-1 grid gap-x-4 gap-y-0.5 text-[0.8125rem] sm:grid-cols-2">
                {readings.slice(0, 12).map((o) => (
                  <li key={o.id} className="tabular" style={o.is_abnormal ? { color: 'var(--color-risk-critical)' } : undefined}>
                    <span className="text-ink-muted">{dateShort(o.recorded_at)}</span>{' '}
                    {t.twin.vitals[o.type]}:{' '}
                    {o.value_numeric !== null
                      ? `${decimal(o.value_numeric)}${o.value_secondary !== null ? `/${decimal(o.value_secondary)}` : ''} ${o.unit ?? ''}`
                      : p.yes}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {plan.status === 'COMPLETED' && (
            <p className="rounded-md px-3 py-2 text-[0.8125rem]" style={{ backgroundColor: tint('var(--color-risk-low)', 8) }}>
              <span className="font-medium">{p.completed} {plan.completed_at ? dateShort(plan.completed_at) : ''}.</span>{' '}
              {plan.completion_note}
            </p>
          )}
        </div>
      )}
    </article>
  )
}

export const PlanTab: React.FC<{ data: TwinData }> = ({ data }) => {
  const { episodes } = useMemo(() => buildEpisodes(data), [data])
  const numberOf = (hospitalizationId: string | null) => {
    const index = episodes.findIndex((episode) => episode.id === hospitalizationId)
    return index === -1 ? null : episodes.length - index
  }

  const plans = [...data.carePlans].sort((a, b) =>
    order[a.status] - order[b.status] || (b.start_date ?? '').localeCompare(a.start_date ?? ''))
  const active = plans.filter((plan) => plan.status === 'ACTIVE').length

  if (plans.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-6 py-12 text-center text-sm text-ink-muted">
        {t.plan.empty}
      </p>
    )
  }

  return (
    <section aria-label={t.plan.title}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[1.0625rem] font-semibold">{t.plan.title}</h3>
        <p className="text-[0.8125rem] text-ink-muted">
          {t.plan.status.ACTIVE}: {active} · {t.plan.total}: {plans.length}
        </p>
      </div>
      <p className="mt-0.5 text-[0.8125rem] text-ink-muted">{t.plan.subtitle}</p>

      <div className="mt-4 space-y-3">
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            data={data}
            episodeNumber={numberOf(plan.hospitalization_id)}
            initiallyOpen={plan.status === 'ACTIVE'}
          />
        ))}
      </div>
    </section>
  )
}
