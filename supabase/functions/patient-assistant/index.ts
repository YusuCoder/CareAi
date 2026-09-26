// Чат-помощник на главной: находит пациента по ПИНФЛ, номеру карты или ФИО и
// готовит сводку по его цифровому двойнику.
//
// Разделение ответственности:
// - поиск и выборка записей — код, с JWT пользователя (RLS действует);
// - списки в карточке пациента (аллергии, диагнозы, назначения, анализы) приходят
//   в интерфейс прямо из базы, модель их не пересказывает и не может исказить;
// - модель ведёт диалог, задаёт уточняющие вопросы и пишет «главное» — каждый
//   пункт со ссылкой на запись; пункты без действительной ссылки отбрасываются.
// Функция ничего не записывает.

import OpenAI from 'npm:openai@4'
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

const DEFAULT_MODEL = 'gpt-4.1-mini'
const MAX_HISTORY = 12
const MAX_ROUNDS = 4
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SYSTEM = `Ты — помощник врача в клинической системе CareTwin AI. Ты помогаешь быстро
найти пациента и понять его историю, чтобы врачу не приходилось открывать карту вручную.

Как вести диалог:
1. Врач называет пациента: ПИНФЛ (14 цифр), номер карты или ФИО (полностью или частично).
   Вызови search_patients. Если имя написано латиницей и ничего не найдено — повтори
   поиск кириллицей, и наоборот.
2. Найдено несколько — перечисли коротко и спроси, кого из них ищет врач (карточки
   пациентов интерфейс покажет сам, не дублируй все данные текстом).
3. Найден один — назови его (ФИО, возраст, номер карты) и спроси, показать ли краткую
   сводку по истории болезни. Сводку без согласия не строй, если врач прямо её не просил.
4. Врач просит сводку или выбирает пациента со словами «сводка», «история», «покажи» —
   вызови get_patient_record и составь сводку.
5. Ничего не найдено — скажи об этом и предложи уточнить запрос.
6. На вопросы по уже открытой карте отвечай по записям get_patient_record.

Правила для сводки и ответов о пациенте:
- Используй ТОЛЬКО факты из записей. Каждая запись имеет идентификатор вида [A1], [D3], [L7].
- Не ставь диагнозов, не назначай и не меняй лечение. Можно предложить, на что обратить
  внимание и что уточнить.
- Числа приводи ровно так, как они записаны.
- Сначала опасное: аллергии, критические и отклонённые показатели, тяжёлые диагнозы,
  недавние госпитализации, затем остальное.

Отвечай по-русски, коротко и ясно. Ответ всегда строго в формате JSON:
{
  "reply": "текст для врача, 1–4 предложения",
  "overview": "только если строил сводку: 3–5 предложений — кто пациент, чем болеет, что было, в каком состоянии сейчас; иначе пустая строка",
  "highlights": [
    { "level": "DANGER", "text": "что важно и почему", "evidence": ["A1"] }
  ],
  "suggestions": ["короткий вариант ответа врача, 0–3 штуки, например «Да, покажи сводку»"]
}
level — DANGER (опасно: аллергия, критическое значение, противопоказание), WARN (требует
внимания), INFO (стоит учесть). highlights — только в сводке, от 2 до 7 пунктов, каждый
со ссылкой хотя бы на одну запись.`

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'search_patients',
      description: 'Поиск пациентов по ПИНФЛ, номеру карты или части ФИО. Возвращает до 10 совпадений.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'ПИНФЛ, номер карты или ФИО (одно или несколько слов)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_patient_record',
      description: 'Полная запись цифрового двойника пациента для сводки: аллергии, диагнозы, назначения, анализы, показатели, госпитализации, образ жизни.',
      parameters: {
        type: 'object',
        properties: { patient_id: { type: 'string', description: 'id пациента из search_patients' } },
        required: ['patient_id'],
      },
    },
  },
]

type Row = Record<string, unknown>

interface IncomingMessage {
  role: 'user' | 'assistant'
  content: string
  // Пациенты, показанные в этом сообщении, и выбранный врачом пациент — чтобы
  // модель знала их id в следующих ходах без повторного поиска.
  patients?: { id: string; label: string }[]
  patientId?: string
}

export interface PatientCard {
  id: string
  patient_number: number | null
  name: string
  birth_date: string | null
  age: number | null
  gender: string
  national_id: string | null
  district: string | null
  risk_level: string | null
  twin_status: string | null
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')
const day = (value: unknown): string =>
  typeof value === 'string' && value ? new Date(value).toISOString().slice(0, 10) : '—'

function age(birth: string | null): number | null {
  if (!birth) return null
  const born = new Date(birth)
  const now = new Date()
  let years = now.getFullYear() - born.getFullYear()
  if (now.getMonth() < born.getMonth() || (now.getMonth() === born.getMonth() && now.getDate() < born.getDate())) years -= 1
  return years
}

function card(row: Row): PatientCard {
  const twin = (Array.isArray(row.digital_twins) ? row.digital_twins[0] : row.digital_twins) as Row | undefined
  const birth = text(row.birth_date) || null
  return {
    id: String(row.id),
    patient_number: typeof row.patient_number === 'number' ? row.patient_number : null,
    name: [text(row.last_name), text(row.first_name)].filter(Boolean).join(' '),
    birth_date: birth,
    age: age(birth),
    gender: text(row.gender),
    national_id: text(row.national_id) || null,
    district: text(row.district) || null,
    risk_level: twin ? text(twin.risk_level) || null : null,
    twin_status: twin ? text(twin.current_status) || null : null,
  }
}

const PATIENT_COLUMNS =
  'id, patient_number, first_name, last_name, birth_date, gender, national_id, district, digital_twins(risk_level, current_status)'

async function searchPatients(supabase: SupabaseClient, raw: string): Promise<PatientCard[]> {
  // Только буквы, цифры, пробел, дефис и апостроф: остальное ломает синтаксис фильтра.
  const query = raw.replace(/[^\p{L}\p{N}\s'’-]/gu, ' ').replace(/\s+/g, ' ').trim()
  if (!query) return []

  let request = supabase.from('patients').select(PATIENT_COLUMNS).limit(10)

  if (/^\d+$/.test(query)) {
    request = query.length >= 6
      ? request.ilike('national_id', `${query}%`)
      : request.eq('patient_number', Number(query))
  } else {
    for (const word of query.split(' ').slice(0, 3)) {
      request = request.or(`last_name.ilike.%${word}%,first_name.ilike.%${word}%`)
    }
    request = request.order('last_name').order('first_name')
  }

  const { data, error } = await request
  if (error) throw error
  return ((data ?? []) as Row[]).map(card)
}

export interface PatientRecord {
  patient: PatientCard
  allergies: { id: string; substance: string; reaction: string; severity: string }[]
  diagnoses_active: { id: string; name: string; code: string; since: string }[]
  diagnoses_past: { id: string; name: string; code: string; since: string; resolved: string }[]
  medications: { id: string; text: string }[]
  labs_abnormal: { id: string; date: string; analyte: string; value: string; flag: string }[]
  hospitalizations: { id: string; from: string; to: string; diagnosis: string; active: boolean }[]
  events: { id: string; date: string; title: string; severity: string }[]
  lifestyle: { id: string; text: string }[]
}

async function loadRecord(
  supabase: SupabaseClient,
  patientId: string,
): Promise<{ record: PatientRecord; facts: Map<string, string>; transcript: string } | null> {
  const { data: patientRow } = await supabase.from('patients').select(PATIENT_COLUMNS).eq('id', patientId).maybeSingle()
  if (!patientRow) return null

  const byPatient = (table: string) => supabase.from(table).select('*').eq('patient_id', patientId)
  const since = new Date(Date.now() - 30 * 86400_000).toISOString()

  const [allergies, diagnoses, medications, labs, observations, profile, stays, events] = await Promise.all([
    byPatient('allergies').eq('status', 'ACTIVE'),
    byPatient('diagnoses').neq('status', 'RULED_OUT').order('diagnosed_at', { ascending: false }),
    byPatient('medications').eq('status', 'ACTIVE'),
    byPatient('lab_results').order('collected_at', { ascending: false }).limit(60),
    byPatient('observations').order('recorded_at', { ascending: false }).limit(30),
    byPatient('patient_profile').maybeSingle(),
    supabase.from('hospitalizations')
      .select('admitted_at, discharged_at, primary_diagnosis, admission_reason, status')
      .eq('patient_id', patientId)
      .order('admitted_at', { ascending: false })
      .limit(6),
    supabase.from('twin_events')
      .select('occurred_at, title, description, severity')
      .eq('patient_id', patientId)
      .neq('severity', 'INFO')
      .gte('occurred_at', since)
      .order('occurred_at', { ascending: false })
      .limit(8),
  ])

  const rows = (result: { data: unknown }): Row[] => (result.data ?? []) as Row[]
  const facts = new Map<string, string>()
  const lines: string[] = []
  const add = (prefix: string, index: number, value: string): string => {
    const id = `${prefix}${index + 1}`
    facts.set(id, value)
    lines.push(`[${id}] ${value}`)
    return id
  }
  const heading = (title: string, empty: boolean) => lines.push('', `${title}:${empty ? ' нет записей' : ''}`)

  const patient = card(patientRow as Row)
  lines.push(
    `Пациент: ${patient.name}, ${patient.age ?? '?'} лет, пол ${patient.gender || 'не указан'}, ` +
    `карта №${patient.patient_number ?? '—'}, уровень риска двойника: ${patient.risk_level ?? 'не оценён'}, ` +
    `статус: ${patient.twin_status ?? '—'}`,
  )

  const allergyRows = rows(allergies)
  heading('Аллергии', allergyRows.length === 0)
  const allergyList = allergyRows.map((a, i) => {
    const item = { substance: text(a.substance), reaction: text(a.reaction), severity: text(a.severity) }
    return { id: add('A', i, `${item.substance}${item.reaction ? ` — ${item.reaction}` : ''}, ${item.severity}`), ...item }
  })

  const diagnosisRows = rows(diagnoses)
  const activeRows = diagnosisRows.filter((d) => text(d.status) === 'ACTIVE')
  const pastRows = diagnosisRows.filter((d) => text(d.status) !== 'ACTIVE')
  heading('Активные диагнозы', activeRows.length === 0)
  const diagnosesActive = activeRows.map((d, i) => {
    const item = { name: text(d.name), code: text(d.code), since: text(d.diagnosed_at) }
    return { id: add('D', i, `${item.name}${item.code ? ` (${item.code})` : ''}, ${text(d.type)}${item.since ? `, с ${item.since}` : ''}`), ...item }
  })
  heading('Перенесённые заболевания', pastRows.length === 0)
  const diagnosesPast = pastRows.map((d, i) => {
    const item = { name: text(d.name), code: text(d.code), since: text(d.diagnosed_at), resolved: text(d.resolved_at) }
    return { id: add('R', i, `${item.name}${item.code ? ` (${item.code})` : ''}, ${text(d.status)}${item.resolved ? `, разрешён ${item.resolved}` : ''}`), ...item }
  })

  const medicationRows = rows(medications)
  heading('Действующие назначения', medicationRows.length === 0)
  const medicationList = medicationRows.map((m, i) => {
    const value = [text(m.name), m.dose ?? '', text(m.dose_unit), text(m.frequency_text) || text(m.frequency)]
      .filter((part) => part !== '').join(' ')
    return { id: add('M', i, value), text: value }
  })

  // Последнее значение каждого анализа; в карточку попадают отклонённые.
  const latest = new Map<string, Row>()
  for (const l of rows(labs)) {
    const key = text(l.analyte).toLowerCase()
    if (!latest.has(key)) latest.set(key, l)
  }
  const labRows = [...latest.values()]
  heading('Анализы (последнее значение каждого)', labRows.length === 0)
  const labsAbnormal: PatientRecord['labs_abnormal'] = []
  labRows.forEach((l, i) => {
    const value = `${l.value_numeric ?? text(l.value_text)} ${text(l.unit)}`.trim()
    const flag = text(l.flag)
    const id = add('L', i, `${day(l.collected_at)} ${text(l.analyte)}: ${value}${flag && flag !== 'NORMAL' ? ` [${flag}]` : ''}`)
    if (flag && flag !== 'NORMAL') {
      labsAbnormal.push({ id, date: day(l.collected_at), analyte: text(l.analyte), value, flag })
    }
  })

  const observationRows = rows(observations)
  heading('Показатели (новые сверху)', observationRows.length === 0)
  observationRows.forEach((o, i) => add('O', i,
    `${day(o.recorded_at)} ${text(o.type)}: ${o.value_numeric ?? ''}` +
    `${o.value_secondary !== null && o.value_secondary !== undefined ? `/${o.value_secondary}` : ''} ${text(o.unit)}` +
    `${o.is_abnormal ? ' [отклонение]' : ''}`))

  const stayRows = rows(stays)
  heading('Госпитализации', stayRows.length === 0)
  const hospitalizations = stayRows.map((h, i) => {
    const item = {
      from: day(h.admitted_at),
      to: h.discharged_at ? day(h.discharged_at) : '',
      diagnosis: text(h.primary_diagnosis) || text(h.admission_reason) || 'диагноз не указан',
      active: text(h.status) === 'ACTIVE',
    }
    return { id: add('H', i, `${item.from}–${item.to || 'по настоящее время'}: ${item.diagnosis}`), ...item }
  })

  const eventRows = rows(events)
  heading('Тревожные события за 30 дней', eventRows.length === 0)
  const eventList = eventRows.map((e, i) => {
    const item = { date: day(e.occurred_at), title: text(e.title), severity: text(e.severity) }
    return { id: add('E', i, `${item.date} ${item.title}${e.description ? ` — ${text(e.description)}` : ''} [${item.severity}]`), ...item }
  })

  const profileRow = (profile.data ?? {}) as Row
  const lifestyleItems = [
    profileRow.smoking_status && profileRow.smoking_status !== 'UNKNOWN' ? `Курение: ${text(profileRow.smoking_status)}` : '',
    profileRow.alcohol_use && profileRow.alcohol_use !== 'UNKNOWN' ? `Алкоголь: ${text(profileRow.alcohol_use)}` : '',
    profileRow.physical_activity && profileRow.physical_activity !== 'UNKNOWN' ? `Активность: ${text(profileRow.physical_activity)}` : '',
    ...((profileRow.family_history ?? []) as string[]).map((entry) => `Семейный анамнез: ${entry}`),
    ...Object.entries((profileRow.genetic_markers ?? {}) as Row).map(([marker, value]) => `Генетический маркер ${marker}: ${String(value)}`),
  ].filter(Boolean)
  heading('Образ жизни, семейный анамнез, генетика', lifestyleItems.length === 0)
  const lifestyle = lifestyleItems.map((value, i) => ({ id: add('P', i, value), text: value }))

  return {
    record: {
      patient,
      allergies: allergyList,
      diagnoses_active: diagnosesActive,
      diagnoses_past: diagnosesPast,
      medications: medicationList,
      labs_abnormal: labsAbnormal,
      hospitalizations,
      events: eventList,
      lifestyle,
    },
    facts,
    transcript: lines.join('\n'),
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const authorization = request.headers.get('Authorization')
  if (!authorization) return failure('unauthorized', 401)

  const body = await request.json().catch(() => ({})) as { messages?: IncomingMessage[] }
  const history = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-MAX_HISTORY)
  if (history.length === 0 || history[history.length - 1].role !== 'user') return failure('bad_request', 400)

  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) {
    console.error('patient-assistant: OPENAI_API_KEY is not set')
    return failure('ai_unavailable', 503)
  }

  const model = Deno.env.get('OPENAI_MODEL') ?? DEFAULT_MODEL
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authorization } } },
  )

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM },
    ...history.map((m): OpenAI.Chat.Completions.ChatCompletionMessageParam => {
      let content = m.content.slice(0, 2000)
      if (m.role === 'assistant' && m.patients?.length) {
        content += `\n[Показаны пациенты: ${m.patients.map((p) => `${p.label} id=${p.id}`).join('; ')}]`
      }
      if (m.role === 'user' && m.patientId && UUID.test(m.patientId)) {
        content += `\n[Врач выбрал пациента id=${m.patientId}]`
      }
      return { role: m.role, content }
    }),
  ]

  // То, что интерфейс покажет из базы, независимо от текста модели.
  let patients: PatientCard[] = []
  let loaded: Awaited<ReturnType<typeof loadRecord>> = null

  try {
    const openai = new OpenAI({ apiKey })

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const completion = await openai.chat.completions.create({
        model,
        temperature: 0.2,
        max_tokens: 1200,
        response_format: { type: 'json_object' },
        tools: TOOLS,
        messages,
      })

      const message = completion.choices[0]?.message
      if (!message) break

      if (!message.tool_calls?.length) {
        const raw = message.content?.trim()
        if (!raw) break
        return json(finish(JSON.parse(raw) as Row, patients, loaded, model))
      }

      messages.push(message)
      for (const call of message.tool_calls) {
        const args = JSON.parse(call.function.arguments || '{}') as Row
        let result: string

        if (call.function.name === 'search_patients') {
          patients = await searchPatients(supabase, text(args.query))
          loaded = null
          result = patients.length === 0
            ? 'Совпадений нет.'
            : patients.map((p) =>
              `id=${p.id}; ${p.name}; ${p.age ?? '?'} лет; д.р. ${p.birth_date ?? '—'}; карта №${p.patient_number ?? '—'}; ` +
              `район: ${p.district ?? '—'}; риск: ${p.risk_level ?? '—'}`).join('\n')
        } else if (call.function.name === 'get_patient_record') {
          const id = text(args.patient_id)
          loaded = UUID.test(id) ? await loadRecord(supabase, id) : null
          result = loaded ? loaded.transcript : 'Пациент не найден или недоступен.'
          if (loaded) patients = []
        } else {
          result = 'Неизвестный инструмент.'
        }

        messages.push({ role: 'tool', tool_call_id: call.id, content: result })
      }
    }

    console.error('patient-assistant: no final answer')
    return failure('ai_failed', 502)
  } catch (caught) {
    // подробности — только в логи функции, врач видит нейтральное сообщение
    console.error('patient-assistant: failed', caught)
    return failure('ai_failed', 502)
  }
})

function finish(
  parsed: Row,
  patients: PatientCard[],
  loaded: Awaited<ReturnType<typeof loadRecord>>,
  model: string,
) {
  const LEVELS = ['DANGER', 'WARN', 'INFO']

  const highlights = loaded
    ? (Array.isArray(parsed.highlights) ? parsed.highlights as Row[] : [])
      .map((item) => ({
        level: text(item.level),
        text: text(item.text),
        evidence: (Array.isArray(item.evidence) ? item.evidence : [])
          .map((id) => text(id).replace(/[[\]]/g, ''))
          .filter((id) => loaded.facts.has(id))
          .map((id) => ({ id, text: loaded.facts.get(id)! })),
      }))
      .filter((item) => LEVELS.includes(item.level) && item.text && item.evidence.length > 0)
      .sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level))
      .slice(0, 7)
    : []

  return {
    reply: text(parsed.reply),
    overview: loaded ? text(parsed.overview) : '',
    highlights,
    suggestions: (Array.isArray(parsed.suggestions) ? parsed.suggestions : [])
      .filter((item): item is string => typeof item === 'string' && item.trim() !== '')
      .slice(0, 3),
    patients,
    record: loaded?.record ?? null,
    model,
  }
}

function failure(code: string, status: number): Response {
  return json({ error: code }, status)
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
