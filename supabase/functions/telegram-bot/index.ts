// Telegram-бот самоконтроля после выписки.
//
// Пользовательского JWT здесь нет: запросы приходят от Telegram и от pg_cron,
// поэтому функция развёрнута с verify_jwt = false и проверяет их сама:
//   • webhook — заголовок X-Telegram-Bot-Api-Secret-Token = TELEGRAM_WEBHOOK_SECRET;
//   • ?task=dispatch / ?task=notify — заголовок x-cron-secret, сверяется с секретом в Vault
//     (их вызывает сама база: pg_cron и триггер на alerts);
//   • ?task=setup — заголовок x-setup-token = TELEGRAM_WEBHOOK_SECRET.
// Работает под service role, но в таблицы напрямую не пишет: только через
// RPC, которые сами находят пациента по telegram_id и проверяют ответы.
//
// Пациент не получает ни диагноза, ни уровня риска — только подтверждение.
// Пояснение ИИ предназначено медсестре и сохраняется в alerts.ai_summary.

import OpenAI from 'npm:openai@4'
import { createClient } from 'npm:@supabase/supabase-js@2'

import {
  MESSAGES,
  QUESTIONS,
  SKIP_DEVICE,
  SOS_BUTTON,
  callbackData,
  choiceLabel,
  promptOf,
  isStep,
  parseCallback,
  parseNumber,
  parsePressure,
  type Step,
} from '../_shared/check-in.ts'

const DEFAULT_MODEL = 'gpt-4.1-mini'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? ''
const WEBHOOK_SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET') ?? ''

const db = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// --- Telegram API -------------------------------------------------------------

interface TgUser { id: number; first_name?: string }
interface TgChat { id: number; type: string }
interface TgMessage {
  message_id: number
  chat: TgChat
  from?: TgUser
  text?: string
  contact?: { phone_number: string; user_id?: number }
  location?: { latitude: number; longitude: number; horizontal_accuracy?: number; live_period?: number }
}
interface TgCallback { id: string; from: TgUser; data?: string; message?: TgMessage }
interface TgUpdate { message?: TgMessage; edited_message?: TgMessage; callback_query?: TgCallback }

type Keyboard =
  | { inline_keyboard: { text: string; callback_data: string }[][] }
  | {
    keyboard: { text: string; request_contact?: boolean; request_location?: boolean }[][]
    resize_keyboard: boolean
    one_time_keyboard?: boolean
    is_persistent?: boolean
  }
  | { remove_keyboard: true }

async function tg(method: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const body = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok || body.ok === false) {
    console.error(`telegram ${method} failed`, response.status, body.description)
  }
  return body
}

const send = (chatId: number, text: string, reply_markup?: Keyboard) =>
  tg('sendMessage', { chat_id: chatId, text, ...(reply_markup ? { reply_markup } : {}) })

// --- RPC ----------------------------------------------------------------------

async function rpc<T = Record<string, unknown>>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(name, args)
  if (error) throw new Error(`${name}: ${error.message}`)
  return data as T
}

interface Session {
  patient_id: string
  first_name: string
  check_in: { id: string; current_step: string | null; steps: string[] } | null
}

// --- Опрос --------------------------------------------------------------------

/** Вопросы опроса задаёт база (правила врача); steps — только для нумерации. */
async function ask(chatId: number, step: Step, steps?: string[]): Promise<void> {
  const question = QUESTIONS[step]
  const prompt = promptOf(step, steps)
  const skip = (label: string) => ({
    inline_keyboard: [[{ text: label, callback_data: callbackData(step, 'SKIP') }]],
  })

  switch (question.kind) {
    case 'number':
    case 'pressure':
      await send(chatId, `${prompt}\n${question.hint}`, skip(SKIP_DEVICE))
      return
    case 'text':
      await send(chatId, prompt, skip(question.skipLabel))
      return
    case 'choice':
      await send(chatId, prompt, {
        inline_keyboard: question.choices.map((choice) => [
          { text: choice.label, callback_data: callbackData(step, choice.value) },
        ]),
      })
  }
}

async function save(chatId: number, telegramId: number, step: Step, answer: Record<string, unknown>): Promise<void> {
  let result: { status: string; current_step?: string | null; steps?: string[] }
  try {
    // следующий вопрос выбирает база по правилам этого пациента
    result = await rpc('save_check_in_answer', {
      p_telegram_id: telegramId,
      p_step: step === 'SYMPTOMS_TEXT' ? 'SYMPTOMS' : step,
      p_answer: answer,
    })
  } catch (caught) {
    console.error(caught)
    await send(chatId, MESSAGES.error)
    return
  }

  if (result.status === 'NO_CHECK_IN') {
    await send(chatId, MESSAGES.noCheckIn)
    return
  }
  if (result.status === 'STALE_STEP') {
    // нажата кнопка из старого сообщения — повторяем текущий вопрос
    if (isStep(result.current_step)) await ask(chatId, result.current_step, result.steps)
    return
  }

  if (isStep(result.current_step)) await ask(chatId, result.current_step, result.steps)
  else await complete(chatId, telegramId)
}

async function complete(chatId: number, telegramId: number): Promise<void> {
  let result: { status: string; alert_id?: string | null }
  try {
    result = await rpc('complete_check_in', { p_telegram_id: telegramId })
  } catch (caught) {
    console.error(caught)
    await send(chatId, MESSAGES.error)
    return
  }

  if (result.status !== 'OK') {
    await send(chatId, MESSAGES.noCheckIn)
    return
  }

  await send(chatId, MESSAGES.done, SOS_KEYBOARD)

  // Пояснение для медсестры готовим после ответа пациенту: тревога уже видна
  // на панели, текст ИИ дописывается в неё следом (Realtime покажет обновление).
  if (result.alert_id) runInBackground(explainAlert(result.alert_id))
}

async function repeatCurrent(chatId: number, telegramId: number): Promise<void> {
  const session = await rpc<Session | null>('telegram_session', { p_telegram_id: telegramId })
  const step = session?.check_in?.current_step
  if (isStep(step)) await ask(chatId, step, session?.check_in?.steps)
  else await send(chatId, MESSAGES.noCheckIn)
}

async function beginCheckIn(chatId: number, telegramId: number): Promise<void> {
  const started = await rpc<{ status: string; created?: boolean; current_step?: string; first_name?: string; steps?: string[] }>(
    'start_check_in', { p_telegram_id: telegramId, p_trigger: 'PATIENT' })

  if (started.status === 'NOT_LINKED') {
    await askToLink(chatId)
    return
  }
  const step = isStep(started.current_step) ? started.current_step : 'TEMPERATURE'
  await send(chatId, started.created ? MESSAGES.greeting(started.first_name ?? '') : MESSAGES.resume, SOS_KEYBOARD)
  await ask(chatId, step, started.steps)
}

// --- SOS ----------------------------------------------------------------------

// Кнопка всегда видна под полем ввода; на телефоне сама отправляет геопозицию.
const SOS_KEYBOARD: Keyboard = {
  keyboard: [[{ text: SOS_BUTTON, request_location: true }]],
  resize_keyboard: true,
  is_persistent: true,
}

/** Показывает кнопку 🆘 и закрепляет подсказку вверху чата. */
async function showSos(chatId: number): Promise<void> {
  const sent = await send(chatId, MESSAGES.sosPinned, SOS_KEYBOARD)
  const messageId = (sent.result as { message_id?: number } | undefined)?.message_id
  if (messageId) {
    await tg('pinChatMessage', { chat_id: chatId, message_id: messageId, disable_notification: true })
  }
}

interface SosResult { status: string; created?: boolean; created_at?: string; has_location?: boolean }

async function raiseSos(chatId: number, telegramId: number, location?: TgMessage['location']): Promise<void> {
  const result = await rpc<SosResult>('raise_emergency', {
    p_telegram_id: telegramId,
    p_latitude: location?.latitude ?? null,
    p_longitude: location?.longitude ?? null,
    p_accuracy: location?.horizontal_accuracy ?? null,
    p_live_until: location?.live_period
      ? new Date(Date.now() + location.live_period * 1000).toISOString()
      : null,
  })

  if (result.status === 'NOT_LINKED') {
    await askToLink(chatId)
    return
  }

  if (result.created) {
    await send(chatId, MESSAGES.sosSent(Boolean(location)), SOS_KEYBOARD)
  } else {
    await send(chatId, MESSAGES.sosRepeat(result.created_at ?? new Date().toISOString(), Boolean(location)), SOS_KEYBOARD)
  }
  if (!result.has_location) await send(chatId, MESSAGES.sosAskLocation)
}

/** Сообщение пациенту, когда медсестра ответила на SOS (вызывает триггер базы). */
async function notifyPatient(alertId: string, event: string): Promise<{ sent: boolean }> {
  const info = await rpc<{ telegram_id: number | null; visit_eta: string | null } | null>(
    'emergency_notification', { p_alert_id: alertId })
  if (!info?.telegram_id) return { sent: false }

  const text = event === 'ETA' && info.visit_eta
    ? MESSAGES.notifyEta(info.visit_eta)
    : event === 'ACKNOWLEDGED'
      ? MESSAGES.notifyAcknowledged
      : event === 'RESOLVED'
        ? MESSAGES.notifyResolved
        : null
  if (!text) return { sent: false }

  const result = await send(info.telegram_id, text, SOS_KEYBOARD)
  return { sent: result.ok === true }
}

// --- Привязка -----------------------------------------------------------------

async function askToLink(chatId: number): Promise<void> {
  await send(chatId, MESSAGES.welcomeUnlinked, {
    keyboard: [[{ text: MESSAGES.sharePhone, request_contact: true }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  })
}

async function reportLink(chatId: number, result: { status: string; first_name?: string }): Promise<void> {
  switch (result.status) {
    case 'LINKED':
      await send(chatId, MESSAGES.linked(result.first_name ?? ''), SOS_KEYBOARD)
      await showSos(chatId)
      return
    case 'EXPIRED': await send(chatId, MESSAGES.expiredCode); return
    case 'TAKEN': await send(chatId, MESSAGES.taken); return
    case 'NOT_FOUND': await send(chatId, MESSAGES.phoneNotFound); return
    case 'AMBIGUOUS': await send(chatId, MESSAGES.phoneAmbiguous); return
    default: await send(chatId, MESSAGES.invalidCode)
  }
}

const CODE_PATTERN = /^CT[0-9A-F]{10}$/i

// --- Обработка обновлений -----------------------------------------------------

async function onMessage(message: TgMessage): Promise<void> {
  if (message.chat.type !== 'private' || !message.from) return
  const chatId = message.chat.id
  const telegramId = message.from.id

  if (message.contact) {
    // только собственный номер: чужой контакт не подтверждает личность
    if (message.contact.user_id !== telegramId) {
      await send(chatId, MESSAGES.foreignContact)
      return
    }
    await reportLink(chatId, await rpc('telegram_link_by_phone', {
      p_telegram_id: telegramId, p_phone: message.contact.phone_number,
    }))
    return
  }

  // геопозиция приходит только по кнопке 🆘 или через 📎 — это всегда SOS
  if (message.location) {
    await raiseSos(chatId, telegramId, message.location)
    return
  }

  const text = (message.text ?? '').trim()
  if (!text) return

  const [command, payload] = text.split(/\s+/, 2)
  const bare = command.toLowerCase().replace(/@.*$/, '')

  // SOS раньше всего остального, даже посреди опроса. Текст кнопки приходит,
  // если клиент (например, Telegram Desktop) не умеет отправлять геопозицию.
  if (bare === '/sos' || text === SOS_BUTTON) {
    await raiseSos(chatId, telegramId)
    return
  }

  if (bare === '/start') {
    if (payload) {
      await reportLink(chatId, await rpc('telegram_link_by_code', { p_telegram_id: telegramId, p_code: payload }))
      return
    }
    const session = await rpc<Session | null>('telegram_session', { p_telegram_id: telegramId })
    if (session) {
      await send(chatId, MESSAGES.linked(session.first_name), SOS_KEYBOARD)
      await showSos(chatId)
    } else {
      await askToLink(chatId)
    }
    return
  }
  if (bare === '/help') {
    await send(chatId, MESSAGES.help, SOS_KEYBOARD)
    return
  }
  if (bare === '/checkin') {
    await beginCheckIn(chatId, telegramId)
    return
  }

  const session = await rpc<Session | null>('telegram_session', { p_telegram_id: telegramId })
  if (!session) {
    if (CODE_PATTERN.test(text)) {
      await reportLink(chatId, await rpc('telegram_link_by_code', { p_telegram_id: telegramId, p_code: text }))
    } else {
      await askToLink(chatId)
    }
    return
  }

  const step = session.check_in?.current_step
  if (!isStep(step)) {
    await send(chatId, MESSAGES.noCheckIn)
    return
  }

  const question = QUESTIONS[step]
  switch (question.kind) {
    case 'number': {
      const parsed = parseNumber(text, question)
      if (!parsed.ok) {
        await send(chatId, parsed.error)
        return
      }
      await save(chatId, telegramId, step, { value: parsed.value })
      return
    }
    case 'pressure': {
      const parsed = parsePressure(text)
      if (!parsed.ok) {
        await send(chatId, parsed.error)
        return
      }
      await save(chatId, telegramId, step, parsed.value)
      return
    }
    case 'text':
      await save(chatId, telegramId, step, { choice: 'YES', text: text.slice(0, 500) })
      return
    case 'choice': {
      // ответ словом вместо кнопки тоже принимаем, если он однозначен
      const typed = question.choices.find((choice) => choice.label.toLowerCase() === text.toLowerCase())
      if (!typed) {
        await send(chatId, 'Пожалуйста, выберите вариант кнопкой.')
        await ask(chatId, step, session.check_in?.steps)
        return
      }
      await onChoice(chatId, telegramId, step, typed.value)
    }
  }
}

async function onChoice(chatId: number, telegramId: number, step: Step, value: string): Promise<void> {
  if (step === 'SYMPTOMS' && value === 'YES') {
    const moved = await rpc<{ status: string }>('set_check_in_step', {
      p_telegram_id: telegramId, p_from: 'SYMPTOMS', p_to: 'SYMPTOMS_TEXT',
    })
    if (moved.status === 'OK') await ask(chatId, 'SYMPTOMS_TEXT')
    else await repeatCurrent(chatId, telegramId)
    return
  }
  await save(chatId, telegramId, step, { choice: value })
}

async function onCallback(callback: TgCallback): Promise<void> {
  await tg('answerCallbackQuery', { callback_query_id: callback.id })

  const parsed = parseCallback(callback.data)
  const message = callback.message
  if (!parsed || !message || message.chat.type !== 'private') return

  const chatId = message.chat.id
  const telegramId = callback.from.id
  const { step, value } = parsed

  // убираем кнопки и оставляем в переписке выбранный ответ
  const picked = value === 'SKIP'
    ? (QUESTIONS[step].kind === 'text' ? 'без описания' : 'пропущено')
    : choiceLabel(step, value)
  await tg('editMessageText', {
    chat_id: chatId,
    message_id: message.message_id,
    text: `${message.text ?? ''}\n\n→ ${picked ?? value}`,
  })

  if (value === 'SKIP') {
    if (step === 'SYMPTOMS_TEXT') await save(chatId, telegramId, step, { choice: 'YES' })
    else if (QUESTIONS[step].kind === 'number' || QUESTIONS[step].kind === 'pressure') {
      await save(chatId, telegramId, step, { skipped: true })
    }
    return
  }

  if (QUESTIONS[step].kind !== 'choice' || !choiceLabel(step, value)) return
  await onChoice(chatId, telegramId, step, value)
}

// --- Рассылка по расписанию ---------------------------------------------------

async function dispatch(): Promise<{ sent: number; failed: number }> {
  const due = await rpc<{ check_in_id: string; telegram_id: number; first_name: string; steps: string[] }[]>(
    'claim_due_check_ins', {})

  let sent = 0
  let failed = 0
  for (const row of due ?? []) {
    const greeting = await send(row.telegram_id, MESSAGES.greeting(row.first_name), SOS_KEYBOARD)
    const first = row.steps?.[0]
    if (greeting.ok) {
      await ask(row.telegram_id, isStep(first) ? first : 'TEMPERATURE', row.steps)
      sent += 1
    } else {
      // пациент заблокировал бота и т. п. — опрос истечёт и станет тревогой MISSED_CHECK_IN
      failed += 1
    }
  }
  return { sent, failed }
}

async function setup(): Promise<Record<string, unknown>> {
  await tg('setWebhook', {
    url: `${SUPABASE_URL}/functions/v1/telegram-bot`,
    secret_token: WEBHOOK_SECRET,
    allowed_updates: ['message', 'edited_message', 'callback_query'],
    drop_pending_updates: true,
  })
  await tg('setMyCommands', {
    // Список открывается над полем ввода, и на части клиентов верхние пункты
    // уходят под шапку чата. Поэтому /sos последний — ближе всего к пальцу.
    commands: [
      { command: 'help', description: 'Справка' },
      { command: 'checkin', description: 'Опрос о самочувствии' },
      { command: 'sos', description: '🆘 Мне плохо' },
    ],
  })
  return tg('getWebhookInfo', {})
}

// --- Пояснение CareTwin AI для медсестры --------------------------------------

const EXPLAIN_SYSTEM = `Ты — ассистент клинической системы CareTwin AI.

Движок правил уже определил уровень риска пациента после выписки и перечислил причины.
Твоя задача — коротко объяснить медсестре, что изменилось, опираясь на эти причины и
на записи цифрового двойника.

Строгие правила:
1. Используй ТОЛЬКО факты из предоставленных записей. Ничего не додумывай.
2. Не ставь диагноз, не называй вероятную болезнь, не назначай и не меняй лечение.
3. Уровень риска не пересматривай — его определили правила, ты только поясняешь.
4. Ссылайся на записи их метками в квадратных скобках, например [R1], [O3].
5. Пиши по-русски, числа приводи ровно так, как они записаны.

Ответ верни строго в формате JSON:
{ "summary": "2–4 предложения: что изменилось и в какой динамике", "action": "Рекомендация: ..." }

"action" — организационное действие (связаться с пациентом, организовать осмотр,
сообщить врачу), никогда не назначение лечения.`

interface Reason { code: string; level: string; detail: string; recorded_at?: string }

async function explainAlert(alertId: string): Promise<void> {
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  const model = Deno.env.get('OPENAI_MODEL') ?? DEFAULT_MODEL

  const fail = (message: string) =>
    db.from('alerts').update({ ai_error: message }).eq('id', alertId)

  if (!apiKey) {
    await fail('OPENAI_API_KEY не настроен.')
    return
  }

  try {
    const { data: alert, error } = await db
      .from('alerts')
      .select('id, level, reasons, patient_id, patient:patients(first_name, last_name, birth_date, gender)')
      .eq('id', alertId)
      .single()
    if (error || !alert) throw new Error(error?.message ?? 'alert not found')

    const patientId = alert.patient_id as string
    const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString()

    const [twin, diagnoses, medications, observations, stay] = await Promise.all([
      db.from('digital_twins').select('current_status').eq('patient_id', patientId).maybeSingle(),
      db.from('diagnoses').select('name, code, type').eq('patient_id', patientId).eq('status', 'ACTIVE'),
      db.from('medications').select('name, dose, dose_unit, frequency').eq('patient_id', patientId).eq('status', 'ACTIVE'),
      db.from('observations')
        .select('type, value_numeric, value_secondary, value_text, unit, source, note, recorded_at')
        .eq('patient_id', patientId)
        .gte('recorded_at', since)
        .order('recorded_at', { ascending: true })
        .limit(80),
      db.from('hospitalizations')
        .select('primary_diagnosis, discharged_at')
        .eq('patient_id', patientId)
        .not('discharged_at', 'is', null)
        .order('discharged_at', { ascending: false })
        .limit(1),
    ])

    const patient = alert.patient as unknown as
      { first_name: string; last_name: string; birth_date: string | null; gender: string } | null
    const age = patient?.birth_date
      ? Math.floor((Date.now() - new Date(patient.birth_date).getTime()) / (365.25 * 24 * 3600_000))
      : null
    const when = (iso: string) =>
      new Date(iso).toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent', dateStyle: 'short', timeStyle: 'short' })

    const lines: string[] = []
    lines.push(`Пациент: ${age !== null ? `${age} лет` : 'возраст не указан'}, пол ${patient?.gender ?? 'не указан'}; статус двойника ${twin.data?.current_status ?? '—'}.`)
    const discharge = stay.data?.[0]
    if (discharge) lines.push(`Выписка: ${when(discharge.discharged_at as string)}; основной диагноз госпитализации: ${discharge.primary_diagnosis ?? '—'}.`)
    lines.push(`\nУровень риска по правилам: ${alert.level}.`)
    lines.push('Причины (движок правил):')
    ;((alert.reasons ?? []) as Reason[]).forEach((reason, index) =>
      lines.push(`[R${index + 1}] ${reason.level}: ${reason.detail}`))

    lines.push('\nАктивные диагнозы:')
    ;(diagnoses.data ?? []).forEach((d, index) =>
      lines.push(`[D${index + 1}] ${d.name}${d.code ? ` (${d.code})` : ''}`))
    lines.push('\nТекущие назначения:')
    ;(medications.data ?? []).forEach((m, index) =>
      lines.push(`[M${index + 1}] ${m.name}${m.dose ? ` ${m.dose}${m.dose_unit ?? ''}` : ''}${m.frequency ? `, ${m.frequency}` : ''}`))

    lines.push('\nИзмерения и ответы пациента за 7 дней (по времени):')
    ;(observations.data ?? []).forEach((o, index) => {
      const value = o.value_secondary !== null
        ? `${o.value_numeric}/${o.value_secondary}`
        : o.value_numeric ?? o.value_text ?? '—'
      const note = o.note ? ` «${String(o.note).slice(0, 120)}»` : ''
      lines.push(`[O${index + 1}] ${when(o.recorded_at as string)} · ${o.type} ${value}${o.unit ? ` ${o.unit}` : ''} · ${o.source}${note}`)
    })

    const openai = new OpenAI({ apiKey })
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.2,
      max_tokens: 500,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: EXPLAIN_SYSTEM },
        { role: 'user', content: `${lines.join('\n')}\n\nОбъясни медсестре, что изменилось.` },
      ],
    })

    const raw = completion.choices[0]?.message?.content?.trim()
    if (!raw) throw new Error('Модель вернула пустой ответ.')

    let summary = raw
    try {
      const parsed = JSON.parse(raw) as { summary?: string; action?: string }
      summary = [parsed.summary, parsed.action].filter(Boolean).join('\n\n') || raw
    } catch {
      // невалидный JSON — сохраняем текст как есть
    }

    await db.from('alerts').update({
      ai_summary: summary,
      ai_model: model,
      ai_generated_at: new Date().toISOString(),
      ai_error: null,
    }).eq('id', alertId)
  } catch (caught) {
    console.error('explainAlert', caught)
    await fail(caught instanceof Error ? caught.message : 'Не удалось получить пояснение.')
  }
}

// --- Вход ---------------------------------------------------------------------

function runInBackground(promise: Promise<unknown>): void {
  const guarded = promise.catch((caught) => console.error(caught))
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil(promise: Promise<unknown>): void } }).EdgeRuntime
  runtime?.waitUntil(guarded)
}

function safeEqual(a: string | null, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!BOT_TOKEN || !WEBHOOK_SECRET) {
    return json({ error: 'TELEGRAM_BOT_TOKEN / TELEGRAM_WEBHOOK_SECRET не настроены.' }, 500)
  }

  const task = new URL(request.url).searchParams.get('task')

  if (task === 'dispatch' || task === 'notify') {
    const secret = request.headers.get('x-cron-secret')
    const { data: valid } = await db.rpc('verify_cron_secret', { p_secret: secret ?? '' })
    if (valid !== true) return json({ error: 'Forbidden' }, 403)
    if (task === 'dispatch') return json(await dispatch())

    const body = await request.json().catch(() => ({})) as { alert_id?: string; event?: string }
    if (!body.alert_id || !body.event) return json({ error: 'alert_id and event required' }, 400)
    return json(await notifyPatient(body.alert_id, body.event))
  }

  if (task === 'setup') {
    if (!safeEqual(request.headers.get('x-setup-token'), WEBHOOK_SECRET)) return json({ error: 'Forbidden' }, 403)
    return json(await setup())
  }

  if (!safeEqual(request.headers.get('x-telegram-bot-api-secret-token'), WEBHOOK_SECRET)) {
    return json({ error: 'Forbidden' }, 403)
  }

  const update = await request.json().catch(() => null) as TgUpdate | null
  try {
    if (update?.callback_query) await onCallback(update.callback_query)
    else if (update?.message) await onMessage(update.message)
    else if (update?.edited_message?.location && update.edited_message.from) {
      // трансляция геопозиции: Telegram присылает правки исходного сообщения
      const { latitude, longitude, horizontal_accuracy } = update.edited_message.location
      await rpc('update_emergency_location', {
        p_telegram_id: update.edited_message.from.id,
        p_latitude: latitude,
        p_longitude: longitude,
        p_accuracy: horizontal_accuracy ?? null,
      })
    }
  } catch (caught) {
    // 200 всё равно: иначе Telegram будет повторять то же обновление
    console.error('update failed', caught)
  }
  return json({ ok: true })
})
