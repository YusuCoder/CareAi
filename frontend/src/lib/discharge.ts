import { useEffect, useState } from 'react'

import { defaultMonitoring, monitoringPayload, type MonitoringDraft } from './checkInRules'
import { supabase } from './supabase'
import type {
  Allergy, Diagnosis, DiagnosisType, LabResult, Medication, MedicationFrequency,
  MedicationRoute, Observation, ObservationType, Patient, Procedure,
  ProcedureCategory, VisitKind,
} from './database.types'

export interface DiagnosisDraft {
  key: string
  name: string
  code: string
  type: DiagnosisType
}

export interface ProcedureDraft {
  key: string
  name: string
  category: ProcedureCategory
  outcome: string
}

export interface MedicationDraft {
  key: string
  name: string
  dose: string
  dose_unit: string
  frequency: MedicationFrequency | ''
  route: MedicationRoute | ''
  instructions: string
  end_date: string
}

export interface VisitDraft {
  key: string
  day_offset: number
  kind: VisitKind
  title: string
}

/**
 * Показатели и анализы, которые форма предлагает заполнить. Набор не случайный:
 * это ровно те переменные, которых simulation_inputs() требует для прогноза, плюс
 * обычные витальные показатели на момент выписки. Названия анализов должны
 * совпадать с теми, по которым функция их ищет, иначе прогноз их не увидит.
 */
export interface VitalSpec {
  field: string
  label: string
  unit: string
  type: ObservationType
  secondaryLabel?: string
  forecast?: boolean
}

export const VITALS: VitalSpec[] = [
  { field: 'weight', label: 'Вес', unit: 'кг', type: 'WEIGHT', forecast: true },
  { field: 'height', label: 'Рост', unit: 'см', type: 'HEIGHT', forecast: true },
  {
    field: 'bp', label: 'Артериальное давление', unit: 'мм рт. ст.',
    type: 'BLOOD_PRESSURE', secondaryLabel: 'диастолическое', forecast: true,
  },
  { field: 'hr', label: 'ЧСС', unit: 'уд/мин', type: 'HEART_RATE' },
  { field: 'spo2', label: 'SpO2', unit: '%', type: 'SPO2' },
  { field: 'temp', label: 'Температура', unit: '°C', type: 'TEMPERATURE' },
]

export interface LabSpec {
  field: string
  analyte: string
  /** По какой подстроке узнаём этот анализ среди уже записанных. */
  match: string
  label: string
  unit: string
  panel: string
  low?: number
  high?: number
  forecast?: boolean
}

export const LABS: LabSpec[] = [
  {
    field: 'creatinine', match: 'креатинин', analyte: 'Креатинин', label: 'Креатинин', unit: 'мкмоль/л',
    panel: 'Биохимия', low: 62, high: 106, forecast: true,
  },
  {
    field: 'hba1c', match: 'hba1c', analyte: 'HbA1c', label: 'HbA1c', unit: '%',
    panel: 'Биохимия', low: 4, high: 6, forecast: true,
  },
  {
    field: 'cholesterol', match: 'общий холестерин', analyte: 'Общий холестерин', label: 'Общий холестерин',
    unit: 'ммоль/л', panel: 'Липидный профиль', low: 3, high: 5.2, forecast: true,
  },
  {
    field: 'hdl', match: 'лпвп', analyte: 'ЛПВП', label: 'ЛПВП', unit: 'ммоль/л',
    panel: 'Липидный профиль', low: 1, high: 2.2, forecast: true,
  },
  {
    field: 'hemoglobin', match: 'гемоглобин', analyte: 'Гемоглобин', label: 'Гемоглобин', unit: 'г/л',
    panel: 'Общий анализ крови', low: 120, high: 160,
  },
  {
    field: 'glucose', match: 'глюкоз', analyte: 'Глюкоза', label: 'Глюкоза натощак', unit: 'ммоль/л',
    panel: 'Биохимия', low: 3.9, high: 6.1,
  },
]

export interface DischargeDraft {
  primary_diagnosis: string
  procedure_summary: string
  discharge_summary: string
  discharged_at: string
  diagnoses: DiagnosisDraft[]
  procedures: ProcedureDraft[]
  medications: MedicationDraft[]
  vitals: Record<string, string>
  vitalsSecondary: Record<string, string>
  labs: Record<string, string>
  followUp: boolean
  planTitle: string
  planSummary: string
  planInstructions: string
  planEndDate: string
  visits: VisitDraft[]
  /** Правила самоконтроля в Telegram (CareTwin AI по требованиям врача). */
  monitoring: MonitoringDraft
}

export interface DischargeResult {
  hospitalization_id: string
  patient_id: string
  care_plan_id: string | null
  active_call_id: string | null
}

const num = (value: string): string => value.trim().replace(',', '.')

/**
 * Одна транзакция на сервере: частично выписанного пациента быть не может.
 *
 * Значения, подставленные из карты и не изменённые врачом, не отправляются:
 * иначе выписка дублировала бы измерения, которые уже записаны.
 */
export async function submitDischarge(
  hospitalizationId: string,
  draft: DischargeDraft,
  context?: DischargeContext,
): Promise<DischargeResult> {
  const observations = VITALS.flatMap((vital) => {
    const raw = num(draft.vitals[vital.field] ?? '')
    if (!raw) return []
    const secondary = num(draft.vitalsSecondary[vital.field] ?? '')
    if (vital.type === 'BLOOD_PRESSURE' && !secondary) return []

    const known = context?.vitals[vital.field]
    if (known && num(known.value) === raw && num(known.secondary) === secondary) return []

    return [{
      type: vital.type,
      value_numeric: raw,
      value_secondary: vital.type === 'BLOOD_PRESSURE' ? secondary : null,
      unit: vital.unit,
    }]
  })

  const labs = LABS.flatMap((lab) => {
    const raw = num(draft.labs[lab.field] ?? '')
    if (!raw) return []

    const known = context?.labs[lab.field]
    if (known && num(known.value) === raw) return []

    return [{
      analyte: lab.analyte,
      panel: lab.panel,
      value_numeric: raw,
      unit: lab.unit,
      reference_low: lab.low ?? null,
      reference_high: lab.high ?? null,
    }]
  })

  const payload = {
    hospitalization_id: hospitalizationId,
    discharged_at: new Date(draft.discharged_at).toISOString(),
    primary_diagnosis: draft.primary_diagnosis,
    procedure_summary: draft.procedure_summary,
    discharge_summary: draft.discharge_summary,
    diagnoses: draft.diagnoses
      .filter((item) => item.name.trim())
      .map((item) => ({ name: item.name, code: item.code, type: item.type })),
    procedures: draft.procedures
      .filter((item) => item.name.trim())
      .map((item) => ({ name: item.name, category: item.category, outcome: item.outcome })),
    medications: draft.medications
      .filter((item) => item.name.trim())
      .map((item) => ({
        name: item.name,
        dose: num(item.dose),
        dose_unit: item.dose_unit,
        frequency: item.frequency,
        route: item.route,
        instructions: item.instructions,
        end_date: item.end_date,
      })),
    observations,
    labs,
    plan: draft.followUp
      ? {
          title: draft.planTitle.trim() || 'Наблюдение после выписки',
          summary: draft.planSummary,
          instructions: draft.planInstructions,
          start_date: draft.discharged_at.slice(0, 10),
          end_date: draft.planEndDate,
          visits: draft.visits.map((visit) => ({
            day_offset: visit.day_offset,
            kind: visit.kind,
            title: visit.title,
          })),
          monitoring: monitoringPayload(draft.monitoring ?? defaultMonitoring(), draft.planEndDate),
        }
      : null,
  }

  const { data, error } = await supabase.rpc('discharge_patient', { p_payload: payload })
  if (error) throw new Error(error.message)
  return data as unknown as DischargeResult
}

export interface OpenAdmission {
  id: string
  patient_id: string
  organization_id: string
  admitted_at: string
  admission_reason: string | null
  primary_diagnosis: string | null
  patient: {
    id: string
    patient_number: number
    first_name: string
    last_name: string
    primary_clinic_id: string | null
  } | null
}

export function useOpenAdmissions() {
  const [data, setData] = useState<OpenAdmission[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    supabase
      .from('hospitalizations')
      .select(
        'id, patient_id, organization_id, admitted_at, admission_reason, primary_diagnosis,' +
        ' patient:patients(id, patient_number, first_name, last_name, primary_clinic_id)',
      )
      .eq('status', 'ACTIVE')
      .order('admitted_at', { ascending: true })
      .then(({ data: rows, error: failure }) => {
        if (cancelled) return
        if (failure) setError(failure.message)
        else setData((rows ?? []) as unknown as OpenAdmission[])
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return { data, loading, error }
}

/** Какое поле формы закрывает какую дыру в прогнозе. */
export const GAP_FIELD: Record<string, string> = {
  height_cm: 'height',
  weight_kg: 'weight',
  systolic: 'bp',
  hba1c: 'hba1c',
  total_cholesterol: 'cholesterol',
  hdl: 'hdl',
  creatinine: 'creatinine',
}

/**
 * Чего не хватает модели прогноза прямо сейчас. Берём напрямую из
 * simulation_inputs(), а не через Edge Function: здесь нужен только список
 * пробелов, а не расчёт.
 */
export function useForecastGaps(patientId: string | undefined) {
  const [missing, setMissing] = useState<string[]>([])

  useEffect(() => {
    if (!patientId) return
    let cancelled = false

    supabase
      .rpc('simulation_inputs', { p_patient_id: patientId })
      .then(({ data }) => {
        if (cancelled || !data) return
        const row = (data as { missing: string[] | null }[])[0]
        setMissing(row?.missing ?? [])
      })

    return () => {
      cancelled = true
    }
  }, [patientId])

  return missing
}

export function useAdmission(hospitalizationId: string | undefined) {
  const [data, setData] = useState<OpenAdmission | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!hospitalizationId) return
    let cancelled = false

    supabase
      .from('hospitalizations')
      .select(
        'id, patient_id, organization_id, admitted_at, admission_reason, primary_diagnosis,' +
        ' patient:patients(id, patient_number, first_name, last_name, primary_clinic_id)',
      )
      .eq('id', hospitalizationId)
      .maybeSingle()
      .then(({ data: row, error: failure }) => {
        if (cancelled) return
        if (failure) setError(failure.message)
        else setData((row ?? null) as unknown as OpenAdmission | null)
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [hospitalizationId])

  return { data, loading, error }
}

const pad = (value: number): string => String(value).padStart(2, '0')

/** datetime-local хочет локальное время без зоны. */
export function localDateTimeValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function dateValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export const newKey = (): string => Math.random().toString(36).slice(2, 10)

export function emptyDraft(
  admission: OpenAdmission | null,
  context?: DischargeContext,
): DischargeDraft {
  const now = new Date()
  const end = new Date(now.getTime() + 30 * 24 * 3600_000)

  const vitals: Record<string, string> = {}
  const vitalsSecondary: Record<string, string> = {}
  for (const [field, value] of Object.entries(context?.vitals ?? {})) {
    vitals[field] = value.value
    vitalsSecondary[field] = value.secondary
  }

  const labs: Record<string, string> = {}
  for (const [field, value] of Object.entries(context?.labs ?? {})) {
    labs[field] = value.value
  }

  return {
    primary_diagnosis: admission?.primary_diagnosis ?? '',
    procedure_summary: '',
    discharge_summary: '',
    discharged_at: localDateTimeValue(now),
    // диагнозы, уже записанные за госпитализацию, показываются отдельно и
    // повторно не вводятся: пустую строку заводим только если карта пуста
    diagnoses: context?.diagnoses.length
      ? []
      : [{ key: newKey(), name: admission?.primary_diagnosis ?? '', code: '', type: 'PRIMARY' }],
    procedures: [],
    medications: [],
    vitals,
    vitalsSecondary,
    labs,
    followUp: Boolean(admission?.patient?.primary_clinic_id),
    planTitle: 'Наблюдение после выписки',
    planSummary: '',
    planInstructions: '',
    planEndDate: dateValue(end),
    visits: [
      { key: newKey(), day_offset: 3, kind: 'HOME', title: 'Первичный патронаж на дому' },
      { key: newKey(), day_offset: 10, kind: 'CLINIC', title: 'Контрольный осмотр' },
      { key: newKey(), day_offset: 21, kind: 'CALL', title: 'Контрольный звонок' },
    ],
    monitoring: defaultMonitoring(),
  }
}

/**
 * Что о пациенте уже записано к моменту выписки. Врач заполняет только то,
 * чего в карте нет: остальное показывается как есть и повторно не вводится.
 */
export interface DischargeContext {
  patient: Patient | null
  allergies: Allergy[]
  diagnoses: Diagnosis[]
  procedures: Procedure[]
  medications: Medication[]
  /** Последнее значение по каждому показателю формы. */
  vitals: Record<string, { value: string; secondary: string; at: string }>
  /** Последнее значение по каждому анализу формы. */
  labs: Record<string, { value: string; at: string }>
  clinicName: string | null
  organizations: OrganizationSummary[]
}

export interface OrganizationSummary {
  id: string
  name: string
  region: string | null
  district: string | null
}

const EMPTY_CONTEXT: DischargeContext = {
  patient: null, allergies: [], diagnoses: [], procedures: [], medications: [],
  vitals: {}, labs: {}, clinicName: null, organizations: [],
}

const asText = (value: number | null): string =>
  value === null ? '' : String(value)

export function useDischargeContext(
  patientId: string | undefined,
  hospitalizationId: string | undefined,
) {
  const [data, setData] = useState<DischargeContext>(EMPTY_CONTEXT)
  const [loading, setLoading] = useState<boolean>(true)

  useEffect(() => {
    if (!patientId || !hospitalizationId) return
    let cancelled = false
    setLoading(true)

    const load = async () => {
      const byPatient = (table: string) =>
        supabase.from(table).select('*').eq('patient_id', patientId)

      const [patient, allergies, diagnoses, procedures, medications, observations, labs, orgs] =
        await Promise.all([
          supabase.from('patients').select('*').eq('id', patientId).maybeSingle(),
          byPatient('allergies').eq('status', 'ACTIVE'),
          byPatient('diagnoses').eq('status', 'ACTIVE').order('diagnosed_at', {
            ascending: false, nullsFirst: false,
          }),
          byPatient('procedures')
            .eq('hospitalization_id', hospitalizationId)
            .order('performed_at', { ascending: false }),
          byPatient('medications').eq('status', 'ACTIVE').order('start_date', {
            ascending: false, nullsFirst: false,
          }),
          byPatient('observations').order('recorded_at', { ascending: false }).limit(300),
          byPatient('lab_results').order('collected_at', { ascending: false }).limit(150),
          supabase.from('organizations').select('id, name, region, district'),
        ])

      if (cancelled) return

      const patientRow = (patient.data ?? null) as Patient | null
      const observationRows = (observations.data ?? []) as unknown as Observation[]
      const labRows = (labs.data ?? []) as unknown as LabResult[]
      const orgRows = (orgs.data ?? []) as unknown as OrganizationSummary[]

      // строки отсортированы от новых к старым, поэтому первое совпадение и есть последнее значение
      const latestVitals: DischargeContext['vitals'] = {}
      for (const vital of VITALS) {
        const found = observationRows.find((row) => row.type === vital.type)
        if (!found) continue
        latestVitals[vital.field] = {
          value: asText(found.value_numeric),
          secondary: asText(found.value_secondary),
          at: found.recorded_at,
        }
      }

      const latestLabs: DischargeContext['labs'] = {}
      for (const lab of LABS) {
        const found = labRows.find((row) => row.analyte.toLowerCase().includes(lab.match))
        if (!found || found.value_numeric === null) continue
        latestLabs[lab.field] = { value: asText(found.value_numeric), at: found.collected_at }
      }

      setData({
        patient: patientRow,
        allergies: (allergies.data ?? []) as unknown as Allergy[],
        diagnoses: (diagnoses.data ?? []) as unknown as Diagnosis[],
        procedures: (procedures.data ?? []) as unknown as Procedure[],
        medications: (medications.data ?? []) as unknown as Medication[],
        vitals: latestVitals,
        labs: latestLabs,
        clinicName:
          orgRows.find((org) => org.id === patientRow?.primary_clinic_id)?.name ?? null,
        organizations: orgRows,
      })
      setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [patientId, hospitalizationId])

  return { data, loading }
}
