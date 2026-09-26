import { useCallback, useEffect, useState } from 'react'

import { supabase } from './supabase'
import type { CareAssignmentStatus, MembershipRole, VisitKind } from './database.types'

export interface StaffMember {
  user_id: string
  role: MembershipRole
  first_name: string | null
  last_name: string | null
  /** Сколько пациентов уже ведёт — чтобы не грузить одного и того же. */
  load: number
}

/** Сотрудники организации, которым можно передать пациента. */
export function useOrganizationStaff(organizationId: string | undefined) {
  const [data, setData] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState<boolean>(true)

  useEffect(() => {
    if (!organizationId) return
    let cancelled = false
    setLoading(true)

    const load = async () => {
      const [members, assignments] = await Promise.all([
        supabase
          .from('organization_memberships')
          .select('user_id, role, profiles(first_name, last_name)')
          .eq('organization_id', organizationId)
          .eq('is_active', true),
        supabase
          .from('care_assignments')
          .select('assigned_user_id')
          .eq('organization_id', organizationId)
          .in('status', ['PENDING', 'ACCEPTED', 'ACTIVE']),
      ])

      if (cancelled) return

      const load_ = new Map<string, number>()
      for (const row of (assignments.data ?? []) as { assigned_user_id: string }[]) {
        load_.set(row.assigned_user_id, (load_.get(row.assigned_user_id) ?? 0) + 1)
      }

      const rows = (members.data ?? []) as unknown as {
        user_id: string
        role: MembershipRole
        profiles: { first_name: string | null; last_name: string | null } | null
      }[]

      setData(
        rows
          .filter((row) => row.role === 'POLYCLINIC_DOCTOR' || row.role === 'NURSE')
          .map((row) => ({
            user_id: row.user_id,
            role: row.role,
            first_name: row.profiles?.first_name ?? null,
            last_name: row.profiles?.last_name ?? null,
            load: load_.get(row.user_id) ?? 0,
          }))
          .sort((a, b) => a.load - b.load),
      )
      setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [organizationId])

  return { data, loading }
}

/**
 * Передача пациента конкретному сотруднику. Назначение создаётся сразу
 * активным: выбор ответственного и есть принятие плана, отдельного шага
 * подтверждения в этой цепочке нет.
 */
export async function assignResponsible(
  carePlanId: string,
  patientId: string,
  organizationId: string,
  assignedUserId: string,
  notes: string,
): Promise<void> {
  const { data } = await supabase.auth.getUser()
  const now = new Date().toISOString()

  const { error } = await supabase.from('care_assignments').insert({
    care_plan_id: carePlanId,
    patient_id: patientId,
    organization_id: organizationId,
    assigned_user_id: assignedUserId,
    assigned_by: data.user?.id ?? null,
    status: 'ACTIVE' as CareAssignmentStatus,
    assigned_at: now,
    accepted_at: now,
    notes: notes.trim() || null,
  })

  if (error) throw new Error(error.message)
}

export interface ClinicAssignment {
  id: string
  patient_id: string
  care_plan_id: string
  status: CareAssignmentStatus
  assigned_at: string
  completed_at: string | null
  notes: string | null
  patient: {
    id: string
    patient_number: number
    first_name: string
    last_name: string
  } | null
  assigned_user: { first_name: string | null; last_name: string | null } | null
  care_plan: { title: string; end_date: string | null; status: string } | null
}

export function useClinicAssignments(organizationId: string | undefined) {
  const [data, setData] = useState<ClinicAssignment[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState<number>(0)

  useEffect(() => {
    if (!organizationId) return
    let cancelled = false
    setLoading(true)

    supabase
      .from('care_assignments')
      .select(
        '*, patient:patients(id, patient_number, first_name, last_name),' +
        ' assigned_user:profiles!assigned_user_id(first_name, last_name),' +
        ' care_plan:care_plans(title, end_date, status)',
      )
      .eq('organization_id', organizationId)
      .order('assigned_at', { ascending: false })
      .then(({ data: rows, error: failure }) => {
        if (cancelled) return
        if (failure) setError(failure.message)
        else setData((rows ?? []) as unknown as ClinicAssignment[])
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [organizationId, nonce])

  return { data, loading, error, refresh: useCallback(() => setNonce((n) => n + 1), []) }
}

export const staffName = (member: StaffMember): string =>
  [member.last_name, member.first_name].filter(Boolean).join(' ') || 'Без имени'

export interface BoardPlan {
  id: string
  patient_id: string
  title: string
  start_date: string | null
  end_date: string | null
  sourceName: string | null
  patient: { id: string; patient_number: number; first_name: string; last_name: string } | null
  /** Текущий ответственный (PENDING / ACCEPTED / ACTIVE), если есть. */
  assignment: {
    id: string
    assigned_user_id: string
    assigned_at: string
    notes: string | null
  } | null
  nextVisit: { scheduled_for: string; kind: VisitKind; title: string | null } | null
}

const OPEN_ASSIGNMENT: CareAssignmentStatus[] = ['PENDING', 'ACCEPTED', 'ACTIVE']

/**
 * Доска назначений поликлиники: все действующие планы наблюдения, которые
 * она приняла, и кто за каждый отвечает.
 */
export function useAssignmentBoard(organizationId: string | undefined) {
  const [data, setData] = useState<BoardPlan[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState<number>(0)

  useEffect(() => {
    if (!organizationId) return
    let cancelled = false

    const load = async () => {
      const [plans, orgs] = await Promise.all([
        supabase
          .from('care_plans')
          .select(
            'id, patient_id, title, start_date, end_date, created_at, source_organization_id,' +
            ' patient:patients(id, patient_number, first_name, last_name),' +
            ' care_assignments(id, assigned_user_id, status, assigned_at, notes)',
          )
          .eq('receiving_organization_id', organizationId)
          .eq('status', 'ACTIVE')
          .order('created_at', { ascending: false }),
        supabase.from('organizations').select('id, name'),
      ])

      if (cancelled) return
      if (plans.error) {
        console.error('[assignments] care plans', plans.error)
        setError('Не удалось загрузить пациентов на наблюдении.')
        setLoading(false)
        return
      }

      const rows = (plans.data ?? []) as unknown as {
        id: string; patient_id: string; title: string; start_date: string | null
        end_date: string | null; source_organization_id: string
        patient: BoardPlan['patient']
        care_assignments: {
          id: string; assigned_user_id: string; status: CareAssignmentStatus
          assigned_at: string; notes: string | null
        }[] | null
      }[]

      const visits = rows.length
        ? await supabase
            .from('care_plan_visits')
            .select('care_plan_id, scheduled_for, kind, title')
            .in('care_plan_id', rows.map((row) => row.id))
            .eq('status', 'PLANNED')
            .gte('scheduled_for', new Date().toISOString().slice(0, 10))
            .order('scheduled_for', { ascending: true })
        : { data: [] }
      if (cancelled) return

      const visitRows = (visits.data ?? []) as unknown as {
        care_plan_id: string; scheduled_for: string; kind: VisitKind; title: string | null
      }[]
      const orgNames = new Map(
        ((orgs.data ?? []) as { id: string; name: string }[]).map((org) => [org.id, org.name]),
      )

      setData(rows.map((row) => {
        const open = (row.care_assignments ?? [])
          .filter((item) => OPEN_ASSIGNMENT.includes(item.status))
          .sort((a, b) => b.assigned_at.localeCompare(a.assigned_at))[0]
        const next = visitRows.find((visit) => visit.care_plan_id === row.id)
        return {
          id: row.id,
          patient_id: row.patient_id,
          title: row.title,
          start_date: row.start_date,
          end_date: row.end_date,
          sourceName: orgNames.get(row.source_organization_id) ?? null,
          patient: row.patient,
          assignment: open
            ? { id: open.id, assigned_user_id: open.assigned_user_id, assigned_at: open.assigned_at, notes: open.notes }
            : null,
          nextVisit: next ? { scheduled_for: next.scheduled_for, kind: next.kind, title: next.title } : null,
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

  return { data, loading, error, refresh: useCallback(() => setNonce((n) => n + 1), []) }
}

/**
 * Смена ответственного. Время назначения переносим на сейчас вместе с
 * accepted_at: таблица требует accepted_at >= assigned_at.
 */
export async function reassignResponsible(assignmentId: string, assignedUserId: string): Promise<void> {
  const { data } = await supabase.auth.getUser()
  const now = new Date().toISOString()

  const { error } = await supabase
    .from('care_assignments')
    .update({
      assigned_user_id: assignedUserId,
      assigned_by: data.user?.id ?? null,
      assigned_at: now,
      accepted_at: now,
    })
    .eq('id', assignmentId)

  if (error) throw new Error(error.message)
}
