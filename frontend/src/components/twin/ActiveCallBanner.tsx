import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { formatGap, isOverdue, useNow, type ActiveCall } from '../../lib/activeCalls'
import { supabase } from '../../lib/supabase'
import { t } from '../../lib/i18n'

/** Shows the open 24-hour obligation right where the doctor opens the patient. */
export const ActiveCallBanner: React.FC<{ patientId: string }> = ({ patientId }) => {
  const [call, setCall] = useState<ActiveCall | null>(null)
  const now = useNow(30_000)

  useEffect(() => {
    let cancelled = false

    supabase
      .from('active_calls')
      .select('*, patient:patients(id, patient_number, first_name, last_name), organization:organizations(name)')
      .eq('patient_id', patientId)
      .in('status', ['PENDING', 'ACKNOWLEDGED'])
      .order('due_at', { ascending: true })
      .limit(1)
      .then(({ data }) => {
        if (!cancelled) setCall(((data ?? []) as unknown as ActiveCall[])[0] ?? null)
      })

    return () => {
      cancelled = true
    }
  }, [patientId])

  if (!call) return null

  const late = isOverdue(call, now)
  const color = late ? 'var(--color-risk-critical)' : 'var(--color-risk-medium)'
  const remaining = new Date(call.due_at).getTime() - now

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-4 py-2.5 text-sm"
      style={{
        borderColor: color,
        backgroundColor: `color-mix(in oklab, ${color} 6%, transparent)`,
      }}
    >
      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="font-medium" style={{ color }}>
        {t.calls.title}
      </span>
      <span className="tabular text-ink-muted">
        {late ? t.calls.overdueBy : t.calls.due} {formatGap(Math.abs(remaining))}
      </span>
      <Link to="/active-calls" className="ml-auto text-xs text-ink-muted hover:text-primary">
        {t.calls.openAll}
      </Link>
    </div>
  )
}
