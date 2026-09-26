import { useState } from 'react'

import { dateShort } from '../../lib/format'
import { medicationFrequencyLabel, medicationRouteLabel, t } from '../../lib/i18n'
import type { MedicationDraft } from '../../lib/discharge'
import type { Medication, MedicationFrequency, MedicationRoute } from '../../lib/database.types'
import { FieldLabel, GhostButton, INPUT, Provenance } from './ui'

type Intent = 'continue' | 'new'

const intentTone: Record<Intent, string> = {
  continue: 'var(--color-phase-home)',
  new: 'var(--color-primary)',
}

const IntentChip: React.FC<{ intent: Intent }> = ({ intent }) => {
  const f = t.dischargeFlow
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[0.6875rem] font-medium"
      style={{
        color: intentTone[intent],
        backgroundColor: `color-mix(in oklab, ${intentTone[intent]} 12%, transparent)`,
      }}
    >
      {intent === 'continue' ? f.medsContinue : f.medsNew}
    </span>
  )
}

const CardShell: React.FC<{ intent: Intent; children: React.ReactNode }> = ({ intent, children }) => (
  <li
    className="rounded-lg border border-border bg-surface p-3"
    style={{ borderLeft: `3px solid ${intentTone[intent]}` }}
  >
    {children}
  </li>
)

/** Действующее назначение из карты: после выписки продолжается как есть. */
export const CurrentMedicationCard: React.FC<{ item: Medication }> = ({ item }) => (
  <CardShell intent="continue">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <p className="text-[0.875rem] font-semibold">{item.name}</p>
      <IntentChip intent="continue" />
    </div>
    <p className="tabular mt-1 text-[0.8125rem]">
      {[
        item.dose !== null ? `${item.dose} ${item.dose_unit ?? ''}`.trim() : null,
        item.frequency ? medicationFrequencyLabel[item.frequency] : null,
        item.route ? medicationRouteLabel[item.route] : null,
      ].filter(Boolean).join(' · ') || t.common.dash}
    </p>
    <div className="mt-2">
      <Provenance
        kind="twin"
        label={t.dischargeFlow.medsCurrentSource}
        when={item.start_date ? `с ${dateShort(item.start_date)}` : undefined}
      />
    </div>
  </CardShell>
)

/** Новое назначение на выписку: вносит только врач. */
export const NewMedicationCard: React.FC<{
  item: MedicationDraft
  onChange: (next: MedicationDraft) => void
  onRemove: () => void
}> = ({ item, onChange, onRemove }) => {
  const f = t.dischargeFlow
  const d = t.discharge
  const [editing, setEditing] = useState<boolean>(!item.name.trim())
  const patch = (fields: Partial<MedicationDraft>) => onChange({ ...item, ...fields })
  const idp = `med-${item.key}`

  if (!editing) {
    return (
      <CardShell intent="new">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="text-[0.875rem] font-semibold">{item.name}</p>
          <IntentChip intent="new" />
        </div>
        <p className="tabular mt-1 text-[0.8125rem]">
          {[
            item.dose ? `${item.dose} ${item.dose_unit}`.trim() : null,
            item.frequency ? medicationFrequencyLabel[item.frequency] : null,
            item.route ? medicationRouteLabel[item.route] : null,
            item.end_date ? `${d.until.toLowerCase()} ${dateShort(item.end_date)}` : null,
          ].filter(Boolean).join(' · ') || t.common.dash}
        </p>
        {item.instructions && <p className="mt-1 text-[0.75rem] text-ink-muted">{item.instructions}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Provenance kind="doctor" label={f.sourceDoctor} />
          <span className="ml-auto flex gap-1">
            <GhostButton tone="primary" onClick={() => setEditing(true)}>{f.change}</GhostButton>
            <GhostButton tone="danger" onClick={onRemove}>{d.remove}</GhostButton>
          </span>
        </div>
      </CardShell>
    )
  }

  return (
    <CardShell intent="new">
      <div className="grid gap-2 sm:grid-cols-6">
        <div className="sm:col-span-3">
          <FieldLabel htmlFor={`${idp}-name`}>{d.medName}</FieldLabel>
          <input id={`${idp}-name`} type="text" className={INPUT} value={item.name}
            onChange={(event) => patch({ name: event.target.value })} />
        </div>
        <div>
          <FieldLabel htmlFor={`${idp}-dose`}>{d.dose}</FieldLabel>
          <input id={`${idp}-dose`} type="text" inputMode="decimal" className={INPUT} value={item.dose}
            onChange={(event) => patch({ dose: event.target.value })} />
        </div>
        <div>
          <FieldLabel htmlFor={`${idp}-unit`}>{d.doseUnit}</FieldLabel>
          <input id={`${idp}-unit`} type="text" className={INPUT} placeholder="мг" value={item.dose_unit}
            onChange={(event) => patch({ dose_unit: event.target.value })} />
        </div>
        <div>
          <FieldLabel htmlFor={`${idp}-until`}>{d.until}</FieldLabel>
          <input id={`${idp}-until`} type="date" className={INPUT} value={item.end_date}
            onChange={(event) => patch({ end_date: event.target.value })} />
        </div>
        <div className="sm:col-span-3">
          <FieldLabel htmlFor={`${idp}-freq`}>{d.frequency}</FieldLabel>
          <select id={`${idp}-freq`} className={INPUT} value={item.frequency}
            onChange={(event) => patch({ frequency: event.target.value as MedicationFrequency | '' })}>
            <option value="">{t.common.dash}</option>
            {Object.entries(medicationFrequencyLabel).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-3">
          <FieldLabel htmlFor={`${idp}-route`}>{d.route}</FieldLabel>
          <select id={`${idp}-route`} className={INPUT} value={item.route}
            onChange={(event) => patch({ route: event.target.value as MedicationRoute | '' })}>
            <option value="">{t.common.dash}</option>
            {Object.entries(medicationRouteLabel).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-6">
          <FieldLabel htmlFor={`${idp}-instr`}>{f.instructions}</FieldLabel>
          <input id={`${idp}-instr`} type="text" className={INPUT} value={item.instructions}
            onChange={(event) => patch({ instructions: event.target.value })} />
        </div>
      </div>
      <div className="mt-2 flex justify-end gap-1">
        <GhostButton tone="danger" onClick={onRemove}>{d.remove}</GhostButton>
        <GhostButton tone="primary" onClick={() => setEditing(false)} disabled={!item.name.trim()}>
          {f.done}
        </GhostButton>
      </div>
    </CardShell>
  )
}
