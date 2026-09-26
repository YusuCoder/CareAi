import { dateShort } from '../../lib/format'
import { t, visitKindLabel } from '../../lib/i18n'
import { newKey, type DischargeDraft, type VisitDraft } from '../../lib/discharge'
import type { DischargeAiDraft } from '../../lib/dischargeAi'
import type { SectionReview } from '../../lib/dischargeReview'
import type { VisitKind } from '../../lib/database.types'
import { AddButton, AiBadge, CompletionIndicator, FieldLabel, GhostButton, INPUT, ReviewBadge, Sparkle } from './ui'

const kindIcon: Record<VisitKind, string> = { HOME: '🏠', CLINIC: '🏥', CALL: '☎' }

const addDays = (isoDate: string, days: number): string | null => {
  const base = new Date(`${isoDate}T00:00:00`)
  if (Number.isNaN(base.getTime()) || !Number.isFinite(days)) return null
  base.setDate(base.getDate() + days)
  return base.toISOString()
}

const FlowNode: React.FC<{ label: string; sub?: string | null; accent?: boolean; delay: number }> = ({
  label, sub, accent, delay,
}) => (
  <li className="handoff-in min-w-0 flex-1" style={{ animationDelay: `${delay}ms` }}>
    <div
      className={`h-full rounded-lg border px-3 py-2 ${accent ? 'border-primary/30 bg-primary-soft' : 'border-border bg-surface'}`}
    >
      <p className={`flex items-center gap-1 text-[0.8125rem] font-medium ${accent ? 'text-primary' : ''}`}>
        {accent && <Sparkle size={12} />}
        {label}
      </p>
      {sub && <p className="mt-0.5 truncate text-[0.6875rem] text-ink-muted">{sub}</p>}
    </div>
  </li>
)

const Arrow: React.FC = () => (
  <li aria-hidden className="flex shrink-0 items-center justify-center text-ink-muted sm:px-0.5">
    <span className="rotate-90 sm:rotate-0">→</span>
  </li>
)

export const FollowUpTimeline: React.FC<{
  visits: VisitDraft[]
  startDate: string
  onChange: (visits: VisitDraft[]) => void
}> = ({ visits, startDate, onChange }) => {
  const f = t.dischargeFlow
  const update = (key: string, patch: Partial<VisitDraft>) =>
    onChange(visits.map((visit) => (visit.key === key ? { ...visit, ...patch } : visit)))

  // порядок в массиве не трогаем (ключи стабильны), сортируем только отображение
  const ordered = [...visits].sort((a, b) => a.day_offset - b.day_offset)

  return (
    <div>
      <ol className="relative space-y-2 before:absolute before:bottom-3 before:left-[1.1rem] before:top-3 before:w-px before:bg-border">
        {ordered.map((visit) => {
          const when = addDays(startDate, visit.day_offset)
          return (
            <li key={visit.key} className="relative flex gap-3">
              <span
                aria-hidden
                className="relative z-10 mt-2 flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-base"
              >
                {kindIcon[visit.kind]}
              </span>
              <div className="min-w-0 flex-1 rounded-lg border border-border bg-surface p-2.5">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="w-20">
                    <FieldLabel htmlFor={`visit-day-${visit.key}`}>{f.day}</FieldLabel>
                    <input
                      id={`visit-day-${visit.key}`}
                      type="number"
                      min={1}
                      className={`${INPUT} tabular font-semibold`}
                      value={visit.day_offset}
                      onChange={(event) => update(visit.key, { day_offset: Number(event.target.value) })}
                    />
                  </div>
                  <div className="w-44">
                    <FieldLabel htmlFor={`visit-kind-${visit.key}`}>Вид</FieldLabel>
                    <select
                      id={`visit-kind-${visit.key}`}
                      className={INPUT}
                      value={visit.kind}
                      onChange={(event) => update(visit.key, { kind: event.target.value as VisitKind })}
                    >
                      {Object.entries(visitKindLabel).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="min-w-[10rem] flex-1">
                    <FieldLabel htmlFor={`visit-title-${visit.key}`}>{t.discharge.visitTitle}</FieldLabel>
                    <input
                      id={`visit-title-${visit.key}`}
                      type="text"
                      className={INPUT}
                      value={visit.title}
                      onChange={(event) => update(visit.key, { title: event.target.value })}
                    />
                  </div>
                  <GhostButton
                    tone="danger"
                    aria-label={t.discharge.remove}
                    onClick={() => onChange(visits.filter((row) => row.key !== visit.key))}
                    className="mb-1"
                  >
                    ✕
                  </GhostButton>
                </div>
                {when && (
                  <p className="tabular mt-1.5 text-[0.6875rem] text-ink-muted">{dateShort(when)}</p>
                )}
              </div>
            </li>
          )
        })}
      </ol>
      <div className="mt-2 pl-12">
        <AddButton
          onClick={() =>
            onChange([...visits, { key: newKey(), day_offset: 30, kind: 'CLINIC', title: '' }])
          }
        >
          {t.discharge.addVisit}
        </AddButton>
      </div>
    </div>
  )
}

export interface PlanOrigin {
  /** График взят из предложения AI. */
  applied: boolean
  /** Врач правил график после применения предложения. */
  edited: boolean
  dismissed: boolean
}

export const ContinuityOfCare: React.FC<{
  draft: DischargeDraft
  set: <K extends keyof DischargeDraft>(key: K, value: DischargeDraft[K]) => void
  review: SectionReview
  hasClinic: boolean
  hospitalName: string | null
  clinicName: string | null
  clinicRegion: string | null
  aiPlan: DischargeAiDraft['follow_up'] | null
  planOrigin: PlanOrigin
  onApplyAiPlan: () => void
  onDismissAiPlan: () => void
}> = ({
  draft, set, review, hasClinic, hospitalName, clinicName, clinicRegion,
  aiPlan, planOrigin, onApplyAiPlan, onDismissAiPlan,
}) => {
  const f = t.dischargeFlow
  const d = t.discharge
  const startDate = draft.discharged_at.slice(0, 10)
  const showSuggestion =
    hasClinic && draft.followUp && aiPlan && aiPlan.visits.length > 0 && !planOrigin.applied && !planOrigin.dismissed

  return (
    <section id="section-followUp" className="continuity-card scroll-mt-4 rounded-2xl p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="inline-flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-primary">
            <Sparkle size={12} /> {f.continuity}
          </p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight">
            <span className="tabular text-ink-muted">5.</span> {f.continuityTitle}
          </h2>
        </div>
        <CompletionIndicator status={review.status} issues={review.issues.length} />
        <label className="flex cursor-pointer items-center gap-2 text-[0.8125rem]">
          <span className="text-ink-muted">{draft.followUp ? f.on : f.off}</span>
          <input
            type="checkbox"
            role="switch"
            className="peer sr-only"
            checked={draft.followUp}
            disabled={!hasClinic}
            onChange={(event) => set('followUp', event.target.checked)}
          />
          <span
            aria-hidden
            className="relative h-5 w-9 rounded-full bg-border-strong transition-colors peer-checked:bg-primary peer-disabled:opacity-50 peer-focus-visible:outline-2 peer-focus-visible:outline-primary after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-4"
          />
        </label>
      </div>

      {!hasClinic ? (
        <p
          className="mt-4 rounded-lg px-3 py-2.5 text-[0.8125rem]"
          style={{
            color: 'var(--color-risk-high)',
            backgroundColor: 'color-mix(in oklab, var(--color-risk-high) 10%, transparent)',
          }}
        >
          {d.noClinic}
        </p>
      ) : !draft.followUp ? (
        <p className="mt-4 text-[0.8125rem] text-ink-muted">{d.followUpOff}</p>
      ) : (
        <>
          <p className="mt-4 text-[0.8125rem] text-ink-muted">{f.continuityLead}:</p>
          <ol className="mt-2 flex flex-col gap-1.5 sm:flex-row sm:items-stretch">
            <FlowNode label={hospitalName ?? f.flowHospital} sub={f.flowHospital} delay={0} />
            <Arrow />
            <FlowNode label={f.flowTwin} sub={f.twinActive} accent delay={120} />
            <Arrow />
            <FlowNode label={clinicName ?? t.common.dash} sub={clinicRegion} delay={240} />
            <Arrow />
            <FlowNode label={f.flowHome} sub={d.followUp} delay={360} />
          </ol>

          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <div>
              <p className="text-[0.75rem] text-ink-muted">{f.receiving}</p>
              <p className="mt-1 text-[0.9375rem] font-semibold">{clinicName ?? t.common.dash}</p>
              {clinicRegion && <p className="text-[0.75rem] text-ink-muted">{clinicRegion}</p>}
            </div>
            <div>
              <p className="text-[0.75rem] text-ink-muted">{f.period}</p>
              <div className="mt-1 flex items-center gap-2">
                <span className="tabular whitespace-nowrap text-[0.875rem] font-medium">{dateShort(`${startDate}T00:00:00`)}</span>
                <span className="text-ink-muted">→</span>
                <input
                  type="date"
                  aria-label={d.planEnd}
                  className={`${INPUT} tabular max-w-[10rem]`}
                  min={startDate}
                  value={draft.planEndDate}
                  onChange={(event) => set('planEndDate', event.target.value)}
                />
              </div>
            </div>
            <div>
              <FieldLabel htmlFor="plan-title">{d.planTitle}</FieldLabel>
              <input
                id="plan-title"
                type="text"
                className={INPUT}
                value={draft.planTitle}
                onChange={(event) => set('planTitle', event.target.value)}
              />
            </div>
          </div>

          {showSuggestion && aiPlan && (
            <div className="handoff-in mt-5 rounded-xl border border-primary/25 bg-primary-soft/50 p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <AiBadge>{f.aiPlanSuggestion}</AiBadge>
                <ReviewBadge kind="needsReview" />
              </div>
              {aiPlan.rationale && <p className="mt-2 text-[0.8125rem]">{aiPlan.rationale}</p>}
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {[...aiPlan.visits].sort((a, b) => a.day_offset - b.day_offset).map((visit) => (
                  <li
                    key={`${visit.day_offset}-${visit.kind}-${visit.title}`}
                    className="rounded-md border border-border bg-surface px-2 py-1 text-[0.75rem]"
                  >
                    <span className="tabular font-semibold">{f.day} {visit.day_offset}</span>{' '}
                    {kindIcon[visit.kind]} {visit.title || visitKindLabel[visit.kind]}
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={onApplyAiPlan}
                  className="rounded-md bg-primary px-3 py-1.5 text-[0.8125rem] font-medium text-white transition-colors hover:bg-primary-hover"
                >
                  {f.aiPlanApply}
                </button>
                <GhostButton onClick={onDismissAiPlan}>{f.aiPlanDismiss}</GhostButton>
              </div>
            </div>
          )}

          <div className="mt-5">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h3 className="text-[0.875rem] font-semibold">{f.plan}</h3>
              {planOrigin.applied && (
                <>
                  <AiBadge>{f.aiPlanApplied}</AiBadge>
                  <ReviewBadge kind={planOrigin.edited ? 'edited' : 'needsReview'} />
                </>
              )}
            </div>
            <FollowUpTimeline
              visits={draft.visits}
              startDate={startDate}
              onChange={(visits) => set('visits', visits)}
            />
          </div>

          <div className="mt-5">
            <FieldLabel htmlFor="plan-instructions">{d.planInstructions}</FieldLabel>
            <textarea
              id="plan-instructions"
              rows={3}
              className={INPUT}
              value={draft.planInstructions}
              onChange={(event) => set('planInstructions', event.target.value)}
            />
          </div>

          <div className="mt-5">
            <p className="text-[0.75rem] text-ink-muted">{f.tracked}</p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {f.trackedItems.map((item) => (
                <li key={item} className="rounded-full border border-border bg-surface px-2.5 py-1 text-[0.75rem]">
                  <span className="text-risk-low">✓</span> {item}
                </li>
              ))}
            </ul>
          </div>

          <p className="mt-5 flex items-center gap-2 border-t border-border pt-3 text-[0.8125rem] text-primary">
            <Sparkle size={14} /> {f.continuityFooter}
          </p>
        </>
      )}
    </section>
  )
}
