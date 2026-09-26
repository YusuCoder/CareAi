import { t } from '../../lib/i18n'
import {
  QUESTIONS, QUESTION_LABEL, REQUIRED_QUESTIONS, THRESHOLD_META,
  type MonitoringDraft, type RuleQuestion,
} from '../../lib/checkInRules'
import { AddButton, AiBadge, FieldLabel, GhostButton, INPUT, ReviewBadge, Sparkle } from './ui'

export type RulesStatus = 'idle' | 'loading' | 'ready' | 'error'

interface Props {
  rules: MonitoringDraft
  status: RulesStatus
  startDate: string
  planEndDate: string
  /** Требования врача изменились после того, как правила были составлены. */
  stale: boolean
  hasRequirements: boolean
  onChange: (rules: MonitoringDraft) => void
  onAnalyze: () => void
}

const FREQUENCY = [1, 2, 3, 7]

/**
 * Правила самоконтроля в Telegram. CareTwin AI заполняет их по требованиям врача
 * сам, врач может поправить любое поле — тогда правила помечаются как изменённые
 * врачом и больше не перезаписываются автоматически.
 */
export const TelegramRules: React.FC<Props> = ({
  rules, status, startDate, planEndDate, stale, hasRequirements, onChange, onAnalyze,
}) => {
  const r = t.telegramRules
  const edit = (patch: Partial<MonitoringDraft>) => onChange({ ...rules, ...patch, source: 'DOCTOR' })

  const toggleQuestion = (question: RuleQuestion) =>
    edit({
      questions: rules.questions.includes(question)
        ? rules.questions.filter((q) => q !== question)
        : QUESTIONS.filter((q) => q === question || rules.questions.includes(q)),
    })

  const setThreshold = (code: string, field: 'medium' | 'high', value: string) => {
    const number = value.trim() === '' ? undefined : Number(value.replace(',', '.'))
    const current = rules.thresholds[code]
    edit({ thresholds: { ...rules.thresholds, [code]: { ...current, [field]: Number.isFinite(number) ? number : undefined } } })
  }

  const removeThreshold = (code: string) => {
    const next = { ...rules.thresholds }
    delete next[code]
    edit({ thresholds: next })
  }

  const personal = Object.entries(rules.thresholds)

  return (
    <div className="mt-5 rounded-xl border border-primary/25 bg-primary-soft/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[0.875rem] font-semibold">{r.title}</h3>
        {rules.source === 'AI' && <><AiBadge>{r.byAi}</AiBadge><ReviewBadge kind="needsReview" /></>}
        {rules.source === 'DOCTOR' && <ReviewBadge kind="edited" />}
        {rules.source === 'DEFAULT' && <span className="text-[0.75rem] text-ink-muted">{r.defaults}</span>}
        <button
          type="button"
          onClick={onAnalyze}
          disabled={status === 'loading' || !hasRequirements}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-primary/30 px-2.5 py-1 text-[0.75rem] text-primary hover:bg-primary/10 disabled:opacity-50"
        >
          <Sparkle size={12} /> {status === 'loading' ? r.analyzing : r.analyze}
        </button>
      </div>
      <p className="mt-1 text-[0.75rem] text-ink-muted">{hasRequirements ? r.lead : r.noRequirements}</p>

      {stale && status !== 'loading' && (
        <p className="mt-2 rounded-md px-2.5 py-1.5 text-[0.75rem]" style={{ color: 'var(--color-risk-medium)', backgroundColor: 'color-mix(in oklab, var(--color-risk-medium) 10%, transparent)' }}>
          {r.stale}
        </p>
      )}
      {status === 'error' && <p className="mt-2 text-[0.75rem] text-risk-critical">{r.failed}</p>}
      {rules.rationale && <p className="mt-2 text-[0.8125rem]">{rules.rationale}</p>}

      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div>
          <FieldLabel>{r.times}</FieldLabel>
          <div className="flex flex-wrap items-center gap-1.5">
            {rules.times.map((time, index) => (
              <span key={`${index}-${time}`} className="inline-flex items-center gap-1">
                <input
                  type="time"
                  aria-label={r.times}
                  className={`${INPUT} tabular w-[6.5rem]`}
                  value={time}
                  min="06:00"
                  max="23:00"
                  onChange={(event) => edit({ times: rules.times.map((value, i) => (i === index ? event.target.value : value)) })}
                />
                {rules.times.length > 1 && (
                  <GhostButton tone="danger" aria-label={t.discharge.remove}
                    onClick={() => edit({ times: rules.times.filter((_, i) => i !== index) })}>✕</GhostButton>
                )}
              </span>
            ))}
            {rules.times.length < 4 && (
              <AddButton onClick={() => edit({ times: [...rules.times, '20:00'] })}>{r.addTime}</AddButton>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <FieldLabel htmlFor="rules-frequency">{r.frequency}</FieldLabel>
            <select id="rules-frequency" className={INPUT} value={rules.every_n_days}
              onChange={(event) => edit({ every_n_days: Number(event.target.value) })}>
              {FREQUENCY.map((n) => <option key={n} value={n}>{r.everyN(n)}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel htmlFor="rules-end">{r.until}</FieldLabel>
            <input id="rules-end" type="date" className={`${INPUT} tabular`} min={startDate} max={planEndDate || undefined}
              value={rules.end_date || planEndDate} onChange={(event) => edit({ end_date: event.target.value })} />
          </div>
          <div>
            <FieldLabel htmlFor="rules-window">{r.window}</FieldLabel>
            <select id="rules-window" className={INPUT} value={rules.response_window_hours}
              onChange={(event) => edit({ response_window_hours: Number(event.target.value) })}>
              {[1, 2, 3, 4, 6, 8, 12].map((h) => <option key={h} value={h}>{h} ч</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <FieldLabel>{r.questions}</FieldLabel>
        <div className="flex flex-wrap gap-1.5">
          {QUESTIONS.map((question) => {
            const required = REQUIRED_QUESTIONS.includes(question)
            const on = required || rules.questions.includes(question)
            return (
              <label key={question}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.75rem] ${on ? 'border-primary/40 bg-surface text-ink' : 'border-border text-ink-muted'} ${required ? 'cursor-default opacity-80' : ''}`}
                title={required ? r.required : undefined}>
                <input type="checkbox" className="accent-[var(--color-primary)]" checked={on} disabled={required}
                  onChange={() => toggleQuestion(question)} />
                {QUESTION_LABEL[question]}
              </label>
            )
          })}
        </div>
      </div>

      <div className="mt-4">
        <FieldLabel>{r.thresholds}</FieldLabel>
        {personal.length === 0 ? (
          <p className="text-[0.75rem] text-ink-muted">{r.noThresholds}</p>
        ) : (
          <ul className="space-y-2">
            {personal.map(([code, value]) => {
              const meta = THRESHOLD_META[code]
              if (!meta) return null
              return (
                <li key={code} className="rounded-lg border border-border bg-surface p-2.5">
                  <div className="flex flex-wrap items-end gap-2">
                    <span className="min-w-[10rem] text-[0.8125rem] font-medium">{meta.label}</span>
                    <label className="text-[0.6875rem] text-ink-muted">
                      {r.medium}
                      <input type="number" step="0.1" className={`${INPUT} tabular w-24`} value={value.medium ?? ''}
                        onChange={(event) => setThreshold(code, 'medium', event.target.value)} />
                    </label>
                    <label className="text-[0.6875rem] text-ink-muted">
                      {r.high}
                      <input type="number" step="0.1" className={`${INPUT} tabular w-24`} value={value.high ?? ''}
                        onChange={(event) => setThreshold(code, 'high', event.target.value)} />
                    </label>
                    <span className="pb-2 text-[0.75rem] text-ink-muted">{meta.unit}</span>
                    <GhostButton tone="danger" className="mb-1 ml-auto" aria-label={t.discharge.remove}
                      onClick={() => removeThreshold(code)}>✕</GhostButton>
                  </div>
                  {value.quote && <p className="mt-1 text-[0.75rem] text-ink-muted">{r.quote}: «{value.quote}»</p>}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {rules.unsupported.length > 0 && (
        <div className="mt-3 text-[0.75rem]">
          <p className="font-medium">{r.unsupported}</p>
          <ul className="mt-0.5 list-disc pl-4 text-ink-muted">
            {rules.unsupported.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      )}
      {rules.rejected.length > 0 && (
        <details className="mt-2 text-[0.75rem] text-ink-muted">
          <summary className="cursor-pointer">{r.rejected} ({rules.rejected.length})</summary>
          <ul className="mt-1 list-disc pl-4">
            {rules.rejected.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </details>
      )}
    </div>
  )
}
