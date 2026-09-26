import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { IconId, IconPhone, IconPin, IconTelegram } from './icons'
import { ageFromBirthDate, dateShort, relativeTime } from '../../lib/format'
import { riskLabel, t, yearsLabel } from '../../lib/i18n'
import type { TwinData } from '../../lib/twin'
import './PatientHeader.css'

const DAY = 24 * 3600_000
const days = (from: string) => Math.max(1, Math.floor((Date.now() - new Date(from).getTime()) / DAY))

const IconClock = () => (
  <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" aria-hidden>
    <circle cx="12" cy="12" r="8.6" /><path d="M12 7.5V12l3 1.8" />
  </svg>
)
const IconCalendar = () => (
  <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" aria-hidden>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4M9 13h5l-3 5" />
  </svg>
)
const IconAllergy = () => (
  <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M10.3 4.5 2.7 18a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 4.5a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4M12 17h.01" />
  </svg>
)

const Fact: React.FC<{ icon: React.ReactNode; children: React.ReactNode }> = ({ icon, children }) => (
  <span className="patient-header__fact">
    {icon}
    <span>{children}</span>
  </span>
)

function phaseCard(data: TwinData) {
  const surgery = data.procedures.find((procedure) => procedure.category === 'SURGERY')
  const discharged = data.hospitalizations.find((h) => h.discharged_at)
  const active = data.hospitalizations.find((h) => h.status === 'ACTIVE')

  if (surgery && discharged?.discharged_at) {
    return {
      title: `${days(surgery.performed_at)} ${t.twin.dayAfterSurgery}`,
      line: `${t.twin.dischargedAgo} ${relativeTime(discharged.discharged_at)}`,
    }
  }
  if (discharged?.discharged_at) {
    return {
      title: `${days(discharged.discharged_at)} ${t.twin.dayAfterDischarge}`,
      line: `${t.twin.dischargedAgo} ${relativeTime(discharged.discharged_at)}`,
    }
  }
  if (active) {
    return { title: `${days(active.admitted_at)} ${t.twin.dayInHospital}`, line: t.twin.sinceAdmission }
  }
  return null
}

interface Props {
  data: TwinData
  photoUrl?: string | null
}

export const PatientHeader: React.FC<Props> = ({ data, photoUrl }) => {
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null)
  const [, setParams] = useSearchParams()
  const { patient, twin } = data
  if (!patient) return null

  const age = ageFromBirthDate(patient.birth_date)
  const initials = `${patient.last_name[0] ?? ''}${patient.first_name[0] ?? ''}`.toUpperCase()
  const gender = patient.gender === 'MALE' ? '♂' : patient.gender === 'FEMALE' ? '♀' : null
  const phase = phaseCard(data)
  const allergies = data.allergies.filter((allergy) => allergy.status === 'ACTIVE')
  const chronic = data.diagnoses.filter((d) => d.status === 'ACTIVE' && (d.type === 'COMORBIDITY' || !d.hospitalization_id))
  const flagged = data.events.find((event) => event.severity !== 'INFO')
  // причины от движка правил; у записей, где риск выставлен вручную, их нет
  const reasons = twin?.risk_reasons ?? []

  const facts = [
    <Fact key="id" icon={<IconId />}>
      {t.twin.id}: <span className="tabular">{patient.patient_number}</span>
    </Fact>,
    patient.phone ? <Fact key="phone" icon={<IconPhone />}>{patient.phone}</Fact> : null,
    patient.telegram_id !== null
      ? <Fact key="tg" icon={<IconTelegram />}>{String(patient.telegram_id)}</Fact>
      : null,
    <Fact key="place" icon={<IconPin />}>
      {[patient.region, patient.district].filter(Boolean).join(', ') || t.common.dash}
    </Fact>,
    <span key="clinic">
      {t.twin.primaryClinic}:{' '}
      {data.primaryClinic
        ? <span className="patient-header__clinic">{data.primaryClinic.name}</span>
        : t.twin.noClinic}
    </span>,
  ].filter(Boolean)

  return (
    <header className="patient-header">
      <div className="patient-header__layout">
        <div className="patient-header__identity">
          <span
            aria-hidden
            className="patient-header__avatar"
          >
            {photoUrl && photoUrl !== failedPhoto ? (
              <img src={photoUrl} alt="" onError={() => setFailedPhoto(photoUrl)} />
            ) : initials}
          </span>

          <div className="patient-header__details">
            <div className="patient-header__name-row">
              <h1 className="patient-header__name">
                {patient.last_name} {patient.first_name}
              </h1>
              {gender && <span className="patient-header__gender">{gender}</span>}
              <span
                className="patient-header__status"
                data-active={patient.is_active}
              >
                <span className="patient-header__status-dot" aria-hidden />
                {patient.is_active ? t.twin.active : t.twin.inactive}
              </span>
            </div>

            <p className="patient-header__age">
              {age !== null ? yearsLabel(age) : t.common.dash}
              {patient.birth_date && ` (${dateShort(patient.birth_date)})`}
            </p>

            <div className="patient-header__facts">
              {facts.map((fact, index) => (
                <span key={index} className="patient-header__fact-item">
                  {fact}
                </span>
              ))}
            </div>

            {/* Подробности — во вкладке «Хронология»; аллергия остаётся на виду
                всегда, потому что от неё зависит любое назначение. */}
            <div className="patient-header__badges">
              {allergies.length > 0 && (
                <button
                  type="button"
                  onClick={() => setParams({ tab: 'timeline' }, { replace: true })}
                  className="patient-header__badge patient-header__badge--allergy cursor-pointer"
                >
                  <IconAllergy />
                  {t.twin.allergy}: {allergies.length}
                </button>
              )}
              {chronic.length > 0 && (
                <button
                  type="button"
                  onClick={() => setParams({ tab: 'timeline' }, { replace: true })}
                  className="patient-header__badge cursor-pointer"
                >
                  {t.chronology.chronicShort}: {chronic.length} →
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="patient-header__summary" data-has-phase={Boolean(phase)}>
          <div
            className="patient-header__card patient-header__card--risk"
            data-risk={twin?.risk_level ?? 'UNKNOWN'}
          >
            <span className="patient-header__card-icon">
              <IconClock />
            </span>
            <div className="patient-header__card-content">
              <p className="patient-header__card-title">
                {twin?.risk_level ? `${riskLabel[twin.risk_level]} риск` : t.twin.riskNotAssessed}
              </p>
              {reasons.length > 0 ? (
                <>
                  <p className="patient-header__risk-description">{t.riskReasons.title}:</p>
                  <ul className="patient-header__risk-reasons">
                    {reasons.slice(0, 3).map((reason) => (
                      <li key={`${reason.code}-${reason.source_id}`}>{reason.detail}</li>
                    ))}
                  </ul>
                  <p className="patient-header__card-meta tabular">
                    {t.riskReasons.engine} · {relativeTime(twin?.risk_evaluated_at ?? null)}
                    {reasons.length > 3 && ` · +${reasons.length - 3}`}
                  </p>
                </>
              ) : twin?.risk_evaluated_at ? (
                <p className="patient-header__card-meta tabular">
                  {t.riskReasons.none} · {relativeTime(twin.risk_evaluated_at)}
                </p>
              ) : flagged && (
                <>
                  <p className="patient-header__risk-description">
                    {t.twin.afterDischargeRisk}
                  </p>
                  <p className="patient-header__card-meta tabular">
                    {relativeTime(flagged.occurred_at)}
                  </p>
                </>
              )}
            </div>
          </div>

          {phase && (
            <div className="patient-header__card patient-header__card--phase">
              <span className="patient-header__card-icon"><IconCalendar /></span>
              <div className="patient-header__card-content">
                <p className="patient-header__card-title">{phase.title}</p>
                <p className="patient-header__card-meta">{phase.line}</p>
                {data.primaryClinic && (
                  <p className="patient-header__card-meta">
                    {t.twin.watchedAt}{' '}
                    <span className="patient-header__clinic">{data.primaryClinic.name}</span>
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
