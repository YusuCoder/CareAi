import { useCallback, useState } from 'react'

import { supabase } from './supabase'
import type { FamilyFactor, Trajectory } from './simulation'

export type DrugVerdict = 'BLOCK' | 'CAUTION' | 'NO_FINDINGS' | 'UNKNOWN'
export type FindingLevel = 'BLOCK' | 'WARN' | 'INFO'
export type FindingCategory =
  | 'ALLERGY' | 'CONTRAINDICATION' | 'INTERACTION' | 'RENAL' | 'DUPLICATE' | 'LIFESTYLE' | 'MISSING_DATA'

export interface DrugFinding {
  level: FindingLevel
  category: FindingCategory
  text: string
  /** Записи карты, на которые опирается находка: идентификатор и текст записи. */
  evidence: { id: string; text: string }[]
  source: 'RULE' | 'AI'
}

export interface DrugCheckResult {
  drug: { query: string; recognized: boolean; inn: string; drug_class: string; class_label: string }
  verdict: DrugVerdict
  findings: DrugFinding[]
  summary: string
  monitoring: string[]
  forecast: {
    trajectories: Trajectory[]
    risk: { baseline: number; treated: number; absoluteReduction: number }
    riskRatio: number
    riskNote: string
  } | null
  forecast_reason: 'OK' | 'NOT_MODELED' | 'MISSING_DATA' | 'UNKNOWN'
  missing: string[]
  factors: FamilyFactor[]
  used: { records: number; allergies: number; diagnoses: number; medications: number; labs: number; observations: number; hospitalizations: number }
  model: string
  generated_at: string
  disclaimer: string
}

export type DrugCheckError = 'ai_unavailable' | 'ai_failed' | 'bad_request' | 'not_found' | 'failed'

export const MAX_COMPARE = 4

/** Один кандидат в сравнении: та же проверка, что и одиночная, плюс место в рейтинге. */
export type CandidateResult = Pick<
  DrugCheckResult, 'drug' | 'verdict' | 'findings' | 'summary' | 'monitoring' | 'forecast' | 'forecast_reason'
> & {
  rank: number
  /** Другие кандидаты того же класса — это не альтернатива, а один и тот же выбор. */
  same_class_as: string[]
  error: string | null
}

export interface DrugCompareResult {
  /** Уже отсортированы сервером: безопасность, затем пятилетний риск. */
  results: CandidateResult[]
  /** query лучшего допустимого варианта с рассчитанным прогнозом; null — такого нет. */
  best: string | null
  baseline_risk: number | null
  missing: string[]
  factors: FamilyFactor[]
  used: DrugCheckResult['used']
  model: string
  generated_at: string
  disclaimer: string
}

const KNOWN: DrugCheckError[] = ['ai_unavailable', 'ai_failed', 'bad_request', 'not_found']

/**
 * Вызывает функцию drug-check: один препарат — проверка, несколько — сравнение.
 * Вердикты, прогноз и порядок кандидатов вычисляются на сервере; браузер только
 * показывает результат. Коды ошибок провайдера остаются в консоли.
 */
export function useDrugCheck(patientId: string | undefined) {
  const [data, setData] = useState<DrugCheckResult | null>(null)
  const [comparison, setComparison] = useState<DrugCompareResult | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<DrugCheckError | null>(null)

  const check = useCallback(
    async (drugs: string[]) => {
      const list = drugs.map((drug) => drug.trim()).filter(Boolean)
      if (!patientId || list.length === 0) return
      const compare = list.length > 1
      setLoading(true)
      setError(null)

      try {
        const { data: result, error: invokeError } = await supabase.functions.invoke<
          (DrugCheckResult | DrugCompareResult) & { error?: string }
        >('drug-check', { body: compare ? { patientId, drugs: list } : { patientId, drug: list[0] } })

        if (invokeError || !result || result.error) {
          let code = result?.error
          const context = (invokeError as { context?: Response } | null)?.context
          if (!code && context) {
            code = await context.json().then((body: { error?: string }) => body.error).catch(() => undefined)
          }
          console.error('[drug-check] failed', invokeError ?? result)
          setError(KNOWN.includes(code as DrugCheckError) ? code as DrugCheckError : 'failed')
          setData(null)
          setComparison(null)
        } else if (compare) {
          setComparison(result as DrugCompareResult)
          setData(null)
        } else {
          setData(result as DrugCheckResult)
          setComparison(null)
        }
      } catch (caught) {
        console.error('[drug-check] request failed', caught)
        setError('failed')
        setData(null)
        setComparison(null)
      } finally {
        setLoading(false)
      }
    },
    [patientId],
  )

  return { data, comparison, loading, error, check }
}
