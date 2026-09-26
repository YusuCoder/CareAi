import { useCallback, useState } from 'react'

import { supabase } from './supabase'
import type { SimulationInputs, SmokingStatus } from './database.types'

export type Marker = 'HBA1C' | 'SBP' | 'TOTAL_CHOLESTEROL' | 'WEIGHT'

export interface Point { month: number; value: number }

export interface Trajectory {
  marker: Marker
  unit: string
  effect: { delta: number; unit: string; onsetMonths: number; note: string }
  baseline: Point[]
  treated: Point[]
}

export interface InterventionSummary {
  id: string
  label: string
  drugClass: string
  conditions: string[]
}

export interface FamilyFactor {
  factor: 'FAMILY_CVD' | 'FAMILY_DIABETES' | 'GENETIC_RISK'
  label: string
  /** The record entry that produced the match. */
  source: string
}

export interface SimulationResult {
  inputs: SimulationInputs & { smoking: SmokingStatus }
  conditions: string[]
  missing: string[]
  available: InterventionSummary[]
  factors?: FamilyFactor[]
  refused?: boolean
  intervention?: { id: string; label: string; drugClass: string; riskRatio: number; riskNote: string }
  warnings?: { level: 'BLOCK' | 'WARN'; text: string }[]
  blocked?: boolean
  trajectories?: Trajectory[]
  risk?: { baseline: number; treated: number; absoluteReduction: number }
  coefficients?: { id: string; label: string; value: number; note: string }[]
  drift?: Record<Marker, number>
  disclaimer?: string
}

/**
 * Calls the treatment-simulation Edge Function. All arithmetic happens there,
 * deterministically — nothing is computed in the browser, so what the clinician
 * sees is exactly what the model produced.
 */
export function useSimulation(patientId: string | undefined) {
  const [data, setData] = useState<SimulationResult | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(
    async (interventionId?: string) => {
      if (!patientId) return
      setLoading(true)
      setError(null)

      const { data: result, error: invokeError } = await supabase.functions.invoke<
        SimulationResult & { error?: string }
      >('treatment-simulation', { body: { patientId, interventionId } })

      if (invokeError) {
        const context = (invokeError as { context?: Response }).context
        let message = invokeError.message
        try {
          if (context) {
            const parsed = JSON.parse(await context.text()) as { error?: string }
            message = parsed.error ?? message
          }
        } catch {
          /* keep the original */
        }
        setError(message)
      } else if (result?.error) {
        setError(result.error)
      } else if (result) {
        setData(result)
      }

      setLoading(false)
    },
    [patientId],
  )

  return { data, loading, error, run }
}
