// Порядок кандидатов при сравнении препаратов. Считает код, а не модель:
// сначала безопасность по записям пациента, затем пятилетний риск.

export type Verdict = 'BLOCK' | 'CAUTION' | 'NO_FINDINGS' | 'UNKNOWN'

export interface Candidate {
  drug: { query: string; inn: string; drug_class: string }
  verdict: Verdict
  findings: { level: 'BLOCK' | 'WARN' | 'INFO' }[]
  forecast: { risk: { treated: number } } | null
  error: string | null
}

const VERDICT_RANK: Record<Verdict, number> = { NO_FINDINGS: 0, CAUTION: 1, BLOCK: 2, UNKNOWN: 3 }

const warnings = (candidate: Candidate) =>
  candidate.findings.filter((finding) => finding.level === 'WARN').length

/**
 * 1. Сбой проверки — в конец.
 * 2. Без противопоказаний → с осторожностью → противопоказан → не распознан.
 * 3. С рассчитанным прогнозом раньше, чем без него.
 * 4. Меньший риск за 5 лет раньше.
 * 5. Меньше предупреждений раньше.
 * 6. При полном равенстве — порядок, в котором врач ввёл варианты.
 */
export function rankCandidates<T extends Candidate>(candidates: T[]) {
  return candidates
    .map((candidate, index) => ({ candidate, index }))
    .sort((a, b) =>
      (a.candidate.error ? 1 : 0) - (b.candidate.error ? 1 : 0) ||
      VERDICT_RANK[a.candidate.verdict] - VERDICT_RANK[b.candidate.verdict] ||
      (a.candidate.forecast ? 0 : 1) - (b.candidate.forecast ? 0 : 1) ||
      (a.candidate.forecast?.risk.treated ?? 0) - (b.candidate.forecast?.risk.treated ?? 0) ||
      warnings(a.candidate) - warnings(b.candidate) ||
      a.index - b.index)
    .map(({ candidate }, position) => ({
      ...candidate,
      rank: position + 1,
      // препараты одного класса — не альтернативы друг другу, а один и тот же выбор
      same_class_as: candidate.drug.drug_class === 'OTHER' ? [] : candidates
        .filter((other) => other !== candidate && other.drug.drug_class === candidate.drug.drug_class)
        .map((other) => other.drug.inn),
    }))
}

/** Лучший — первый в рейтинге, только если он допустим и для него есть прогноз. */
export function pickBest(ranked: Candidate[]): string | null {
  const leader = ranked[0]
  if (!leader || leader.error || !leader.forecast) return null
  return leader.verdict === 'NO_FINDINGS' || leader.verdict === 'CAUTION' ? leader.drug.query : null
}
