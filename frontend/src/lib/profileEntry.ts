import { supabase } from './supabase'
import type {
  AlcoholUse, ClinicalSource, ObservationType, PhysicalActivity, SmokingStatus,
} from './database.types'

/**
 * How each missing variable gets into the record. Height and weight are
 * observations, HbA1c and lipids are lab results, date of birth is on the
 * patient — the form needs to know which, so nothing is written to the wrong
 * table just because it was convenient.
 */
export interface EntrySpec {
  kind: 'observation' | 'lab' | 'patient'
  label: string
  unit: string
  observationType?: ObservationType
  analyte?: string
  panel?: string
  referenceLow?: number
  referenceHigh?: number
  /** Blood pressure carries a second number. */
  secondaryLabel?: string
}

export const ENTRY: Record<string, EntrySpec> = {
  birth_date: { kind: 'patient', label: 'Дата рождения', unit: '' },
  height_cm: { kind: 'observation', label: 'Рост', unit: 'см', observationType: 'HEIGHT' },
  weight_kg: { kind: 'observation', label: 'Вес', unit: 'кг', observationType: 'WEIGHT' },
  systolic: {
    kind: 'observation', label: 'Артериальное давление', unit: 'мм рт. ст.',
    observationType: 'BLOOD_PRESSURE', secondaryLabel: 'Диастолическое',
  },
  hba1c: {
    kind: 'lab', label: 'HbA1c', unit: '%', analyte: 'HbA1c', panel: 'Биохимия',
    referenceLow: 4, referenceHigh: 6,
  },
  total_cholesterol: {
    kind: 'lab', label: 'Общий холестерин', unit: 'ммоль/л', analyte: 'Общий холестерин',
    panel: 'Липидный профиль', referenceLow: 3, referenceHigh: 5.2,
  },
  hdl: {
    kind: 'lab', label: 'ЛПВП', unit: 'ммоль/л', analyte: 'ЛПВП',
    panel: 'Липидный профиль', referenceLow: 1, referenceHigh: 2.2,
  },
  creatinine: {
    kind: 'lab', label: 'Креатинин', unit: 'мкмоль/л', analyte: 'Креатинин',
    panel: 'Биохимия', referenceLow: 62, referenceHigh: 106,
  },
}

export interface ProfileFields {
  smoking_status: SmokingStatus
  alcohol_use: AlcoholUse
  physical_activity: PhysicalActivity
  family_history: string[]
  genetic_markers: Record<string, string>
}

interface Context {
  patientId: string
  userId: string
  organizationId: string | null
  source: ClinicalSource
}

export async function saveProfile(context: Context, fields: ProfileFields): Promise<void> {
  const { error } = await supabase.from('patient_profile').upsert({
    patient_id: context.patientId,
    ...fields,
    updated_by: context.userId,
  })
  if (error) throw new Error(error.message)
}

/** Writes one missing variable to whichever table it belongs in. */
export async function saveValue(
  context: Context,
  field: string,
  value: number,
  secondary?: number,
): Promise<void> {
  const spec = ENTRY[field]
  if (!spec) throw new Error(`Неизвестное поле: ${field}`)

  if (spec.kind === 'observation') {
    const { error } = await supabase.from('observations').insert({
      patient_id: context.patientId,
      type: spec.observationType!,
      value_numeric: value,
      value_secondary: secondary ?? null,
      unit: spec.unit,
      source: context.source,
      recorded_at: new Date().toISOString(),
      recorded_by: context.userId,
      organization_id: context.organizationId,
    })
    if (error) throw new Error(error.message)
    return
  }

  if (spec.kind === 'lab') {
    const { error } = await supabase.from('lab_results').insert({
      patient_id: context.patientId,
      panel: spec.panel ?? null,
      analyte: spec.analyte!,
      value_numeric: value,
      unit: spec.unit,
      reference_low: spec.referenceLow ?? null,
      reference_high: spec.referenceHigh ?? null,
      collected_at: new Date().toISOString(),
      source: context.source,
      recorded_by: context.userId,
      organization_id: context.organizationId,
    })
    if (error) throw new Error(error.message)
    return
  }

  throw new Error('Это поле редактируется в карте пациента.')
}
