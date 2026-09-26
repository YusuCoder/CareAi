import { useEffect, useRef, useState } from 'react'

import { useRealtimeVersion } from './realtime'
import { supabase } from './supabase'
import { isTelegramEvent } from './telegram'
import type {
  ActiveCallRow, Allergy, CareAssignment, CarePlan, CarePlanVisit, Device, Diagnosis, DigitalTwin,
  Hospitalization, LabResult, Medication, Observation, ObservationType,
  Patient, Procedure, TwinEvent,
} from './database.types'

export interface AssignmentWithWorker extends CareAssignment {
  assigned_user: { first_name: string | null; last_name: string | null } | null
  organization: { name: string } | null
}

export interface TwinData {
  patient: Patient | null
  primaryClinic: { id: string; name: string } | null
  twin: DigitalTwin | null
  observations: Observation[]
  diagnoses: Diagnosis[]
  labs: LabResult[]
  medications: Medication[]
  procedures: Procedure[]
  allergies: Allergy[]
  hospitalizations: Hospitalization[]
  carePlans: CarePlan[]
  assignments: AssignmentWithWorker[]
  devices: Device[]
  visits: CarePlanVisit[]
  activeCalls: ActiveCallRow[]
  events: TwinEvent[]
  /** id -> название: события несут только organization_id. */
  organizationNames: Record<string, string>
}

const EMPTY: TwinData = {
  patient: null, primaryClinic: null, twin: null, observations: [], diagnoses: [], labs: [],
  medications: [], procedures: [], allergies: [], hospitalizations: [],
  carePlans: [], assignments: [], devices: [], visits: [], activeCalls: [], events: [],
  organizationNames: {},
}

/** `includeTelegram: false` убирает события бота из общей ленты — у врачей они во вкладке «Telegram». */
export function usePatientTwin(patientId: string | undefined, { includeTelegram = true } = {}) {
  const [data, setData] = useState<TwinData>(EMPTY)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const loadedFor = useRef<string | undefined>(undefined)
  // новая запись в хронологии (ответ в Telegram, тревога, смена риска) — перечитываем двойника
  const version = useRealtimeVersion('twin_events', {
    filter: patientId ? `patient_id=eq.${patientId}` : undefined,
    enabled: Boolean(patientId),
  })

  useEffect(() => {
    if (!patientId) return
    let cancelled = false
    if (loadedFor.current !== patientId) setLoading(true)
    setError(null)

    const load = async () => {
      const byPatient = (table: string, columns = '*') =>
        supabase.from(table).select(columns).eq('patient_id', patientId)

      const [
        patient, twin, observations, diagnoses, labs, medications,
        procedures, allergies, hospitalizations, carePlans, assignments,
        devices, visits, activeCalls, events, organizations,
      ] = await Promise.all([
        supabase.from('patients').select('*').eq('id', patientId).maybeSingle(),
        supabase.from('digital_twins').select('*').eq('patient_id', patientId).maybeSingle(),
        byPatient('observations').order('recorded_at', { ascending: false }).limit(400),
        byPatient('diagnoses').order('diagnosed_at', { ascending: false, nullsFirst: false }),
        byPatient('lab_results').order('collected_at', { ascending: false }),
        byPatient('medications').order('start_date', { ascending: false, nullsFirst: false }),
        byPatient('procedures').order('performed_at', { ascending: false }),
        byPatient('allergies').order('noted_at', { ascending: false, nullsFirst: false }),
        byPatient('hospitalizations').order('admitted_at', { ascending: false }),
        byPatient('care_plans').order('created_at', { ascending: false }),
        supabase
          .from('care_assignments')
          // Внешний ключ указывается явно: на profiles ссылаются два поля.
          .select('*, assigned_user:profiles!assigned_user_id(first_name, last_name), organization:organizations(name)')
          .eq('patient_id', patientId)
          .order('assigned_at', { ascending: false }),
        byPatient('devices').order('linked_at', { ascending: false }),
        byPatient('care_plan_visits').order('scheduled_for', { ascending: false }),
        byPatient('active_calls').order('created_at', { ascending: false }),
        byPatient('twin_events').order('occurred_at', { ascending: false }).limit(2000),
        supabase.from('organizations').select('id, name'),
      ])

      if (cancelled) return

      const firstError = [patient, twin, observations, diagnoses, labs, medications,
        procedures, allergies, hospitalizations, carePlans, assignments, devices,
        visits, activeCalls, events, organizations]
        .find((result) => result.error)?.error

      if (firstError) setError(firstError.message)

      const patientRow = (patient.data ?? null) as Patient | null
      const orgs = (organizations.data ?? []) as unknown as { id: string; name: string }[]

      setData({
        patient: patientRow,
        primaryClinic:
          orgs.find((organization) => organization.id === patientRow?.primary_clinic_id) ?? null,
        twin: (twin.data ?? null) as DigitalTwin | null,
        observations: (observations.data ?? []) as unknown as Observation[],
        diagnoses: (diagnoses.data ?? []) as unknown as Diagnosis[],
        labs: (labs.data ?? []) as unknown as LabResult[],
        medications: (medications.data ?? []) as unknown as Medication[],
        procedures: (procedures.data ?? []) as unknown as Procedure[],
        allergies: (allergies.data ?? []) as unknown as Allergy[],
        hospitalizations: (hospitalizations.data ?? []) as unknown as Hospitalization[],
        carePlans: (carePlans.data ?? []) as unknown as CarePlan[],
        assignments: (assignments.data ?? []) as unknown as AssignmentWithWorker[],
        devices: (devices.data ?? []) as unknown as Device[],
        visits: (visits.data ?? []) as unknown as CarePlanVisit[],
        activeCalls: (activeCalls.data ?? []) as unknown as ActiveCallRow[],
        events: ((events.data ?? []) as unknown as TwinEvent[])
          .filter((event) => includeTelegram || !isTelegramEvent(event)),
        organizationNames: Object.fromEntries(orgs.map((o) => [o.id, o.name])),
      })
      loadedFor.current = patientId
      setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [patientId, version, includeTelegram])

  return { data, loading, error }
}

export function latestPair(
  observations: Observation[],
  type: ObservationType,
): [Observation | undefined, Observation | undefined] {
  const ofType = observations.filter((observation) => observation.type === type)
  return [ofType[0], ofType[1]]
}

export type Trend = 'up' | 'down' | 'flat' | 'none'

export function trendOf(current?: Observation, previous?: Observation): Trend {
  if (!current || !previous) return 'none'
  if (current.value_numeric === null || previous.value_numeric === null) return 'none'
  const delta = current.value_numeric - previous.value_numeric
  if (Math.abs(delta) < 0.05) return 'flat'
  return delta > 0 ? 'up' : 'down'
}
