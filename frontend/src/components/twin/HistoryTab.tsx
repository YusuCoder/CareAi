import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { VisitList } from './VisitList'
import { tint } from '../../lib/visits'
import { buildEpisodes, type Episode, type EpisodeStatus, type Stage, type StageState } from '../../lib/episodes'
import { dateTime, dateShort, fullName } from '../../lib/format'
import { diagnosisTypeLabel, medicationFrequencyLabel, plural, t } from '../../lib/i18n'
import type { TwinEvent, TwinEventType } from '../../lib/database.types'
import type { TwinData } from '../../lib/twin'

/* ────────────────────────── общая хронология ────────────────────────── */

type Group = 'hospital' | 'diagnosis' | 'treatment' | 'labs' | 'followup' | 'vitals' | 'other'

const GROUP_OF: Record<TwinEventType, Group> = {
  HOSPITAL_ADMISSION: 'hospital',
  PATIENT_DISCHARGED: 'hospital',

  DIAGNOSIS_ADDED: 'diagnosis',
  ALLERGY_RECORDED: 'diagnosis',

  PROCEDURE_COMPLETED: 'treatment',
  MEDICATION_PRESCRIBED: 'treatment',

  LAB_RESULT_ADDED: 'labs',

  CARE_PLAN_CREATED: 'followup',
  CARE_PLAN_APPROVED: 'followup',
  CARE_PLAN_COMPLETED: 'followup',
  NURSE_ASSIGNED: 'followup',
  CARE_ASSIGNMENT_ACCEPTED: 'followup',
  VISIT_SCHEDULED: 'followup',
  VISIT_COMPLETED: 'followup',
  VISIT_MISSED: 'followup',
  ACTIVE_CALL_CREATED: 'followup',
  ACTIVE_CALL_ACKNOWLEDGED: 'followup',
  ACTIVE_CALL_COMPLETED: 'followup',

  OBSERVATION_RECORDED: 'vitals',
  PATIENT_CHECK_IN: 'vitals',
  MISSED_CHECK_IN: 'followup',

  TWIN_CREATED: 'other',
  RISK_LEVEL_CHANGED: 'other',
  ALERT_CREATED: 'other',
  ALERT_RESOLVED: 'other',
  NOTE_ADDED: 'other',
  DEVICE_LINKED: 'other',
  DEVICE_UNLINKED: 'other',
  TELEGRAM_LINKED: 'other',
}

const GROUP_COLOR: Record<Group, string> = {
  hospital: 'var(--color-phase-hospital)',
  diagnosis: 'var(--color-risk-high)',
  treatment: '#1f9b8e',
  labs: 'var(--color-synthetic)',
  followup: 'var(--color-primary)',
  vitals: 'var(--color-risk-medium)',
  other: 'var(--color-ink-muted)',
}

const ORDER: Group[] = ['hospital', 'diagnosis', 'treatment', 'labs', 'followup', 'vitals', 'other']

/** Показатели по умолчанию выключены: их тысячи, и они топят остальное. */
const DEFAULT_ON = ORDER.filter((group) => group !== 'vitals')

const groupOf = (event: TwinEvent): Group => GROUP_OF[event.event_type] ?? 'other'

const Dot: React.FC<{ color: string; severity: TwinEvent['severity'] }> = ({ color, severity }) => (
  <span
    className="-ml-[1.3125rem] mt-[0.4375rem] size-2.5 shrink-0 rounded-full ring-4 ring-[color:var(--color-surface)]"
    style={{
      backgroundColor:
        severity === 'CRITICAL'
          ? 'var(--color-risk-critical)'
          : severity === 'WARNING'
            ? 'var(--color-risk-high)'
            : color,
    }}
  />
)

const Entry: React.FC<{ event: TwinEvent; organizations: Record<string, string> }> = ({
  event,
  organizations,
}) => {
  const group = groupOf(event)
  const organization = event.organization_id ? organizations[event.organization_id] : null

  return (
    <li className="relative flex gap-3 pb-5 pl-[1.3125rem] last:pb-0">
      <Dot color={GROUP_COLOR[group]} severity={event.severity} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="text-sm font-medium">{event.title}</p>
          <time className="tabular text-[0.6875rem] text-ink-muted" dateTime={event.occurred_at}>
            {dateTime(event.occurred_at)}
          </time>
        </div>

        {event.description && (
          <p className="mt-0.5 text-[0.8125rem] leading-snug text-ink-muted">{event.description}</p>
        )}

        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[0.6875rem] text-ink-muted">
          <span style={{ color: GROUP_COLOR[group] }}>{t.history.groups[group]}</span>
          {organization && <span>· {organization}</span>}
        </p>
      </div>
    </li>
  )
}

/** Хронология с фильтрами по разделам: вся карта или события одного обращения. */
const Timeline: React.FC<{ events: TwinEvent[]; organizations: Record<string, string> }> = ({
  events, organizations,
}) => {
  const [enabled, setEnabled] = useState<Group[]>(DEFAULT_ON)

  const counts = useMemo(() => {
    const result = {} as Record<Group, number>
    for (const group of ORDER) result[group] = 0
    for (const event of events) result[groupOf(event)] += 1
    return result
  }, [events])

  // события приходят от новых к старым, поэтому группы лет уже в нужном порядке
  const years = useMemo(() => {
    const visible = events.filter((event) => enabled.includes(groupOf(event)))
    const buckets: Array<{ year: string; events: TwinEvent[] }> = []

    for (const event of visible) {
      const year = String(new Date(event.occurred_at).getFullYear())
      const last = buckets[buckets.length - 1]
      if (last && last.year === year) last.events.push(event)
      else buckets.push({ year, events: [event] })
    }
    return buckets
  }, [events, enabled])

  const toggle = (group: Group) =>
    setEnabled((current) =>
      current.includes(group) ? current.filter((item) => item !== group) : [...current, group],
    )

  const total = years.reduce((sum, bucket) => sum + bucket.events.length, 0)

  if (events.length === 0) {
    return <p className="py-6 text-center text-sm text-ink-muted">{t.history.empty}</p>
  }

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {ORDER.filter((group) => counts[group] > 0).map((group) => {
          const on = enabled.includes(group)
          return (
            <button
              key={group}
              type="button"
              onClick={() => toggle(group)}
              aria-pressed={on}
              className="rounded-md border px-2.5 py-1.5 text-xs transition-colors"
              style={
                on
                  ? {
                      borderColor: GROUP_COLOR[group],
                      color: GROUP_COLOR[group],
                      backgroundColor: tint(GROUP_COLOR[group]),
                    }
                  : { borderColor: 'var(--color-border)', color: 'var(--color-ink-muted)' }
              }
            >
              {t.history.groups[group]}
              <span className="tabular ml-1.5 opacity-60">{counts[group]}</span>
            </button>
          )
        })}
      </div>

      {total === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-border px-6 py-10 text-center text-sm text-ink-muted">
          {t.history.nothingInFilter}
        </p>
      ) : (
        <div className="mt-4 space-y-6">
          {years.map((bucket) => (
            <div key={bucket.year}>
              <div className="sticky top-0 z-10 -mx-1 bg-surface px-1 py-1">
                <h4 className="tabular text-sm font-semibold text-ink-muted">{bucket.year}</h4>
              </div>

              <ul className="mt-2 border-l border-border pl-4">
                {bucket.events.map((event) => (
                  <Entry key={event.id} event={event} organizations={organizations} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

/* ────────────────────────────── обращения ────────────────────────────── */

const STATUS_COLOR: Record<EpisodeStatus, string> = {
  IN_HOSPITAL: 'var(--color-phase-hospital)',
  HANDOFF: 'var(--color-risk-medium)',
  MONITORING: 'var(--color-phase-home)',
  COMPLETED: 'var(--color-ink-muted)',
  DISCHARGED: 'var(--color-ink-muted)',
  TRANSFERRED: 'var(--color-ink-muted)',
  CANCELLED: 'var(--color-ink-muted)',
}

const STATE_COLOR: Record<StageState, string> = {
  done: 'var(--color-risk-low)',
  current: 'var(--color-primary)',
  problem: 'var(--color-risk-critical)',
  upcoming: 'var(--color-border-strong)',
  skipped: 'var(--color-border-strong)',
}

const StatusChip: React.FC<{ status: EpisodeStatus }> = ({ status }) => (
  <span
    className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium"
    style={{ color: STATUS_COLOR[status], backgroundColor: tint(STATUS_COLOR[status], 12) }}
  >
    <span className="size-1.5 rounded-full" style={{ backgroundColor: STATUS_COLOR[status] }} aria-hidden />
    {t.history.episodes.status[status]}
  </span>
)

/** Шесть сегментов — весь путь обращения одним взглядом. */
const Progress: React.FC<{ stages: Stage[] }> = ({ stages }) => (
  <div className="flex gap-0.5" aria-hidden>
    {stages.map((stage) => (
      <span
        key={stage.id}
        className="h-1 flex-1 rounded-full"
        style={{
          backgroundColor: stage.state === 'skipped' ? 'transparent' : STATE_COLOR[stage.state],
          border: stage.state === 'skipped' ? '1px dashed var(--color-border-strong)' : undefined,
        }}
      />
    ))}
  </div>
)

const range = (episode: Episode) =>
  `${dateShort(episode.start)} — ${episode.end ? dateShort(episode.end) : t.history.episodes.now}`

const EpisodeCard: React.FC<{ episode: Episode; active: boolean; onSelect: () => void; index: number }> = ({
  episode, active, onSelect, index,
}) => (
  <button
    type="button"
    onClick={onSelect}
    aria-current={active ? 'true' : undefined}
    className={[
      'w-full rounded-xl border px-3.5 py-3 text-left transition-colors',
      active ? 'border-primary/50 bg-primary-soft/50' : 'border-border bg-surface hover:border-primary/30',
    ].join(' ')}
  >
    <div className="flex items-center gap-2">
      <span className="tabular text-[0.6875rem] font-medium text-ink-muted">
        {t.history.episodes.episode} {index}
      </span>
      <span className="ml-auto"><StatusChip status={episode.status} /></span>
    </div>
    <p className="mt-1 line-clamp-2 text-[0.875rem] font-semibold leading-snug">
      {episode.hospitalization.primary_diagnosis || episode.hospitalization.admission_reason || t.history.episodes.noDiagnosis}
    </p>
    <p className="tabular mt-0.5 text-[0.75rem] text-ink-muted">{range(episode)}</p>
    <div className="mt-2.5"><Progress stages={episode.stages} /></div>
    {episode.attention.length > 0 && (
      <p className="mt-2 text-[0.6875rem] font-medium" style={{ color: 'var(--color-risk-critical)' }}>
        ! {episode.attention.map((key) => t.history.episodes.attention[key as keyof typeof t.history.episodes.attention]).join(' · ')}
      </p>
    )}
  </button>
)

const Muted: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-[0.8125rem] text-ink-muted">{children}</p>
)

const Facts: React.FC<{ items: [string, React.ReactNode][] }> = ({ items }) => (
  <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
    {items.map(([label, value]) => (
      <div key={label}>
        <dt className="text-[0.6875rem] uppercase tracking-wide text-ink-muted">{label}</dt>
        <dd className="text-[0.8125rem]">{value}</dd>
      </div>
    ))}
  </dl>
)

const SubList: React.FC<{ title: string; count?: number; children: React.ReactNode }> = ({ title, count, children }) => (
  <div>
    <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-muted">
      {title}
      {count !== undefined && <span className="tabular ml-1 font-normal">· {count}</span>}
    </p>
    <ul className="mt-1 space-y-1 text-[0.8125rem] leading-snug">{children}</ul>
  </div>
)

const StageMarker: React.FC<{ state: StageState; number: number }> = ({ state, number }) => {
  const color = STATE_COLOR[state]
  const filled = state === 'done' || state === 'problem'
  return (
    <span
      className={[
        'relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full text-[0.75rem] font-semibold',
        state === 'current' ? 'ring-4 ring-primary/15' : '',
      ].join(' ')}
      style={{
        backgroundColor: filled ? color : 'var(--color-surface)',
        color: filled ? 'white' : state === 'current' ? color : 'var(--color-ink-muted)',
        border: filled ? 'none' : `2px ${state === 'skipped' ? 'dashed' : 'solid'} ${color}`,
      }}
    >
      {state === 'done' ? '✓' : state === 'problem' ? '!' : number}
    </span>
  )
}

/** Содержимое каждого этапа — только записи, относящиеся к этому обращению. */
function stageBody(stage: Stage, episode: Episode, data: TwinData): React.ReactNode {
  const h = episode.hospitalization
  const e = t.history.episodes
  const org = (id: string | null | undefined) => (id ? data.organizationNames[id] : null) ?? '—'

  switch (stage.id) {
    case 'admission':
      return (
        <Facts items={[
          [e.when, dateTime(h.admitted_at)],
          [e.where, org(h.organization_id)],
          [e.reason, h.admission_reason || '—'],
          [e.primaryDiagnosis, h.primary_diagnosis || '—'],
        ]} />
      )

    case 'treatment': {
      const abnormal = episode.labs.filter((lab) => lab.flag && lab.flag !== 'NORMAL')
      const nothing = episode.diagnoses.length + episode.procedures.length + episode.medications.length + episode.labs.length === 0
      return (
        <div className="space-y-3">
          <Muted>
            {episode.stayDays} {plural(episode.stayDays ?? 0, ['сутки', 'суток', 'суток'])} {e.inHospital}
          </Muted>
          {nothing && <Muted>{e.noTreatmentRecords}</Muted>}
          {episode.diagnoses.length > 0 && (
            <SubList title={e.diagnoses} count={episode.diagnoses.length}>
              {episode.diagnoses.map((d) => (
                <li key={d.id}>
                  {d.name}
                  {d.code && <span className="text-ink-muted"> ({d.code})</span>}
                  <span className="text-ink-muted"> · {diagnosisTypeLabel[d.type]}</span>
                </li>
              ))}
            </SubList>
          )}
          {episode.procedures.length > 0 && (
            <SubList title={e.procedures} count={episode.procedures.length}>
              {episode.procedures.map((p) => (
                <li key={p.id}>
                  <span className="tabular text-ink-muted">{dateShort(p.performed_at)}</span> {p.name}
                  {p.outcome && <span className="text-ink-muted"> — {p.outcome}</span>}
                </li>
              ))}
            </SubList>
          )}
          {episode.medications.length > 0 && (
            <SubList title={e.medications} count={episode.medications.length}>
              {episode.medications.map((m) => (
                <li key={m.id}>
                  {m.name}
                  <span className="text-ink-muted">
                    {' '}{[m.dose !== null ? `${m.dose} ${m.dose_unit ?? ''}`.trim() : null,
                      m.frequency_text || (m.frequency ? medicationFrequencyLabel[m.frequency] : null)]
                      .filter(Boolean).join(', ')}
                  </span>
                </li>
              ))}
            </SubList>
          )}
          {episode.labs.length > 0 && (
            <SubList title={`${e.labs}: ${episode.labs.length}, ${e.abnormal}`} count={abnormal.length}>
              {abnormal.slice(0, 8).map((l) => (
                <li key={l.id} className="tabular">
                  <span style={{ color: l.flag === 'CRITICAL' ? 'var(--color-risk-critical)' : 'var(--color-risk-medium)' }}>●</span>{' '}
                  {l.analyte}: <span className="font-medium">{l.value_numeric ?? l.value_text} {l.unit ?? ''}</span>
                  <span className="text-ink-muted"> · {dateShort(l.collected_at)}</span>
                </li>
              ))}
            </SubList>
          )}
        </div>
      )
    }

    case 'discharge':
      if (!h.discharged_at) return <Muted>{e.notDischarged}</Muted>
      return (
        <div className="space-y-2">
          <Muted>{dateTime(h.discharged_at)}</Muted>
          {h.discharge_summary && <p className="text-[0.8125rem] leading-relaxed">{h.discharge_summary}</p>}
          {h.procedure_summary && (
            <p className="text-[0.8125rem] leading-relaxed text-ink-muted">
              <span className="font-medium text-ink">{e.done}:</span> {h.procedure_summary}
            </p>
          )}
        </div>
      )

    case 'handoff': {
      const call = episode.call
      if (!call) return <Muted>{stage.state === 'upcoming' ? e.handoffLater : e.noCall}</Muted>
      const hours = call.completed_at
        ? Math.round((new Date(call.completed_at).getTime() - new Date(call.created_at).getTime()) / 3_600_000)
        : null
      return (
        <Facts items={[
          [e.clinic, org(call.organization_id)],
          [e.due, dateTime(call.due_at)],
          [e.result, call.outcome ? t.calls.outcomes[call.outcome] : stage.state === 'problem' ? e.overdue : e.waiting],
          [e.took, hours !== null ? `${hours} ${t.calls.stats.hours}` : '—'],
          ...(call.notes ? [[e.note, call.notes] as [string, React.ReactNode]] : []),
        ]} />
      )
    }

    case 'monitoring': {
      const plan = episode.plan
      if (!plan) return <Muted>{stage.state === 'upcoming' ? e.monitoringLater : e.noPlan}</Muted>
      const nurse = episode.assignments.find((a) => a.status !== 'CANCELLED')
      const completed = episode.visits.filter((v) => v.status === 'COMPLETED').length
      return (
        <div className="space-y-3">
          <Facts items={[
            [e.plan, plan.title],
            [e.period, `${plan.start_date ? dateShort(plan.start_date) : '—'} — ${plan.end_date ? dateShort(plan.end_date) : '—'}`],
            [e.clinic, org(plan.receiving_organization_id)],
            [e.nurse, nurse ? fullName(nurse.assigned_user) : e.notAssigned],
          ]} />
          {episode.visits.length > 0 ? (
            <div>
              <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-muted">
                {e.visits} <span className="tabular font-normal">· {completed} {e.of} {episode.visits.length}</span>
              </p>
              <div className="mt-1.5"><VisitList visits={episode.visits} /></div>
            </div>
          ) : (
            <Muted>{e.noVisits}</Muted>
          )}
        </div>
      )
    }

    case 'closed': {
      const plan = episode.plan
      if (plan?.status === 'COMPLETED') {
        return (
          <div className="space-y-1">
            <Muted>{plan.completed_at ? dateTime(plan.completed_at) : plan.end_date ? dateShort(plan.end_date) : '—'}</Muted>
            {plan.completion_note && <p className="text-[0.8125rem]">{plan.completion_note}</p>}
          </div>
        )
      }
      if (stage.state === 'done') return <Muted>{e.closedWithoutPlan}</Muted>
      return <Muted>{plan?.end_date ? `${e.expected} ${dateShort(plan.end_date)}` : e.openEnded}</Muted>
    }
  }
}

const EpisodeDetail: React.FC<{ episode: Episode; index: number; data: TwinData }> = ({ episode, index, data }) => {
  const [showEvents, setShowEvents] = useState(false)
  const e = t.history.episodes

  return (
    <article className="rounded-xl border border-border bg-surface">
      <header className="border-b border-border px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="tabular text-[0.75rem] font-medium text-ink-muted">{e.episode} {index}</span>
          <StatusChip status={episode.status} />
          <span className="tabular ml-auto text-[0.75rem] text-ink-muted">{range(episode)}</span>
        </div>
        <h4 className="mt-1.5 text-[1.0625rem] font-semibold leading-snug">
          {episode.hospitalization.primary_diagnosis || episode.hospitalization.admission_reason || e.noDiagnosis}
        </h4>
        <p className="mt-0.5 text-[0.8125rem] text-ink-muted">
          {data.organizationNames[episode.hospitalization.organization_id] ?? ''}
        </p>
        {episode.attention.length > 0 && (
          <p
            className="mt-2.5 rounded-md px-2.5 py-1.5 text-[0.8125rem] font-medium"
            style={{ color: 'var(--color-risk-critical)', backgroundColor: tint('var(--color-risk-critical)', 8) }}
          >
            {episode.attention.map((key) => e.attention[key as keyof typeof e.attention]).join(' · ')}
          </p>
        )}
      </header>

      <ol className="relative px-5 py-5">
        {episode.stages.map((stage, i) => {
          const last = i === episode.stages.length - 1
          const dim = stage.state === 'upcoming' || stage.state === 'skipped'
          return (
            <li key={stage.id} className="relative flex gap-4 pb-6 last:pb-0">
              {!last && (
                <span
                  aria-hidden
                  className="absolute left-[0.8125rem] top-7 bottom-0 w-0.5"
                  style={{
                    backgroundColor: stage.state === 'done' || stage.state === 'problem'
                      ? tint(STATE_COLOR[stage.state], 45)
                      : 'var(--color-border)',
                  }}
                />
              )}
              <StageMarker state={stage.state} number={i + 1} />
              <div className={`min-w-0 flex-1 pt-0.5 ${dim ? 'opacity-70' : ''}`}>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <p className="text-[0.9375rem] font-semibold">{e.stages[stage.id]}</p>
                  <span className="text-[0.6875rem] font-medium" style={{ color: STATE_COLOR[stage.state] === 'var(--color-border-strong)' ? 'var(--color-ink-muted)' : STATE_COLOR[stage.state] }}>
                    {e.states[stage.state]}
                  </span>
                </div>
                <div className="mt-1.5">{stageBody(stage, episode, data)}</div>
              </div>
            </li>
          )
        })}
      </ol>

      <footer className="border-t border-border px-5 py-3">
        <button
          type="button"
          onClick={() => setShowEvents((value) => !value)}
          className="text-[0.8125rem] font-medium text-primary"
        >
          {showEvents ? e.hideEvents : `${e.showEvents} (${episode.events.length})`}
        </button>
        {showEvents && (
          <div className="mt-3">
            <Timeline events={episode.events} organizations={data.organizationNames} />
          </div>
        )}
      </footer>
    </article>
  )
}

const OUTSIDE = 'outside'

const Episodes: React.FC<{ data: TwinData }> = ({ data }) => {
  const { episodes, outside } = useMemo(() => buildEpisodes(data), [data])
  const [params, setParams] = useSearchParams()
  const e = t.history.episodes

  const requested = params.get('episode')
  const selected = requested === OUTSIDE
    ? OUTSIDE
    : episodes.find((episode) => episode.id === requested)?.id ?? episodes[0]?.id ?? OUTSIDE

  const select = (id: string) => {
    const next = new URLSearchParams(params)
    next.set('episode', id)
    setParams(next, { replace: true })
  }

  const active = episodes.find((episode) => episode.id === selected)
  // номер по порядку от первого обращения: «Обращение 1» — самое раннее
  const numberOf = (episode: Episode) => episodes.length - episodes.indexOf(episode)

  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <nav aria-label={e.listTitle} className="space-y-2">
        {episodes.length === 0 && <Muted>{e.noEpisodes}</Muted>}
        {episodes.map((episode) => (
          <EpisodeCard
            key={episode.id}
            episode={episode}
            index={numberOf(episode)}
            active={episode.id === selected}
            onSelect={() => select(episode.id)}
          />
        ))}
        {outside.length > 0 && (
          <button
            type="button"
            onClick={() => select(OUTSIDE)}
            aria-current={selected === OUTSIDE ? 'true' : undefined}
            className={[
              'w-full rounded-xl border border-dashed px-3.5 py-3 text-left transition-colors',
              selected === OUTSIDE ? 'border-primary/50 bg-primary-soft/50' : 'border-border hover:border-primary/30',
            ].join(' ')}
          >
            <p className="text-[0.875rem] font-semibold">{e.outside}</p>
            <p className="tabular mt-0.5 text-[0.75rem] text-ink-muted">
              {outside.length} {plural(outside.length, ['запись', 'записи', 'записей'])} · {e.outsideHint}
            </p>
          </button>
        )}
      </nav>

      {active ? (
        <EpisodeDetail key={active.id} episode={active} index={numberOf(active)} data={data} />
      ) : (
        <section className="rounded-xl border border-border bg-surface px-5 py-4">
          <h4 className="text-[1.0625rem] font-semibold">{e.outside}</h4>
          <p className="mb-4 mt-0.5 text-[0.8125rem] text-ink-muted">{e.outsideHint}</p>
          <Timeline events={outside} organizations={data.organizationNames} />
        </section>
      )}
    </div>
  )
}

/* ─────────────────────────────── вкладка ─────────────────────────────── */

export const HistoryTab: React.FC<{ data: TwinData }> = ({ data }) => {
  const [view, setView] = useState<'episodes' | 'timeline'>('episodes')

  if (data.events.length === 0 && data.hospitalizations.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-6 py-12 text-center text-sm text-ink-muted">
        {t.history.empty}
      </p>
    )
  }

  const span = data.events.length
    ? `${dateShort(data.events[data.events.length - 1].occurred_at)} — ${dateShort(data.events[0].occurred_at)}`
    : null

  return (
    <section aria-label={t.history.title}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-[1.0625rem] font-semibold">{t.history.title}</h3>
          <p className="mt-0.5 text-[0.8125rem] text-ink-muted">
            {view === 'episodes' ? t.history.episodes.subtitle : t.history.subtitle}
            {view === 'timeline' && span && <span className="tabular"> · {span}</span>}
          </p>
        </div>

        <div role="tablist" className="inline-flex rounded-lg border border-border p-0.5">
          {(['episodes', 'timeline'] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              onClick={() => setView(id)}
              className={[
                'rounded-md px-3 py-1.5 text-[0.8125rem] transition-colors',
                view === id ? 'bg-primary text-white' : 'text-ink-muted hover:text-ink',
              ].join(' ')}
            >
              {t.history.views[id]}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        {view === 'episodes'
          ? <Episodes data={data} />
          : <Timeline events={data.events} organizations={data.organizationNames} />}
      </div>
    </section>
  )
}
