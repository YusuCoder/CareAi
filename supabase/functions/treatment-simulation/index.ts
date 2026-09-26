// Запросы выполняются с JWT пользователя. При неполных исходных данных прогноз не строится.

import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  conditionsOf, COEFFICIENTS, DRIFT, INTERVENTIONS, familyFactors, simulate, type Inputs,
} from '../_shared/simulation-model.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface Body {
  patientId?: string
  interventionId?: string
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const authorization = request.headers.get('Authorization')
  if (!authorization) return json({ error: 'Требуется авторизация.' }, 401)

  const body = (await request.json().catch(() => ({}))) as Body
  if (!body.patientId) return json({ error: 'Не указан пациент.' }, 400)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authorization } } },
  )

  const { data: rows, error } = await supabase.rpc('simulation_inputs', {
    p_patient_id: body.patientId,
  })
  if (error) return json({ error: error.message }, 400)

  const inputs = (rows as Inputs[] | null)?.[0]
  if (!inputs) return json({ error: 'Пациент недоступен.' }, 404)

  const missing = (inputs as unknown as { missing: string[] }).missing ?? []
  const conditions = conditionsOf(inputs)

  const available = INTERVENTIONS.filter((one) =>
    one.conditions.some((condition) => conditions.includes(condition)),
  )

  if (!body.interventionId) {
    return json({
      inputs, conditions, missing,
      available: summarise(available),
      factors: familyFactors(inputs),
    })
  }

  const intervention = available.find((one) => one.id === body.interventionId)
  if (!intervention) return json({ error: 'Вмешательство неприменимо к этому пациенту.' }, 400)

  if (missing.length > 0) {
    return json({
      inputs, conditions, missing,
      available: summarise(available),
      factors: familyFactors(inputs),
      refused: true,
    })
  }

  const [allergies, medications] = await Promise.all([
    supabase.from('allergies').select('substance').eq('patient_id', body.patientId).eq('status', 'ACTIVE'),
    supabase.from('medications').select('name').eq('patient_id', body.patientId).eq('status', 'ACTIVE'),
  ])

  const warnings: { level: 'BLOCK' | 'WARN'; text: string }[] = []
  const guards = intervention.guards

  for (const row of allergies.data ?? []) {
    const substance = String(row.substance ?? '').toLowerCase()
    if ((guards.allergyKeywords ?? []).some((word) => substance.includes(word))) {
      warnings.push({ level: 'BLOCK', text: `Аллергия в записи: ${row.substance}` })
    }
  }

  for (const row of medications.data ?? []) {
    const name = String(row.name ?? '').toLowerCase()
    if ((guards.duplicateKeywords ?? []).some((word) => name.includes(word))) {
      warnings.push({ level: 'WARN', text: `Пациент уже получает: ${row.name}` })
    }
  }

  if (guards.maxCreatinine && inputs.creatinine && inputs.creatinine > guards.maxCreatinine) {
    warnings.push({
      level: 'BLOCK',
      text: `Креатинин ${inputs.creatinine} выше порога ${guards.maxCreatinine} для этого препарата`,
    })
  }

  const { trajectories, risk } = simulate(inputs, intervention.effects, intervention.riskRatio)

  return json({
    inputs,
    conditions,
    missing,
    available: summarise(available),
    factors: familyFactors(inputs),
    intervention: {
      id: intervention.id,
      label: intervention.label,
      drugClass: intervention.drugClass,
      riskRatio: intervention.riskRatio,
      riskNote: intervention.riskNote,
    },
    warnings,
    blocked: warnings.some((warning) => warning.level === 'BLOCK'),
    trajectories,
    risk,
    coefficients: COEFFICIENTS,
    drift: DRIFT,
    disclaimer:
      'Симуляция по настроенным демонстрационным параметрам. Не валидированный клинический прогноз и не назначение. Решение принимает врач.',
  })
})

function summarise(list: typeof INTERVENTIONS) {
  return list.map((one) => ({
    id: one.id,
    label: one.label,
    drugClass: one.drugClass,
    conditions: one.conditions,
  }))
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
