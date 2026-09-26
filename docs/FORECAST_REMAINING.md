# Problem 1 — Digital Twin for chronic patients: what is left

## The brief

> Surunkali kasalliklar (diabet, yurak yetishmovchiligi) bilan ogʻrigan bemorlar uchun
> individuallashtirilgan davolash rejimi yoʻq: haqiqiy bemorga dori belgilashdan oldin
> uning tanasida qanday taʼsir koʻrsatishini virtual muhitda tekshirish imkoniyati mavjud emas.
>
> **Digital Twin for Chronic Patients:** Har bir surunkali kasallik bemoriga tegishli
> biologik koʻrsatkichlar (**kasallik tarixi, tahlillar, turmush tarzi, genetika**) asosida
> individual **SI-modeli** yaratish. Shifokor dori belgilashdan avval "raqamli egizak"da
> sinovdan oʻtkazadi, **5 yillik prognoz** oladi.

## Done

| Requirement | Where |
|---|---|
| Per-patient model inputs from history, labs, lifestyle, genetics | `public.simulation_inputs(patient_id)` |
| Lifestyle + family history + genetic markers stored | `public.patient_profile` |
| Doctor tests a drug before prescribing | `/patients/:id?tab=forecast` |
| 5-year prognosis, baseline vs treated | `treatment-simulation` Edge Function |
| Contraindication check against the record | allergies, duplicate class, creatinine threshold |
| Family history and genetics affect the risk | `familyFactors()` in `_shared/simulation-model.ts` |
| Refuses on incomplete input | `missing[]` → `refused: true`, no numbers shown |
| Every coefficient visible in the UI | «Параметры модели» |
| Gaps can be filled from the UI | `ProfileForm` writes to profile / observations / lab_results |
| Any drug, checked by AI against the whole record | `drug-check` Edge Function: findings must cite record IDs, verdict and numbers computed in code, forecast via `DRUG_CLASSES` |

Everything numeric is deterministic and lives in `_shared/simulation-model.ts`. Swapping the
configured demo parameters for published models (UKPDS, SCORE2-Diabetes, MAGGIC) means
editing `COEFFICIENTS` and `INTERVENTIONS` and nothing else.

## Remaining

### A. Compare candidates side by side — ✅ done

- [x] `drug-check` accepts `drugs: string[]` (2–4, deduplicated) and reviews them in parallel;
      one failed review does not fail the comparison
- [x] Ranking is computed in code (`_shared/ranking.ts`, covered by `ranking.test.ts`):
      safety verdict first, then 5-year risk, then number of warnings, then input order
- [x] Blocked candidates stay in the list with their reason; same-class candidates are flagged
- [x] Charts overlay the treated curves of each admissible candidate against one baseline

Run the tests: `cd supabase/functions && npx deno@2 test --no-check --config deno.json _shared/ranking.test.ts`

### B. AI narration

The brief says *SI-modeli*. There is currently no model call in the simulation path.
Blocked on OpenAI credits.

- [ ] `treatment-simulation` accepts `explain: true`
- [ ] The function computes first, then sends **its own** computed JSON to the model.
      Never accept numbers from the client for explanation — they can be edited in
      devtools and the model would narrate a lie.
- [ ] Returns `{ explanation, considerations[] }`, `response_format: json_object`,
      low temperature, reusing the `OPENAI_MODEL` secret already set for `twin-summary`
- [ ] UI: «Объяснить» button, so exploring stays free and instant
- [ ] Grounding line under the text: which values it was given

Prompt contract:

```
Тебе передан УЖЕ ВЫПОЛНЕННЫЙ детерминированный расчёт.

1. Не вычисляй и не пересчитывай. Числа бери только из переданных.
2. Если есть предупреждение BLOCK — начни с него. Не предлагай
   назначение, заблокированное записью пациента.
3. Не называй дозу, которой нет во входных данных.
4. Не ставь диагноз и не назначай лечение.
5. Если данных не хватало — скажи, что это ограничивает вывод.
6. Закончи организационной рекомендацией (обсудить, уточнить,
   проконтролировать), а не решением.
7. 3–5 предложений, по-русски.
```

With A done, the model's real job becomes explaining the **trade-off** between candidates.
That is the strongest sentence in the demo and no table conveys it.

### C. Record the simulation

- [ ] `SIMULATION_RUN` added to `twin_event_type` — **its own migration**, an enum value
      cannot be added and used in one transaction
- [ ] The function writes a timeline event: who simulated what, and the risk delta
- [ ] Shows on the Хронология tab

Ties problem 1 back into the continuity product and makes an AI-assisted decision
auditable, instead of leaving the forecast a separate toy.

## What not to do

- Do not let the model produce or adjust a number. Maths predicts, AI explains.
- Do not drop the disclaimer. «Симуляция по настроенным демонстрационным параметрам»
  is a strength in front of a clinical judge, not a hedge.
- Do not fill a missing variable with a default. The refusal path is a feature —
  a model that admits its inputs are incomplete reads as serious.
- Do not present the configured coefficients as published values. If you enter real
  UKPDS/SCORE2 numbers, cite them in `COEFFICIENTS[].note`.

## Demo patients

| Patient | Shows |
|---|---|
| Мирзаева №7 (T2DM) | full calculation, family-history factors counted |
| Тошматова №5 (HF) | statin **blocked** by recorded intolerance |
| Салимов №8 / Хасанова №11 | refusal — no profile, gaps listed |
| Каримов №1 (T2DM + hypertension) | most options available |

Patients seeded with surgical or infectious diagnoses have no chronic condition coded and
correctly show no candidates. Do not pick one of those on stage.
