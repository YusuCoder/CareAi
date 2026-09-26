import { useEffect, useId, useState } from 'react'

import { supabase } from './supabase'

type Table = 'alerts' | 'twin_events' | 'digital_twins'

interface Options {
  /** Фильтр Realtime, например `patient_id=eq.<uuid>`. */
  filter?: string
  /** Выключить подписку, пока нет нужных данных. */
  enabled?: boolean
}

/**
 * Номер «версии» таблицы: растёт при каждом изменении, которое пользователю
 * разрешено видеть (Realtime проверяет RLS). Кладите его в зависимости загрузки,
 * чтобы экран обновлялся без перезагрузки. Пачку изменений схлопываем в одно
 * обновление — опрос в Telegram пишет несколько строк подряд.
 */
export function useRealtimeVersion(table: Table, { filter, enabled = true }: Options = {}): number {
  const [version, setVersion] = useState<number>(0)
  const id = useId()

  useEffect(() => {
    if (!enabled) return
    let timer: number | undefined

    const channel = supabase
      .channel(`rt:${table}:${filter ?? 'all'}:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) }, () => {
        window.clearTimeout(timer)
        timer = window.setTimeout(() => setVersion((v) => v + 1), 400)
      })
      .subscribe()

    return () => {
      window.clearTimeout(timer)
      void supabase.removeChannel(channel)
    }
  }, [table, filter, enabled, id])

  return version
}
