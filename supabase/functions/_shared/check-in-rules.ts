// Правила самоконтроля из требований врача: проверка того, что предложил ИИ.
//
// ИИ только раскладывает текст врача на поля. Всё, что он вернул, проходит
// через эту функцию: диапазоны, формат времени, допустимые вопросы. Личный порог
// риска принимается, только если к нему приложена цитата, которая дословно есть
// в тексте врача, — иначе действует общий порог.

export const ALL_QUESTIONS = [
  'TEMPERATURE', 'SPO2', 'HEART_RATE', 'BLOOD_PRESSURE',
  'WELLBEING', 'DYSPNEA', 'SYMPTOMS', 'MEDICATIONS',
] as const
export type Question = (typeof ALL_QUESTIONS)[number]

/** Эти вопросы задаём всегда: они нужны для безопасности, даже если врач о них не писал. */
export const REQUIRED_QUESTIONS: Question[] = ['WELLBEING', 'DYSPNEA', 'SYMPTOMS', 'MEDICATIONS']

interface ThresholdSpec {
  direction: 'ABOVE' | 'BELOW'
  min: number
  max: number
  question: Question
}

/** Какие общие правила врач может переопределить и в каких пределах. */
export const THRESHOLDS: Record<string, ThresholdSpec> = {
  SPO2_LOW: { direction: 'BELOW', min: 80, max: 98, question: 'SPO2' },
  TEMP_HIGH: { direction: 'ABOVE', min: 37, max: 40.5, question: 'TEMPERATURE' },
  HR_HIGH: { direction: 'ABOVE', min: 80, max: 160, question: 'HEART_RATE' },
  HR_LOW: { direction: 'BELOW', min: 35, max: 65, question: 'HEART_RATE' },
  BP_SYS_HIGH: { direction: 'ABOVE', min: 120, max: 220, question: 'BLOOD_PRESSURE' },
  BP_SYS_LOW: { direction: 'BELOW', min: 70, max: 120, question: 'BLOOD_PRESSURE' },
  BP_DIA_HIGH: { direction: 'ABOVE', min: 80, max: 130, question: 'BLOOD_PRESSURE' },
}

export interface PersonalThreshold {
  medium?: number
  high?: number
  quote: string
}

export interface CheckInRules {
  times: string[]
  every_n_days: number
  duration_days: number | null
  response_window_hours: number
  questions: Question[]
  thresholds: Record<string, PersonalThreshold>
  rationale: string
  /** Требования, которые бот собрать не может (например, вес или глюкоза). */
  unsupported: string[]
  /** Что отброшено при проверке, — показываем врачу. */
  rejected: string[]
}

export const DEFAULT_RULES: CheckInRules = {
  times: ['10:00'],
  every_n_days: 1,
  duration_days: null,
  response_window_hours: 6,
  questions: [...ALL_QUESTIONS],
  thresholds: {},
  rationale: '',
  unsupported: [],
  rejected: [],
}

const clampInt = (value: unknown, min: number, max: number, fallback: number): number => {
  const number = Math.round(Number(value))
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback
}

const minutes = (time: string): number => {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/** Для сравнения цитаты с текстом: регистр, ё, пробелы и кавычки не важны. */
export function normalizeText(text: string): string {
  return text.toLowerCase().replace(/ё/g, 'е').replace(/[«»"“”]/g, '').replace(/\s+/g, ' ').trim()
}

function parseTime(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = value.trim().match(/^(\d{1,2})[:.](\d{2})$/)
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  // опрос ночью разбудит пациента: только с 06:00 до 23:00
  if (h < 6 || h > 23 || m > 59 || (h === 23 && m > 0)) return null
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function validateRules(raw: Record<string, unknown>, requirements: string): CheckInRules {
  const rejected: string[] = []

  // время: не больше 4 раз в день и не чаще, чем раз в 2 часа
  const times: string[] = []
  const candidates = (Array.isArray(raw.times) ? raw.times : [])
    .map(parseTime)
    .filter((time): time is string => time !== null)
    .sort((a, b) => minutes(a) - minutes(b))
  for (const time of candidates) {
    if (times.includes(time)) continue
    if (times.length > 0 && minutes(time) - minutes(times[times.length - 1]) < 120) {
      rejected.push(`время ${time}: меньше 2 часов после предыдущего опроса`)
      continue
    }
    if (times.length === 4) {
      rejected.push(`время ${time}: не больше 4 опросов в день`)
      continue
    }
    times.push(time)
  }
  if (times.length === 0) times.push(...DEFAULT_RULES.times)

  // окно ответа не должно заходить на следующий опрос
  const gaps = times.slice(1).map((time, index) => minutes(time) - minutes(times[index]))
  const maxWindow = gaps.length > 0 ? Math.max(1, Math.floor(Math.min(...gaps) / 60)) : 12
  const window = clampInt(raw.response_window_hours, 1, Math.min(12, maxWindow), Math.min(6, maxWindow))

  const questions = ALL_QUESTIONS.filter((question) =>
    REQUIRED_QUESTIONS.includes(question) ||
    (Array.isArray(raw.questions) && raw.questions.includes(question)))

  const thresholds: Record<string, PersonalThreshold> = {}
  const source = normalizeText(requirements)
  const rawThresholds = raw.thresholds && typeof raw.thresholds === 'object'
    ? raw.thresholds as Record<string, Record<string, unknown>>
    : {}

  for (const [code, value] of Object.entries(rawThresholds)) {
    const spec = THRESHOLDS[code]
    if (!spec || !value || typeof value !== 'object') {
      rejected.push(`порог ${code}: такого правила нет`)
      continue
    }
    const quote = typeof value.quote === 'string' ? value.quote.trim() : ''
    if (!quote || !/\d/.test(quote) || !source.includes(normalizeText(quote))) {
      rejected.push(`порог ${code}: нет дословной цитаты из требований врача`)
      continue
    }
    const inRange = (n: unknown) =>
      typeof n === 'number' && Number.isFinite(n) && n >= spec.min && n <= spec.max ? n : undefined
    const medium = inRange(value.medium)
    const high = inRange(value.high)
    if (medium === undefined && high === undefined) {
      rejected.push(`порог ${code}: значение вне допустимого диапазона ${spec.min}–${spec.max}`)
      continue
    }
    if (medium !== undefined && high !== undefined &&
        (spec.direction === 'BELOW' ? high > medium : high < medium)) {
      rejected.push(`порог ${code}: «срочный» порог мягче обычного`)
      continue
    }
    thresholds[code] = { ...(medium !== undefined ? { medium } : {}), ...(high !== undefined ? { high } : {}), quote }
    // порог по показателю, о котором бот не спрашивает, бесполезен — добавляем вопрос
    if (!questions.includes(spec.question)) questions.push(spec.question)
  }

  const strings = (value: unknown, limit: number) =>
    (Array.isArray(value) ? value : [])
      .filter((item): item is string => typeof item === 'string' && item.trim() !== '')
      .map((item) => item.trim().slice(0, 200))
      .slice(0, limit)

  return {
    times,
    every_n_days: clampInt(raw.every_n_days, 1, 7, 1),
    duration_days: raw.duration_days === null || raw.duration_days === undefined
      ? null
      : clampInt(raw.duration_days, 1, 90, 14),
    response_window_hours: window,
    questions: ALL_QUESTIONS.filter((question) => questions.includes(question)),
    thresholds,
    rationale: typeof raw.rationale === 'string' ? raw.rationale.trim().slice(0, 600) : '',
    unsupported: strings(raw.unsupported, 5),
    rejected,
  }
}
