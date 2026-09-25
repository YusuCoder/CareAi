/**
 * Types for the TwinCare schema.
 *
 * Hand-written stopgap that mirrors supabase/migrations/. Regenerate properly
 * once the Supabase CLI is available:
 *
 *   npx supabase gen types typescript --project-id wrjttmjkawtqjpgveyzj \
 *     > src/lib/database.types.ts
 */

export type OrganizationType =
  | 'CENTRAL_HOSPITAL' | 'POLYCLINIC' | 'PRIVATE_CLINIC'
  | 'REHABILITATION_CENTER' | 'OTHER'

export type MembershipRole =
  | 'SUPER_ADMIN' | 'ORGANIZATION_ADMIN' | 'HOSPITAL_DOCTOR'
  | 'POLYCLINIC_DOCTOR' | 'NURSE'

export type Gender = 'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN'

export type TwinStatus =
  | 'NEW' | 'HOSPITALIZED' | 'POST_DISCHARGE_MONITORING' | 'STABLE' | 'INACTIVE'

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export type HospitalizationStatus =
  | 'ACTIVE' | 'DISCHARGED' | 'TRANSFERRED' | 'CANCELLED'

export type CarePlanStatus =
  | 'DRAFT' | 'PENDING_APPROVAL' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED'

export type CareAssignmentStatus =
  | 'PENDING' | 'ACCEPTED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED'

export type ClinicalSource =
  | 'HOSPITAL' | 'POLYCLINIC' | 'NURSE' | 'PATIENT' | 'DEVICE' | 'AI_DRAFT'

export type DiagnosisType = 'PRIMARY' | 'SECONDARY' | 'COMORBIDITY' | 'COMPLICATION'
export type DiagnosisStatus = 'ACTIVE' | 'RESOLVED' | 'IN_REMISSION' | 'RULED_OUT'

export type ObservationType =
  | 'TEMPERATURE' | 'HEART_RATE' | 'BLOOD_PRESSURE' | 'SPO2' | 'RESPIRATORY_RATE'
  | 'WEIGHT' | 'GLUCOSE' | 'PAIN' | 'NAUSEA' | 'WEAKNESS' | 'DIZZINESS'
  | 'WOUND_REDNESS' | 'SHORTNESS_OF_BREATH' | 'SWELLING'
  | 'HRV' | 'RESTING_HEART_RATE' | 'SKIN_TEMPERATURE_DELTA'
  | 'SLEEP_DURATION' | 'SLEEP_EFFICIENCY' | 'STEPS' | 'RECOVERY_SCORE'

export type LabFlag = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL'

export type MedicationFrequency =
  | 'ONCE_DAILY' | 'TWICE_DAILY' | 'THREE_TIMES_DAILY' | 'FOUR_TIMES_DAILY'
  | 'EVERY_OTHER_DAY' | 'WEEKLY' | 'AS_NEEDED' | 'OTHER'

export type MedicationRoute =
  | 'ORAL' | 'IV' | 'IM' | 'SUBCUTANEOUS' | 'TOPICAL' | 'INHALATION'
  | 'RECTAL' | 'OTHER'

export type MedicationStatus = 'ACTIVE' | 'COMPLETED' | 'STOPPED' | 'ON_HOLD'
export type ProcedureCategory = 'SURGERY' | 'IMAGING' | 'DIAGNOSTIC' | 'THERAPEUTIC' | 'OTHER'
export type AllergySeverity = 'MILD' | 'MODERATE' | 'SEVERE'
export type AllergyStatus = 'ACTIVE' | 'INACTIVE'

export type CarePhase = 'HOSPITAL' | 'HOME'
export type TwinEventSeverity = 'INFO' | 'WARNING' | 'CRITICAL'

export type TwinEventType =
  | 'TWIN_CREATED' | 'HOSPITAL_ADMISSION' | 'DIAGNOSIS_ADDED' | 'PROCEDURE_COMPLETED'
  | 'LAB_RESULT_ADDED' | 'MEDICATION_PRESCRIBED' | 'ALLERGY_RECORDED'
  | 'OBSERVATION_RECORDED' | 'PATIENT_DISCHARGED' | 'CARE_PLAN_CREATED'
  | 'CARE_PLAN_APPROVED' | 'NURSE_ASSIGNED' | 'CARE_ASSIGNMENT_ACCEPTED'
  | 'PATIENT_CHECK_IN' | 'RISK_LEVEL_CHANGED' | 'ALERT_CREATED' | 'ALERT_RESOLVED'
  | 'NOTE_ADDED' | 'DEVICE_LINKED' | 'DEVICE_UNLINKED'

export type DeviceProvider =
  | 'WHOOP' | 'APPLE_HEALTH' | 'GOOGLE_FIT' | 'FITBIT' | 'GARMIN' | 'OTHER'

export type DeviceStatus = 'ACTIVE' | 'INACTIVE' | 'REVOKED' | 'ERROR'
export type DeviceSyncStatus = 'SUCCESS' | 'PARTIAL' | 'FAILED'

// --- Rows --------------------------------------------------------------------

export interface Profile {
  id: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  avatar_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Organization {
  id: string
  name: string
  type: OrganizationType
  region: string | null
  district: string | null
  address: string | null
  phone: string | null
  latitude: number | null
  longitude: number | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface OrganizationMembership {
  id: string
  organization_id: string
  user_id: string
  role: MembershipRole
  job_title: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Patient {
  id: string
  patient_number: number
  national_id: string | null
  first_name: string
  last_name: string
  birth_date: string | null
  gender: Gender
  phone: string | null
  telegram_id: number | null
  region: string | null
  district: string | null
  address: string | null
  primary_clinic_id: string | null
  created_by: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface DigitalTwin {
  id: string
  patient_id: string
  current_status: TwinStatus
  risk_level: RiskLevel | null
  last_updated_at: string
  created_at: string
}

export interface Hospitalization {
  id: string
  patient_id: string
  organization_id: string
  attending_doctor_id: string | null
  admitted_at: string
  discharged_at: string | null
  admission_reason: string | null
  primary_diagnosis: string | null
  procedure_summary: string | null
  discharge_summary: string | null
  status: HospitalizationStatus
  created_at: string
  updated_at: string
}

export interface CarePlan {
  id: string
  patient_id: string
  hospitalization_id: string | null
  source_organization_id: string
  receiving_organization_id: string
  created_by: string | null
  approved_by: string | null
  title: string
  summary: string | null
  instructions: string | null
  start_date: string | null
  end_date: string | null
  status: CarePlanStatus
  approved_at: string | null
  created_at: string
  updated_at: string
}

export interface CareAssignment {
  id: string
  patient_id: string
  care_plan_id: string
  organization_id: string
  assigned_user_id: string
  assigned_by: string | null
  status: CareAssignmentStatus
  assigned_at: string
  accepted_at: string | null
  completed_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

interface ClinicalProvenance {
  source: ClinicalSource
  organization_id: string | null
  created_at: string
  updated_at: string
}

export interface Diagnosis extends ClinicalProvenance {
  id: string
  patient_id: string
  hospitalization_id: string | null
  name: string
  code: string | null
  type: DiagnosisType
  status: DiagnosisStatus
  diagnosed_at: string | null
  resolved_at: string | null
  notes: string | null
  recorded_by: string | null
}

export interface Observation extends ClinicalProvenance {
  id: string
  patient_id: string
  hospitalization_id: string | null
  care_plan_id: string | null
  type: ObservationType
  value_numeric: number | null
  value_secondary: number | null
  value_boolean: boolean | null
  value_text: string | null
  unit: string | null
  is_abnormal: boolean
  note: string | null
  recorded_at: string
  recorded_by: string | null
  device_id: string | null
  external_id: string | null
}

export interface LabResult extends ClinicalProvenance {
  id: string
  patient_id: string
  hospitalization_id: string | null
  panel: string | null
  analyte: string
  value_numeric: number | null
  value_text: string | null
  unit: string | null
  reference_low: number | null
  reference_high: number | null
  flag: LabFlag | null
  collected_at: string
  resulted_at: string | null
  lab_name: string | null
  note: string | null
  recorded_by: string | null
}

export interface Medication extends ClinicalProvenance {
  id: string
  patient_id: string
  hospitalization_id: string | null
  care_plan_id: string | null
  name: string
  dose: number | null
  dose_unit: string | null
  frequency: MedicationFrequency | null
  frequency_text: string | null
  route: MedicationRoute | null
  instructions: string | null
  start_date: string | null
  end_date: string | null
  status: MedicationStatus
  prescribed_by: string | null
}

export interface Procedure extends ClinicalProvenance {
  id: string
  patient_id: string
  hospitalization_id: string | null
  name: string
  code: string | null
  category: ProcedureCategory
  performed_at: string
  performed_by: string | null
  outcome: string | null
  notes: string | null
}

export interface Allergy extends ClinicalProvenance {
  id: string
  patient_id: string
  substance: string
  reaction: string | null
  severity: AllergySeverity
  status: AllergyStatus
  noted_at: string | null
  note: string | null
  recorded_by: string | null
}

export interface TwinEvent {
  id: string
  patient_id: string
  event_type: TwinEventType
  phase: CarePhase
  severity: TwinEventSeverity
  occurred_at: string
  title: string
  description: string | null
  source_table: string | null
  source_id: string | null
  actor_id: string | null
  organization_id: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface Device {
  id: string
  patient_id: string
  provider: DeviceProvider
  model: string | null
  external_device_id: string | null
  is_simulated: boolean
  status: DeviceStatus
  linked_at: string
  unlinked_at: string | null
  last_sync_at: string | null
  linked_by: string | null
  organization_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface DeviceSyncLog {
  id: string
  device_id: string
  patient_id: string
  started_at: string
  finished_at: string | null
  status: DeviceSyncStatus
  observations_ingested: number
  observations_skipped: number
  error_message: string | null
  created_at: string
}

// --- Database shape for the Supabase client ----------------------------------

type Table<R> = { Row: R; Insert: Partial<R>; Update: Partial<R>; Relationships: [] }

export interface Database {
  public: {
    Tables: {
      profiles: Table<Profile>
      organizations: Table<Organization>
      organization_memberships: Table<OrganizationMembership>
      patients: Table<Patient>
      digital_twins: Table<DigitalTwin>
      hospitalizations: Table<Hospitalization>
      care_plans: Table<CarePlan>
      care_assignments: Table<CareAssignment>
      diagnoses: Table<Diagnosis>
      observations: Table<Observation>
      lab_results: Table<LabResult>
      medications: Table<Medication>
      procedures: Table<Procedure>
      allergies: Table<Allergy>
      twin_events: Table<TwinEvent>
      devices: Table<Device>
      device_sync_log: Table<DeviceSyncLog>
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      risk_level: RiskLevel
      twin_status: TwinStatus
      membership_role: MembershipRole
      care_phase: CarePhase
    }
    CompositeTypes: Record<string, never>
  }
}
