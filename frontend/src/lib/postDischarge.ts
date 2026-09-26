import { useCallback, useEffect, useState } from 'react'

import { supabase } from './supabase'
import type {
  ActiveCallStatus, CarePlanStatus, VisitKind, VisitStatus,
} from './database.types'

/**
 * Выписанные пациенты глазами стационара: передан ли пациент, взяла ли его
 * поликлиника и идёт ли наблюдение по графику. Только чтение — RLS пускает
 * стационар к пациентам, которые у него лежали (can_access_patient).
 */

const WINDOW_DAYS = 90

export interface FollowUpVisit {
  id: string
  care_plan_id: string
  scheduled_for: string
  kind: VisitKind
  title: string | null
  status: VisitStatus
}

export interface DischargedPatient {
  hospitalizationId: string
  patientId: string
  name: string
  patientNumber: number | null
  diagnosis: string | null
  dischargedAt: string
  plan: {
    id: string
    status: CarePlanStatus
    title: string
    clinicName: string | null
    startDate: string | null
    endDate: string | null
  } | null
  call: { status: ActiveCallStatus; dueAt: string; completedAt: string | null } | null
  visits: FollowUpVisit[]
}

export type FollowUpState = 'monitoring' | 'attention' | 'completed' | 'none'

const today = (): string => {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function isCallOverdue(call: DischargedPatient['call'], now = Date.now()): boolean {
  return Boolean(
    call && (call.status === 'PENDING' || call.status === 'ACKNOWLEDGED') &&
    now > new Date(call.dueAt).getTime(),
  )
}

/** Плановый осмотр, дата которого прошла, а отметки нет, — тоже пропуск. */
export function missedVisits(row: DischargedPatient): FollowUpVisit[] {
  const day = today()
  return row.visits.filter(
    (visit) => visit.status === 'MISSED' || (visit.status === 'PLANNED' && visit.scheduled_for < day),
  )
}

export function nextVisit(row: DischargedPatient): FollowUpVisit | null {
  const day = today()
  return row.visits.find((visit) => visit.status === 'PLANNED' && visit.scheduled_for >= day) ?? null
}

export function followUpState(row: DischargedPatient, now = Date.now()): FollowUpState {
  if (!row.plan || row.plan.status === 'CANCELLED') return 'none'
  if (row.plan.status === 'COMPLETED') return 'completed'
  if (isCallOverdue(row.call, now) || missedVisits(row).length > 0) return 'attention'
  return 'monitoring'
}

interface HospRow {
  id: string
  patient_id: string
  discharged_at: string
  primary_diagnosis: string | null
  patient: { patient_number: number; first_name: string; last_name: string } | null
}

export function usePostDischarge(organizationId: string | null) {
  const [data, setData] = useState<DischargedPatient[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      const since = new Date(Date.now() - WINDOW_DAYS * 24 * 3600_000).toISOString()
      let query = supabase
        .from('hospitalizations')
        .select('id, patient_id, discharged_at, primary_diagnosis, patient:patients(patient_number, first_name, last_name)')
        .eq('status', 'DISCHARGED')
        .gte('discharged_at', since)
        .order('discharged_at', { ascending: false })
        .limit(200)
      // стационар видит своих выписанных, а не всех, к кому у него есть доступ
      if (organizationId) query = query.eq('organization_id', organizationId)

      const { data: hospRows, error: hospError } = await query
      if (cancelled) return
      if (hospError) {
        console.error('[post-discharge] hospitalizations', hospError)
        setError('Не удалось загрузить выписанных пациентов.')
        setLoading(false)
        return
      }

      const hosps = (hospRows ?? []) as unknown as HospRow[]
      const ids = hosps.map((row) => row.id)
      if (ids.length === 0) {
        setData([])
        setError(null)
        setLoading(false)
        return
      }

      const [plans, calls, orgs] = await Promise.all([
        supabase
          .from('care_plans')
          .select('id, hospitalization_id, status, title, receiving_organization_id, start_date, end_date, created_at')
          .in('hospitalization_id', ids)
          .order('created_at', { ascending: false }),
        supabase
          .from('active_calls')
          .select('hospitalization_id, status, due_at, completed_at, created_at')
          .in('hospitalization_id', ids)
          .order('created_at', { ascending: false }),
        supabase.from('organizations').select('id, name'),
      ])

      const planRows = (plans.data ?? []) as unknown as {
        id: string; hospitalization_id: string; status: CarePlanStatus; title: string
        receiving_organization_id: string; start_date: string | null; end_date: string | null
      }[]

      const visits = planRows.length
        ? await supabase
            .from('care_plan_visits')
            .select('id, care_plan_id, scheduled_for, kind, title, status')
            .in('care_plan_id', planRows.map((plan) => plan.id))
            .order('scheduled_for', { ascending: true })
        : { data: [], error: null }

      if (cancelled) return
      for (const failure of [plans.error, calls.error, orgs.error, visits.error]) {
        if (failure) console.error('[post-discharge] follow-up data', failure)
      }

      const callRows = (calls.data ?? []) as unknown as {
        hospitalization_id: string; status: ActiveCallStatus; due_at: string; completed_at: string | null
      }[]
      const orgNames = new Map(
        ((orgs.data ?? []) as unknown as { id: string; name: string }[]).map((org) => [org.id, org.name]),
      )
      const visitRows = (visits.data ?? []) as unknown as FollowUpVisit[]

      setData(hosps.map((hosp) => {
        // строки отсортированы от новых к старым: первый план и первый вызов — актуальные
        const plan = planRows.find((row) => row.hospitalization_id === hosp.id) ?? null
        const call = callRows.find((row) => row.hospitalization_id === hosp.id) ?? null
        return {
          hospitalizationId: hosp.id,
          patientId: hosp.patient_id,
          name: hosp.patient ? `${hosp.patient.last_name} ${hosp.patient.first_name}` : '—',
          patientNumber: hosp.patient?.patient_number ?? null,
          diagnosis: hosp.primary_diagnosis,
          dischargedAt: hosp.discharged_at,
          plan: plan && {
            id: plan.id,
            status: plan.status,
            title: plan.title,
            clinicName: orgNames.get(plan.receiving_organization_id) ?? null,
            startDate: plan.start_date,
            endDate: plan.end_date,
          },
          call: call && { status: call.status, dueAt: call.due_at, completedAt: call.completed_at },
          visits: plan ? visitRows.filter((visit) => visit.care_plan_id === plan.id) : [],
        }
      }))
      setError(null)
      setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [organizationId, nonce])

  const refresh = useCallback(() => setNonce((value) => value + 1), [])
  return { data, loading, error, refresh }
}
