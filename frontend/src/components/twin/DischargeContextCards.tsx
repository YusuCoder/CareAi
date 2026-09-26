import { ageFromBirthDate, dateShort } from '../../lib/format'
import {
  diagnosisTypeLabel, medicationFrequencyLabel, procedureCategoryLabel, t, yearsLabel,
} from '../../lib/i18n'
import type { DischargeContext } from '../../lib/discharge'

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <dt className="text-[0.6875rem] text-ink-muted">{label}</dt>
    <dd className="mt-0.5 text-[0.8125rem]">{value}</dd>
  </div>
)

/** Всё, что уже известно о пациенте: только для чтения. */
export const PatientCard: React.FC<{
  context: DischargeContext
  admissionReason: string | null
  admittedAt: string
}> = ({ context, admissionReason, admittedAt }) => {
  const { patient } = context
  if (!patient) return null

  const age = ageFromBirthDate(patient.birth_date)
  const allergies = context.allergies.map((item) => item.substance).join(', ')

  return (
    <section className="rounded-xl border border-border bg-surface-sunken p-4">
      <h3 className="text-[0.9375rem] font-semibold">{t.discharge.patientCard}</h3>

      <dl className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Row label="ФИО" value={`${patient.last_name} ${patient.first_name}`} />
        <Row label={t.twin.id} value={`№${patient.patient_number}`} />
        <Row
          label="Возраст"
          value={age === null ? t.common.dash : yearsLabel(age)}
        />
        <Row
          label="Пол"
          value={patient.gender === 'MALE' ? 'мужской' : patient.gender === 'FEMALE' ? 'женский' : t.common.dash}
        />
        <Row label="Телефон" value={patient.phone ?? t.common.dash} />
        <Row
          label={t.discharge.clinic}
          value={context.clinicName ?? t.discharge.noClinicShort}
        />
        <Row label={t.discharge.admitted} value={dateShort(admittedAt)} />
        <Row
          label={t.discharge.allergies}
          value={allergies || t.discharge.noAllergies}
        />
      </dl>

      {admissionReason && (
        <p className="mt-3 border-t border-border pt-3 text-[0.8125rem] text-ink-muted">
          <span className="text-[0.6875rem]">{t.discharge.admissionReason}: </span>
          {admissionReason}
        </p>
      )}
    </section>
  )
}

const Existing: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-md bg-surface-sunken px-2.5 py-1.5 text-[0.8125rem]">
    {children}
  </li>
)

const Muted: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="text-[0.6875rem] text-ink-muted">{children}</span>
)

export const ExistingDiagnoses: React.FC<{ context: DischargeContext }> = ({ context }) => {
  if (context.diagnoses.length === 0) return null
  return (
    <ul className="mb-3 space-y-1.5">
      {context.diagnoses.map((item) => (
        <Existing key={item.id}>
          <span>{item.name}</span>
          {item.code && <Muted>{item.code}</Muted>}
          <Muted>· {diagnosisTypeLabel[item.type]}</Muted>
          {item.diagnosed_at && <Muted>· {dateShort(item.diagnosed_at)}</Muted>}
        </Existing>
      ))}
    </ul>
  )
}

export const ExistingProcedures: React.FC<{ context: DischargeContext }> = ({ context }) => {
  if (context.procedures.length === 0) return null
  return (
    <ul className="mb-3 space-y-1.5">
      {context.procedures.map((item) => (
        <Existing key={item.id}>
          <span>{item.name}</span>
          <Muted>· {procedureCategoryLabel[item.category]}</Muted>
          <Muted>· {dateShort(item.performed_at)}</Muted>
          {item.outcome && <Muted>· {item.outcome}</Muted>}
        </Existing>
      ))}
    </ul>
  )
}

export const ExistingMedications: React.FC<{ context: DischargeContext }> = ({ context }) => {
  if (context.medications.length === 0) return null
  return (
    <ul className="mb-3 space-y-1.5">
      {context.medications.map((item) => (
        <Existing key={item.id}>
          <span>{item.name}</span>
          {item.dose !== null && <Muted>{item.dose} {item.dose_unit ?? ''}</Muted>}
          {item.frequency && <Muted>· {medicationFrequencyLabel[item.frequency]}</Muted>}
          {item.start_date && <Muted>· с {dateShort(item.start_date)}</Muted>}
        </Existing>
      ))}
    </ul>
  )
}
