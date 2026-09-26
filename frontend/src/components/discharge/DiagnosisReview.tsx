import { useState } from 'react'

import { dateShort } from '../../lib/format'
import { diagnosisTypeLabel, procedureCategoryLabel, t } from '../../lib/i18n'
import { newKey, type DischargeContext, type DischargeDraft } from '../../lib/discharge'
import type { DiagnosisType, ProcedureCategory } from '../../lib/database.types'
import { AddButton, FieldLabel, GhostButton, INPUT, Provenance } from './ui'

type Setter = <K extends keyof DischargeDraft>(key: K, value: DischargeDraft[K]) => void

/**
 * Основной диагноз берётся из госпитализации или из диагноза, уже записанного
 * в карте. AI диагнозы не предлагает: здесь только то, что внёс врач.
 */
export const PrimaryDiagnosis: React.FC<{
  draft: DischargeDraft
  set: Setter
  context: DischargeContext
  admissionDiagnosis: string | null
  hospitalizationId: string
}> = ({ draft, set, context, admissionDiagnosis, hospitalizationId }) => {
  const f = t.dischargeFlow
  const value = draft.primary_diagnosis.trim()
  const [editing, setEditing] = useState<boolean>(!value)
  const match = context.diagnoses.find((item) => item.name.trim().toLowerCase() === value.toLowerCase())

  const source = !value
    ? null
    : match
      ? match.hospitalization_id === hospitalizationId
        ? { kind: 'twin' as const, label: f.sourceCurrent }
        : { kind: 'history' as const, label: f.sourceHistory }
      : value === (admissionDiagnosis ?? '').trim()
        ? { kind: 'twin' as const, label: f.sourceCurrent }
        : { kind: 'doctor' as const, label: f.sourceDoctor }

  const showEditor = editing || !value

  return (
    <div
      className="rounded-lg border p-3"
      style={{
        borderColor: value ? 'var(--color-border)' : 'var(--color-risk-medium)',
        backgroundColor: value ? 'var(--color-surface-sunken)' : 'color-mix(in oklab, var(--color-risk-medium) 5%, white)',
      }}
    >
      <div className="flex items-center gap-2">
        <label htmlFor="primary-diagnosis" className="text-[0.75rem] text-ink-muted">{f.primary}</label>
        {value && !showEditor && (
          <GhostButton tone="primary" className="ml-auto" onClick={() => setEditing(true)}>
            {f.change}
          </GhostButton>
        )}
      </div>

      {showEditor ? (
        <div className="mt-1 flex gap-2">
          <input
            id="primary-diagnosis"
            type="text"
            autoFocus={editing && Boolean(value)}
            className={INPUT}
            value={draft.primary_diagnosis}
            onChange={(event) => set('primary_diagnosis', event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && value) setEditing(false)
            }}
          />
          {value && (
            <GhostButton tone="primary" onClick={() => setEditing(false)}>{f.done}</GhostButton>
          )}
        </div>
      ) : (
        <p className="mt-0.5 text-[1rem] font-semibold">{draft.primary_diagnosis}</p>
      )}

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        {match?.code && (
          <span className="tabular text-[0.75rem] text-ink-muted">{f.icd}: {match.code}</span>
        )}
        {source && <Provenance kind={source.kind} label={source.label} />}
      </div>
    </div>
  )
}

export const TwinDiagnoses: React.FC<{
  draft: DischargeDraft
  set: Setter
  context: DischargeContext
  hospitalizationId: string
}> = ({ draft, set, context, hospitalizationId }) => {
  const f = t.dischargeFlow
  const d = t.discharge
  const primary = draft.primary_diagnosis.trim().toLowerCase()

  const updateRow = (index: number, patch: Partial<DischargeDraft['diagnoses'][number]>) => {
    const next = [...draft.diagnoses]
    next[index] = { ...next[index], ...patch }
    set('diagnoses', next)
  }

  return (
    <div className="space-y-3">
      {context.diagnoses.length > 0 && (
        <div>
          <p className="mb-1.5 text-[0.75rem] text-ink-muted">{f.twinDiagnoses}</p>
          <ul className="space-y-1.5">
            {context.diagnoses.map((item) => {
              const current = item.hospitalization_id === hospitalizationId
              return (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border bg-surface px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.8125rem] font-medium">
                      {item.name}
                      {item.code && <span className="tabular ml-2 text-[0.75rem] font-normal text-ink-muted">{item.code}</span>}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2">
                      <Provenance
                        kind={current ? 'twin' : 'history'}
                        label={current ? f.sourceCurrent : f.sourceHistory}
                        when={item.diagnosed_at ? dateShort(item.diagnosed_at) : undefined}
                      />
                      <span className="text-[0.6875rem] text-ink-muted">· {diagnosisTypeLabel[item.type]}</span>
                    </div>
                  </div>
                  {item.name.trim().toLowerCase() !== primary && (
                    <GhostButton tone="primary" onClick={() => set('primary_diagnosis', item.name)}>
                      {f.makePrimary}
                    </GhostButton>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {draft.diagnoses.length > 0 && (
        <div>
          <p className="mb-1.5 text-[0.75rem] text-ink-muted">{f.newDiagnoses}</p>
          <div className="space-y-2">
            {draft.diagnoses.map((item, index) => (
              <div key={item.key} className="flex flex-wrap items-end gap-2 rounded-md border border-dashed border-border p-2">
                <div className="min-w-[12rem] flex-1">
                  <FieldLabel htmlFor={`dx-name-${item.key}`}>{d.diagnosisName}</FieldLabel>
                  <input id={`dx-name-${item.key}`} type="text" className={INPUT} value={item.name}
                    onChange={(event) => updateRow(index, { name: event.target.value })} />
                </div>
                <div className="w-28">
                  <FieldLabel htmlFor={`dx-code-${item.key}`}>{d.diagnosisCode}</FieldLabel>
                  <input id={`dx-code-${item.key}`} type="text" className={INPUT} placeholder="I50.0" value={item.code}
                    onChange={(event) => updateRow(index, { code: event.target.value })} />
                </div>
                <div className="w-40">
                  <FieldLabel htmlFor={`dx-type-${item.key}`}>Тип</FieldLabel>
                  <select id={`dx-type-${item.key}`} className={INPUT} value={item.type}
                    onChange={(event) => updateRow(index, { type: event.target.value as DiagnosisType })}>
                    {Object.entries(diagnosisTypeLabel).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
                <GhostButton
                  tone="danger"
                  aria-label={d.remove}
                  className="mb-1"
                  onClick={() => set('diagnoses', draft.diagnoses.filter((row) => row.key !== item.key))}
                >
                  ✕
                </GhostButton>
              </div>
            ))}
          </div>
        </div>
      )}

      <AddButton
        onClick={() =>
          set('diagnoses', [...draft.diagnoses, { key: newKey(), name: '', code: '', type: 'SECONDARY' }])
        }
      >
        {context.diagnoses.length ? d.addNew : d.add}
      </AddButton>
    </div>
  )
}

export const ProceduresReview: React.FC<{
  draft: DischargeDraft
  set: Setter
  context: DischargeContext
}> = ({ draft, set, context }) => {
  const f = t.dischargeFlow
  const d = t.discharge

  const updateRow = (index: number, patch: Partial<DischargeDraft['procedures'][number]>) => {
    const next = [...draft.procedures]
    next[index] = { ...next[index], ...patch }
    set('procedures', next)
  }

  return (
    <div>
      <p className="mb-1.5 text-[0.75rem] text-ink-muted">{f.proceduresTitle}</p>
      {context.procedures.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {context.procedures.map((item) => (
            <li key={item.id} className="flex flex-wrap items-baseline gap-x-2 rounded-md bg-surface-sunken px-3 py-1.5 text-[0.8125rem]">
              <span>{item.name}</span>
              <span className="text-[0.6875rem] text-ink-muted">
                · {procedureCategoryLabel[item.category]} · {dateShort(item.performed_at)}
                {item.outcome ? ` · ${item.outcome}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}

      {draft.procedures.length > 0 && (
        <div className="mb-2 space-y-2">
          {draft.procedures.map((item, index) => (
            <div key={item.key} className="flex flex-wrap items-end gap-2 rounded-md border border-dashed border-border p-2">
              <div className="min-w-[12rem] flex-1">
                <FieldLabel htmlFor={`pr-name-${item.key}`}>{d.procedureName}</FieldLabel>
                <input id={`pr-name-${item.key}`} type="text" className={INPUT} value={item.name}
                  onChange={(event) => updateRow(index, { name: event.target.value })} />
              </div>
              <div className="w-40">
                <FieldLabel htmlFor={`pr-cat-${item.key}`}>Категория</FieldLabel>
                <select id={`pr-cat-${item.key}`} className={INPUT} value={item.category}
                  onChange={(event) => updateRow(index, { category: event.target.value as ProcedureCategory })}>
                  {Object.entries(procedureCategoryLabel).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="min-w-[10rem] flex-1">
                <FieldLabel htmlFor={`pr-out-${item.key}`}>{d.procedureOutcome}</FieldLabel>
                <input id={`pr-out-${item.key}`} type="text" className={INPUT} value={item.outcome}
                  onChange={(event) => updateRow(index, { outcome: event.target.value })} />
              </div>
              <GhostButton
                tone="danger"
                aria-label={d.remove}
                className="mb-1"
                onClick={() => set('procedures', draft.procedures.filter((row) => row.key !== item.key))}
              >
                ✕
              </GhostButton>
            </div>
          ))}
        </div>
      )}

      <AddButton
        onClick={() =>
          set('procedures', [...draft.procedures, { key: newKey(), name: '', category: 'OTHER', outcome: '' }])
        }
      >
        {context.procedures.length ? d.addNew : d.add}
      </AddButton>
    </div>
  )
}
