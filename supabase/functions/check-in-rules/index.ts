// Правила самоконтроля в Telegram по требованиям врача при выписке.
//
// Врач пишет требования к наблюдению обычным текстом. CareTwin AI раскладывает
// их на правила: когда и как часто писать пациенту, сколько дней, какие вопросы
// и какие личные пороги риска. Функция ничего не записывает: результат попадает
// в форму выписки, врач проверяет его и сохраняет вместе с выпиской.
//
// Запросы идут с JWT врача (RLS действует). Всё, что вернула модель, проходит
// через validateRules: диапазоны, формат, а личные пороги — только с дословной
// цитатой из текста врача.

import OpenAI from 'npm:openai@4'
import { createClient } from 'npm:@supabase/supabase-js@2'

import { DEFAULT_RULES, THRESHOLDS, validateRules } from '../_shared/check-in-rules.ts'

const DEFAULT_MODEL = 'gpt-4.1-mini'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SYSTEM = `Ты — ассистент клинической системы CareTwin AI. Врач при выписке написал
требования к наблюдению пациента дома. Разложи их на правила ежедневного опроса пациента
в Telegram-боте. Ты НЕ принимаешь клинических решений — только переносишь требования врача
в поля. Врач проверит результат.

Что умеет бот. Вопросы (коды): TEMPERATURE — температура, SPO2 — сатурация, HEART_RATE — пульс,
BLOOD_PRESSURE — давление, WELLBEING — самочувствие по сравнению со вчера, DYSPNEA — одышка,
SYMPTOMS — новые симптомы, MEDICATIONS — приняты ли лекарства. Больше бот ничего не собирает.

Правила заполнения:
1. times — местное время опросов "HH:MM", от 06:00 до 23:00, 1–4 раза в день.
   Если частота не указана — ["10:00"]. «2 раза в день» / «утром и вечером» — ["08:00", "20:00"].
   «3 раза в день» — ["08:00", "14:00", "20:00"]. Если врач назвал время — используй его.
2. every_n_days — 1 каждый день, 2 через день и т. д. По умолчанию 1.
3. duration_days — сколько дней опрашивать, если врач указал срок; иначе null (до конца плана).
4. response_window_hours — сколько часов ждать ответа; если врач не указал — 4 при 2+ опросах в день, иначе 6.
5. questions — показатели, которые врач просит контролировать. Если врач ничего не уточнил — все.
6. thresholds — ТОЛЬКО если врач явно назвал число, при котором нужно сообщить или насторожиться.
   Никогда не придумывай пороги сам. Для каждого порога приведи quote — ДОСЛОВНЫЙ фрагмент текста
   врача с этим числом. Коды и направление:
   SPO2_LOW (ниже), TEMP_HIGH (выше), HR_HIGH (выше), HR_LOW (ниже), BP_SYS_HIGH (систолическое выше),
   BP_SYS_LOW (систолическое ниже), BP_DIA_HIGH (диастолическое выше).
   medium — «сообщить/насторожиться», high — «срочно/немедленно/вызвать». Если уровень неясен — medium.
   Направление «ниже N» означает значение ≤ N-1 для целых показателей (SpO₂, пульс, давление);
   «N и ниже» — ≤ N. Для «выше N» — ≥ N+1 для целых, для температуры «выше 37,8» — 37.9.
7. unsupported — требования врача, которые бот собрать не может (вес, глюкоза, осмотр раны и т. п.),
   коротко, чтобы врач поручил их медсестре.
8. rationale — 1–2 предложения по-русски: как требования врача перенесены в правила.

Ответ строго JSON:
{ "times": ["08:00","20:00"], "every_n_days": 1, "duration_days": 14, "response_window_hours": 4,
  "questions": ["BLOOD_PRESSURE","HEART_RATE"],
  "thresholds": { "SPO2_LOW": { "high": 91, "quote": "при SpO2 ниже 92% срочно сообщить" } },
  "unsupported": ["контроль веса"], "rationale": "..." }`

interface Body {
  hospitalizationId?: string
  requirements?: string
  diagnoses?: string[]
  medications?: string[]
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const authorization = request.headers.get('Authorization')
  if (!authorization) return json({ error: 'unauthorized' }, 401)

  const body = await request.json().catch(() => ({})) as Body
  const requirements = (body.requirements ?? '').trim().slice(0, 4000)
  if (!body.hospitalizationId) return json({ error: 'hospitalizationId required' }, 400)

  // без требований правила — значения по умолчанию, модель не нужна
  if (!requirements) {
    return json({ ...DEFAULT_RULES, source: 'DEFAULT', generated_at: new Date().toISOString() })
  }

  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) {
    console.error('check-in-rules: OPENAI_API_KEY is not set')
    return json({ error: 'ai_unavailable' }, 503)
  }
  const model = Deno.env.get('OPENAI_MODEL') ?? DEFAULT_MODEL

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authorization } } },
  )

  // доступ к госпитализации проверяет RLS: чужую врач не увидит
  const { data: stay, error } = await supabase
    .from('hospitalizations')
    .select('patient_id, primary_diagnosis, admission_reason, patient:patients(birth_date, gender)')
    .eq('id', body.hospitalizationId)
    .maybeSingle()
  if (error || !stay) return json({ error: 'not_found' }, 404)

  const { data: diagnoses } = await supabase
    .from('diagnoses')
    .select('name, code')
    .eq('patient_id', stay.patient_id)
    .eq('status', 'ACTIVE')

  const list = (items: unknown) =>
    (Array.isArray(items) ? items : []).filter((item): item is string => typeof item === 'string' && item.trim() !== '')
      .slice(0, 20).map((item) => item.slice(0, 200))

  const facts = [
    `Основной диагноз госпитализации: ${stay.primary_diagnosis ?? '—'}`,
    `Причина поступления: ${stay.admission_reason ?? '—'}`,
    `Диагнозы в карте: ${(diagnoses ?? []).map((d) => `${d.name}${d.code ? ` (${d.code})` : ''}`).join('; ') || '—'}`,
    `Диагнозы в форме выписки: ${list(body.diagnoses).join('; ') || '—'}`,
    `Назначения на выписку: ${list(body.medications).join('; ') || '—'}`,
  ].join('\n')

  try {
    const openai = new OpenAI({ apiKey })
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0,
      max_tokens: 700,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: `Контекст пациента (для понимания, не для порогов):\n${facts}\n\n` +
            `Требования врача:\n"""\n${requirements}\n"""\n\nРазложи требования на правила.`,
        },
      ],
    })

    const raw = completion.choices[0]?.message?.content?.trim()
    if (!raw) throw new Error('empty model response')

    const rules = validateRules(JSON.parse(raw) as Record<string, unknown>, requirements)
    return json({
      ...rules,
      threshold_codes: Object.keys(THRESHOLDS),
      source: 'AI',
      model,
      generated_at: new Date().toISOString(),
    })
  } catch (caught) {
    // подробности — в логи функции; врач видит нейтральное «не удалось»
    console.error('check-in-rules: generation failed', caught)
    return json({ error: 'ai_failed' }, 502)
  }
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
