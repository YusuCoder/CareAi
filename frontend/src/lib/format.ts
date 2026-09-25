import type { CarePhase, RiskLevel } from './database.types'
import { plural } from './i18n'

const LOCALE = 'ru-RU'

export function fullName(
  person: { first_name: string | null; last_name: string | null } | null | undefined,
  fallback = 'Без имени',
): string {
  if (!person) return fallback
  const name = [person.last_name, person.first_name].filter(Boolean).join(' ').trim()
  return name || fallback
}

export function ageFromBirthDate(birthDate: string | null): number | null {
  if (!birthDate) return null
  const born = new Date(birthDate)
  if (Number.isNaN(born.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - born.getFullYear()
  const monthDelta = now.getMonth() - born.getMonth()
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < born.getDate())) age -= 1
  return age
}

export function relativeTime(iso: string | null): string {
  if (!iso) return 'никогда'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 'неизвестно'

  const seconds = Math.round((Date.now() - then) / 1000)
  if (seconds < 60) return 'только что'

  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} ${plural(minutes, ['минуту', 'минуты', 'минут'])} назад`

  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} ${plural(hours, ['час', 'часа', 'часов'])} назад`

  const days = Math.round(hours / 24)
  if (days < 30) return `${days} ${plural(days, ['день', 'дня', 'дней'])} назад`

  return new Date(iso).toLocaleDateString(LOCALE)
}

export function dateShort(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(LOCALE, {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString(LOCALE, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function decimal(value: number | null, fractionDigits = 1): string {
  if (value === null) return '—'
  return value.toLocaleString(LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  })
}

export const riskColor: Record<RiskLevel, string> = {
  LOW: 'var(--color-risk-low)',
  MEDIUM: 'var(--color-risk-medium)',
  HIGH: 'var(--color-risk-high)',
  CRITICAL: 'var(--color-risk-critical)',
}

export const phaseColor: Record<CarePhase, string> = {
  HOSPITAL: 'var(--color-phase-hospital)',
  HOME: 'var(--color-phase-home)',
}
