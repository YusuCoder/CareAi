import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { DashboardLayout } from '../components/layout/DashboardLayout'
import { EmptyState } from '../components/PatientRow'
import { useAuth } from '../contexts/AuthContext'
import { useNow } from '../lib/activeCalls'
import { dateShort } from '../lib/format'
import { plural, t, visitKindLabel } from '../lib/i18n'
import {
  followUpState, isCallOverdue, missedVisits, nextVisit, usePostDischarge,
  type DischargedPatient, type FollowUpState,
} from '../lib/postDischarge'

type Filter = 'active' | FollowUpState | 'all'

const stateColor: Record<FollowUpState, string> = {
  monitoring: 'var(--color-phase-home)',
  attention: 'var(--color-risk-critical)',
  completed: 'var(--color-primary)',
  none: 'var(--color-ink-muted)',
}

const DAY = 24 * 3600_000
const kindIcon = { HOME: '🏠', CLINIC: '🏥', CALL: '☎' } as const

const Chip: React.FC<{ color: string; children: React.ReactNode }> = ({ color, children }) => (
  <span
    className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium"
    style={{ color, backgroundColor: `color-mix(in oklab, ${color} 12%, transparent)` }}
  >
    {children}
  </span>
)

function callChip(row: DischargedPatient, now: number): { color: string; label: string } | null {
  const p = t.postDischarge
  if (!row.call) return null
  if (isCallOverdue(row.call, now)) return { color: 'var(--color-risk-critical)', label: p.callOverdue }
  switch (row.call.status) {
    case 'PENDING': return { color: 'var(--color-risk-high)', label: p.callPending }
    case 'ACKNOWLEDGED': return { color: 'var(--color-risk-medium)', label: p.callAcknowledged }
    case 'COMPLETED': return { color: 'var(--color-risk-low)', label: p.callCompleted }
    default: return { color: 'var(--color-ink-muted)', label: p.callCancelled }
  }
}

/** Точка на каждый осмотр: видно и прогресс, и пропуски, не читая текст. */
const VisitTrack: React.FC<{ row: DischargedPatient }> = ({ row }) => {
  const p = t.postDischarge
  const missed = new Set(missedVisits(row).map((visit) => visit.id))
  const next = nextVisit(row)
  const done = row.visits.filter((visit) => visit.status === 'COMPLETED').length

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span className="text-[0.6875rem] text-ink-muted">{p.visits}</span>
        <ol className="flex items-center gap-1" aria-label={`${p.visits}: ${done} / ${row.visits.length}`}>
          {row.visits.map((visit) => {
            const color = visit.status === 'COMPLETED'
              ? 'var(--color-risk-low)'
              : missed.has(visit.id)
                ? 'var(--color-risk-critical)'
                : visit.status === 'CANCELLED'
                  ? 'var(--color-border)'
                  : 'var(--color-border-strong)'
            return (
              <li
                key={visit.id}
                title={`${dateShort(visit.scheduled_for)} · ${visit.title ?? visitKindLabel[visit.kind]} · ${
                  missed.has(visit.id) ? p.visitStatus.MISSED : p.visitStatus[visit.status]
                }`}
                className={`size-2.5 rounded-full ${visit.id === next?.id ? 'ring-2 ring-primary/40 ring-offset-1' : ''}`}
                style={{ backgroundColor: color }}
              />
            )
          })}
        </ol>
        <span className="tabular text-[0.6875rem] text-ink-muted">{done}/{row.visits.length}</span>
        {missed.size > 0 && (
          <span className="tabular text-[0.6875rem] font-medium text-risk-critical">
            · {missed.size} {p.missed}
          </span>
        )}
      </div>
      <p className="mt-0.5 truncate text-[0.75rem]">
        {next ? (
          <>
            <span className="text-ink-muted">{p.next}: </span>
            {kindIcon[next.kind]} {next.title ?? visitKindLabel[next.kind]} ·{' '}
            <span className="tabular">{dateShort(next.scheduled_for)}</span>
          </>
        ) : row.visits.length > 0 && missed.size === 0 ? (
          <span className="text-ink-muted">{p.allVisitsDone}</span>
        ) : null}
      </p>
    </div>
  )
}

const PatientCard: React.FC<{ row: DischargedPatient; now: number }> = ({ row, now }) => {
  const p = t.postDischarge
  const state = followUpState(row, now)
  const days = Math.floor((now - new Date(row.dischargedAt).getTime()) / DAY)
  const call = callChip(row, now)
  const stateLabel = { monitoring: p.monitoring, attention: p.attention, completed: p.completed, none: p.none }[state]

  return (
    <li
      className="grid gap-x-6 gap-y-3 px-4 py-3.5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] lg:items-center"
      style={{ boxShadow: `inset 3px 0 0 ${stateColor[state]}` }}
    >
      <div className="min-w-0">
        <Link to={`/patients/${row.patientId}`} className="block truncate font-medium hover:text-primary">
          {row.name}
          {row.patientNumber !== null && (
            <span className="tabular ml-2 text-xs font-normal text-ink-muted">№{row.patientNumber}</span>
          )}
        </Link>
        <p className="truncate text-xs text-ink-muted">{row.diagnosis ?? t.common.dash}</p>
        <p className="tabular mt-0.5 text-[0.6875rem] text-ink-muted">
          {p.discharged} {dateShort(row.dischargedAt)} ·{' '}
          {days <= 0 ? p.today : `${days} ${plural(days, p.daysAgo)}`}
        </p>
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap gap-1.5">
          <Chip color={stateColor[state]}>{stateLabel}</Chip>
          {call && <Chip color={call.color}>{call.label}</Chip>}
        </div>
        {row.plan ? (
          <p className="mt-1 truncate text-[0.75rem]">
            <span className="text-ink-muted">{p.handedTo} → </span>
            {row.plan.clinicName ?? t.common.dash}
            {row.plan.endDate && (
              <span className="tabular text-ink-muted"> · {p.until} {dateShort(row.plan.endDate)}</span>
            )}
          </p>
        ) : (
          <p className="mt-1 text-[0.75rem] text-ink-muted">{p.noPlan}</p>
        )}
      </div>

      <div className="min-w-0">{row.plan && row.visits.length > 0 && <VisitTrack row={row} />}</div>

      <Link
        to={`/patients/${row.patientId}`}
        className="justify-self-start rounded-md border border-border px-3 py-1.5 text-xs text-ink-muted transition-colors hover:border-primary hover:text-primary lg:justify-self-end"
      >
        {p.openTwin} →
      </Link>
    </li>
  )
}

export const PostDischargePage: React.FC = () => {
  const p = t.postDischarge
  const { activeMembership } = useAuth()
  // у стационара — только его выписки; у суперадмина фильтра нет
  const orgId = activeMembership?.organization.type === 'CENTRAL_HOSPITAL'
    ? activeMembership.organization.id
    : null
  const { data, loading, error, refresh } = usePostDischarge(orgId)
  const now = useNow(60_000)
  const [filter, setFilter] = useState<Filter>('active')
  const [search, setSearch] = useState('')

  const counts = useMemo(() => {
    const result: Record<FollowUpState, number> = { monitoring: 0, attention: 0, completed: 0, none: 0 }
    for (const row of data) result[followUpState(row, now)] += 1
    return result
  }, [data, now])

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return data
      .filter((row) => {
        const state = followUpState(row, now)
        if (filter === 'active') return state === 'monitoring' || state === 'attention'
        return filter === 'all' || state === filter
      })
      .filter((row) =>
        !needle || row.name.toLowerCase().includes(needle) || String(row.patientNumber ?? '').includes(needle))
      // требующие внимания — сверху
      .sort((a, b) => Number(followUpState(b, now) === 'attention') - Number(followUpState(a, now) === 'attention'))
  }, [data, filter, search, now])

  const tabs: { id: Filter; label: string; count: number; color?: string }[] = [
    { id: 'active', label: p.monitoring, count: counts.monitoring + counts.attention, color: stateColor.monitoring },
    { id: 'attention', label: p.attention, count: counts.attention, color: stateColor.attention },
    { id: 'completed', label: p.completed, count: counts.completed },
    { id: 'none', label: p.none, count: counts.none },
    { id: 'all', label: p.all, count: data.length },
  ]

  return (
    <DashboardLayout title={t.nav.postDischarge} subtitle={p.subtitle}>
      {error && (
        <p className="mb-4 flex items-center gap-3 border-l-2 border-risk-critical py-1 pl-3 text-sm text-risk-critical">
          {error}
          <button type="button" onClick={refresh} className="text-primary hover:underline">{p.retry}</button>
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div role="tablist" className="flex flex-wrap gap-1.5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={filter === tab.id}
              onClick={() => setFilter(tab.id)}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[0.8125rem] transition-colors ${
                filter === tab.id
                  ? 'border-primary bg-primary-soft text-primary'
                  : 'border-border text-ink-muted hover:text-ink'
              }`}
            >
              {tab.label}
              <span
                className="tabular text-[0.75rem] font-semibold"
                style={tab.color && tab.count > 0 ? { color: tab.color } : undefined}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={p.search}
          aria-label={p.search}
          className="ml-auto w-full rounded-md border border-border bg-surface px-3 py-1.5 text-[0.8125rem] outline-none focus-visible:border-primary sm:w-64"
        />
      </div>

      <section className="overflow-hidden rounded-lg border border-border bg-surface">
        {loading && <EmptyState>{t.common.loading}</EmptyState>}
        {!loading && data.length === 0 && !error && <EmptyState>{p.empty}</EmptyState>}
        {!loading && data.length > 0 && rows.length === 0 && <EmptyState>{p.emptyFilter}</EmptyState>}
        <ul className="divide-y divide-border">
          {rows.map((row) => <PatientCard key={row.hospitalizationId} row={row} now={now} />)}
        </ul>
      </section>
    </DashboardLayout>
  )
}
