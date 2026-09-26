import { useState } from 'react'

import { useAuth } from '../../contexts/AuthContext'
import { t } from '../../lib/i18n'
import { ENTRY, saveProfile, saveValue, type ProfileFields } from '../../lib/profileEntry'
import type { AlcoholUse, PhysicalActivity, SimulationInputs, SmokingStatus } from '../../lib/database.types'

interface Props {
  patientId: string
  inputs: SimulationInputs
  missing: string[]
  onSaved: () => void
  onClose: () => void
}

const field =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-[0.8125rem] outline-none ' +
  'focus-visible:border-primary'

/**
 * Makes the refusal actionable. Writes each value to the table it belongs in —
 * profile fields to patient_profile, height and weight to observations, labs to
 * lab_results — all under the signed-in clinician's name, which is what the RLS
 * policies require anyway.
 */
export const ProfileForm: React.FC<Props> = ({ patientId, inputs, missing, onSaved, onClose }) => {
  const { user, activeMembership } = useAuth()

  const [profile, setProfile] = useState<ProfileFields>({
    smoking_status: inputs.smoking,
    alcohol_use: inputs.alcohol,
    physical_activity: inputs.activity,
    family_history: inputs.family_history ?? [],
    genetic_markers: inputs.genetic_markers ?? {},
  })
  const [entry, setEntry] = useState('')
  const [marker, setMarker] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const context = {
    patientId,
    userId: user?.id ?? '',
    organizationId: activeMembership?.organization_id ?? null,
    source: (activeMembership?.organization.type === 'CENTRAL_HOSPITAL'
      ? 'HOSPITAL'
      : 'POLYCLINIC') as 'HOSPITAL' | 'POLYCLINIC',
  }

  const clinicalGaps = missing.filter((name) => ENTRY[name]?.kind !== 'patient')

  const submit = async () => {
    try {
      setBusy(true)
      setError(null)

      await saveProfile(context, profile)

      for (const [name, raw] of Object.entries(values)) {
        const value = Number(raw.replace(',', '.'))
        if (!raw.trim() || Number.isNaN(value)) continue
        const second = values[`${name}__secondary`]
        await saveValue(
          context,
          name,
          value,
          second ? Number(second.replace(',', '.')) : undefined,
        )
      }

      onSaved()
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[0.9375rem] font-semibold">{t.forecast.fill}</h3>
        <button type="button" onClick={onClose} className="text-[0.8125rem] text-ink-muted hover:text-ink">
          {t.forecast.close}
        </button>
      </div>

      <p className="mt-3 text-[0.75rem] font-medium text-ink-muted">{t.forecast.lifestyle}</p>
      <div className="mt-1.5 grid gap-2 sm:grid-cols-3">
        <select
          className={field}
          value={profile.smoking_status}
          onChange={(e) => setProfile({ ...profile, smoking_status: e.target.value as SmokingStatus })}
        >
          {Object.entries(t.forecast.smoking).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <select
          className={field}
          value={profile.alcohol_use}
          onChange={(e) => setProfile({ ...profile, alcohol_use: e.target.value as AlcoholUse })}
        >
          {Object.entries(t.forecast.alcoholLabels).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <select
          className={field}
          value={profile.physical_activity}
          onChange={(e) => setProfile({ ...profile, physical_activity: e.target.value as PhysicalActivity })}
        >
          {Object.entries(t.forecast.activityLabels).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      <p className="mt-4 text-[0.75rem] font-medium text-ink-muted">{t.forecast.familyHistory}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {profile.family_history.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setProfile({
              ...profile,
              family_history: profile.family_history.filter((one) => one !== item),
            })}
            className="rounded-md border border-border px-2 py-1 text-[0.75rem] text-ink-muted hover:border-risk-critical hover:text-risk-critical"
          >
            {item} ×
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex gap-2">
        <input
          className={field}
          value={entry}
          placeholder={t.forecast.familyAdd}
          onChange={(e) => setEntry(e.target.value)}
        />
        <button
          type="button"
          onClick={() => {
            if (!entry.trim()) return
            setProfile({ ...profile, family_history: [...profile.family_history, entry.trim()] })
            setEntry('')
          }}
          className="shrink-0 rounded-lg border border-border px-3 text-[0.8125rem]"
        >
          {t.forecast.add}
        </button>
      </div>

      <p className="mt-4 text-[0.75rem] font-medium text-ink-muted">{t.forecast.genetics}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {Object.entries(profile.genetic_markers).map(([key, value]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              const next = { ...profile.genetic_markers }
              delete next[key]
              setProfile({ ...profile, genetic_markers: next })
            }}
            className="rounded-md border border-border px-2 py-1 text-[0.75rem] text-ink-muted hover:border-risk-critical hover:text-risk-critical"
          >
            {key}: {value} ×
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex gap-2">
        <input
          className={field}
          value={marker}
          placeholder={t.forecast.geneticMarker}
          onChange={(e) => setMarker(e.target.value)}
        />
        <button
          type="button"
          onClick={() => {
            if (!marker.trim()) return
            setProfile({
              ...profile,
              genetic_markers: { ...profile.genetic_markers, [marker.trim()]: 'risk' },
            })
            setMarker('')
          }}
          className="shrink-0 rounded-lg border border-border px-3 text-[0.8125rem]"
        >
          {t.forecast.geneticRisk}
        </button>
      </div>

      {clinicalGaps.length > 0 && (
        <>
          <p className="mt-4 text-[0.75rem] font-medium text-ink-muted">{t.forecast.values}</p>
          <div className="mt-1.5 space-y-2">
            {clinicalGaps.map((name) => {
              const spec = ENTRY[name]
              return (
                <div key={name} className="flex items-center gap-2">
                  <span className="w-40 shrink-0 text-[0.8125rem]">{spec.label}</span>
                  <input
                    className={field}
                    inputMode="decimal"
                    value={values[name] ?? ''}
                    placeholder={spec.unit}
                    onChange={(e) => setValues({ ...values, [name]: e.target.value })}
                  />
                  {spec.secondaryLabel && (
                    <input
                      className={field}
                      inputMode="decimal"
                      value={values[`${name}__secondary`] ?? ''}
                      placeholder={spec.secondaryLabel}
                      onChange={(e) => setValues({ ...values, [`${name}__secondary`]: e.target.value })}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {error && (
        <p className="mt-3 border-l-2 border-risk-critical pl-2 text-[0.8125rem] text-risk-critical">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy}
        className="mt-4 w-full rounded-lg bg-primary px-3 py-2 text-[0.8125rem] font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
      >
        {busy ? t.forecast.saving : t.forecast.save}
      </button>
    </div>
  )
}
