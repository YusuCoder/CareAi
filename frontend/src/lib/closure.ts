import { useCallback, useEffect, useState } from 'react'

import { supabase } from './supabase'
import type { FollowUpCandidate } from './database.types'

export function useFollowUpCandidates() {
  const [data, setData] = useState<FollowUpCandidate[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState<number>(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    supabase.rpc('follow_up_candidates').then(({ data: rows, error: rpcError }) => {
      if (cancelled) return
      if (rpcError) setError(rpcError.message)
      else setData((rows ?? []) as FollowUpCandidate[])
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [nonce])

  return { data, loading, error, refresh: useCallback(() => setNonce((n) => n + 1), []) }
}

export async function completeCarePlan(carePlanId: string, note: string): Promise<void> {
  const { data: session } = await supabase.auth.getUser()

  const { error } = await supabase
    .from('care_plans')
    .update({
      status: 'COMPLETED',
      completed_by: session.user?.id ?? null,
      completion_note: note.trim() || null,
    })
    .eq('id', carePlanId)

  if (error) throw new Error(error.message)
}

export async function extendCarePlan(carePlanId: string, currentEnd: string | null): Promise<void> {
  const base = currentEnd ? new Date(currentEnd) : new Date()
  const from = base.getTime() > Date.now() ? base : new Date()
  const next = new Date(from.getTime() + 7 * 24 * 3600_000)

  const { error } = await supabase
    .from('care_plans')
    .update({ end_date: next.toISOString().slice(0, 10) })
    .eq('id', carePlanId)

  if (error) throw new Error(error.message)
}
