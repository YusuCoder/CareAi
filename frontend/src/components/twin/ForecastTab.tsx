import { useEffect, useState } from 'react'

import { ProfileForm } from './ProfileForm'
import { ProjectionChart } from './ProjectionChart'
import { ComparePanel } from './ComparePanel'
import { MAX_COMPARE, useDrugCheck, type DrugCheckResult, type FindingLevel } from '../../lib/drugCheck'
import { useSimulation, type Marker, type Trajectory } from '../../lib/simulation'
import { decimal } from '../../lib/format'
import { t } from '../../lib/i18n'
import type { TwinData } from '../../lib/twin'

const Card: React.FC<{ title?: string; children: React.ReactNode; className?: string }> = ({
  title, children, className = '',
}) => (
  <section className={`rounded-xl border border-border bg-surface p-4 ${className}`}>
    {title && <h3 className="text-[0.9375rem] font-semibold">{title}</h3>}
    {children}
  </section>
)

/** The variables feeding the model, with gaps shown rather than filled. */
const ProfileCard: React.FC<{ data: ReturnType<typeof useSimulation>['data'] }> = ({ data }) => {
  if (!data) return null
  const { inputs, missing } = data

  const rows: [string, string][] = [
    ['Возраст', inputs.age_years ? `${inputs.age_years}` : '—'],
    [t.forecast.fields.height_cm, inputs.height_cm ? `${decimal(inputs.height_cm, 0)} см` : '—'],
    [t.forecast.fields.weight_kg, inputs.weight_kg ? `${decimal(inputs.weight_kg)} кг` : '—'],
    ['ИМТ', inputs.bmi ? decimal(inputs.bmi) : '—'],
    [t.forecast.fields.systolic, inputs.systolic ? `${decimal(inputs.systolic, 0)} мм рт. ст.` : '—'],
    [t.forecast.fields.hba1c, inputs.hba1c ? `${decimal(inputs.hba1c)} %` : '—'],
    [t.forecast.fields.total_cholesterol, inputs.total_cholesterol ? `${decimal(inputs.total_cholesterol)} ммоль/л` : '—'],
    [t.forecast.fields.hdl, inputs.hdl ? `${decimal(inputs.hdl)} ммоль/л` : '—'],
    [t.forecast.fields.creatinine, inputs.creatinine ? `${decimal(inputs.creatinine, 0)} мкмоль/л` : '—'],
    [t.forecast.fields.smoking_status, t.forecast.smoking[inputs.smoking]],
  ]

  return (
    <Card title={t.forecast.profile}>
      <p className="mt-1 text-[0.75rem] text-ink-muted">{t.forecast.profileNote}</p>

      <dl className="mt-2.5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3 border-b border-border py-1.5 last:border-b-0">
            <dt className="text-[0.75rem] text-ink-muted">{label}</dt>
            <dd className="tabular text-[0.8125rem] font-medium">{value}</dd>
          </div>
        ))}
      </dl>

      {missing.length > 0 && (
        <div
          className="mt-3 rounded-lg px-3 py-2.5"
          style={{ backgroundColor: 'color-mix(in oklab, var(--color-risk-medium) 10%, transparent)' }}
        >
          <p className="text-[0.8125rem] font-medium" style={{ color: 'var(--color-risk-medium)' }}>
            {t.forecast.refused}
          </p>
          <p className="mt-0.5 text-[0.75rem] leading-snug text-ink-muted">{t.forecast.refusedBody}</p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {missing.map((field) => (
              <li
                key={field}
                className="rounded border border-border px-1.5 py-0.5 text-[0.6875rem] text-ink-muted"
              >
                {t.forecast.fields[field as keyof typeof t.forecast.fields] ?? field}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* What the family history and genetics actually contributed, with the
          record entry that produced each one. */}
      {data.factors && data.factors.length > 0 && (
        <>
          <p className="mt-3 text-[0.75rem] font-medium text-ink-muted">{t.forecast.factorsTitle}</p>
          <ul className="mt-1 space-y-1">
            {data.factors.map((factor) => (
              <li key={factor.source} className="text-[0.75rem]">
                <span className="font-medium">{factor.label}</span>
                <span className="text-ink-muted"> — {factor.source}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  )
}

export const ForecastTab: React.FC<{ data: TwinData }> = ({ data }) => {
  const patientId = data.patient?.id
  const { data: result, loading, error, run } = useSimulation(patientId)
  const [choice, setChoice] = useState<string>('')
  const [editing, setEditing] = useState<boolean>(false)
  const drugCheck = useDrugCheck(patientId)
  const [drug, setDrug] = useState<string>('')
  // Кандидаты на сравнение; то, что ещё набирается в поле, тоже участвует.
  const [drugs, setDrugs] = useState<string[]>([])
  // Правая колонка показывает результат последнего действия врача.
  const [view, setView] = useState<'ai' | 'preset'>('preset')

  // Регистр не различаем: «Метформин» и «метформин» — один кандидат.
  const unique = (list: string[]) => list.filter((name, index) =>
    list.findIndex((other) => other.toLowerCase() === name.toLowerCase()) === index)
  const candidates = unique([...drugs, drug.trim()].filter(Boolean)).slice(0, MAX_COMPARE)
  const addDrug = () => {
    const name = drug.trim()
    if (!name) return
    setDrugs((list) => unique([...list, name]).slice(0, MAX_COMPARE))
    setDrug('')
  }

  // First load lists what is applicable; no numbers yet.
  useEffect(() => {
    void run()
  }, [run])

  const blocked = result?.blocked ?? false
  const risk = result?.risk

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)]">
      <div className="space-y-4">
        <ProfileCard data={result} />

        {result && patientId && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="w-full rounded-lg border border-primary/30 px-3 py-2 text-[0.8125rem] font-medium text-primary transition-colors hover:bg-primary-soft"
          >
            {t.forecast.fill}
          </button>
        )}

        {result && patientId && editing && (
          <ProfileForm
            patientId={patientId}
            inputs={result.inputs}
            missing={result.missing}
            onSaved={() => {
              void run(choice || undefined)
              if (view === 'ai' && drugCheck.data) void drugCheck.check([drugCheck.data.drug.query])
              if (view === 'ai' && drugCheck.comparison) {
                void drugCheck.check(drugCheck.comparison.results.map((item) => item.drug.query))
              }
            }}
            onClose={() => setEditing(false)}
          />
        )}

        <Card title={t.forecast.ai.title}>
          <p className="mt-1 text-[0.75rem] leading-snug text-ink-muted">{t.forecast.ai.hint}</p>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              if (candidates.length === 0) return
              setView('ai')
              void drugCheck.check(candidates)
            }}
          >
            {drugs.length > 0 && (
              <ul className="mt-2.5 flex flex-wrap gap-1.5">
                {drugs.map((name) => (
                  <li key={name} className="flex items-center gap-1 rounded-full border border-primary/30 bg-primary-soft/40 py-0.5 pl-2.5 pr-1 text-[0.8125rem]">
                    {name}
                    <button
                      type="button"
                      onClick={() => setDrugs((list) => list.filter((one) => one !== name))}
                      aria-label={`${t.forecast.compare.remove} ${name}`}
                      className="rounded-full px-1.5 text-ink-muted hover:text-ink"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2.5 flex gap-2">
              <input
                value={drug}
                onChange={(event) => setDrug(event.target.value)}
                maxLength={120}
                placeholder={drugs.length ? t.forecast.compare.placeholderMore : t.forecast.ai.placeholder}
                className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-[0.8125rem]"
              />
              <button
                type="button"
                onClick={addDrug}
                disabled={!drug.trim() || drugs.length >= MAX_COMPARE}
                title={t.forecast.compare.addHint}
                className="rounded-lg border border-primary/30 px-3 py-2 text-[0.8125rem] font-medium text-primary transition-colors hover:bg-primary-soft disabled:opacity-40"
              >
                + {t.forecast.compare.add}
              </button>
            </div>
            <p className="mt-1 text-[0.6875rem] text-ink-muted">{t.forecast.compare.hint}</p>
            <button
              type="submit"
              disabled={candidates.length === 0 || drugCheck.loading || !patientId}
              className="mt-2.5 w-full rounded-lg bg-primary px-3 py-2 text-[0.8125rem] font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
            >
              {drugCheck.loading
                ? (candidates.length > 1 ? t.forecast.compare.comparing : t.forecast.ai.checking)
                : candidates.length > 1
                  ? `${t.forecast.compare.run} (${candidates.length})`
                  : t.forecast.ai.check}
            </button>
          </form>
        </Card>

        <Card title={t.forecast.ai.presets}>
          {error && (
            <p className="mt-2 border-l-2 border-risk-critical pl-2 text-[0.8125rem] text-risk-critical">
              {error}
            </p>
          )}

          {result && result.available.length === 0 && (
            <p className="mt-2 text-[0.8125rem] text-ink-muted">{t.forecast.noOptions}</p>
          )}

          {result && result.available.length > 0 && (
            <>
              <select
                value={choice}
                onChange={(event) => setChoice(event.target.value)}
                className="mt-2.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-[0.8125rem]"
              >
                <option value="">{t.forecast.choose}</option>
                {result.available.map((one) => (
                  <option key={one.id} value={one.id}>
                    {one.label} — {one.drugClass}
                  </option>
                ))}
              </select>

              <button
                type="button"
                disabled={!choice || loading}
                onClick={() => {
                  setView('preset')
                  void run(choice)
                }}
                className="mt-2.5 w-full rounded-lg bg-primary px-3 py-2 text-[0.8125rem] font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
              >
                {loading ? t.forecast.calculating : t.forecast.calculate}
              </button>
            </>
          )}
        </Card>

        {view === 'preset' && result?.warnings && (
          <Card title={t.forecast.checks}>
            {result.warnings.length === 0 && (
              <p className="mt-2 text-[0.8125rem] text-ink-muted">{t.forecast.noChecks}</p>
            )}
            <ul className="mt-2 space-y-1.5">
              {result.warnings.map((warning) => (
                <li
                  key={warning.text}
                  className="rounded-md px-2.5 py-1.5 text-[0.8125rem]"
                  style={{
                    color: warning.level === 'BLOCK' ? 'var(--color-risk-critical)' : 'var(--color-risk-medium)',
                    backgroundColor: `color-mix(in oklab, ${
                      warning.level === 'BLOCK' ? 'var(--color-risk-critical)' : 'var(--color-risk-medium)'
                    } 10%, transparent)`,
                  }}
                >
                  {warning.text}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      {view === 'ai' ? (
        drugCheck.comparison && !drugCheck.error ? (
          <ComparePanel data={drugCheck.comparison} loading={drugCheck.loading} />
        ) : (
          <DrugCheckPanel
            data={drugCheck.data}
            loading={drugCheck.loading}
            error={drugCheck.error}
          />
        )
      ) : (
        <div className="space-y-4">
          {blocked && (
            <Card className="border-risk-critical/40">
              <p className="font-semibold" style={{ color: 'var(--color-risk-critical)' }}>
                {t.forecast.blocked}
              </p>
            </Card>
          )}

          {risk && (
            <RiskCard
              risk={risk}
              note={result?.intervention
                ? `${result.intervention.label} · ${result.intervention.riskNote} (×${result.intervention.riskRatio})`
                : undefined}
            />
          )}

          {result?.trajectories?.map((trajectory) => (
            <TrajectoryCard key={trajectory.marker} trajectory={trajectory} />
          ))}

          {result?.coefficients && <Parameters result={result} />}

          {result?.disclaimer && (
            <p className="text-[0.75rem] leading-relaxed text-ink-muted">{result.disclaimer}</p>
          )}
        </div>
      )}
    </div>
  )
}

const RiskCard: React.FC<{
  risk: { baseline: number; treated: number; absoluteReduction: number }
  note?: string
}> = ({ risk, note }) => (
  <Card title={t.forecast.risk}>
    <div className="mt-3 grid grid-cols-3 gap-3">
      <div className="rounded-lg border border-border px-3 py-2.5">
        <p className="tabular text-2xl font-semibold">{decimal(risk.baseline)}%</p>
        <p className="mt-0.5 text-[0.75rem] text-ink-muted">{t.forecast.baseline}</p>
      </div>
      <div className="rounded-lg border border-primary/30 bg-primary-soft/40 px-3 py-2.5">
        <p className="tabular text-2xl font-semibold text-primary">{decimal(risk.treated)}%</p>
        <p className="mt-0.5 text-[0.75rem] text-ink-muted">{t.forecast.treated}</p>
      </div>
      <div className="rounded-lg border border-border px-3 py-2.5">
        <p className="tabular text-2xl font-semibold" style={{ color: 'var(--color-risk-low)' }}>
          −{decimal(risk.absoluteReduction)}
        </p>
        <p className="mt-0.5 text-[0.75rem] text-ink-muted">{t.forecast.reduction}</p>
      </div>
    </div>

    {note && <p className="mt-2.5 text-[0.75rem] text-ink-muted">{note}</p>}
  </Card>
)

const TrajectoryCard: React.FC<{ trajectory: Trajectory }> = ({ trajectory }) => (
  <Card title={`${t.forecast.trajectory}: ${t.forecast.markers[trajectory.marker as Marker]}`}>
    <div className="mt-1 flex flex-wrap gap-4 text-[0.75rem] text-ink-muted">
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="inline-block h-0 w-5 border-t-2 border-dashed border-ink-muted" />
        {t.forecast.baseline}
      </span>
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="inline-block h-0 w-5 border-t-2 border-primary" />
        {t.forecast.treated}
      </span>
      <span className="ml-auto">
        {trajectory.effect.note}: {decimal(trajectory.effect.delta)} {trajectory.effect.unit}
      </span>
    </div>
    <div className="mt-1.5">
      <ProjectionChart
        baseline={trajectory.baseline}
        treated={trajectory.treated}
        unit={trajectory.unit}
      />
    </div>
  </Card>
)

const LEVEL_COLOR: Record<FindingLevel, string> = {
  BLOCK: 'var(--color-risk-critical)',
  WARN: 'var(--color-risk-medium)',
  INFO: 'var(--color-ink-muted)',
}

const VERDICT_COLOR: Record<DrugCheckResult['verdict'], string> = {
  BLOCK: 'var(--color-risk-critical)',
  CAUTION: 'var(--color-risk-medium)',
  NO_FINDINGS: 'var(--color-risk-low)',
  UNKNOWN: 'var(--color-ink-muted)',
}

const tint = (color: string, amount = 10) => `color-mix(in oklab, ${color} ${amount}%, transparent)`

/** Результат ИИ-проверки: вердикт кода, находки со ссылками на записи и прогноз по классу. */
const DrugCheckPanel: React.FC<{
  data: DrugCheckResult | null
  loading: boolean
  error: ReturnType<typeof useDrugCheck>['error']
}> = ({ data, loading, error }) => {
  if (error) {
    return (
      <Card>
        <p className="border-l-2 border-risk-critical pl-2 text-[0.8125rem] text-risk-critical">
          {t.forecast.ai.errors[error]}
        </p>
      </Card>
    )
  }

  if (!data) {
    return loading ? (
      <Card>
        <p className="text-[0.8125rem] text-ink-muted">{t.forecast.ai.checking}</p>
      </Card>
    ) : null
  }

  const verdictColor = VERDICT_COLOR[data.verdict]

  return (
    <div className={`space-y-4 ${loading ? 'opacity-60' : ''}`}>
      <section
        className="rounded-xl border p-4"
        style={{ borderColor: tint(verdictColor, 45), backgroundColor: tint(verdictColor, 8) }}
      >
        <p className="text-[0.75rem] text-ink-muted">
          {data.drug.inn}
          {data.drug.class_label && ` · ${data.drug.class_label}`}
        </p>
        <p className="mt-0.5 font-semibold" style={{ color: verdictColor }}>
          {t.forecast.ai.verdicts[data.verdict]}
        </p>
        {data.summary && <p className="mt-2 text-[0.8125rem] leading-relaxed">{data.summary}</p>}
      </section>

      {data.drug.recognized && (
        <Card title={t.forecast.ai.findings}>
          {data.findings.length === 0 && (
            <p className="mt-2 text-[0.8125rem] text-ink-muted">{t.forecast.ai.noFindings}</p>
          )}
          <ul className="mt-2 space-y-2">
            {data.findings.map((finding, index) => (
              <li
                key={`${finding.category}-${index}`}
                className="rounded-md px-2.5 py-2"
                style={{ backgroundColor: tint(LEVEL_COLOR[finding.level]) }}
              >
                <div className="flex flex-wrap items-center gap-1.5 text-[0.6875rem]">
                  <span className="font-semibold uppercase" style={{ color: LEVEL_COLOR[finding.level] }}>
                    {t.forecast.ai.levels[finding.level]}
                  </span>
                  <span className="text-ink-muted">· {t.forecast.ai.categories[finding.category]}</span>
                  <span className="ml-auto text-ink-muted">
                    {finding.source === 'RULE' ? t.forecast.ai.rule : t.forecast.ai.aiSource}
                  </span>
                </div>
                <p className="mt-0.5 text-[0.8125rem]">{finding.text}</p>
                {finding.evidence.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {finding.evidence.map((item) => (
                      <li key={item.id} className="text-[0.6875rem] text-ink-muted">
                        <span className="tabular rounded border border-border px-1">{item.id}</span> {item.text}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>

          {data.monitoring.length > 0 && (
            <>
              <p className="mt-3 text-[0.75rem] font-medium text-ink-muted">{t.forecast.ai.monitoring}</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[0.8125rem]">
                {data.monitoring.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </>
          )}
        </Card>
      )}

      {data.forecast_reason === 'NOT_MODELED' && (
        <p className="text-[0.75rem] text-ink-muted">{t.forecast.ai.forecastNotModeled}</p>
      )}
      {data.forecast_reason === 'MISSING_DATA' && (
        <p className="text-[0.75rem]" style={{ color: 'var(--color-risk-medium)' }}>{t.forecast.ai.forecastMissing}</p>
      )}

      {data.forecast && (
        <>
          <RiskCard
            risk={data.forecast.risk}
            note={`${data.drug.class_label} · ${data.forecast.riskNote} (×${data.forecast.riskRatio})`}
          />
          {data.forecast.trajectories.map((trajectory) => (
            <TrajectoryCard key={trajectory.marker} trajectory={trajectory} />
          ))}
        </>
      )}

      <p className="text-[0.75rem] leading-relaxed text-ink-muted">
        {t.forecast.ai.used}: {data.used.records} · {data.model}. {data.disclaimer}
      </p>
    </div>
  )
}

/** Every constant the projection used, so nothing on this screen is a black box. */
const Parameters: React.FC<{ result: NonNullable<ReturnType<typeof useSimulation>['data']> }> = ({ result }) => {
  const [open, setOpen] = useState(false)

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="text-[0.8125rem] font-medium text-primary"
      >
        {open ? t.forecast.hideParams : t.forecast.showParams}
      </button>

      {open && (
        <>
          <table className="mt-3 w-full text-[0.75rem]">
            <thead>
              <tr className="text-left text-ink-muted">
                <th className="pb-1 font-medium">{t.forecast.coefficient}</th>
                <th className="pb-1 text-right font-medium">{t.forecast.value}</th>
              </tr>
            </thead>
            <tbody>
              {result.coefficients?.map((coefficient) => (
                <tr key={coefficient.id} className="border-t border-border">
                  <td className="py-1">
                    {coefficient.label}
                    {coefficient.note && <span className="text-ink-muted"> — {coefficient.note}</span>}
                  </td>
                  <td className="tabular py-1 text-right">{coefficient.value}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {result.drift && (
            <>
              <p className="mt-3 text-[0.75rem] font-medium">{t.forecast.drift}</p>
              <ul className="mt-1 space-y-0.5 text-[0.75rem] text-ink-muted">
                {Object.entries(result.drift).map(([marker, value]) => (
                  <li key={marker} className="tabular">
                    {t.forecast.markers[marker as Marker]}: {value > 0 ? '+' : ''}{value} {t.forecast.perYear}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </Card>
  )
}
