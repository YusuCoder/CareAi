import type { AlertKind, MembershipRole, TwinEvent } from './database.types'

/**
 * Кто где видит данные из Telegram-бота.
 *
 * Медсестра ведёт пациента после выписки — ей всё на панели и в общей ленте.
 * Администратору на панели нужен только SOS. Врачам панель без Telegram, а
 * история опросов и реакций — во вкладке «Telegram» карточки пациента.
 * Это правила отображения, не доступа: RLS по-прежнему решает, чьи записи видны.
 */

/** Условие PostgREST для `.or()`: события не из Telegram. */
export const NOT_TELEGRAM = 'metadata->>channel.is.null,metadata->>channel.neq.TELEGRAM'

export function isTelegramEvent(event: Pick<TwinEvent, 'metadata'>): boolean {
  return event.metadata?.channel === 'TELEGRAM'
}

export function seesTelegramFeed(role: MembershipRole | null): boolean {
  return role === 'NURSE'
}

/** Какие тревоги показывать на панели; пустой список — панель не показывается. */
export function dashboardAlertKinds(role: MembershipRole | null): AlertKind[] {
  if (role === 'NURSE') return ['RISK', 'MISSED_CHECK_IN', 'EMERGENCY']
  if (role === 'ORGANIZATION_ADMIN' || role === 'SUPER_ADMIN') return ['EMERGENCY']
  return []
}
