import type { DischargeDraft } from './discharge'
import type { AiFields } from './dischargeReview'

/**
 * «Сохранить черновик» — только на этом устройстве. Серверной таблицы для
 * черновиков выписки нет, поэтому интерфейс прямо говорит, где он лежит.
 * TODO: перенести в таблицу discharge_drafts, если черновик должен быть виден
 * другим врачам отделения.
 */

export interface SavedDischarge {
  draft: DischargeDraft
  ai: AiFields
  savedAt: string
}

const key = (hospitalizationId: string) => `caretwin.dischargeDraft.${hospitalizationId}`

export function loadSavedDischarge(hospitalizationId: string): SavedDischarge | null {
  try {
    const raw = localStorage.getItem(key(hospitalizationId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as SavedDischarge
    return parsed && parsed.draft ? parsed : null
  } catch {
    return null
  }
}

export function saveDischarge(hospitalizationId: string, draft: DischargeDraft, ai: AiFields): string | null {
  const savedAt = new Date().toISOString()
  try {
    localStorage.setItem(key(hospitalizationId), JSON.stringify({ draft, ai, savedAt }))
    return savedAt
  } catch {
    return null
  }
}

export function clearSavedDischarge(hospitalizationId: string): void {
  try {
    localStorage.removeItem(key(hospitalizationId))
  } catch {
    // хранилище недоступно — удалять нечего
  }
}
