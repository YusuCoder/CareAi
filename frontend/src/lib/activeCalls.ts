import { useCallback, useEffect, useState } from 'react'

import { supabase } from './supabase'
import type {
  ActiveCallOutcome,
  ActiveCallRow,
  ActiveCallStats,
} from './database.types'

export type { ActiveCallOutcome, ActiveCallStats } from './database.types'

export type ActiveCall = ActiveCallRow & {
  patient: {
    id: string
    patient_number: number
    first_name: string
    last_name: string
  } | null
  organization: { name: string } | null
}

/** Overdue is derived, never stored — correct without a background job. */
export function isOverdue(call: ActiveCall, now: number = Date.now()): boolean {
  return (
    (call.status === 'PENDING' || call.status === 'ACKNOWLEDGED') &&
    now > new Date(call.due_at).getTime()
  )
}

export function useActiveCalls() {
  const [data, setData] = useState<ActiveCall[]>([])
  const [stats, setStats] = useState<ActiveCallStats | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState<number>(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    const load = async () => {
      const [calls, summary] = await Promise.all([
        supabase
          .from('active_calls')
          .select('*, patient:patients(id, patient_number, first_name, last_name), organization:organizations(name)')
          .order('due_at', { ascending: true }),
        supabase.rpc('active_call_stats'),
      ])

      if (cancelled) return
      if (calls.error) setError(calls.error.message)
      else setData((calls.data ?? []) as unknown as ActiveCall[])
      if (!summary.error && summary.data) setStats((summary.data as ActiveCallStats[])[0] ?? null)
      setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [nonce])

  return { data, stats, loading, error, refresh: useCallback(() => setNonce((n) => n + 1), []) }
}

/** Number of breached calls, for the sidebar badge. */
export function useOverdueCount(enabled: boolean): number {
  const [count, setCount] = useState<number>(0)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    supabase
      .from('active_calls')
      .select('due_at, status')
      .in('status', ['PENDING', 'ACKNOWLEDGED'])
      .then(({ data }) => {
        if (cancelled || !data) return
        const now = Date.now()
        setCount(data.filter((row) => now > new Date(row.due_at as string).getTime()).length)
      })

    return () => {
      cancelled = true
    }
  }, [enabled])

  return count
}

export async function acknowledgeCall(id: string): Promise<void> {
  const { data } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('active_calls')
    .update({ status: 'ACKNOWLEDGED', acknowledged_by: data.user?.id ?? null })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

/** The confirmation the brief requires: a person records that contact happened. */
export async function completeCall(
  id: string,
  outcome: ActiveCallOutcome,
  notes: string,
): Promise<void> {
  const { data } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('active_calls')
    .update({
      status: 'COMPLETED',
      completed_by: data.user?.id ?? null,
      outcome,
      notes: notes.trim() || null,
    })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

/** Ticks so countdowns move while the screen is open. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState<number>(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])
  return now
}

/** "4 ч 12 мин" */
export function formatGap(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 60000))
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  if (hours >= 24) {
    const days = Math.floor(hours / 24)
    return `${days} д ${hours % 24} ч`
  }
  return hours > 0 ? `${hours} ч ${minutes} мин` : `${minutes} мин`
}
