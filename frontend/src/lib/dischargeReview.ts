import { GAP_FIELD, LABS, VITALS, type DischargeContext, type DischargeDraft } from './discharge'
import { t } from './i18n'

/**
 * Готовность выписки считается только из состояния формы и карты — ничего не
 * захардкожено. Блокирует оформление по-прежнему одно: пустой основной диагноз
 * (та же проверка, что была в форме). Остальное — предупреждения для врача.
 */

export type AiField = 'discharge_summary' | 'procedure_summary'

export interface AiFieldState {
  /** Текст, который вернул CareTwin AI. Отличие от поля формы = правка врача. */
  aiText: string
  reviewed: boolean
}

export type AiFields = Partial<Record<AiField, AiFieldState>>

export type AiFieldStatus = 'manual' | 'needsReview' | 'edited' | 'reviewed'

export function aiFieldStatus(value: string, state: AiFieldState | undefined): AiFieldStatus {
  if (!state) return 'manual'
  if (value.trim() !== state.aiText.trim()) return 'edited'
  return state.reviewed ? 'reviewed' : 'needsReview'
}

export type SectionId = 'diagnosis' | 'medications' | 'vitals' | 'labs' | 'followUp'
export type SectionStatus = 'done' | 'attention' | 'empty'

export interface SectionReview {
  id: SectionId
  status: SectionStatus
  issues: string[]
}

export interface ForecastGap {
  gap: string
  label: string
  /** Поле формы, которое закрывает пробел; null — заполняется не здесь. */
  field: string | null
}

export interface Check {
  label: string
  ok: boolean
  /** Не даёт оформить выписку (только основной диагноз). */
  blocking?: boolean
  /** Нейтральный пункт: не готово, но и не требуется. */
  neutral?: boolean
}

export interface Review {
  sections: SectionReview[]
  forecastGaps: ForecastGap[]
  /** Пробелы, которые ещё открыты с учётом введённого в форме. */
  openGaps: ForecastGap[]
  checks: Check[]
  canSubmit: boolean
}

const filled = (value: string | undefined): boolean => Boolean(value && value.trim())

const gapLabel = (gap: string): string =>
  t.forecast.fields[gap as keyof typeof t.forecast.fields] ?? gap

export function reviewDischarge(
  draft: DischargeDraft,
  context: DischargeContext,
  gaps: string[],
  hasClinic: boolean,
  ai: AiFields,
): Review {
  const f = t.dischargeFlow

  const forecastGaps: ForecastGap[] = gaps.map((gap) => ({
    gap,
    label: gapLabel(gap),
    field: GAP_FIELD[gap] ?? null,
  }))

  const fieldFilled = (field: string): boolean => {
    if (field === 'bp') return filled(draft.vitals.bp) && filled(draft.vitalsSecondary.bp)
    if (VITALS.some((vital) => vital.field === field)) return filled(draft.vitals[field])
    return filled(draft.labs[field])
  }

  const openGaps = forecastGaps.filter((gap) => !gap.field || !fieldFilled(gap.field))
  const gapFields = new Set(forecastGaps.map((gap) => gap.field).filter(Boolean))

  // 1. диагноз и эпикриз
  const diagnosisIssues: string[] = []
  if (!filled(draft.primary_diagnosis)) diagnosisIssues.push(f.issuePrimary)
  if (!filled(draft.discharge_summary)) diagnosisIssues.push(f.issueEpicrisis)
  if (aiFieldStatus(draft.discharge_summary, ai.discharge_summary) === 'needsReview') {
    diagnosisIssues.push(f.issueEpicrisisReview)
  }
  if (aiFieldStatus(draft.procedure_summary, ai.procedure_summary) === 'needsReview') {
    diagnosisIssues.push(f.issueProceduresReview)
  }
  if (draft.diagnoses.some((row) => filled(row.code) && !filled(row.name))) {
    diagnosisIssues.push(f.issueDiagnosisName)
  }

  // 2. назначения: неполная новая строка не отправится или уйдёт без дозы
  const incompleteMeds = draft.medications.filter(
    (row) => !filled(row.name) || !filled(row.dose) || !row.frequency,
  )
  const medicationIssues = incompleteMeds.length
    ? [`${f.issueMedIncomplete}: ${incompleteMeds.length}`]
    : []

  // 3. состояние при выписке
  const vitalIssues: string[] = []
  for (const vital of VITALS) {
    const primary = filled(draft.vitals[vital.field])
    if (vital.secondaryLabel) {
      const secondary = filled(draft.vitalsSecondary[vital.field])
      // без второго значения давление не запишется вовсе — это надо показать
      if (primary !== secondary) vitalIssues.push(f.issueBpPair)
      else if (!primary && gapFields.has(vital.field)) vitalIssues.push(vital.label)
    } else if (!primary && gapFields.has(vital.field)) {
      vitalIssues.push(vital.label)
    }
  }
  const anyVital = VITALS.some((vital) => filled(draft.vitals[vital.field]))

  // 4. анализы: пустой необязательный анализ — не ошибка
  const labIssues = LABS
    .filter((lab) => gapFields.has(lab.field) && !filled(draft.labs[lab.field]))
    .map((lab) => lab.label)
  const anyLab = LABS.some((lab) => filled(draft.labs[lab.field]))

  // 5. наблюдение
  const followUpIssues: string[] = []
  if (!hasClinic) followUpIssues.push(f.issueNoClinic)
  else if (draft.followUp) {
    if (draft.visits.length === 0) followUpIssues.push(f.issueNoVisits)
    if (!draft.planEndDate) followUpIssues.push(f.issueNoEnd)
    if (draft.visits.some((visit) => !Number.isFinite(visit.day_offset) || visit.day_offset < 1)) {
      followUpIssues.push(f.issueVisitDay)
    }
  }

  const status = (issues: string[], empty = false): SectionStatus =>
    issues.length ? 'attention' : empty ? 'empty' : 'done'

  const sections: SectionReview[] = [
    { id: 'diagnosis', status: status(diagnosisIssues), issues: diagnosisIssues },
    { id: 'medications', status: status(medicationIssues), issues: medicationIssues },
    { id: 'vitals', status: status(vitalIssues, !anyVital), issues: vitalIssues },
    { id: 'labs', status: status(labIssues, !anyLab), issues: labIssues },
    { id: 'followUp', status: status(followUpIssues), issues: followUpIssues },
  ]

  const epicrisisState = aiFieldStatus(draft.discharge_summary, ai.discharge_summary)
  const vitalCount = VITALS.filter((vital) => filled(draft.vitals[vital.field])).length
  const newMeds = draft.medications.filter((row) => filled(row.name)).length

  const checks: Check[] = [
    {
      label: filled(draft.primary_diagnosis) ? f.checkPrimary : f.checkPrimaryMissing,
      ok: filled(draft.primary_diagnosis),
      blocking: true,
    },
    {
      label: !filled(draft.discharge_summary)
        ? f.checkEpicrisisMissing
        : epicrisisState === 'needsReview'
          ? f.checkEpicrisisReview
          : f.checkEpicrisis,
      ok: filled(draft.discharge_summary) && epicrisisState !== 'needsReview',
    },
    {
      label: incompleteMeds.length
        ? `${f.checkMedsIncomplete}: ${incompleteMeds.length}`
        : `${f.checkMeds} (${context.medications.length + newMeds})`,
      ok: incompleteMeds.length === 0,
    },
    {
      label: `${f.checkVitals}: ${vitalCount} ${f.of} ${VITALS.length}`,
      ok: vitalIssues.length === 0 && vitalCount > 0,
    },
    ...openGaps.map((gap) => ({
      label: gap.field ? `${gap.label} — ${f.checkGapMissing}` : `${gap.label} — ${f.checkGapProfile}`,
      ok: false,
    })),
    {
      label: hasClinic
        ? `${f.checkClinic}: ${context.clinicName ?? t.common.dash}`
        : f.checkClinicMissing,
      ok: hasClinic,
    },
    draft.followUp
      ? {
          label: followUpIssues.length ? f.checkPlanIssues : `${f.checkPlan} (${draft.visits.length})`,
          ok: followUpIssues.length === 0,
        }
      : { label: f.checkPlanOff, ok: true, neutral: true },
  ]

  return {
    sections,
    forecastGaps,
    openGaps,
    checks,
    canSubmit: filled(draft.primary_diagnosis),
  }
}
