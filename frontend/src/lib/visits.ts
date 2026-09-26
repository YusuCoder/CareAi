import { visitOverdue } from './episodes'
import { t, visitStatusLabel } from './i18n'
import type { CarePlanVisit } from './database.types'

export const tint = (color: string, amount = 10) => `color-mix(in oklab, ${color} ${amount}%, transparent)`

export const visitTone = (visit: CarePlanVisit): { label: string; color: string } => {
  if (visitOverdue(visit)) return { label: t.history.episodes.overdue, color: 'var(--color-risk-critical)' }
  if (visit.status === 'MISSED') return { label: visitStatusLabel.MISSED, color: 'var(--color-risk-critical)' }
  if (visit.status === 'COMPLETED') return { label: visitStatusLabel.COMPLETED, color: 'var(--color-risk-low)' }
  if (visit.status === 'CANCELLED') return { label: visitStatusLabel.CANCELLED, color: 'var(--color-ink-muted)' }
  return { label: visitStatusLabel.PLANNED, color: 'var(--color-primary)' }
}
