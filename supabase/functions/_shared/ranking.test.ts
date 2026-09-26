import { assertEquals } from 'jsr:@std/assert@1'
import { pickBest, rankCandidates, type Candidate } from './ranking.ts'
import { DRUG_CLASSES, fiveYearRisk, simulate, type Inputs } from './simulation-model.ts'

const make = (query: string, verdict: Candidate['verdict'], treated: number | null,
  extra: Partial<Candidate> = {}): Candidate => ({
  drug: { query, inn: query, drug_class: extra.drug?.drug_class ?? query.toUpperCase() },
  verdict,
  findings: [],
  forecast: treated === null ? null : { risk: { treated } },
  error: null,
  ...extra,
})

Deno.test('безопасность важнее риска: противопоказанный с лучшим прогнозом уходит вниз', () => {
  const ranked = rankCandidates([
    make('statin', 'BLOCK', 5),
    make('sglt2', 'NO_FINDINGS', 14),
    make('metformin', 'CAUTION', 9),
  ])
  assertEquals(ranked.map((c) => c.drug.query), ['sglt2', 'metformin', 'statin'])
  assertEquals(ranked.map((c) => c.rank), [1, 2, 3])
  assertEquals(pickBest(ranked), 'sglt2')
})

Deno.test('внутри одного вердикта — меньший риск за 5 лет выше', () => {
  const ranked = rankCandidates([make('a', 'NO_FINDINGS', 18), make('b', 'NO_FINDINGS', 12)])
  assertEquals(ranked.map((c) => c.drug.query), ['b', 'a'])
})

Deno.test('с прогнозом раньше, чем без прогноза', () => {
  const ranked = rankCandidates([make('other-class', 'NO_FINDINGS', null), make('modeled', 'NO_FINDINGS', 20)])
  assertEquals(ranked[0].drug.query, 'modeled')
})

Deno.test('сбой проверки и нераспознанный препарат — в конце', () => {
  const ranked = rankCandidates([
    make('broken', 'UNKNOWN', null, { error: 'ai_failed' }),
    make('xyz', 'UNKNOWN', null),
    make('ok', 'CAUTION', 30),
  ])
  assertEquals(ranked.map((c) => c.drug.query), ['ok', 'xyz', 'broken'])
})

Deno.test('лучшего нет, если все противопоказаны или без прогноза', () => {
  assertEquals(pickBest(rankCandidates([make('a', 'BLOCK', 5), make('b', 'BLOCK', 6)])), null)
  assertEquals(pickBest(rankCandidates([make('a', 'NO_FINDINGS', null)])), null)
})

Deno.test('равенство — порядок ввода; одинаковый класс отмечен', () => {
  const ranked = rankCandidates([
    make('Метформин', 'NO_FINDINGS', 10, { drug: { query: 'Метформин', inn: 'метформин', drug_class: 'BIGUANIDE' } }),
    make('Глюкофаж', 'NO_FINDINGS', 10, { drug: { query: 'Глюкофаж', inn: 'метформин', drug_class: 'BIGUANIDE' } }),
  ])
  assertEquals(ranked.map((c) => c.drug.query), ['Метформин', 'Глюкофаж'])
  assertEquals(ranked[0].same_class_as, ['метформин'])
})

Deno.test('модель: у всех кандидатов одна базовая линия, лечение не повышает риск', () => {
  const inputs: Inputs = {
    age_years: 70, sex: 'MALE', bmi: 27.5, systolic: 128, hba1c: 8.2, total_cholesterol: 4.9, hdl: 0.92,
    creatinine: 138, smoking: 'FORMER', has_diabetes: true, has_heart_failure: true, has_hypertension: true,
    family_history: ['инфаркт миокарда у отца в 58 лет'], genetic_markers: { '9p21': 'risk' },
  }
  const baseline = fiveYearRisk(inputs)
  for (const drugClass of DRUG_CLASSES) {
    const { risk } = simulate(inputs, drugClass.effects, drugClass.riskRatio)
    assertEquals(risk.baseline, Math.round(baseline * 1000) / 10, drugClass.id)
    if (risk.treated > risk.baseline) throw new Error(`${drugClass.id}: лечение повышает риск`)
  }
})
