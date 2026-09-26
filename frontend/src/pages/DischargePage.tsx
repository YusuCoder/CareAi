import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { DashboardLayout } from '../components/layout/DashboardLayout'
import { AiDischargeCard } from '../components/discharge/AiDischargeCard'
import { AiTextField } from '../components/discharge/AiTextField'
import { LabResults, VitalsGrid } from '../components/discharge/ClinicalValues'
import { ContinuityOfCare, type PlanOrigin } from '../components/discharge/ContinuityOfCare'
import { PrimaryDiagnosis, ProceduresReview, TwinDiagnoses } from '../components/discharge/DiagnosisReview'
import { DischargeHeader } from '../components/discharge/DischargeHeader'
import { DischargeSection } from '../components/discharge/DischargeSection'
import { DischargeSuccess } from '../components/discharge/DischargeSuccess'
import { CurrentMedicationCard, NewMedicationCard } from '../components/discharge/MedicationCard'
import { PreDischargeCheck } from '../components/discharge/PreDischargeCheck'
import { AddButton, FieldLabel, INPUT } from '../components/discharge/ui'
import {
  emptyDraft, newKey, submitDischarge, useAdmission, useDischargeContext, useForecastGaps,
  LABS, VITALS,
  type DischargeDraft, type DischargeResult,
} from '../lib/discharge'
import { useDischargeAiDraft } from '../lib/dischargeAi'
import { clearSavedDischarge, loadSavedDischarge, saveDischarge } from '../lib/dischargeDraftStore'
import {
  aiFieldStatus, reviewDischarge,
  type AiField, type AiFields, type ForecastGap, type SectionId,
} from '../lib/dischargeReview'
import { t } from '../lib/i18n'

const reducedMotion = (): boolean =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

function focusField(field: string) {
  // ждём, пока раздел раскроется, иначе поле ещё под inert
  window.setTimeout(() => {
    const element = document.getElementById(`field-${field}`)
    if (!element) return
    element.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' })
    element.focus({ preventScroll: true })
  }, 60)
}

/** Врачу — понятная причина, технические детали — в консоль. */
function friendlySubmitError(caught: unknown): string {
  console.error('[discharge] submit failed', caught)
  const message = caught instanceof Error ? caught.message : ''
  if (message.includes('уже закрыта')) return 'Эта госпитализация уже закрыта — выписка была оформлена ранее.'
  if (message.includes('Требуется вход')) return 'Сессия истекла. Войдите снова и повторите оформление.'
  return t.dischargeFlow.submitError
}

const timeShort = (iso: string): string =>
  new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export const DischargePage: React.FC = () => {
  const f = t.dischargeFlow
  const { hospitalizationId } = useParams<{ hospitalizationId: string }>()
  const { data: admission, loading } = useAdmission(hospitalizationId)
  const { data: context, loading: contextLoading } = useDischargeContext(
    admission?.patient_id,
    hospitalizationId,
  )
  const gaps = useForecastGaps(admission?.patient_id)
  const ai = useDischargeAiDraft(hospitalizationId)

  const [draft, setDraft] = useState<DischargeDraft>(() => emptyDraft(null))
  const [aiFields, setAiFields] = useState<AiFields>({})
  const [planOrigin, setPlanOrigin] = useState<PlanOrigin>({ applied: false, edited: false, dismissed: false })
  const [open, setOpen] = useState<Partial<Record<SectionId, boolean>>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<DischargeResult | null>(null)
  const [submittedVisits, setSubmittedVisits] = useState(0)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [restoredAt, setRestoredAt] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  // runAi и regenerate читают свежий черновик после await, не пересоздаваясь
  const draftRef = useRef(draft)
  const aiFieldsRef = useRef(aiFields)
  useLayoutEffect(() => {
    draftRef.current = draft
    aiFieldsRef.current = aiFields
  }, [draft, aiFields])

  const set = useCallback(<K extends keyof DischargeDraft>(key: K, value: DischargeDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }, [])

  /**
   * AI-текст попадает только в пустые поля, либо — по явному «Перегенерировать»
   * — в указанные (правки врача перед этим подтверждаются).
   */
  const { generate } = ai
  const runAi = useCallback(async (overwrite: AiField[] = []) => {
    const generated = await generate()
    if (!generated) return

    const current = draftRef.current
    const applied: AiField[] = (['discharge_summary', 'procedure_summary'] as AiField[]).filter(
      (field) => generated[field] && (overwrite.includes(field) || !current[field].trim()),
    )
    if (applied.length === 0) return

    setDraft((value) => {
      const next = { ...value }
      for (const field of applied) next[field] = generated[field]
      return next
    })
    setAiFields((value) => {
      const next = { ...value }
      for (const field of applied) next[field] = { aiText: generated[field], reviewed: false }
      return next
    })
    setPlanOrigin((value) => (value.applied ? value : { ...value, dismissed: false }))
  }, [generate])

  // черновик собираем один раз, когда известно и поступление, и содержимое карты
  useEffect(() => {
    if (ready || !admission || contextLoading || !hospitalizationId) return
    const saved = loadSavedDischarge(hospitalizationId)
    if (saved) {
      setDraft({ ...emptyDraft(admission, context), ...saved.draft })
      setAiFields(saved.ai ?? {})
      setRestoredAt(saved.savedAt)
    } else {
      setDraft(emptyDraft(admission, context))
    }
    setReady(true)
  }, [admission, context, contextLoading, hospitalizationId, ready])

  // после сборки черновика — AI сам готовит пустые тексты, если их нет
  const autoRan = useRef(false)
  useEffect(() => {
    if (!ready || autoRan.current) return
    autoRan.current = true
    if (!draftRef.current.discharge_summary.trim() || !draftRef.current.procedure_summary.trim()) {
      void runAi()
    }
  }, [ready, runAi])

  const hasClinic = Boolean(admission?.patient?.primary_clinic_id)
  const review = useMemo(
    () => reviewDischarge(draft, context, gaps, hasClinic, aiFields),
    [draft, context, gaps, hasClinic, aiFields],
  )
  const sectionReview = (id: SectionId) => review.sections.find((section) => section.id === id)!
  const requiredFields = useMemo(
    () => new Set(review.forecastGaps.map((gap) => gap.field).filter((field): field is string => Boolean(field))),
    [review.forecastGaps],
  )

  // раскрываем то, что требует внимания; готовое свёрнуто, чтобы страница была короче
  const openInit = useRef(false)
  useEffect(() => {
    if (!ready || openInit.current) return
    openInit.current = true
    setOpen(Object.fromEntries(review.sections.map((section) => [section.id, section.status !== 'done'])))
  }, [ready, review.sections])

  const toggle = (id: SectionId) => setOpen((value) => ({ ...value, [id]: !value[id] }))

  const fillGap = (gap: ForecastGap) => {
    if (!gap.field) return
    const section: SectionId = VITALS.some((vital) => vital.field === gap.field) ? 'vitals' : 'labs'
    setOpen((value) => ({ ...value, [section]: true }))
    focusField(gap.field)
  }

  const regenerate = (fields: AiField[]) => {
    const edited = fields.filter((field) => {
      const status = aiFieldStatus(draftRef.current[field], aiFieldsRef.current[field])
      return draftRef.current[field].trim() && (status === 'edited' || status === 'manual')
    })
    if (edited.length && !window.confirm(f.replaceConfirm)) return
    void runAi(fields)
  }

  const markReviewed = (field: AiField) =>
    setAiFields((value) => (value[field] ? { ...value, [field]: { ...value[field]!, reviewed: true } } : value))

  const setPlan = useCallback(<K extends keyof DischargeDraft>(key: K, value: DischargeDraft[K]) => {
    set(key, value)
    if (key === 'visits') setPlanOrigin((origin) => (origin.applied ? { ...origin, edited: true } : origin))
  }, [set])

  const applyAiPlan = () => {
    const plan = ai.data?.follow_up
    if (!plan) return
    set('visits', plan.visits.map((visit) => ({ ...visit, key: newKey() })))
    if (plan.instructions && !draftRef.current.planInstructions.trim()) set('planInstructions', plan.instructions)
    setPlanOrigin({ applied: true, edited: false, dismissed: false })
  }

  const saveDraft = () => {
    if (!hospitalizationId) return
    setSavedAt(saveDischarge(hospitalizationId, draft, aiFields))
  }

  const discardSaved = () => {
    if (!hospitalizationId || !admission) return
    clearSavedDischarge(hospitalizationId)
    setDraft(emptyDraft(admission, context))
    setAiFields({})
    setRestoredAt(null)
    setSavedAt(null)
    void runAi()
  }

  const submit = async () => {
    if (!hospitalizationId) return
    if (!review.canSubmit) {
      setError(t.discharge.needDiagnosis)
      setOpen((value) => ({ ...value, diagnosis: true }))
      window.setTimeout(() => document.getElementById('primary-diagnosis')?.focus(), 60)
      return
    }
    try {
      setBusy(true)
      setError(null)
      const response = await submitDischarge(hospitalizationId, draft, context)
      setSubmittedVisits(draft.followUp ? draft.visits.length : 0)
      clearSavedDischarge(hospitalizationId)
      setResult(response)
      window.scrollTo({ top: 0 })
    } catch (caught) {
      setError(friendlySubmitError(caught))
    } finally {
      setBusy(false)
    }
  }

  if (loading || (admission && (contextLoading || !ready))) {
    return (
      <DashboardLayout title={f.pageTitle}>
        <p className="py-10 text-center text-sm text-ink-muted">{t.common.loading}</p>
      </DashboardLayout>
    )
  }

  if (!admission || !hospitalizationId) {
    return (
      <DashboardLayout title={f.pageTitle}>
        <p className="rounded-lg border border-border px-4 py-10 text-center text-sm text-ink-muted">
          {t.twin.notFound}
        </p>
      </DashboardLayout>
    )
  }

  const name = admission.patient
    ? `${admission.patient.last_name} ${admission.patient.first_name}`
    : t.common.dash
  const hospitalName = context.organizations.find((org) => org.id === admission.organization_id)?.name ?? null
  const clinic = context.organizations.find((org) => org.id === context.patient?.primary_clinic_id)
  const clinicRegion = clinic ? [clinic.district, clinic.region].filter(Boolean).join(', ') || null : null

  if (result) {
    return (
      <DashboardLayout title={f.pageTitle}>
        <DischargeSuccess
          result={result}
          patientName={name}
          hospitalName={hospitalName}
          clinicName={context.clinicName}
          visitCount={result.care_plan_id ? submittedVisits : 0}
        />
      </DashboardLayout>
    )
  }

  const used = ai.data?.used
  const aiSources = used
    ? [
        [f.usedHospitalization, 1],
        [f.usedDiagnoses, used.diagnoses],
        [f.usedLabs, used.labs],
        [f.usedMeds, used.medications],
        [f.usedObservations, used.observations],
      ].filter(([, n]) => Number(n) > 0).map(([label]) => String(label))
    : undefined

  const sectionsReady = review.sections.filter((section) => section.status === 'done').length
  const newMeds = draft.medications.filter((row) => row.name.trim()).length
  const filledVitals = VITALS
    .filter((vital) => draft.vitals[vital.field]?.trim())
    .map((vital) =>
      vital.secondaryLabel
        ? `${vital.label} ${draft.vitals[vital.field]}/${draft.vitalsSecondary[vital.field] || '—'}`
        : `${vital.label} ${draft.vitals[vital.field]} ${vital.unit}`)
  const filledLabs = LABS.filter((lab) => draft.labs[lab.field]?.trim()).length

  return (
    <DashboardLayout title={f.pageTitle}>
      <div className="mx-auto max-w-[76rem] space-y-4">
        <DischargeHeader
          name={name}
          patientNumber={admission.patient?.patient_number ?? null}
          context={context}
          admittedAt={admission.admitted_at}
          dischargedAt={draft.discharged_at}
          admissionReason={admission.admission_reason}
        />

        <AiDischargeCard
          status={ai.status}
          generatedAt={ai.data?.generated_at ?? null}
          counts={{
            diagnoses: used?.diagnoses ?? context.diagnoses.length,
            procedures: used?.procedures ?? context.procedures.length,
            medications: used?.medications ?? context.medications.length,
            observations: used?.observations ?? 0,
            labs: used?.labs ?? 0,
            prior_hospitalizations: used?.prior_hospitalizations ?? null,
          }}
          reviewFlags={ai.data?.review_flags ?? []}
          sectionsReady={sectionsReady}
          sectionsTotal={review.sections.length}
          gaps={review.forecastGaps}
          openGaps={review.openGaps}
          onGenerate={() => regenerate(['discharge_summary', 'procedure_summary'])}
          onFill={fillGap}
        />

        {restoredAt && (
          <p className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-sunken px-3 py-2 text-[0.8125rem] text-ink-muted">
            {f.draftRestored} {timeShort(restoredAt)}
            <button type="button" onClick={discardSaved} className="text-primary hover:underline">
              {f.draftDiscard}
            </button>
          </p>
        )}

        <DischargeSection
          id="diagnosis"
          index={1}
          title={f.sectionDiagnosis}
          review={sectionReview('diagnosis')}
          open={Boolean(open.diagnosis)}
          onToggle={() => toggle('diagnosis')}
          summary={[
            draft.primary_diagnosis || null,
            draft.discharge_summary.trim() ? `${t.discharge.dischargeSummary.toLowerCase()} · ${draft.discharge_summary.trim().length} симв.` : null,
          ].filter(Boolean).join(' · ')}
        >
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_14rem]">
            <PrimaryDiagnosis
              draft={draft}
              set={set}
              context={context}
              admissionDiagnosis={admission.primary_diagnosis}
              hospitalizationId={hospitalizationId}
            />
            <div>
              <FieldLabel htmlFor="discharged-at">{t.discharge.dischargedAt}</FieldLabel>
              <input
                id="discharged-at"
                type="datetime-local"
                className={INPUT}
                value={draft.discharged_at}
                onChange={(event) => set('discharged_at', event.target.value)}
              />
            </div>
          </div>

          <div className="mt-4">
            <TwinDiagnoses draft={draft} set={set} context={context} hospitalizationId={hospitalizationId} />
          </div>

          <div className="mt-5 border-t border-border pt-4">
            <AiTextField
              id="discharge-summary"
              label={t.discharge.dischargeSummary}
              rows={7}
              value={draft.discharge_summary}
              onChange={(value) => set('discharge_summary', value)}
              ai={aiFields.discharge_summary}
              onReviewed={() => markReviewed('discharge_summary')}
              onRegenerate={() => regenerate(['discharge_summary'])}
              regenerating={ai.status === 'loading'}
              sources={aiSources}
            />
          </div>

          <div className="mt-5 border-t border-border pt-4">
            <AiTextField
              id="procedure-summary"
              label={t.discharge.procedureSummary}
              rows={3}
              value={draft.procedure_summary}
              onChange={(value) => set('procedure_summary', value)}
              ai={aiFields.procedure_summary}
              onReviewed={() => markReviewed('procedure_summary')}
              onRegenerate={() => regenerate(['procedure_summary'])}
              regenerating={ai.status === 'loading'}
              sources={aiSources}
            />
            <div className="mt-4">
              <ProceduresReview draft={draft} set={set} context={context} />
            </div>
          </div>
        </DischargeSection>

        <DischargeSection
          id="medications"
          index={2}
          title={f.sectionMeds}
          review={sectionReview('medications')}
          open={Boolean(open.medications)}
          onToggle={() => toggle('medications')}
          summary={`${f.medsContinue}: ${context.medications.length} · ${f.medsNew}: ${newMeds}`}
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-[0.75rem] text-ink-muted">{f.medsCurrent}</p>
              {context.medications.length ? (
                <ul className="space-y-2">
                  {context.medications.map((item) => <CurrentMedicationCard key={item.id} item={item} />)}
                </ul>
              ) : (
                <p className="text-[0.8125rem] text-ink-muted">{f.medsEmpty}</p>
              )}
              {/* TODO: «Прекратить» требует права менять чужие назначения (RLS) и поля в discharge_patient */}
              <p className="mt-2 text-[0.6875rem] text-ink-muted">{f.medsStopTodo}</p>
            </div>
            <div>
              <p className="mb-2 text-[0.75rem] text-ink-muted">{f.medsNewTitle}</p>
              {draft.medications.length > 0 && (
                <ul className="mb-2 space-y-2">
                  {draft.medications.map((item, index) => (
                    <NewMedicationCard
                      key={item.key}
                      item={item}
                      onChange={(next) => {
                        const rows = [...draft.medications]
                        rows[index] = next
                        set('medications', rows)
                      }}
                      onRemove={() => set('medications', draft.medications.filter((row) => row.key !== item.key))}
                    />
                  ))}
                </ul>
              )}
              <AddButton
                onClick={() =>
                  set('medications', [
                    ...draft.medications,
                    {
                      key: newKey(), name: '', dose: '', dose_unit: 'мг',
                      frequency: 'ONCE_DAILY', route: 'ORAL', instructions: '', end_date: '',
                    },
                  ])
                }
              >
                {context.medications.length ? t.discharge.addNew : t.discharge.add}
              </AddButton>
              <p className="mt-2 text-[0.6875rem] text-ink-muted">{f.medsNoAi}</p>
            </div>
          </div>
        </DischargeSection>

        <DischargeSection
          id="vitals"
          index={3}
          title={f.sectionVitals}
          review={sectionReview('vitals')}
          open={Boolean(open.vitals)}
          onToggle={() => toggle('vitals')}
          summary={filledVitals.join(' · ')}
        >
          <p className="mb-3 text-[0.75rem] text-ink-muted">{f.vitalsHint}</p>
          <VitalsGrid
            draft={draft}
            context={context}
            requiredFields={requiredFields}
            onChange={(field, primary, secondary) => {
              setDraft((current) => ({
                ...current,
                vitals: { ...current.vitals, [field]: primary },
                vitalsSecondary:
                  secondary === undefined
                    ? current.vitalsSecondary
                    : { ...current.vitalsSecondary, [field]: secondary },
              }))
            }}
          />
        </DischargeSection>

        <DischargeSection
          id="labs"
          index={4}
          title={f.sectionLabs}
          review={sectionReview('labs')}
          open={Boolean(open.labs)}
          onToggle={() => toggle('labs')}
          summary={`${filledLabs} ${f.of} ${LABS.length}`}
        >
          <LabResults
            draft={draft}
            context={context}
            requiredFields={requiredFields}
            onChange={(field, value) =>
              setDraft((current) => ({ ...current, labs: { ...current.labs, [field]: value } }))
            }
          />
        </DischargeSection>

        <ContinuityOfCare
          draft={draft}
          set={setPlan}
          review={sectionReview('followUp')}
          hasClinic={hasClinic}
          hospitalName={hospitalName}
          clinicName={context.clinicName}
          clinicRegion={clinicRegion}
          aiPlan={ai.data?.follow_up ?? null}
          planOrigin={planOrigin}
          onApplyAiPlan={applyAiPlan}
          onDismissAiPlan={() => setPlanOrigin((value) => ({ ...value, dismissed: true }))}
        />

        <PreDischargeCheck checks={review.checks} />

        <div className="sticky bottom-0 z-20 -mx-4 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="mx-auto flex max-w-[76rem] flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={saveDraft}
                className="rounded-lg border border-border px-4 py-2.5 text-sm text-ink transition-colors hover:border-primary hover:text-primary"
              >
                {f.saveDraft}
              </button>
              <Link
                to="/admissions"
                className="rounded-lg px-3 py-2.5 text-sm text-ink-muted transition-colors hover:text-ink"
              >
                {t.discharge.back}
              </Link>
            </div>

            <div className="min-w-[14rem] flex-1 text-[0.75rem] leading-snug">
              {error && <p role="alert" className="mb-0.5 text-sm text-risk-critical">{error}</p>}
              <p className="text-ink-muted">{f.approval}</p>
              {savedAt && (
                <p className="text-ink-muted">✓ {f.draftSaved} · {timeShort(savedAt)}</p>
              )}
            </div>

            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy}
              className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-[0_6px_18px_-8px_var(--color-primary)] transition-colors hover:bg-primary-hover disabled:opacity-50"
            >
              {busy ? t.discharge.submitting : `${f.submit} →`}
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
