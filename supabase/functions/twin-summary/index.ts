// Запросы выполняются с JWT пользователя, чтобы сохранить ограничения RLS.

import OpenAI from 'npm:openai@4'
import { createClient } from 'npm:@supabase/supabase-js@2'

const DEFAULT_MODEL = 'gpt-4.1-mini'
const WINDOW_HOURS = 72
const MAX_EVENTS = 80

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SYSTEM = `Ты — ассистент клинической системы CareTwin AI.

Твоя задача: коротко описать, что изменилось у пациентов за последние сутки-трое,
чтобы медицинский работник за несколько секунд понял, кому нужно внимание.

Строгие правила:
1. Используй ТОЛЬКО факты из предоставленных записей. Ничего не додумывай.
2. Не ставь диагноз, не назначай и не меняй лечение, не объясняй причину состояния.
3. Не утверждай того, чего нет в данных. Если данных мало — напиши об этом прямо.
4. Сначала высокий риск и ухудшение, затем остальное.
5. Пиши по-русски. Числа приводи ровно так, как они записаны.

Ответ верни строго в формате JSON:
{
  "alert": "2–4 предложения о главном изменении",
  "findings": ["короткий пункт", "короткий пункт"]
}

В "findings" — от 3 до 6 наблюдений, каждое одной строкой, без нумерации.
Последним пунктом добавь, что именно стоит сделать медработнику, начав со слова
"Рекомендация:". Это организационное действие (осмотреть, связаться, уточнить),
никогда не назначение лечения.`

interface EventRow {
  id: string
  event_type: string
  severity: string
  occurred_at: string
  title: string
  description: string | null
  patient: { patient_number: number; first_name: string; last_name: string } | null
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const authorization = request.headers.get('Authorization')
  if (!authorization) {
    return json({ error: 'Требуется авторизация.' }, 401)
  }

  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) {
    return json({ error: 'OPENAI_API_KEY не настроен.' }, 500)
  }

  const model = Deno.env.get('OPENAI_MODEL') ?? DEFAULT_MODEL

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authorization } } },
  )

  const body = await request.json().catch(() => ({})) as { patientId?: string }

  const since = new Date(Date.now() - WINDOW_HOURS * 3600_000).toISOString()

  let query = supabase
    .from('twin_events')
    .select('id, event_type, severity, occurred_at, title, description, patient:patients(patient_number, first_name, last_name)')
    .gte('occurred_at', since)
    .order('occurred_at', { ascending: false })
    .limit(MAX_EVENTS)

  if (body.patientId) query = query.eq('patient_id', body.patientId)

  const { data, error } = await query

  if (error) return json({ error: error.message }, 400)

  const events = (data ?? []) as unknown as EventRow[]
  if (events.length === 0) {
    return json({
      summary: 'За последние трое суток изменений нет.',
      findings: [],
      sources: [],
      event_count: 0,
      generated_at: new Date().toISOString(),
      model,
    })
  }

  const transcript = [...events]
    .reverse()
    .map((event) => {
      const who = event.patient
        ? `${event.patient.last_name} ${event.patient.first_name} (№${event.patient.patient_number})`
        : 'пациент не указан'
      const when = new Date(event.occurred_at).toLocaleString('ru-RU', { timeZone: 'UTC' })
      const flag = event.severity === 'INFO' ? '' : ` [${event.severity}]`
      const detail = event.description ? ` — ${event.description}` : ''
      return `${when} · ${who} · ${event.title}${detail}${flag}`
    })
    .join('\n')

  try {
    const openai = new OpenAI({ apiKey })

    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.2,
      max_tokens: 900,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: `Записи цифровых двойников за последние ${WINDOW_HOURS} часов:\n\n${transcript}\n\nОпиши, что изменилось.`,
        },
      ],
    })

    const raw = completion.choices[0]?.message?.content?.trim()
    if (!raw) {
      return json({ error: 'Модель вернула пустой ответ.' }, 502)
    }

    let summary = raw
    let findings: string[] = []
    try {
      const parsed = JSON.parse(raw) as { alert?: string; findings?: string[] }
      if (parsed.alert) summary = parsed.alert
      if (Array.isArray(parsed.findings)) findings = parsed.findings.filter((f) => typeof f === 'string')
    } catch {
      // При невалидном JSON показываем исходный текст ответа.
    }

    return json({
      summary,
      findings,
      sources: events.map((event) => event.id),
      event_count: events.length,
      generated_at: new Date().toISOString(),
      model,
    })
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'Не удалось получить сводку.'
    return json({ error: message }, 502)
  }
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
