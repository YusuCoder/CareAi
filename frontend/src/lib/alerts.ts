import { useEffect, useRef, useState } from 'react'

import { useRealtimeVersion } from './realtime'
import { supabase } from './supabase'
import type { AlertKind, AlertRow, RiskLevel } from './database.types'

export type Alert = AlertRow & {
  patient: {
    id: string
    patient_number: number
    first_name: string
    last_name: string
    phone: string | null
    address: string | null
  } | null
}

const RANK: Record<RiskLevel, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
// SOS всегда наверху, даже над критическим риском
const rank = (alert: Alert) => (alert.kind === 'EMERGENCY' ? -1 : RANK[alert.level])

/**
 * Открытые тревоги, которые видит пользователь (RLS: назначенные ему и по
 * доступным пациентам). Приходят через Realtime — новая тревога и пояснение ИИ,
 * дописанное позже, появляются без перезагрузки. `fresh` — пришедшие после
 * открытия экрана, их подсвечиваем.
 */
export function useOpenAlerts(kinds: AlertKind[]) {
  const [data, setData] = useState<Alert[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [fresh, setFresh] = useState<Set<string>>(new Set())
  const seen = useRef<Set<string> | null>(null)
  const enabled = kinds.length > 0
  const version = useRealtimeVersion('alerts', { enabled })
  const kindsKey = kinds.join(',')

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    supabase
      .from('alerts')
      .select('*, patient:patients(id, patient_number, first_name, last_name, phone, address)')
      .neq('status', 'RESOLVED')
      .in('kind', kindsKey.split(',') as AlertKind[])
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data: rows, error: failure }) => {
        if (cancelled) return
        if (failure) {
          setError(failure.message)
        } else {
          const alerts = ((rows ?? []) as unknown as Alert[]).sort(
            (a, b) => rank(a) - rank(b)
              || new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
          )
          if (seen.current) {
            const arrived = alerts.filter((alert) => !seen.current!.has(alert.id)).map((alert) => alert.id)
            if (arrived.length > 0) setFresh((prev) => new Set([...prev, ...arrived]))
          }
          seen.current = new Set(alerts.map((alert) => alert.id))
          setData(alerts)
          setError(null)
        }
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [version, enabled, kindsKey])

  return { data, loading: enabled && loading, error, fresh }
}

export async function acknowledgeAlert(id: string): Promise<void> {
  const { error } = await supabase.from('alerts').update({ status: 'ACKNOWLEDGED' }).eq('id', id)
  if (error) throw new Error(error.message)
}

/** Ответ на SOS: медсестра называет, через сколько будет у пациента. Бот сообщит пациенту. */
export async function setVisitEta(alert: Alert, minutes: number): Promise<void> {
  const { error } = await supabase
    .from('alerts')
    .update({
      visit_eta: new Date(Date.now() + minutes * 60_000).toISOString(),
      ...(alert.status === 'OPEN' ? { status: 'ACKNOWLEDGED' as const } : {}),
    })
    .eq('id', alert.id)
  if (error) throw new Error(error.message)
}

/** Закрывает человек; отметки времени и автора ставит триггер. */
export async function resolveAlert(id: string, note: string): Promise<void> {
  const { error } = await supabase
    .from('alerts')
    .update({ status: 'RESOLVED', resolution_note: note.trim() || null })
    .eq('id', id)
  if (error) throw new Error(error.message)
}
