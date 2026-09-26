import type {
  ActiveCallRow, CarePlan, CarePlanVisit, Diagnosis, Hospitalization, LabResult,
  Medication, Procedure, TwinEvent,
} from './database.types'
import type { AssignmentWithWorker, TwinData } from './twin'

/**
 * Обращение — одна госпитализация целиком: от поступления до закрытия
 * наблюдения в поликлинике. Всё выводится из уже сохранённых записей, ничего
 * нового в базе не хранится, поэтому статус не может разойтись с картой.
 */

export type StageId = 'admission' | 'treatment' | 'discharge' | 'handoff' | 'monitoring' | 'closed'

/** done — пройден, current — идёт сейчас, problem — идёт с нарушением, upcoming — впереди, skipped — не было. */
export type StageState = 'done' | 'current' | 'problem' | 'upcoming' | 'skipped'

export type EpisodeStatus =
  | 'IN_HOSPITAL'
  | 'HANDOFF'
  | 'MONITORING'
  | 'COMPLETED'
  | 'DISCHARGED'
  | 'TRANSFERRED'
  | 'CANCELLED'

export interface Stage {
  id: StageId
  state: StageState
  /** Когда этап начался или завершился — что осмысленнее для этапа. */
  at: string | null
}

export interface Episode {
  id: string
  hospitalization: Hospitalization
  plan: CarePlan | null
  call: ActiveCallRow | null
  visits: CarePlanVisit[]
  assignments: AssignmentWithWorker[]
  diagnoses: Diagnosis[]
  procedures: Procedure[]
  medications: Medication[]
  labs: LabResult[]
  events: TwinEvent[]
  stages: Stage[]
  status: EpisodeStatus
  /** Есть просроченный вызов или пропущенный/просроченный визит. */
  attention: string[]
  start: string
  end: string | null
  stayDays: number | null
}

const DAY = 86_400_000

export const visitOverdue = (visit: CarePlanVisit, now = Date.now()): boolean =>
  visit.status === 'PLANNED' && new Date(`${visit.scheduled_for}T23:59:59`).getTime() < now

const callOverdue = (call: ActiveCallRow, now = Date.now()): boolean =>
  (call.status === 'PENDING' || call.status === 'ACKNOWLEDGED') && new Date(call.due_at).getTime() < now

function pickPlan(plans: CarePlan[]): CarePlan | null {
  // Живой план важнее отменённого черновика.
  const rank = (plan: CarePlan) =>
    ({ ACTIVE: 0, COMPLETED: 1, PENDING_APPROVAL: 2, DRAFT: 3, CANCELLED: 4 })[plan.status]
  return [...plans].sort((a, b) => rank(a) - rank(b))[0] ?? null
}

function build(h: Hospitalization, data: TwinData, now: number): Omit<Episode, 'events'> {
  const plan = pickPlan(data.carePlans.filter((p) => p.hospitalization_id === h.id))
  const call = data.activeCalls.find((c) => c.hospitalization_id === h.id) ?? null
  const visits = plan
    ? data.visits.filter((v) => v.care_plan_id === plan.id)
      .sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for))
    : []
  const assignments = plan ? data.assignments.filter((a) => a.care_plan_id === plan.id) : []

  const discharged = h.discharged_at
  const inHospital = h.status === 'ACTIVE'

  const missed = visits.filter((v) => v.status === 'MISSED' || visitOverdue(v, now))
  const attention: string[] = []
  if (call && callOverdue(call, now)) attention.push('call_overdue')
  if (missed.length > 0) attention.push('visits_missed')

  const handoff: Stage = (() => {
    if (inHospital) return { id: 'handoff', state: 'upcoming', at: null }
    if (!call) return { id: 'handoff', state: 'skipped', at: null }
    if (call.status === 'COMPLETED') {
      const bad = call.outcome === 'UNREACHABLE' || call.outcome === 'REFUSED'
      return { id: 'handoff', state: bad ? 'problem' : 'done', at: call.completed_at }
    }
    if (call.status === 'CANCELLED') return { id: 'handoff', state: 'skipped', at: null }
    return { id: 'handoff', state: callOverdue(call, now) ? 'problem' : 'current', at: call.due_at }
  })()

  const monitoring: Stage = (() => {
    if (!plan || plan.status === 'CANCELLED') {
      return { id: 'monitoring', state: inHospital ? 'upcoming' : 'skipped', at: null }
    }
    if (plan.status === 'COMPLETED') {
      return { id: 'monitoring', state: missed.length > 0 ? 'problem' : 'done', at: plan.start_date ?? plan.approved_at }
    }
    if (plan.status === 'ACTIVE') {
      return { id: 'monitoring', state: missed.length > 0 ? 'problem' : 'current', at: plan.start_date ?? plan.approved_at }
    }
    return { id: 'monitoring', state: 'upcoming', at: null }
  })()

  const closedStage: Stage = plan?.status === 'COMPLETED'
    ? { id: 'closed', state: 'done', at: plan.completed_at ?? plan.end_date }
    : !plan && discharged && !inHospital
      ? { id: 'closed', state: 'done', at: discharged }
      : { id: 'closed', state: 'upcoming', at: plan?.end_date ?? null }

  const stages: Stage[] = [
    { id: 'admission', state: 'done', at: h.admitted_at },
    { id: 'treatment', state: inHospital ? 'current' : 'done', at: h.admitted_at },
    { id: 'discharge', state: discharged ? 'done' : 'upcoming', at: discharged },
    handoff,
    monitoring,
    closedStage,
  ]

  const status: EpisodeStatus =
    h.status === 'CANCELLED' ? 'CANCELLED'
      : h.status === 'TRANSFERRED' ? 'TRANSFERRED'
        : inHospital ? 'IN_HOSPITAL'
          : plan?.status === 'COMPLETED' ? 'COMPLETED'
            : plan?.status === 'ACTIVE' ? 'MONITORING'
              : plan || (call && call.status !== 'COMPLETED' && call.status !== 'CANCELLED') ? 'HANDOFF'
                : 'DISCHARGED'

  const end = status === 'COMPLETED'
    ? plan?.completed_at ?? plan?.end_date ?? discharged
    : status === 'DISCHARGED' || status === 'TRANSFERRED' || status === 'CANCELLED'
      ? discharged
      : null

  return {
    id: h.id,
    hospitalization: h,
    plan,
    call,
    visits,
    assignments,
    diagnoses: data.diagnoses.filter((d) => d.hospitalization_id === h.id),
    procedures: data.procedures.filter((p) => p.hospitalization_id === h.id)
      .sort((a, b) => a.performed_at.localeCompare(b.performed_at)),
    medications: data.medications.filter((m) => m.hospitalization_id === h.id || (plan && m.care_plan_id === plan.id)),
    labs: data.labs.filter((l) => l.hospitalization_id === h.id),
    stages,
    status,
    attention,
    start: h.admitted_at,
    end,
    stayDays: discharged
      ? Math.max(1, Math.round((new Date(discharged).getTime() - new Date(h.admitted_at).getTime()) / DAY))
      : Math.max(1, Math.round((now - new Date(h.admitted_at).getTime()) / DAY)),
  }
}

export function buildEpisodes(data: TwinData, now = Date.now()): { episodes: Episode[]; outside: TwinEvent[] } {
  const built = data.hospitalizations
    .map((h) => build(h, data, now))
    .sort((a, b) => b.start.localeCompare(a.start))

  // Событие принадлежит обращению, если попало в его окно: от поступления до
  // закрытия (для открытых — до сегодняшнего дня). Остальное — вне обращений.
  const windows = built.map((episode) => ({
    id: episode.id,
    from: new Date(episode.start).getTime(),
    to: episode.end ? new Date(episode.end).getTime() + DAY : now + DAY,
  }))

  const byEpisode = new Map<string, TwinEvent[]>(built.map((episode) => [episode.id, []]))
  const outside: TwinEvent[] = []

  for (const event of data.events) {
    const at = new Date(event.occurred_at).getTime()
    // окна почти не пересекаются; при пересечении выигрывает более позднее обращение
    const match = windows.find((w) => at >= w.from && at <= w.to)
    if (match) byEpisode.get(match.id)!.push(event)
    else outside.push(event)
  }

  return {
    episodes: built.map((episode) => ({ ...episode, events: byEpisode.get(episode.id) ?? [] })),
    outside,
  }
}
