// Проверка произвольного препарата по цифровому двойнику пациента.
//
// ИИ делает только то, для чего нужен открытый словарь: узнаёт препарат, относит
// его к классу и ищет в записях противопоказания и взаимодействия. Каждая его
// находка обязана ссылаться на запись карты — находки без действительной ссылки
// отбрасываются. Итог (вердикт) и все числа прогноза вычисляет код: вердикт — по
// уровням находок, прогноз — по таблице классов в _shared/simulation-model.ts.
// Функция ничего не записывает; запросы идут с JWT пользователя, RLS действует.

import OpenAI from 'npm:openai@4'
import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  DRUG_CLASSES, familyFactors, simulate, type Inputs, type Simulation,
} from '../_shared/simulation-model.ts'
import { pickBest, rankCandidates } from '../_shared/ranking.ts'

const DEFAULT_MODEL = 'gpt-4.1-mini'
const MAX_COMPARE = 4
const LEVELS = ['BLOCK', 'WARN', 'INFO'] as const
const CATEGORIES = [
  'ALLERGY', 'CONTRAINDICATION', 'INTERACTION', 'RENAL', 'DUPLICATE', 'LIFESTYLE', 'MISSING_DATA',
] as const

type Level = typeof LEVELS[number]
type Category = typeof CATEGORIES[number]
type Row = Record<string, unknown>
type Verdict = 'BLOCK' | 'CAUTION' | 'NO_FINDINGS' | 'UNKNOWN'

interface Finding {
  level: Level
  category: Category
  text: string
  evidence: { id: string; text: string }[]
  source: 'RULE' | 'AI'
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SYSTEM = `Ты — модуль проверки назначений клинической системы CareTwin AI. Врач
вводит препарат, который собирается назначить. Ты проверяешь его по записям
цифрового двойника пациента. Решение принимает врач.

Строгие правила:
1. Каждая запись пациента имеет идентификатор в квадратных скобках, например [D2] или [L5].
   Каждая находка ОБЯЗАНА ссылаться хотя бы на один такой идентификатор в поле evidence.
   Находка без ссылки на запись не допускается (кроме категории MISSING_DATA).
2. Используй только факты из записей. Не выдумывай анализы, диагнозы или препараты.
3. Не пересчитывай риск и не называй числа прогноза — их считает другая часть системы.
4. Не назначай и не отменяй другие препараты. Можно предложить организационный
   контроль (например, «проконтролировать калий через 1–2 недели»).
5. BLOCK — абсолютное противопоказание или аллергия на препарат/класс, подтверждённые записью.
   WARN — относительное противопоказание, значимое взаимодействие, коррекция дозы,
   дублирование класса. INFO — стоит учесть, но не мешает назначению.
6. MISSING_DATA — если для безопасного назначения нужен показатель, которого в записях нет
   (например, калий для ингибитора АПФ, СКФ/креатинин для метформина).
7. Если препарат тебе не известен или введённый текст не является препаратом —
   recognized: false и пустые списки.
8. Пиши по-русски, кратко, медицинским стилем.

Классы (drug_class) — одно из:
${DRUG_CLASSES.map((one) => `${one.id} — ${one.label}`).join('\n')}
OTHER — любой другой класс.

Ответ строго в формате JSON:
{
  "recognized": true,
  "inn": "международное непатентованное название по-русски",
  "drug_class": "SGLT2",
  "class_label": "название класса по-русски",
  "findings": [
    { "level": "WARN", "category": "RENAL", "text": "почему это важно для этого пациента", "evidence": ["L3"] }
  ],
  "summary": "2–4 предложения: что показала проверка для этого пациента",
  "monitoring": ["что проконтролировать после назначения, 0–3 пункта"]
}

category — одно из ${CATEGORIES.join(', ')}. findings — от 0 до 8 пунктов.`

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

const day = (value: unknown): string =>
  typeof value === 'string' ? new Date(value).toISOString().slice(0, 10) : '—'

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const authorization = request.headers.get('Authorization')
  if (!authorization) return failure('unauthorized', 401)

  // drug — одна проверка; drugs — сравнение до MAX_COMPARE вариантов
  const body = await request.json().catch(() => ({})) as { patientId?: string; drug?: string; drugs?: unknown[] }
  const compare = Array.isArray(body.drugs)
  const seen = new Set<string>()
  const queries = (compare ? body.drugs! : [body.drug])
    .map(text)
    .filter((query) => {
      const key = query.toLowerCase()
      if (!query || seen.has(key)) return false
      seen.add(key)
      return true
    })
  if (!body.patientId || queries.length === 0 || queries.length > MAX_COMPARE ||
      queries.some((query) => query.length > 120)) {
    return failure('bad_request', 400)
  }

  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) {
    console.error('drug-check: OPENAI_API_KEY is not set')
    return failure('ai_unavailable', 503)
  }

  const model = Deno.env.get('OPENAI_MODEL') ?? DEFAULT_MODEL
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authorization } } },
  )

  const patientId = body.patientId
  const byPatient = (table: string) => supabase.from(table).select('*').eq('patient_id', patientId)

  const [inputsResult, allergies, diagnoses, medications, labs, observations, profile, stays] =
    await Promise.all([
      supabase.rpc('simulation_inputs', { p_patient_id: patientId }),
      byPatient('allergies'),
      byPatient('diagnoses').neq('status', 'RULED_OUT').order('diagnosed_at', { ascending: false }),
      byPatient('medications').eq('status', 'ACTIVE'),
      byPatient('lab_results').order('collected_at', { ascending: false }).limit(80),
      byPatient('observations').order('recorded_at', { ascending: false }).limit(40),
      byPatient('patient_profile').maybeSingle(),
      supabase.from('hospitalizations')
        .select('admitted_at, discharged_at, primary_diagnosis, admission_reason')
        .eq('patient_id', patientId)
        .order('admitted_at', { ascending: false })
        .limit(10),
    ])

  if (inputsResult.error) {
    console.error('drug-check: simulation_inputs failed', inputsResult.error)
    return failure('data_unavailable', 400)
  }
  const inputs = (inputsResult.data as Inputs[] | null)?.[0]
  if (!inputs) return failure('not_found', 404)
  const missing = (inputs as unknown as { missing: string[] }).missing ?? []

  const rows = (result: { data: unknown }): Row[] => (result.data ?? []) as Row[]
  const allergyRows = rows(allergies)
  const medicationRows = rows(medications)

  // Каждая запись получает идентификатор: по нему модель ссылается на факт,
  // а код проверяет, что такая запись действительно была передана.
  const facts = new Map<string, string>()
  const lines: string[] = []
  const section = (title: string, prefix: string, items: string[], empty: string) => {
    lines.push('', `${title}:`)
    if (items.length === 0) lines.push(`- ${empty}`)
    items.forEach((item, index) => {
      const id = `${prefix}${index + 1}`
      facts.set(id, item)
      lines.push(`[${id}] ${item}`)
    })
  }

  const profileRow = (profile.data ?? {}) as Row
  const markers = Object.entries((profileRow.genetic_markers ?? {}) as Row)

  section('Пациент', 'P', [
    `Возраст: ${inputs.age_years ?? 'не указан'}, пол: ${inputs.sex || 'не указан'}`,
    ...(inputs.bmi ? [`ИМТ ${inputs.bmi}`] : []),
    `Курение: ${text(profileRow.smoking_status) || inputs.smoking || 'не указано'}`,
    `Алкоголь: ${text(profileRow.alcohol_use) || 'не указано'}`,
    `Физическая активность: ${text(profileRow.physical_activity) || 'не указано'}`,
    ...((profileRow.family_history ?? []) as string[]).map((entry) => `Семейный анамнез: ${entry}`),
    ...markers.map(([marker, value]) => `Генетический маркер ${marker}: ${String(value)}`),
  ], '')

  section('Аллергии и непереносимость', 'A', allergyRows.map((a) =>
    `${text(a.substance)}${a.reaction ? ` — ${text(a.reaction)}` : ''}, ${text(a.severity)}, статус ${text(a.status)}`,
  ), 'не зафиксированы')

  section('Диагнозы (включая перенесённые)', 'D', rows(diagnoses).map((d) =>
    `${text(d.name)}${d.code ? ` (${text(d.code)})` : ''}, ${text(d.type)}, ${text(d.status)}` +
    `${d.diagnosed_at ? `, с ${text(d.diagnosed_at)}` : ''}${d.resolved_at ? `, разрешён ${text(d.resolved_at)}` : ''}`,
  ), 'не зафиксированы')

  section('Действующие назначения', 'M', medicationRows.map((m) =>
    [text(m.name), m.dose ?? '', text(m.dose_unit), text(m.frequency_text) || text(m.frequency), text(m.route)]
      .filter((part) => part !== '').join(' '),
  ), 'нет')

  section('Анализы (новые сверху)', 'L', rows(labs).map((l) =>
    `${day(l.collected_at)} ${text(l.analyte)}: ${l.value_numeric ?? text(l.value_text)} ${text(l.unit)}` +
    `${l.flag && l.flag !== 'NORMAL' ? ` [${text(l.flag)}]` : ''}`,
  ), 'нет')

  section('Показатели (новые сверху)', 'O', rows(observations).map((o) =>
    `${day(o.recorded_at)} ${text(o.type)}: ${o.value_numeric ?? ''}` +
    `${o.value_secondary !== null && o.value_secondary !== undefined ? `/${o.value_secondary}` : ''} ${text(o.unit)}` +
    `${o.is_abnormal ? ' [отклонение]' : ''}`,
  ), 'нет')

  section('Госпитализации', 'H', rows(stays).map((h) =>
    `${day(h.admitted_at)}–${h.discharged_at ? day(h.discharged_at) : 'по настоящее время'}: ` +
    `${text(h.primary_diagnosis) || text(h.admission_reason) || 'диагноз не указан'}`,
  ), 'нет')

  const openai = new OpenAI({ apiKey })

  // Один препарат — один вызов модели. Записи пациента общие, поэтому все
  // кандидаты проверяются по одному и тому же набору фактов.
  const review = async (query: string) => {
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.1,
      max_tokens: 1400,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: `Препарат, который врач собирается назначить: «${query}»\n\nЗаписи цифрового двойника:${lines.join('\n')}`,
        },
      ],
    })

    const raw = completion.choices[0]?.message?.content?.trim()
    if (!raw) throw new Error('empty model response')
    const parsed = JSON.parse(raw) as Row

    const recognized = parsed.recognized === true
    const inn = text(parsed.inn)
    const drugClass = DRUG_CLASSES.find((one) => one.id === text(parsed.drug_class))

    const findings: Finding[] = []

    if (recognized) {
      // Находки модели: принимаются только со ссылками на реально переданные записи.
      for (const item of (Array.isArray(parsed.findings) ? parsed.findings : []) as Row[]) {
        const level = text(item.level) as Level
        const category = text(item.category) as Category
        const note = text(item.text)
        if (!LEVELS.includes(level) || !CATEGORIES.includes(category) || !note) continue

        const evidence = (Array.isArray(item.evidence) ? item.evidence : [])
          .map((id) => text(id).replace(/[[\]]/g, ''))
          .filter((id) => facts.has(id))
          .map((id) => ({ id, text: facts.get(id)! }))

        if (evidence.length === 0 && category !== 'MISSING_DATA') continue
        findings.push({ level, category, text: note, evidence, source: 'AI' })
      }

      // Правила кода работают независимо от модели: ИИ может добавить находку,
      // но не может отменить блокировку по аллергии или порогу креатинина.
      const names = [inn, query, ...(drugClass?.members ?? [])]
        .map((name) => name.toLowerCase()).filter((name) => name.length >= 4)

      allergyRows.forEach((allergy, index) => {
        if (text(allergy.status) !== 'ACTIVE') return
        const substance = text(allergy.substance).toLowerCase()
        if (names.some((name) => substance.includes(name) || name.includes(substance))) {
          findings.push({
            level: 'BLOCK',
            category: 'ALLERGY',
            text: `В карте аллергия/непереносимость: ${text(allergy.substance)}`,
            evidence: [{ id: `A${index + 1}`, text: facts.get(`A${index + 1}`)! }],
            source: 'RULE',
          })
        }
      })

      medicationRows.forEach((medication, index) => {
        const name = text(medication.name).toLowerCase()
        if (names.some((one) => name.includes(one))) {
          findings.push({
            level: 'WARN',
            category: 'DUPLICATE',
            text: `Пациент уже получает препарат этого класса: ${text(medication.name)}`,
            evidence: [{ id: `M${index + 1}`, text: facts.get(`M${index + 1}`)! }],
            source: 'RULE',
          })
        }
      })

      if (drugClass?.maxCreatinine && inputs.creatinine && inputs.creatinine > drugClass.maxCreatinine) {
        findings.push({
          level: 'BLOCK',
          category: 'RENAL',
          text: `Креатинин ${inputs.creatinine} мкмоль/л выше порога ${drugClass.maxCreatinine} для класса «${drugClass.label}»`,
          evidence: [],
          source: 'RULE',
        })
      }
    }

    const order: Record<Level, number> = { BLOCK: 0, WARN: 1, INFO: 2 }
    findings.sort((a, b) => order[a.level] - order[b.level])

    const verdict: Verdict = !recognized
      ? 'UNKNOWN'
      : findings.some((finding) => finding.level === 'BLOCK')
        ? 'BLOCK'
        : findings.some((finding) => finding.level === 'WARN')
          ? 'CAUTION'
          : 'NO_FINDINGS'

    // Прогноз строится только для известного класса и полного набора данных.
    let forecast: (Simulation & { riskRatio: number; riskNote: string }) | null = null
    let forecastReason: 'OK' | 'NOT_MODELED' | 'MISSING_DATA' | 'UNKNOWN' = 'UNKNOWN'
    if (recognized && !drugClass) forecastReason = 'NOT_MODELED'
    else if (recognized && drugClass && missing.length > 0) forecastReason = 'MISSING_DATA'
    else if (recognized && drugClass) {
      forecast = {
        ...simulate(inputs, drugClass.effects, drugClass.riskRatio),
        riskRatio: drugClass.riskRatio,
        riskNote: drugClass.riskNote,
      }
      forecastReason = 'OK'
    }

    return {
      drug: {
        query,
        recognized,
        inn: inn || query,
        drug_class: drugClass?.id ?? 'OTHER',
        class_label: drugClass?.label ?? text(parsed.class_label),
      },
      verdict,
      findings,
      summary: recognized ? text(parsed.summary) : '',
      monitoring: recognized
        ? (Array.isArray(parsed.monitoring) ? parsed.monitoring : [])
          .filter((item): item is string => typeof item === 'string' && item.trim() !== '')
          .slice(0, 3)
        : [],
      forecast,
      forecast_reason: forecastReason,
    }
  }

  // Сбой одного кандидата не роняет сравнение: он вернётся с ошибкой.
  const settled = await Promise.allSettled(queries.map(review))
  const results = settled.map((outcome, index) => {
    if (outcome.status === 'fulfilled') return { ...outcome.value, error: null as string | null }
    // подробности — только в логи функции, врач видит нейтральное сообщение
    console.error('drug-check: generation failed for', queries[index], outcome.reason)
    return { drug: { query: queries[index], recognized: false, inn: queries[index], drug_class: 'OTHER', class_label: '' },
      verdict: 'UNKNOWN' as Verdict, findings: [] as Finding[], summary: '', monitoring: [] as string[],
      forecast: null, forecast_reason: 'UNKNOWN' as const, error: 'ai_failed' }
  })

  const meta = {
    missing,
    factors: familyFactors(inputs),
    used: {
      records: facts.size,
      allergies: allergyRows.length,
      diagnoses: rows(diagnoses).length,
      medications: medicationRows.length,
      labs: rows(labs).length,
      observations: rows(observations).length,
      hospitalizations: rows(stays).length,
    },
    model,
    generated_at: new Date().toISOString(),
    disclaimer:
      'Проверка выполнена ИИ по записям карты и правилами системы; прогноз — по демонстрационным параметрам класса. ' +
      'Отсутствие находок не означает безопасность назначения. Решение принимает врач.',
  }

  if (!compare) {
    if (results[0].error) return failure('ai_failed', 502)
    const { error: _error, ...single } = results[0]
    return json({ ...single, ...meta })
  }

  if (results.every((result) => result.error)) return failure('ai_failed', 502)

  // Рейтинг считает код, не модель: сначала безопасность, затем прогноз.
  const ranked = rankCandidates(results)
  const best = pickBest(ranked)

  return json({
    results: ranked,
    best,
    baseline_risk: missing.length === 0 ? simulate(inputs, [], 1).risk.baseline : null,
    ...meta,
  })
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
