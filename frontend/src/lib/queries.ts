import { useEffect, useRef, useState } from 'react'

import { useRealtimeVersion } from './realtime'
import { supabase } from './supabase'
import { NOT_TELEGRAM } from './telegram'
import type { CarePlan, CareAssignment, DigitalTwin, Patient, TwinEvent } from './database.types'

export interface PatientWithTwin extends Patient {
  digital_twins: DigitalTwin[]
}

interface Result<T> {
  data: T
  loading: boolean
  error: string | null
}

function useQuery<T>(run: () => Promise<{ data: T | null; error: { message: string } | null }>, deps: unknown[], initial: T): Result<T> {
  const [data, setData] = useState<T>(initial)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const loaded = useRef<boolean>(false)

  useEffect(() => {
    let cancelled = false
    // фоновые обновления из Realtime не должны мигать «Загрузка…»
    if (!loaded.current) setLoading(true)
    setError(null)

    run().then((result) => {
      if (cancelled) return
      if (result.error) setError(result.error.message)
      else if (result.data) setData(result.data)
      loaded.current = true
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, loading, error }
}

export function usePatients(): Result<PatientWithTwin[]> {
  const version = useRealtimeVersion('digital_twins')
  return useQuery<PatientWithTwin[]>(
    async () =>
      (await supabase
        .from('patients')
        .select('*, digital_twins(*)')
        .order('patient_number', { ascending: true })) as never,
    [version],
    [],
  )
}

export interface IncomingCase extends CarePlan {
  patient: PatientWithTwin | null
  care_assignments: { id: string; status: string }[]
}

export function useIncomingCases(): Result<IncomingCase[]> {
  return useQuery<IncomingCase[]>(
    async () =>
      (await supabase
        .from('care_plans')
        .select('*, patient:patients(*, digital_twins(*)), care_assignments(id, status)')
        .eq('status', 'ACTIVE')
        .order('created_at', { ascending: false })) as never,
    [],
    [],
  )
}

export interface MyAssignment extends CareAssignment {
  patient: PatientWithTwin | null
}

export function useMyAssignments(userId: string | undefined): Result<MyAssignment[]> {
  const version = useRealtimeVersion('digital_twins', { enabled: Boolean(userId) })
  return useQuery<MyAssignment[]>(
    async () => {
      if (!userId) return { data: [], error: null }
      return (await supabase
        .from('care_assignments')
        .select('*, patient:patients(*, digital_twins(*))')
        .eq('assigned_user_id', userId)
        .in('status', ['PENDING', 'ACCEPTED', 'ACTIVE'])
        .order('assigned_at', { ascending: false })) as never
    },
    [userId, version],
    [],
  )
}

export interface AttentionEvent extends TwinEvent {
  patient: Pick<Patient, 'id' | 'patient_number' | 'first_name' | 'last_name'> | null
}

/** `includeTelegram: false` — без событий из Telegram-бота (панель врача и администратора). */
export function useAttention({ includeTelegram }: { includeTelegram: boolean }): Result<AttentionEvent[]> {
  const version = useRealtimeVersion('twin_events')
  return useQuery<AttentionEvent[]>(
    async () => {
      let query = supabase
        .from('twin_events')
        .select('*, patient:patients(id, patient_number, first_name, last_name)')
        .neq('severity', 'INFO')
      if (!includeTelegram) query = query.or(NOT_TELEGRAM)
      return (await query.order('occurred_at', { ascending: false }).limit(30)) as never
    },
    [version, includeTelegram],
    [],
  )
}

export function useIncomingCount(enabled: boolean): number {
  const [count, setCount] = useState<number>(0)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    supabase
      .from('care_plans')
      .select('id, care_assignments(id)')
      .eq('status', 'ACTIVE')
      .then(({ data }) => {
        if (cancelled || !data) return
        const rows = data as unknown as { care_assignments: unknown[] }[]
        setCount(rows.filter((row) => (row.care_assignments ?? []).length === 0).length)
      })

    return () => {
      cancelled = true
    }
  }, [enabled])

  return count
}
