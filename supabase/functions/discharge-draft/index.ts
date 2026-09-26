// Черновик выписки по данным цифрового двойника. Функция ничего не записывает:
// она только читает карту с JWT пользователя (RLS продолжает действовать) и
// возвращает текст, который врач проверяет и правит перед выпиской.

import OpenAI from 'npm:openai@4'
import { createClient } from 'npm:@supabase/supabase-js@2'

const DEFAULT_MODEL = 'gpt-4.1-mini'
const VISIT_KINDS = ['HOME', 'CLINIC', 'CALL'] as const

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SYSTEM = `Ты — ассистент клинической системы CareTwin AI. Ты готовишь ЧЕРНОВИК
выписки, который врач обязательно проверит, исправит и подтвердит сам.

Строгие правила:
1. Используй ТОЛЬКО факты из предоставленных записей. Ничего не додумывай.
2. Не ставь новых диагнозов и не меняй существующие.
3. Не назначай, не отменяй и не меняй лекарства. Упоминай только те, что есть в записях.
4. Если данных для раздела мало — так и напиши, не заполняй пробелы догадками.
5. Числа приводи ровно так, как они записаны. Пиши по-русски, медицинским стилем.
6. План наблюдения — это ПРЕДЛОЖЕНИЕ графика контактов (визит на дому, приём, звонок),
   а не лечение.

Ответ верни строго в формате JSON:
{
  "discharge_summary": "выписной эпикриз: причина поступления, течение, результаты обследований, состояние при выписке — 4–8 предложений",
  "procedure_summary": "что выполнено за госпитализацию: обследования, процедуры, проводимая терапия — 2–4 предложения",
  "follow_up": {
    "instructions": "инструкции поликлинике, 1–3 предложения",
    "rationale": "почему предложен такой график, одно предложение со ссылкой на факты",
    "visits": [{ "day_offset": 3, "kind": "HOME", "title": "короткое название" }]
  },
  "review_flags": ["что врачу стоит перепроверить перед выпиской, со ссылкой на факт"]
}

kind — одно из HOME, CLINIC, CALL. day_offset — сутки после выписки, от 1 до 90.
visits — от 2 до 5 контактов. review_flags — от 0 до 4 пунктов, только если в данных
есть на что обратить внимание (отклонение показателя, пробел в данных).`

type Row = Record<string, unknown>

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

const day = (value: unknown): string =>
  typeof value === 'string' ? new Date(value).toISOString().slice(0, 10) : '—'

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const authorization = request.headers.get('Authorization')
  if (!authorization) return failure('unauthorized', 401)

  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) {
    console.error('discharge-draft: OPENAI_API_KEY is not set')
    return failure('ai_unavailable', 503)
  }

  const body = await request.json().catch(() => ({})) as { hospitalizationId?: string }
  if (!body.hospitalizationId) return failure('bad_request', 400)

  const model = Deno.env.get('OPENAI_MODEL') ?? DEFAULT_MODEL
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authorization } } },
  )

  const { data: hosp, error: hospError } = await supabase
    .from('hospitalizations')
    .select('id, patient_id, admitted_at, admission_reason, primary_diagnosis, status')
    .eq('id', body.hospitalizationId)
    .maybeSingle()

  if (hospError) {
    console.error('discharge-draft: hospitalization query failed', hospError)
    return failure('data_unavailable', 400)
  }
  if (!hosp) return failure('not_found', 404)

  const patientId = hosp.patient_id as string
  const byPatient = (table: string) => supabase.from(table).select('*').eq('patient_id', patientId)

  const [patient, allergies, diagnoses, procedures, medications, observations, labs, previous] =
    await Promise.all([
      supabase.from('patients').select('birth_date, gender').eq('id', patientId).maybeSingle(),
      byPatient('allergies').eq('status', 'ACTIVE'),
      byPatient('diagnoses').eq('status', 'ACTIVE'),
      byPatient('procedures').eq('hospitalization_id', hosp.id).order('performed_at'),
      byPatient('medications').eq('status', 'ACTIVE'),
      byPatient('observations').eq('hospitalization_id', hosp.id)
        .order('recorded_at', { ascending: false }).limit(120),
      byPatient('lab_results').order('collected_at', { ascending: false }).limit(60),
      supabase.from('hospitalizations')
        .select('admitted_at, discharged_at, primary_diagnosis')
        .eq('patient_id', patientId)
        .neq('id', hosp.id)
        .order('admitted_at', { ascending: false })
        .limit(5),
    ])

  const rows = (result: { data: unknown }): Row[] => (result.data ?? []) as Row[]
  const diagnosisRows = rows(diagnoses)
  const procedureRows = rows(procedures)
  const medicationRows = rows(medications)
  const observationRows = rows(observations)
  const labRows = rows(labs)
  const previousRows = rows(previous)
  const patientRow = (patient.data ?? {}) as Row

  const facts = [
    `Пациент: пол ${text(patientRow.gender) || 'не указан'}, дата рождения ${text(patientRow.birth_date) || 'не указана'}.`,
    `Поступил: ${day(hosp.admitted_at)}. Причина поступления: ${text(hosp.admission_reason) || 'не указана'}.`,
    `Основной диагноз госпитализации: ${text(hosp.primary_diagnosis) || 'не указан'}.`,
    `Аллергии: ${rows(allergies).map((a) => text(a.substance)).filter(Boolean).join(', ') || 'не зафиксированы'}.`,
    '',
    'Активные диагнозы:',
    ...diagnosisRows.map((d) => `- ${text(d.name)}${d.code ? ` (${text(d.code)})` : ''}, ${text(d.type)}`),
    '',
    'Процедуры за госпитализацию:',
    ...procedureRows.map((p) =>
      `- ${day(p.performed_at)}: ${text(p.name)}${p.outcome ? ` — ${text(p.outcome)}` : ''}`),
    '',
    'Действующие назначения:',
    ...medicationRows.map((m) =>
      `- ${text(m.name)} ${m.dose ?? ''} ${text(m.dose_unit)} ${text(m.frequency)} ${text(m.route)}`.trim()),
    '',
    'Показатели за госпитализацию (новые сверху):',
    ...observationRows.map((o) =>
      `- ${day(o.recorded_at)} ${text(o.type)}: ${o.value_numeric ?? ''}${o.value_secondary !== null && o.value_secondary !== undefined ? `/${o.value_secondary}` : ''} ${text(o.unit)}${o.is_abnormal ? ' [отклонение]' : ''}`),
    '',
    'Анализы (новые сверху):',
    ...labRows.map((l) =>
      `- ${day(l.collected_at)} ${text(l.analyte)}: ${l.value_numeric ?? text(l.value_text)} ${text(l.unit)}${l.flag && l.flag !== 'NORMAL' ? ` [${text(l.flag)}]` : ''}`),
    '',
    'Прошлые госпитализации:',
    ...previousRows.map((h) =>
      `- ${day(h.admitted_at)}–${day(h.discharged_at)}: ${text(h.primary_diagnosis) || 'диагноз не указан'}`),
  ].join('\n')

  const used = {
    diagnoses: diagnosisRows.length,
    procedures: procedureRows.length,
    medications: medicationRows.length,
    observations: observationRows.length,
    labs: labRows.length,
    prior_hospitalizations: previousRows.length,
  }

  try {
    const openai = new OpenAI({ apiKey })
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.2,
      max_tokens: 1400,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `Записи цифрового двойника пациента:\n\n${facts}\n\nПодготовь черновик выписки.` },
      ],
    })

    const raw = completion.choices[0]?.message?.content?.trim()
    if (!raw) {
      console.error('discharge-draft: empty model response')
      return failure('ai_failed', 502)
    }

    const parsed = JSON.parse(raw) as Row
    const followUp = (parsed.follow_up ?? {}) as Row
    const visits = (Array.isArray(followUp.visits) ? followUp.visits : [])
      .map((visit: Row) => ({
        day_offset: Math.round(Number(visit.day_offset)),
        kind: String(visit.kind),
        title: text(visit.title),
      }))
      .filter((visit) =>
        Number.isFinite(visit.day_offset) && visit.day_offset >= 1 && visit.day_offset <= 90 &&
        (VISIT_KINDS as readonly string[]).includes(visit.kind))
      .slice(0, 6)

    return json({
      discharge_summary: text(parsed.discharge_summary),
      procedure_summary: text(parsed.procedure_summary),
      follow_up: {
        instructions: text(followUp.instructions),
        rationale: text(followUp.rationale),
        visits,
      },
      review_flags: (Array.isArray(parsed.review_flags) ? parsed.review_flags : [])
        .filter((flag): flag is string => typeof flag === 'string' && flag.trim() !== '')
        .slice(0, 4),
      used,
      generated_at: new Date().toISOString(),
      model,
    })
  } catch (caught) {
    // подробности — только в логи функции, врач видит нейтральное сообщение
    console.error('discharge-draft: generation failed', caught)
    return failure('ai_failed', 502)
  }
})

function failure(code: string, status: number): Response {
  return json({ error: code }, status)
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
