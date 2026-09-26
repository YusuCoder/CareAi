import { useState } from 'react'

import { dateTime } from '../../lib/format'
import { t } from '../../lib/i18n'
import {
  LABS, VITALS, type DischargeContext, type DischargeDraft, type LabSpec, type VitalSpec,
} from '../../lib/discharge'
import { Provenance } from './ui'

const num = (value: string | undefined): string => (value ?? '').trim().replace(',', '.')

const VALUE_INPUT =
  'tabular w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-lg font-semibold outline-none transition-colors hover:border-border focus-visible:border-primary focus-visible:bg-surface'

/**
 * Откуда значение. Совпадает с последним в карте — «Digital Twin» и повторно
 * не запишется (эту логику держит submitDischarge); отличается — «введено врачом».
 */
function provenance(
  value: string,
  known: { value: string; at: string } | undefined,
  secondary?: { value: string; known: string },
): { kind: 'twin' | 'doctor' | 'none'; label: string; when?: string } {
  const f = t.dischargeFlow
  if (!num(value)) return { kind: 'none', label: f.provenanceNone }
  const same =
    known && num(known.value) === num(value) &&
    (!secondary || num(secondary.known) === num(secondary.value))
  if (same) return { kind: 'twin', label: f.provenanceTwin, when: dateTime(known.at) }
  return { kind: 'doctor', label: f.provenanceDoctor, when: f.provenanceNow }
}

const RequiredTag: React.FC = () => (
  <span
    className="rounded px-1 py-px text-[0.625rem]"
    style={{
      color: 'var(--color-risk-medium)',
      backgroundColor: 'color-mix(in oklab, var(--color-risk-medium) 14%, transparent)',
    }}
  >
    {t.dischargeFlow.forecastNeeds}
  </span>
)

const VitalCard: React.FC<{
  vital: VitalSpec
  draft: DischargeDraft
  context: DischargeContext
  required: boolean
  onChange: (primary: string, secondary?: string) => void
}> = ({ vital, draft, context, required, onChange }) => {
  const value = draft.vitals[vital.field] ?? ''
  const second = draft.vitalsSecondary[vital.field] ?? ''
  const known = context.vitals[vital.field]
  const source = provenance(
    value,
    known,
    vital.secondaryLabel ? { value: second, known: known?.secondary ?? '' } : undefined,
  )
  const missing = required && (!num(value) || (vital.secondaryLabel && !num(second)))
  const id = `field-${vital.field}`

  return (
    <div
      className="rounded-lg border bg-surface p-3 transition-colors"
      style={{
        borderColor: missing ? 'var(--color-risk-medium)' : 'var(--color-border)',
        backgroundColor: missing ? 'color-mix(in oklab, var(--color-risk-medium) 5%, white)' : undefined,
      }}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <label htmlFor={id} className="text-[0.75rem] text-ink-muted">{vital.label}</label>
        {missing && <RequiredTag />}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          placeholder="—"
          className={`${VALUE_INPUT} ${vital.secondaryLabel ? 'max-w-[4.5rem]' : 'max-w-[6rem]'}`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        {vital.secondaryLabel && (
          <>
            <span className="text-lg text-ink-muted">/</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="—"
              aria-label={`${vital.label}: ${vital.secondaryLabel}`}
              className={`${VALUE_INPUT} max-w-[4.5rem]`}
              value={second}
              onChange={(event) => onChange(value, event.target.value)}
            />
          </>
        )}
        <span className="shrink-0 text-[0.75rem] text-ink-muted">{vital.unit}</span>
      </div>
      <div className="mt-1.5">
        <Provenance {...source} />
      </div>
    </div>
  )
}

export const VitalsGrid: React.FC<{
  draft: DischargeDraft
  context: DischargeContext
  requiredFields: Set<string>
  onChange: (field: string, primary: string, secondary?: string) => void
}> = ({ draft, context, requiredFields, onChange }) => (
  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
    {VITALS.map((vital) => (
      <VitalCard
        key={vital.field}
        vital={vital}
        draft={draft}
        context={context}
        required={requiredFields.has(vital.field)}
        onChange={(primary, secondary) => onChange(vital.field, primary, secondary)}
      />
    ))}
  </div>
)

const LabRow: React.FC<{
  lab: LabSpec
  value: string
  known: { value: string; at: string } | undefined
  required: boolean
  onChange: (value: string) => void
}> = ({ lab, value, known, required, onChange }) => {
  const source = provenance(value, known)
  const missing = required && !num(value)
  const quiet = !required && !num(value)
  const id = `field-${lab.field}`
  const numeric = Number(num(value))
  const outOfRange =
    num(value) !== '' && Number.isFinite(numeric) &&
    ((lab.low !== undefined && numeric < lab.low) || (lab.high !== undefined && numeric > lab.high))

  return (
    <li
      className={`grid grid-cols-[minmax(0,1fr)_7rem] items-center gap-x-3 gap-y-1 px-3 py-2.5 sm:grid-cols-[minmax(0,12rem)_7rem_minmax(0,1fr)] ${
        quiet ? 'opacity-60 focus-within:opacity-100 hover:opacity-100' : ''
      }`}
      style={missing ? { backgroundColor: 'color-mix(in oklab, var(--color-risk-medium) 6%, transparent)' } : undefined}
    >
      <div className="min-w-0">
        <label htmlFor={id} className="text-[0.8125rem]">{lab.label}</label>
        <div className="flex flex-wrap items-center gap-1.5">
          {missing && <RequiredTag />}
          {quiet && <span className="text-[0.625rem] text-ink-muted">{t.dischargeFlow.labsOptional}</span>}
        </div>
      </div>
      <div className="flex items-baseline gap-1">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          placeholder="—"
          className="tabular w-full min-w-0 rounded-md border border-border bg-surface px-2 py-1 text-[0.875rem] font-medium outline-none focus-visible:border-primary"
          style={outOfRange ? { color: 'var(--color-risk-high)' } : undefined}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <span className="shrink-0 text-[0.6875rem] text-ink-muted">{lab.unit}</span>
      </div>
      <div className="col-span-2 sm:col-span-1">
        <Provenance {...source} />
        {lab.low !== undefined && lab.high !== undefined && (
          <span className="tabular ml-2 text-[0.625rem] text-ink-muted">
            {lab.low}–{lab.high}
          </span>
        )}
      </div>
    </li>
  )
}

/**
 * Показываем то, что есть в карте или нужно прогнозу. Пустые необязательные
 * анализы спрятаны и приглушены: это не ошибка, а просто отсутствие данных.
 */
export const LabResults: React.FC<{
  draft: DischargeDraft
  context: DischargeContext
  requiredFields: Set<string>
  onChange: (field: string, value: string) => void
}> = ({ draft, context, requiredFields, onChange }) => {
  const f = t.dischargeFlow
  const [showAll, setShowAll] = useState(false)

  const relevant = (lab: LabSpec) =>
    Boolean(context.labs[lab.field]) || requiredFields.has(lab.field) || Boolean(num(draft.labs[lab.field]))
  const visible = showAll ? LABS : LABS.filter(relevant)
  const hidden = LABS.length - LABS.filter(relevant).length

  return (
    <div>
      <p className="mb-2 text-[0.75rem] text-ink-muted">{f.labsTitle}</p>
      {visible.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {visible.map((lab) => (
            <LabRow
              key={lab.field}
              lab={lab}
              value={draft.labs[lab.field] ?? ''}
              known={context.labs[lab.field]}
              required={requiredFields.has(lab.field)}
              onChange={(value) => onChange(lab.field, value)}
            />
          ))}
        </ul>
      )}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setShowAll((value) => !value)}
          className="mt-2 rounded-md border border-dashed border-border px-3 py-2 text-xs text-ink-muted transition-colors hover:border-primary hover:text-primary"
        >
          {showAll ? f.labsLess : `+ ${f.labsMore} (${hidden})`}
        </button>
      )}
    </div>
  )
}
