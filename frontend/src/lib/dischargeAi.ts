import { useCallback, useRef, useState } from 'react'

import { supabase } from './supabase'
import type { VisitKind } from './database.types'

/**
 * Черновик выписки от функции discharge-draft. Это только предложение: в форму
 * он попадает как текст, помеченный «Подготовлено CareTwin AI», и записывается
 * в карту лишь тогда, когда врач оформляет выписку.
 */
export interface DischargeAiDraft {
  discharge_summary: string
  procedure_summary: string
  follow_up: {
    instructions: string
    rationale: string
    visits: { day_offset: number; kind: VisitKind; title: string }[]
  }
  review_flags: string[]
  used: {
    diagnoses: number
    procedures: number
    medications: number
    observations: number
    labs: number
    prior_hospitalizations: number
  }
  generated_at: string
}

export type AiStatus = 'idle' | 'loading' | 'ready' | 'error'

const KINDS: VisitKind[] = ['HOME', 'CLINIC', 'CALL']

const count = (value: unknown): number => (typeof value === 'number' ? value : 0)
const str = (value: unknown): string => (typeof value === 'string' ? value : '')

function normalize(raw: Record<string, unknown>): DischargeAiDraft {
  const followUp = (raw.follow_up ?? {}) as Record<string, unknown>
  const used = (raw.used ?? {}) as Record<string, unknown>
  const visits = Array.isArray(followUp.visits) ? followUp.visits : []

  return {
    discharge_summary: str(raw.discharge_summary),
    procedure_summary: str(raw.procedure_summary),
    follow_up: {
      instructions: str(followUp.instructions),
      rationale: str(followUp.rationale),
      visits: visits
        .map((visit: Record<string, unknown>) => ({
          day_offset: Number(visit.day_offset),
          kind: visit.kind as VisitKind,
          title: str(visit.title),
        }))
        .filter((visit) => Number.isFinite(visit.day_offset) && KINDS.includes(visit.kind)),
    },
    review_flags: (Array.isArray(raw.review_flags) ? raw.review_flags : [])
      .filter((flag): flag is string => typeof flag === 'string'),
    used: {
      diagnoses: count(used.diagnoses),
      procedures: count(used.procedures),
      medications: count(used.medications),
      observations: count(used.observations),
      labs: count(used.labs),
      prior_hospitalizations: count(used.prior_hospitalizations),
    },
    generated_at: str(raw.generated_at) || new Date().toISOString(),
  }
}

/**
 * Врач видит только нейтральное «не удалось подготовить»: коды HTTP, ключи и
 * тексты ошибок провайдера уходят в консоль разработчика.
 */
export function useDischargeAiDraft(hospitalizationId: string | undefined) {
  const [status, setStatus] = useState<AiStatus>('idle')
  const [data, setData] = useState<DischargeAiDraft | null>(null)
  const inFlight = useRef<Promise<DischargeAiDraft | null> | null>(null)

  const generate = useCallback((): Promise<DischargeAiDraft | null> => {
    if (!hospitalizationId) return Promise.resolve(null)
    if (inFlight.current) return inFlight.current

    setStatus('loading')

    const run = async (): Promise<DischargeAiDraft | null> => {
      try {
        const { data: result, error } = await supabase.functions.invoke<Record<string, unknown>>(
          'discharge-draft',
          { body: { hospitalizationId } },
        )

        if (error || !result || typeof result !== 'object' || 'error' in result) {
          console.error('[discharge-draft] generation failed', error ?? result)
          setStatus('error')
          return null
        }

        const draft = normalize(result)
        if (!draft.discharge_summary && !draft.procedure_summary) {
          console.error('[discharge-draft] empty draft', result)
          setStatus('error')
          return null
        }

        setData(draft)
        setStatus('ready')
        return draft
      } catch (caught) {
        console.error('[discharge-draft] request failed', caught)
        setStatus('error')
        return null
      } finally {
        inFlight.current = null
      }
    }

    inFlight.current = run()
    return inFlight.current
  }, [hospitalizationId])

  return { status, data, generate }
}
