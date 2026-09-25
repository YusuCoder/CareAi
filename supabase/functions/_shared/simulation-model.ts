// Коэффициенты демонстрационные: модель не проходила клиническую валидацию и калибровку.

export type ConditionId = 'T2DM' | 'HEART_FAILURE' | 'HYPERTENSION'

export interface Coefficient {
  id: string
  label: string
  value: number
  note: string
}

export interface Effect {
  marker: 'HBA1C' | 'SBP' | 'TOTAL_CHOLESTEROL' | 'WEIGHT'
  // Изменение в единицах показателя за onsetMonths месяцев.
  delta: number
  unit: string
  onsetMonths: number
  note: string
}

export interface Intervention {
  id: string
  label: string
  drugClass: string
  conditions: ConditionId[]
  effects: Effect[]
  // Множитель пятилетнего риска: 0.75 означает относительное снижение на 25%.
  riskRatio: number
  riskNote: string
  guards: {
    // Верхний порог креатинина в мкмоль/л.
    maxCreatinine?: number
    allergyKeywords?: string[]
    duplicateKeywords?: string[]
  }
}

export const COEFFICIENTS: Coefficient[] = [
  { id: 'age', label: 'Возраст', value: 0.045, note: 'на каждый год сверх 40' },
  { id: 'male', label: 'Мужской пол', value: 0.25, note: 'постоянная надбавка' },
  { id: 'smoking_current', label: 'Курит', value: 0.55, note: 'текущее курение' },
  { id: 'smoking_former', label: 'Курил ранее', value: 0.2, note: '' },
  { id: 'sbp', label: 'Систолическое АД', value: 0.018, note: 'на каждый мм рт. ст. сверх 120' },
  { id: 'chol_ratio', label: 'Холестерин / ЛПВП', value: 0.13, note: 'на единицу отношения' },
  { id: 'diabetes', label: 'Сахарный диабет', value: 0.6, note: 'наличие диагноза' },
  { id: 'hba1c', label: 'HbA1c', value: 0.18, note: 'на каждый процент сверх 6,0' },
  { id: 'bmi', label: 'ИМТ', value: 0.03, note: 'на единицу сверх 25' },
  { id: 'heart_failure', label: 'Сердечная недостаточность', value: 0.9, note: 'наличие диагноза' },
  { id: 'intercept', label: 'Свободный член', value: -4.6, note: 'калибровка демо-модели' },
]

const C = Object.fromEntries(COEFFICIENTS.map((c) => [c.id, c.value])) as Record<string, number>

export const INTERVENTIONS: Intervention[] = [
  {
    id: 'metformin',
    label: 'Метформин 1000 мг 2 раза в день',
    drugClass: 'Бигуаниды',
    conditions: ['T2DM'],
    effects: [{ marker: 'HBA1C', delta: -1.2, unit: '%', onsetMonths: 3, note: 'снижение HbA1c' }],
    riskRatio: 0.92,
    riskNote: 'умеренное снижение сердечно-сосудистого риска',
    guards: {
      maxCreatinine: 130,
      allergyKeywords: ['метформин'],
      duplicateKeywords: ['метформин'],
    },
  },
  {
    id: 'sglt2',
    label: 'Эмпаглифлозин 10 мг 1 раз в день',
    drugClass: 'Ингибиторы SGLT2',
    conditions: ['T2DM', 'HEART_FAILURE'],
    effects: [
      { marker: 'HBA1C', delta: -0.7, unit: '%', onsetMonths: 3, note: 'снижение HbA1c' },
      { marker: 'WEIGHT', delta: -2.5, unit: 'кг', onsetMonths: 6, note: 'снижение веса' },
    ],
    riskRatio: 0.75,
    riskNote: 'снижение госпитализаций по поводу сердечной недостаточности',
    guards: { maxCreatinine: 160, allergyKeywords: ['эмпаглифлозин'] },
  },
  {
    id: 'ace',
    label: 'Лизиноприл 10 мг 1 раз в день',
    drugClass: 'Ингибиторы АПФ',
    conditions: ['HYPERTENSION', 'HEART_FAILURE'],
    effects: [{ marker: 'SBP', delta: -10, unit: 'мм рт. ст.', onsetMonths: 1, note: 'снижение САД' }],
    riskRatio: 0.82,
    riskNote: 'снижение сердечно-сосудистых событий',
    guards: { maxCreatinine: 180, allergyKeywords: ['лизиноприл', 'ингибитор апф'] },
  },
  {
    id: 'beta_blocker',
    label: 'Бисопролол 5 мг 1 раз в день',
    drugClass: 'Бета-блокаторы',
    conditions: ['HEART_FAILURE', 'HYPERTENSION'],
    effects: [{ marker: 'SBP', delta: -8, unit: 'мм рт. ст.', onsetMonths: 1, note: 'снижение САД' }],
    riskRatio: 0.78,
    riskNote: 'снижение смертности при сердечной недостаточности',
    guards: { allergyKeywords: ['бисопролол'] },
  },
  {
    id: 'statin',
    label: 'Аторвастатин 20 мг 1 раз в день',
    drugClass: 'Статины',
    conditions: ['T2DM', 'HYPERTENSION', 'HEART_FAILURE'],
    effects: [
      { marker: 'TOTAL_CHOLESTEROL', delta: -1.8, unit: 'ммоль/л', onsetMonths: 2, note: 'снижение общего холестерина' },
    ],
    riskRatio: 0.76,
    riskNote: 'снижение сердечно-сосудистых событий',
    guards: { allergyKeywords: ['аторвастатин', 'статин'], duplicateKeywords: ['статин', 'аторвастатин'] },
  },
]

export interface Inputs {
  age_years: number | null
  sex: string
  bmi: number | null
  systolic: number | null
  hba1c: number | null
  total_cholesterol: number | null
  hdl: number | null
  creatinine: number | null
  smoking: string
  has_diabetes: boolean
  has_heart_failure: boolean
  has_hypertension: boolean
}

export function fiveYearRisk(inputs: Inputs, overrides: Partial<Inputs> = {}): number {
  const v = { ...inputs, ...overrides }

  let z = C.intercept
  if (v.age_years) z += C.age * Math.max(0, v.age_years - 40)
  if (v.sex === 'MALE') z += C.male
  if (v.smoking === 'CURRENT') z += C.smoking_current
  if (v.smoking === 'FORMER') z += C.smoking_former
  if (v.systolic) z += C.sbp * Math.max(0, v.systolic - 120)
  if (v.total_cholesterol && v.hdl) z += C.chol_ratio * (v.total_cholesterol / v.hdl)
  if (v.has_diabetes) z += C.diabetes
  if (v.hba1c) z += C.hba1c * Math.max(0, v.hba1c - 6)
  if (v.bmi) z += C.bmi * Math.max(0, v.bmi - 25)
  if (v.has_heart_failure) z += C.heart_failure

  const annual = 1 / (1 + Math.exp(-z))
  return Math.min(0.99, 1 - Math.pow(1 - annual, 5))
}

export interface Point { month: number; value: number }

export function project(
  start: number,
  driftPerYear: number,
  effect?: Effect,
): { baseline: Point[]; treated: Point[] } {
  const baseline: Point[] = []
  const treated: Point[] = []

  for (let month = 0; month <= 60; month += 3) {
    const drift = (driftPerYear * month) / 12
    baseline.push({ month, value: round(start + drift) })

    let applied = 0
    if (effect) {
      const onset = Math.max(1, effect.onsetMonths)
      applied = effect.delta * Math.min(1, month / onset)
    }
    treated.push({ month, value: round(start + drift + applied) })
  }

  return { baseline, treated }
}

const round = (n: number) => Math.round(n * 100) / 100

// Годовой прирост без лечения; демонстрационные параметры.
export const DRIFT: Record<Effect['marker'], number> = {
  HBA1C: 0.15,
  SBP: 1.5,
  TOTAL_CHOLESTEROL: 0.05,
  WEIGHT: 0.4,
}

export function conditionsOf(inputs: Inputs): ConditionId[] {
  const list: ConditionId[] = []
  if (inputs.has_diabetes) list.push('T2DM')
  if (inputs.has_heart_failure) list.push('HEART_FAILURE')
  if (inputs.has_hypertension) list.push('HYPERTENSION')
  return list
}
