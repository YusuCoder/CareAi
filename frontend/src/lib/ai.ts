import { useCallback, useEffect, useState } from 'react'

import { supabase } from './supabase'

export interface ShiftSummary {
  summary: string
  findings: string[]
  sources: string[]
  event_count: number
  generated_at: string
  model: string
}

interface State {
  data: ShiftSummary | null
  loading: boolean
  error: string | null
  refresh: () => void
}

async function describeInvokeError(error: unknown): Promise<string> {
  const context = (error as { context?: Response }).context
  const fallback = error instanceof Error ? error.message : 'Не удалось получить сводку.'

  if (!context || typeof context.text !== 'function') return fallback

  try {
    const body = await context.text()
    if (!body) return `${fallback} (HTTP ${context.status})`
    try {
      const parsed = JSON.parse(body) as { error?: string; msg?: string }
      return parsed.error ?? parsed.msg ?? body
    } catch {
      return body
    }
  } catch {
    return fallback
  }
}

export function useShiftSummary(patientId?: string): State {
  const [data, setData] = useState<ShiftSummary | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState<number>(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    const load = async () => {
      const { data: result, error: invokeError } = await supabase.functions.invoke<
        ShiftSummary & { error?: string }
      >('twin-summary', { body: patientId ? { patientId } : {} })

      if (cancelled) return

      if (invokeError) {
        setError(await describeInvokeError(invokeError))
      } else if (result?.error) {
        setError(result.error)
      } else if (result) {
        setData(result)
      }

      setLoading(false)
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [nonce, patientId])

  const refresh = useCallback(() => setNonce((value) => value + 1), [])

  return { data, loading, error, refresh }
}
