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
  { id: 'family_cvd', label: 'Семейный сердечно-сосудистый анамнез', value: 0.35, note: 'инфаркт или инсульт у близкого родственника' },
  { id: 'family_diabetes', label: 'Семейный анамнез диабета', value: 0.15, note: 'диабет у близкого родственника' },
  { id: 'genetic_risk', label: 'Генетический маркер риска', value: 0.30, note: 'маркер, отмеченный как risk' },
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
  family_history?: string[]
  genetic_markers?: Record<string, unknown>
}

export interface FamilyFactor {
  factor: 'FAMILY_CVD' | 'FAMILY_DIABETES' | 'GENETIC_RISK'
  label: string
  /** The exact record entry that matched, so the screen can show its source. */
  source: string
}

/**
 * Turns free-text family history and genetic markers into model factors.
 *
 * Keyword matching, deliberately: the record stores what a clinician typed, and
 * anything cleverer would hide why a risk went up. Every match is returned with
 * the text that produced it.
 */
export function familyFactors(inputs: Inputs): FamilyFactor[] {
  const found: FamilyFactor[] = []

  const CVD = ['инфаркт', 'инсульт', 'сердечн', 'ишемическ', 'коронарн']
  const DIABETES = ['диабет']

  for (const entry of inputs.family_history ?? []) {
    const text = entry.toLowerCase()
    if (CVD.some((word) => text.includes(word)) &&
        !found.some((f) => f.factor === 'FAMILY_CVD')) {
      found.push({ factor: 'FAMILY_CVD', label: 'Семейный сердечно-сосудистый анамнез', source: entry })
    }
    if (DIABETES.some((word) => text.includes(word)) &&
        !found.some((f) => f.factor === 'FAMILY_DIABETES')) {
      found.push({ factor: 'FAMILY_DIABETES', label: 'Семейный анамнез диабета', source: entry })
    }
  }

  // Convention: a marker counts when its value is 'risk' or 'high'.
  for (const [marker, value] of Object.entries(inputs.genetic_markers ?? {})) {
    const flag = String(value).toLowerCase()
    if (flag === 'risk' || flag === 'high') {
      found.push({ factor: 'GENETIC_RISK', label: 'Генетический маркер риска', source: `${marker}: ${value}` })
      break
    }
  }

  return found
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

  // Family history and genetics, from the record rather than assumed.
  for (const factor of familyFactors(v)) {
    if (factor.factor === 'FAMILY_CVD') z += C.family_cvd
    if (factor.factor === 'FAMILY_DIABETES') z += C.family_diabetes
    if (factor.factor === 'GENETIC_RISK') z += C.genetic_risk
  }

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

// Эффекты по классам препаратов. ИИ только относит введённый препарат к классу;
// числа прогноза берутся отсюда, поэтому у каждого из них есть видимый источник.
export interface DrugClass {
  id: string
  label: string
  // Международные названия и корни для проверки аллергий и дублирования.
  members: string[]
  effects: Effect[]
  riskRatio: number
  riskNote: string
  maxCreatinine?: number
}

export const DRUG_CLASSES: DrugClass[] = [
  {
    id: 'BIGUANIDE', label: 'Бигуаниды', members: ['метформин', 'metformin'],
    effects: [{ marker: 'HBA1C', delta: -1.2, unit: '%', onsetMonths: 3, note: 'снижение HbA1c' }],
    riskRatio: 0.92, riskNote: 'умеренное снижение сердечно-сосудистого риска', maxCreatinine: 130,
  },
  {
    id: 'SGLT2', label: 'Ингибиторы SGLT2',
    members: ['эмпаглифлозин', 'дапаглифлозин', 'канаглифлозин', 'эртуглифлозин', 'глифлозин', 'gliflozin'],
    effects: [
      { marker: 'HBA1C', delta: -0.7, unit: '%', onsetMonths: 3, note: 'снижение HbA1c' },
      { marker: 'WEIGHT', delta: -2.5, unit: 'кг', onsetMonths: 6, note: 'снижение веса' },
    ],
    riskRatio: 0.75, riskNote: 'снижение госпитализаций по поводу сердечной недостаточности', maxCreatinine: 160,
  },
  {
    id: 'GLP1', label: 'Агонисты рецепторов ГПП-1',
    members: ['семаглутид', 'лираглутид', 'дулаглутид', 'эксенатид', 'глутид', 'glutide'],
    effects: [
      { marker: 'HBA1C', delta: -1.1, unit: '%', onsetMonths: 3, note: 'снижение HbA1c' },
      { marker: 'WEIGHT', delta: -4, unit: 'кг', onsetMonths: 6, note: 'снижение веса' },
    ],
    riskRatio: 0.86, riskNote: 'снижение сердечно-сосудистых событий',
  },
  {
    id: 'DPP4', label: 'Ингибиторы ДПП-4',
    members: ['ситаглиптин', 'вилдаглиптин', 'саксаглиптин', 'линаглиптин', 'алоглиптин', 'глиптин', 'gliptin'],
    effects: [{ marker: 'HBA1C', delta: -0.6, unit: '%', onsetMonths: 3, note: 'снижение HbA1c' }],
    riskRatio: 1, riskNote: 'нейтрально по сердечно-сосудистому риску',
  },
  {
    id: 'SULFONYLUREA', label: 'Производные сульфонилмочевины',
    members: ['гликлазид', 'глимепирид', 'глибенкламид', 'глипизид', 'сульфонилмочевин'],
    effects: [
      { marker: 'HBA1C', delta: -1, unit: '%', onsetMonths: 3, note: 'снижение HbA1c' },
      { marker: 'WEIGHT', delta: 2, unit: 'кг', onsetMonths: 6, note: 'прибавка веса' },
    ],
    riskRatio: 1, riskNote: 'нейтрально по сердечно-сосудистому риску',
  },
  {
    id: 'INSULIN', label: 'Инсулины',
    members: ['инсулин', 'гларгин', 'детемир', 'деглудек', 'аспарт', 'лизпро', 'insulin'],
    effects: [
      { marker: 'HBA1C', delta: -1.5, unit: '%', onsetMonths: 3, note: 'снижение HbA1c' },
      { marker: 'WEIGHT', delta: 2.5, unit: 'кг', onsetMonths: 6, note: 'прибавка веса' },
    ],
    riskRatio: 1, riskNote: 'нейтрально по сердечно-сосудистому риску',
  },
  {
    id: 'ACE_INHIBITOR', label: 'Ингибиторы АПФ',
    members: ['лизиноприл', 'эналаприл', 'рамиприл', 'периндоприл', 'каптоприл', 'фозиноприл', 'прил', 'ингибитор апф'],
    effects: [{ marker: 'SBP', delta: -10, unit: 'мм рт. ст.', onsetMonths: 1, note: 'снижение САД' }],
    riskRatio: 0.82, riskNote: 'снижение сердечно-сосудистых событий', maxCreatinine: 180,
  },
  {
    id: 'ARB', label: 'Блокаторы рецепторов ангиотензина',
    members: ['лозартан', 'валсартан', 'телмисартан', 'ирбесартан', 'кандесартан', 'сартан', 'sartan'],
    effects: [{ marker: 'SBP', delta: -10, unit: 'мм рт. ст.', onsetMonths: 1, note: 'снижение САД' }],
    riskRatio: 0.84, riskNote: 'снижение сердечно-сосудистых событий', maxCreatinine: 180,
  },
  {
    id: 'ARNI', label: 'Ингибиторы неприлизина и рецепторов ангиотензина',
    members: ['сакубитрил', 'sacubitril'],
    effects: [{ marker: 'SBP', delta: -6, unit: 'мм рт. ст.', onsetMonths: 1, note: 'снижение САД' }],
    riskRatio: 0.8, riskNote: 'снижение смертности и госпитализаций при сердечной недостаточности', maxCreatinine: 220,
  },
  {
    id: 'BETA_BLOCKER', label: 'Бета-блокаторы',
    members: ['бисопролол', 'метопролол', 'карведилол', 'небиволол', 'атенолол', 'олол', 'бета-блокатор'],
    effects: [{ marker: 'SBP', delta: -8, unit: 'мм рт. ст.', onsetMonths: 1, note: 'снижение САД' }],
    riskRatio: 0.78, riskNote: 'снижение смертности при сердечной недостаточности',
  },
  {
    id: 'CCB', label: 'Блокаторы кальциевых каналов',
    members: ['амлодипин', 'нифедипин', 'лерканидипин', 'дипин', 'верапамил', 'дилтиазем'],
    effects: [{ marker: 'SBP', delta: -9, unit: 'мм рт. ст.', onsetMonths: 1, note: 'снижение САД' }],
    riskRatio: 0.85, riskNote: 'снижение сердечно-сосудистых событий',
  },
  {
    id: 'THIAZIDE', label: 'Тиазидные и тиазидоподобные диуретики',
    members: ['гидрохлоротиазид', 'индапамид', 'хлорталидон', 'тиазид'],
    effects: [{ marker: 'SBP', delta: -9, unit: 'мм рт. ст.', onsetMonths: 1, note: 'снижение САД' }],
    riskRatio: 0.85, riskNote: 'снижение сердечно-сосудистых событий',
  },
  {
    id: 'LOOP_DIURETIC', label: 'Петлевые диуретики',
    members: ['фуросемид', 'торасемид', 'буметанид'],
    effects: [{ marker: 'WEIGHT', delta: -1.5, unit: 'кг', onsetMonths: 1, note: 'уменьшение задержки жидкости' }],
    riskRatio: 1, riskNote: 'симптоматическое действие, без влияния на прогноз',
  },
  {
    id: 'MRA', label: 'Антагонисты минералокортикоидных рецепторов',
    members: ['спиронолактон', 'эплеренон', 'финеренон'],
    effects: [{ marker: 'SBP', delta: -5, unit: 'мм рт. ст.', onsetMonths: 1, note: 'снижение САД' }],
    riskRatio: 0.8, riskNote: 'снижение смертности при сердечной недостаточности', maxCreatinine: 220,
  },
  {
    id: 'STATIN', label: 'Статины',
    members: ['аторвастатин', 'розувастатин', 'симвастатин', 'правастатин', 'питавастатин', 'статин'],
    effects: [
      { marker: 'TOTAL_CHOLESTEROL', delta: -1.8, unit: 'ммоль/л', onsetMonths: 2, note: 'снижение общего холестерина' },
    ],
    riskRatio: 0.76, riskNote: 'снижение сердечно-сосудистых событий',
  },
]

export interface Simulation {
  trajectories: {
    marker: Effect['marker']
    unit: string
    effect: Effect
    baseline: Point[]
    treated: Point[]
  }[]
  risk: { baseline: number; treated: number; absoluteReduction: number }
}

/** Траектории показателей и пятилетний риск для набора эффектов. */
export function simulate(inputs: Inputs, effects: Effect[], riskRatio: number): Simulation {
  const markerStart: Record<Effect['marker'], number | null> = {
    HBA1C: inputs.hba1c,
    SBP: inputs.systolic,
    TOTAL_CHOLESTEROL: inputs.total_cholesterol,
    WEIGHT: null,
  }

  const trajectories = effects
    .filter((effect) => markerStart[effect.marker] !== null)
    .map((effect) => {
      const start = markerStart[effect.marker] as number
      const { baseline, treated } = project(start, DRIFT[effect.marker], effect)
      return { marker: effect.marker, unit: effect.unit, effect, baseline, treated }
    })

  const overrides: Partial<Inputs> = {}
  for (const effect of effects) {
    if (effect.marker === 'HBA1C' && inputs.hba1c) overrides.hba1c = inputs.hba1c + effect.delta
    if (effect.marker === 'SBP' && inputs.systolic) overrides.systolic = inputs.systolic + effect.delta
    if (effect.marker === 'TOTAL_CHOLESTEROL' && inputs.total_cholesterol) {
      overrides.total_cholesterol = inputs.total_cholesterol + effect.delta
    }
  }

  const baselineRisk = fiveYearRisk(inputs)
  const treatedRisk = Math.min(baselineRisk, fiveYearRisk(inputs, overrides) * riskRatio)
  const percent = (n: number) => Math.round(n * 1000) / 10

  return {
    trajectories,
    risk: {
      baseline: percent(baselineRisk),
      treated: percent(treatedRisk),
      absoluteReduction: percent(baselineRisk - treatedRisk),
    },
  }
}
