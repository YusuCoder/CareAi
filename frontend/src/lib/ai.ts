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

function normalizeSummary(raw: Partial<ShiftSummary> & { summary: string }): ShiftSummary {
  const strings = (value: unknown) =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

  return {
    summary: raw.summary,
    findings: strings(raw.findings),
    sources: strings(raw.sources),
    event_count: typeof raw.event_count === 'number' ? raw.event_count : 0,
    generated_at: raw.generated_at ?? new Date().toISOString(),
    model: raw.model ?? '',
  }
}

export function useShiftSummary(patientId?: string, includeTelegram = true): State {
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
      >('twin-summary', { body: { ...(patientId ? { patientId } : {}), excludeTelegram: !includeTelegram } })

      if (cancelled) return

      if (invokeError) {
        setError(await describeInvokeError(invokeError))
      } else if (result?.error) {
        setError(result.error)
      } else if (result && typeof result === 'object' && typeof result.summary === 'string') {
        setData(normalizeSummary(result))
      } else if (result) {
        setError('Некорректный ответ функции twin-summary.')
      }

      setLoading(false)
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [nonce, patientId, includeTelegram])

  const refresh = useCallback(() => setNonce((value) => value + 1), [])

  return { data, loading, error, refresh }
}
