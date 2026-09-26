import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { DashboardLayout } from '../components/layout/DashboardLayout'
import { EmptyState } from '../components/PatientRow'
import { useAuth } from '../contexts/AuthContext'
import {
  assignResponsible, reassignResponsible, staffName, useAssignmentBoard, useOrganizationStaff,
  type BoardPlan, type StaffMember,
} from '../lib/assignments'
import { dateShort } from '../lib/format'
import { plural, roleLabel, t, visitKindLabel } from '../lib/i18n'

const kindIcon = { HOME: '🏠', CLINIC: '🏥', CALL: '☎' } as const

const initials = (member: StaffMember): string =>
  [member.last_name, member.first_name].map((part) => part?.[0] ?? '').join('').toUpperCase() || '?'

const patientName = (plan: BoardPlan): string =>
  plan.patient ? `${plan.patient.last_name} ${plan.patient.first_name}` : t.common.dash

/** Выбор ответственного: сотрудники по возрастанию нагрузки, чтобы не грузить одного. */
const AssignPanel: React.FC<{
  plan: BoardPlan
  organizationId: string
  staff: StaffMember[]
  load: Map<string, number>
  onCancel: () => void
  onDone: (member: StaffMember) => void
}> = ({ plan, organizationId, staff, load, onCancel, onDone }) => {
  const a = t.assignBoard
  const reassign = Boolean(plan.assignment)
  const candidates = [...staff].sort((x, y) => (load.get(x.user_id) ?? 0) - (load.get(y.user_id) ?? 0))
  const [selected, setSelected] = useState<string | null>(
    candidates.find((member) => member.user_id !== plan.assignment?.assigned_user_id)?.user_id ?? null,
  )
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    const member = staff.find((item) => item.user_id === selected)
    if (!member || !plan.patient) return
    try {
      setBusy(true)
      setError(null)
      if (plan.assignment) await reassignResponsible(plan.assignment.id, member.user_id)
      else await assignResponsible(plan.id, plan.patient_id, organizationId, member.user_id, note)
      onDone(member)
    } catch (caught) {
      console.error('[assignments] save failed', caught)
      setError(a.failed)
      setBusy(false)
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-primary/25 bg-primary-soft/40 p-3">
      <p className="text-[0.8125rem] font-medium">{a.choose}</p>
      <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {candidates.map((member) => {
          const isCurrent = member.user_id === plan.assignment?.assigned_user_id
          const count = load.get(member.user_id) ?? 0
          return (
            <li key={member.user_id}>
              <label
                className={`flex cursor-pointer items-center gap-2.5 rounded-md border bg-surface px-2.5 py-2 text-[0.8125rem] transition-colors ${
                  selected === member.user_id ? 'border-primary' : 'border-border hover:border-border-strong'
                } ${isCurrent ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                <input
                  type="radio"
                  name={`assignee-${plan.id}`}
                  className="accent-[var(--color-primary)]"
                  checked={selected === member.user_id}
                  disabled={isCurrent}
                  onChange={() => setSelected(member.user_id)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{staffName(member)}</span>
                  <span className="block text-[0.6875rem] text-ink-muted">
                    {roleLabel[member.role]}
                    {isCurrent && ` · ${a.current}`}
                  </span>
                </span>
                <span className="tabular shrink-0 text-[0.75rem] text-ink-muted">
                  {count} {plural(count, a.patientsCount)}
                </span>
              </label>
            </li>
          )
        })}
      </ul>

      {!reassign && (
        <input
          type="text"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={a.note}
          aria-label={a.note}
          className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-[0.8125rem] outline-none focus-visible:border-primary"
        />
      )}

      {error && <p role="alert" className="mt-2 text-[0.8125rem] text-risk-critical">{error}</p>}

      <div className="mt-2.5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-[0.8125rem] text-ink-muted hover:text-ink"
        >
          {a.cancel}
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!selected || busy}
          className="rounded-md bg-primary px-3.5 py-1.5 text-[0.8125rem] font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          {busy ? a.saving : reassign ? a.confirmReassign : a.confirm}
        </button>
      </div>
    </div>
  )
}

const PlanRow: React.FC<{
  plan: BoardPlan
  assignee: StaffMember | null
  canAssign: boolean
  open: boolean
  onToggle: () => void
  panel: React.ReactNode
}> = ({ plan, assignee, canAssign, open, onToggle, panel }) => {
  const a = t.assignBoard
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="min-w-[14rem] flex-1">
          <Link to={`/patients/${plan.patient_id}`} className="font-medium hover:text-primary">
            {patientName(plan)}
            {plan.patient && (
              <span className="tabular ml-2 text-xs font-normal text-ink-muted">№{plan.patient.patient_number}</span>
            )}
          </Link>
          <p className="truncate text-xs text-ink-muted">
            {plan.title}
            {plan.sourceName && ` · ${a.from} ${plan.sourceName}`}
            {plan.end_date && ` · ${a.planUntil} ${dateShort(plan.end_date)}`}
          </p>
        </div>

        <p className="min-w-[12rem] text-[0.75rem]">
          {plan.nextVisit ? (
            <>
              <span className="text-ink-muted">{a.next}: </span>
              {kindIcon[plan.nextVisit.kind]} {plan.nextVisit.title ?? visitKindLabel[plan.nextVisit.kind]} ·{' '}
              <span className="tabular">{dateShort(plan.nextVisit.scheduled_for)}</span>
            </>
          ) : (
            <span className="text-ink-muted">{t.common.dash}</span>
          )}
        </p>

        {assignee && plan.assignment && (
          <span className="inline-flex items-center gap-2 rounded-full bg-surface-sunken py-1 pl-1 pr-3 text-[0.75rem]">
            <span className="flex size-6 items-center justify-center rounded-full bg-primary-soft text-[0.625rem] font-semibold text-primary">
              {initials(assignee)}
            </span>
            {staffName(assignee)}
            <span className="tabular text-ink-muted">· {a.since} {dateShort(plan.assignment.assigned_at)}</span>
          </span>
        )}

        {canAssign ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className={
              plan.assignment
                ? 'rounded-md border border-border px-3 py-1.5 text-xs text-ink-muted transition-colors hover:border-primary hover:text-primary'
                : 'rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-hover'
            }
          >
            {plan.assignment ? a.reassign : a.assign}
          </button>
        ) : (
          <Link
            to={`/patients/${plan.patient_id}`}
            className="rounded-md border border-border px-3 py-1.5 text-xs text-ink-muted hover:text-primary"
          >
            {a.openTwin} →
          </Link>
        )}
      </div>
      {open && panel}
    </li>
  )
}

export const AssignmentsPage: React.FC = () => {
  const a = t.assignBoard
  const { activeMembership, role } = useAuth()
  const orgId = activeMembership?.organization.id
  // триггер care_assignments принимает назначившего только в роли администратора
  const canAssign = role === 'ORGANIZATION_ADMIN' || role === 'SUPER_ADMIN'

  const { data: staff, loading: staffLoading } = useOrganizationStaff(orgId)
  const { data: plans, loading, error, refresh } = useAssignmentBoard(orgId)
  const [openPlan, setOpenPlan] = useState<string | null>(null)
  const [staffFilter, setStaffFilter] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // нагрузку считаем по доске, чтобы она обновлялась сразу после назначения
  const load = useMemo(() => {
    const counts = new Map<string, number>()
    for (const plan of plans) {
      if (plan.assignment) counts.set(plan.assignment.assigned_user_id, (counts.get(plan.assignment.assigned_user_id) ?? 0) + 1)
    }
    return counts
  }, [plans])

  const byId = useMemo(() => new Map(staff.map((member) => [member.user_id, member])), [staff])
  const waiting = plans.filter((plan) => !plan.assignment)
  const assigned = plans
    .filter((plan) => plan.assignment)
    .filter((plan) => !staffFilter || plan.assignment?.assigned_user_id === staffFilter)

  const panelFor = (plan: BoardPlan) => (
    <AssignPanel
      plan={plan}
      organizationId={orgId ?? ''}
      staff={staff}
      load={load}
      onCancel={() => setOpenPlan(null)}
      onDone={(member) => {
        setOpenPlan(null)
        setNotice(`${a.done}: ${patientName(plan)} → ${staffName(member)} — ${a.doneBody}`)
        refresh()
      }}
    />
  )

  const row = (plan: BoardPlan) => (
    <PlanRow
      key={plan.id}
      plan={plan}
      assignee={plan.assignment ? byId.get(plan.assignment.assigned_user_id) ?? null : null}
      canAssign={canAssign && staff.length > 0}
      open={openPlan === plan.id}
      onToggle={() => setOpenPlan((value) => (value === plan.id ? null : plan.id))}
      panel={panelFor(plan)}
    />
  )

  return (
    <DashboardLayout title={t.nav.assignments} subtitle={a.subtitle}>
      <div className="space-y-5">
        {error && (
          <p className="border-l-2 border-risk-critical py-1 pl-3 text-sm text-risk-critical">{error}</p>
        )}
        {!canAssign && <p className="rounded-lg bg-surface-sunken px-3 py-2 text-[0.8125rem] text-ink-muted">{a.readOnly}</p>}
        {notice && (
          <p
            role="status"
            className="handoff-in flex items-start gap-2 rounded-lg px-3 py-2 text-[0.8125rem]"
            style={{
              color: 'var(--color-risk-low)',
              backgroundColor: 'color-mix(in oklab, var(--color-risk-low) 9%, transparent)',
            }}
          >
            <span className="check-pop">✓</span>
            <span className="flex-1">{notice}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label={a.cancel} className="text-ink-muted">✕</button>
          </p>
        )}

        <section>
          <h2 className="mb-2 text-sm font-semibold">{a.team}</h2>
          {staffLoading ? (
            <p className="text-sm text-ink-muted">{t.common.loading}</p>
          ) : staff.length === 0 ? (
            <p className="text-sm text-ink-muted">{a.teamEmpty}</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {staff.map((member) => {
                const count = load.get(member.user_id) ?? 0
                const active = staffFilter === member.user_id
                return (
                  <li key={member.user_id}>
                    <button
                      type="button"
                      onClick={() => setStaffFilter(active ? null : member.user_id)}
                      aria-pressed={active}
                      className={`flex w-full items-center gap-3 rounded-lg border bg-surface px-3 py-2.5 text-left transition-colors ${
                        active ? 'border-primary bg-primary-soft/40' : 'border-border hover:border-border-strong'
                      }`}
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
                        {initials(member)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.875rem] font-medium">{staffName(member)}</span>
                        <span className="block text-[0.6875rem] text-ink-muted">{roleLabel[member.role]}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="tabular block text-base font-semibold">{count}</span>
                        <span className="block text-[0.625rem] text-ink-muted">{plural(count, a.patientsCount)}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="overflow-hidden rounded-lg border border-border bg-surface">
          <header className="flex items-center gap-2 border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">{a.waiting}</h2>
            <span
              className="tabular rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold"
              style={waiting.length
                ? { color: 'var(--color-risk-high)', backgroundColor: 'color-mix(in oklab, var(--color-risk-high) 12%, transparent)' }
                : { color: 'var(--color-ink-muted)' }}
            >
              {waiting.length}
            </span>
          </header>
          {loading ? <EmptyState>{t.common.loading}</EmptyState>
            : waiting.length === 0 ? <EmptyState>{a.waitingEmpty}</EmptyState>
              : <ul className="divide-y divide-border">{waiting.map(row)}</ul>}
        </section>

        <section className="overflow-hidden rounded-lg border border-border bg-surface">
          <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">{a.assigned}</h2>
            <span className="tabular text-[0.75rem] text-ink-muted">{assigned.length}</span>
            {staffFilter && byId.get(staffFilter) && (
              <button
                type="button"
                onClick={() => setStaffFilter(null)}
                className="ml-auto rounded-full bg-primary-soft px-2.5 py-0.5 text-[0.75rem] text-primary"
              >
                {staffName(byId.get(staffFilter)!)} ✕
              </button>
            )}
          </header>
          {loading ? <EmptyState>{t.common.loading}</EmptyState>
            : assigned.length === 0 ? <EmptyState>{staffFilter ? a.assignedEmptyFor : a.assignedEmpty}</EmptyState>
              : <ul className="divide-y divide-border">{assigned.map(row)}</ul>}
        </section>
      </div>
    </DashboardLayout>
  )
}
