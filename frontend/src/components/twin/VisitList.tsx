import { dateShort } from '../../lib/format'
import { visitKindLabel } from '../../lib/i18n'
import { tint, visitTone } from '../../lib/visits'
import type { CarePlanVisit } from '../../lib/database.types'

/** Визиты плана наблюдения со статусом каждого: состоялся, пропущен, просрочен, впереди. */
export const VisitList: React.FC<{ visits: CarePlanVisit[] }> = ({ visits }) => (
  <ol className="divide-y divide-border overflow-hidden rounded-lg border border-border">
    {visits.map((visit) => {
      const tone = visitTone(visit)
      return (
        <li key={visit.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-[0.8125rem]">
          <span className="tabular w-24 shrink-0 text-ink-muted">{dateShort(visit.scheduled_for)}</span>
          <span className="min-w-0 flex-1">
            {visit.title || visitKindLabel[visit.kind]}
            <span className="text-ink-muted"> · {visitKindLabel[visit.kind]}</span>
            {visit.notes && <span className="block text-[0.75rem] text-ink-muted">{visit.notes}</span>}
          </span>
          <span
            className="rounded-full px-2 py-0.5 text-[0.6875rem] font-medium"
            style={{ color: tone.color, backgroundColor: tint(tone.color, 12) }}
          >
            {tone.label}
          </span>
        </li>
      )
    })}
  </ol>
)
