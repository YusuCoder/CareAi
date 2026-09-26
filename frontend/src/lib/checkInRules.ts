import { supabase } from './supabase'

/**
 * Правила самоконтроля в Telegram для одного пациента. Задаются при выписке:
 * CareTwin AI раскладывает требования врача на поля (функция check-in-rules),
 * врач проверяет и правит, правила сохраняются вместе с выпиской.
 */

export const QUESTIONS = [
  'TEMPERATURE', 'SPO2', 'HEART_RATE', 'BLOOD_PRESSURE',
  'WELLBEING', 'DYSPNEA', 'SYMPTOMS', 'MEDICATIONS',
] as const
export type RuleQuestion = (typeof QUESTIONS)[number]

/** Задаются всегда: без них опрос теряет смысл для безопасности. */
export const REQUIRED_QUESTIONS: RuleQuestion[] = ['WELLBEING', 'DYSPNEA', 'SYMPTOMS', 'MEDICATIONS']

export const QUESTION_LABEL: Record<RuleQuestion, string> = {
  TEMPERATURE: 'Температура',
  SPO2: 'SpO₂',
  HEART_RATE: 'Пульс',
  BLOOD_PRESSURE: 'Давление',
  WELLBEING: 'Самочувствие',
  DYSPNEA: 'Одышка',
  SYMPTOMS: 'Новые симптомы',
  MEDICATIONS: 'Приём лекарств',
}

/** Какие общие пороги можно заменить личными — те же коды, что в risk_rules. */
export const THRESHOLD_META: Record<string, { label: string; unit: string; direction: 'ABOVE' | 'BELOW'; question: RuleQuestion }> = {
  SPO2_LOW: { label: 'Сатурация ниже', unit: '%', direction: 'BELOW', question: 'SPO2' },
  TEMP_HIGH: { label: 'Температура выше', unit: '°C', direction: 'ABOVE', question: 'TEMPERATURE' },
  HR_HIGH: { label: 'Пульс выше', unit: 'уд/мин', direction: 'ABOVE', question: 'HEART_RATE' },
  HR_LOW: { label: 'Пульс ниже', unit: 'уд/мин', direction: 'BELOW', question: 'HEART_RATE' },
  BP_SYS_HIGH: { label: 'Систолическое выше', unit: 'мм рт. ст.', direction: 'ABOVE', question: 'BLOOD_PRESSURE' },
  BP_SYS_LOW: { label: 'Систолическое ниже', unit: 'мм рт. ст.', direction: 'BELOW', question: 'BLOOD_PRESSURE' },
  BP_DIA_HIGH: { label: 'Диастолическое выше', unit: 'мм рт. ст.', direction: 'ABOVE', question: 'BLOOD_PRESSURE' },
}

export interface PersonalThreshold {
  medium?: number
  high?: number
  quote: string
}

export type RulesSource = 'AI' | 'DOCTOR' | 'DEFAULT'

export interface MonitoringDraft {
  times: string[]
  every_n_days: number
  /** Последний день опросов; пусто — до конца плана наблюдения. */
  end_date: string
  response_window_hours: number
  questions: RuleQuestion[]
  thresholds: Record<string, PersonalThreshold>
  source: RulesSource
  rationale: string
  model: string
  unsupported: string[]
  rejected: string[]
  /** Требования врача, из которых получены правила: так видно, что текст с тех пор менялся. */
  basedOn: string
}

export const defaultMonitoring = (): MonitoringDraft => ({
  times: ['10:00'],
  every_n_days: 1,
  end_date: '',
  response_window_hours: 6,
  questions: [...QUESTIONS],
  thresholds: {},
  source: 'DEFAULT',
  rationale: '',
  model: '',
  unsupported: [],
  rejected: [],
  basedOn: '',
})

const addDays = (isoDate: string, days: number): string => {
  const date = new Date(`${isoDate}T00:00:00`)
  date.setDate(date.getDate() + days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export interface SuggestInput {
  hospitalizationId: string
  requirements: string
  diagnoses: string[]
  medications: string[]
  startDate: string
  planEndDate: string
}

/** Предложение CareTwin AI. null — не удалось; подробности только в консоли. */
export async function suggestRules(input: SuggestInput): Promise<MonitoringDraft | null> {
  const { data, error } = await supabase.functions.invoke<Record<string, unknown>>('check-in-rules', {
    body: {
      hospitalizationId: input.hospitalizationId,
      requirements: input.requirements,
      diagnoses: input.diagnoses,
      medications: input.medications,
    },
  })

  if (error || !data || 'error' in data) {
    console.error('[check-in-rules] failed', error ?? data)
    return null
  }

  const duration = typeof data.duration_days === 'number' ? data.duration_days : null
  // срок опросов не выходит за план наблюдения
  let end = duration ? addDays(input.startDate, duration - 1) : ''
  if (end && input.planEndDate && end > input.planEndDate) end = input.planEndDate

  const strings = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [])

  return {
    times: strings(data.times).length ? strings(data.times) : ['10:00'],
    every_n_days: typeof data.every_n_days === 'number' ? data.every_n_days : 1,
    end_date: end,
    response_window_hours: typeof data.response_window_hours === 'number' ? data.response_window_hours : 6,
    questions: strings(data.questions).filter((q): q is RuleQuestion => (QUESTIONS as readonly string[]).includes(q)),
    thresholds: (data.thresholds && typeof data.thresholds === 'object' ? data.thresholds : {}) as Record<string, PersonalThreshold>,
    source: data.source === 'DEFAULT' ? 'DEFAULT' : 'AI',
    rationale: typeof data.rationale === 'string' ? data.rationale : '',
    model: typeof data.model === 'string' ? data.model : '',
    unsupported: strings(data.unsupported),
    rejected: strings(data.rejected),
    basedOn: input.requirements,
  }
}

/** То, что уходит в discharge_patient → check_in_schedules. */
export function monitoringPayload(m: MonitoringDraft, planEndDate: string) {
  const end = m.end_date && planEndDate && m.end_date > planEndDate ? planEndDate : m.end_date
  return {
    times: [...new Set(m.times)].sort(),
    every_n_days: m.every_n_days,
    end_date: end || planEndDate || '',
    response_window_hours: m.response_window_hours,
    questions: QUESTIONS.filter((q) => m.questions.includes(q) || REQUIRED_QUESTIONS.includes(q)),
    thresholds: m.thresholds,
    source: m.source,
    rationale: m.rationale,
    model: m.model,
  }
}

export function frequencyLabel(times: string[], everyNDays: number): string {
  const perDay = times.length === 1 ? '1 раз в день' : `${times.length} раза в день`
  const days = everyNDays === 1 ? 'ежедневно' : everyNDays === 2 ? 'через день'
    : `раз в ${everyNDays} ${everyNDays < 5 ? 'дня' : 'дней'}`
  return `${days}, ${perDay}: ${[...times].sort().join(', ')}`
}
