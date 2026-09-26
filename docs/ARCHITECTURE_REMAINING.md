# Architecture: what is left

Target diagram: Hospital UI + Polyclinic/Nurse UI → API Layer → Supabase / Risk Engine / AI Layer,
with patient inputs from Telegram, a device gateway and clinician entry.

## Where we are

| Box | Status | Implementation |
|---|---|---|
| Hospital UI | ✅ | React + TS (`frontend/`) |
| Polyclinic / Nurse UI | ✅ | Same app, role-based routes |
| API Layer | ✅ different tech | Supabase Edge Functions (Deno/TS) + Postgres RPC/triggers — **not** Python/FastAPI |
| Supabase | ✅ | Postgres, Auth, RLS, Realtime (`alerts`, `twin_events`, `digital_twins`), pg_cron + pg_net |
| Risk Engine | ✅ | `risk_rules` + `evaluate_risk()` / `refresh_risk()`, triggers on `observations`, `lab_results` |
| AI Layer | ✅ | `twin-summary`, `discharge-draft`, `drug-check`, `patient-assistant`. Context building duplicated |
| Telegram | ✅ | Edge Function `telegram-bot`, `patient_check_ins`, daily check-in via pg_cron, `alerts` |
| Device gateway | ⚠️ | `devices`, `device_sync_log`, triggers exist; no ingestion endpoint |

Decision: **no FastAPI.** Edge Functions already are the API layer and run under the user's JWT, so
RLS applies for free. A Python server would be a second backend to host and secure with no new
feature. Update the diagram instead (step 0).

---

## Step 0 — Align the diagram with reality

- [ ] Rename the box to «API Layer — Supabase Edge Functions (TypeScript) + Postgres RPC»
- [ ] Risk Engine box: «Postgres rules + trends» (after step 1)
- [ ] Keep `plan.md` / `project_structure.md` in sync

## Step 1 — Risk Engine  ✅ (migration `20260926190000_risk_engine.sql`)

Risk level is the most visible fake on the screen today.

- [x] `public.evaluate_risk(p_patient_id uuid)` — deterministic, returns level + list of reasons
      with the record each came from (same «every claim cites a record» rule as the AI features)
- [x] Rules in table `risk_rules` (THRESHOLD / TREND / ANSWER / LAB_FLAG / OVERDUE_CALL / COMBINATION),
      editable by SUPER_ADMIN. Not yet shown in the UI:
  - [x] vitals out of range (SpO2, BP, HR, temperature, glucose, RR) — latest reading in 48 h
  - [x] worsening trend over the last 3 readings (SpO2 ↓3, temperature ↑0.8, HR ↑15) in 7 days
  - [x] patient answers: feeling worse, dyspnea worse, new symptoms, missed medications
  - [x] lab flagged `CRITICAL` in 7 days → HIGH (`HIGH` flag — not used, too noisy on seed data)
  - [x] overdue active call; 3+ MEDIUM factors at once → HIGH
  - [ ] missed/overdue visit, discharged within 7 days
  - [ ] high-risk chronic diagnoses as a floor (would push most seed patients to MEDIUM; decide first)
- [x] Statement-level triggers on `observations`, `lab_results` (Telegram check-in defers until the
      check-in is complete). `care_plan_visits` / `active_calls` / `hospitalizations` — **not yet**.
- [x] Store reasons (`digital_twins.risk_reasons jsonb` + `risk_evaluated_at`)
- [x] UI: «Почему такой риск» in the patient header (reasons carry source ids; not yet clickable)
- [ ] Remove hard-coded `risk_level` from `seed.sql`; recompute for all patients once — **not done**:
      seeded levels stay until new data arrives for that patient

**Acceptance:** insert SpO2 88 for a LOW patient → risk becomes HIGH, the twin history shows the
change, the header explains «SpO2 88% (норма ≥ 94%)».

## Step 2 — Telegram bot (patient input)  ✅ (migration `20260926200000_telegram_check_ins.sql`)

- [x] Edge Function `telegram-bot` (verify Telegram secret header, no user JWT → service role,
      so validate everything strictly)
- [x] Link flow: `/start <code>` (code issued on the twin page → tab «Устройства и Telegram») or
      sharing own phone number (must match `patients.phone`)
- [x] Daily check-in (10:00 Asia/Tashkent, `check_in_settings`): temperature, SpO₂, pulse, BP,
      feeling vs yesterday, dyspnea, new symptoms, medications. `/checkin` starts one on demand
- [x] Writes `observations` with `source = 'PATIENT'`, `check_in_id` + `PATIENT_CHECK_IN` event
- [x] Risk Engine runs once on completion; MEDIUM/HIGH → `alerts` row for the assigned nurse +
      CareTwin AI explanation (`alerts.ai_summary`, OpenAI, written after the patient is answered)
- [x] Not completed within `response_window_hours` → `MISSED_CHECK_IN` event + alert (pg_cron, 10 min)
- [x] Reply to patient: always the same «данные сохранены» + 103 line — never risk or advice
- [ ] Secrets: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` — **set by hand**, see «Telegram setup»

**Acceptance:** patient sends BP 185/110 in Telegram → reading in the twin within seconds, risk goes
up, nurse dashboard shows it.

## Step 3 — Realtime on the dashboard  ✅ (partly)

- [x] Subscribe to `twin_events` (and `digital_twins` risk changes) on the overview page;
      live «Тревоги» panel on `alerts`
- [x] Attention list refreshes live — overdue calls **not yet**
- [x] Twin page refreshes when a new event for this patient arrives

**Acceptance:** step 2 demo updates the doctor's screen without pressing reload.

### Who sees Telegram data

Events from the bot carry `twin_events.metadata.channel = 'TELEGRAM'` (migration `20260926230000`).
Display rules (not access rules — RLS is unchanged), in `frontend/src/lib/telegram.ts`:

| | Dashboard «Тревоги» | Attention / AI summary / chronology | Twin page → «Telegram» tab |
|---|---|---|---|
| Nurse | risk, missed check-in, SOS | with Telegram | full history |
| Admin | SOS only | without Telegram | full history |
| Doctor | — | without Telegram | full history |

The risk level itself (`RISK_LEVEL_CHANGED`, header «Почему такой риск») stays visible to everyone —
it is the twin's state, whatever data produced it.

### Telegram setup (once)

1. Create a bot with @BotFather, keep the token.
2. `supabase secrets set TELEGRAM_BOT_TOKEN=<token> TELEGRAM_WEBHOOK_SECRET=<random 32+ chars, A-Z a-z 0-9 _ ->`
   (or Dashboard → Edge Functions → Secrets). `OPENAI_API_KEY` is already used by the other functions.
3. Register the webhook:
   `curl -X POST "https://wrjttmjkawtqjpgveyzj.supabase.co/functions/v1/telegram-bot?task=setup" -H "x-setup-token: <TELEGRAM_WEBHOOK_SECRET>"`
4. `frontend/.env`: `VITE_TELEGRAM_BOT_USERNAME=<bot username>` to show the deep link.
5. Scheduling needs nothing else: Vault holds `caretwin_cron_secret` (generated by the migration) and
   `caretwin_functions_url` (set once per project with `vault.create_secret`).

Demo: twin page of Юсупов Шухрат → «Устройства и Telegram» → «Выдать код» → open link → `/checkin`
→ answer 38,2 / 89 / 106 / … → nurse overview shows a HIGH alert, AI text appears a few seconds later.

## Step 4 — Device gateway

- [ ] Edge Function `device-ingest`: accepts a batch of readings for a linked device
      (per-device token, not a user JWT)
- [ ] Writes `observations` with `source = 'DEVICE'`, logs `device_sync_log`
- [ ] Simulator script for the demo (pushes a realistic day of HR / SpO2 / steps / sleep)

**Acceptance:** run the simulator → wearable readings appear on the twin and feed the risk engine.

## Step 5 — Shared context builder (cleanup)

- [ ] `supabase/functions/_shared/context.ts`: one loader for the patient record with fact IDs
      (`[A1]`, `[D2]`, `[L5]`…) and one evidence validator
- [ ] Use it in `drug-check`, `patient-assistant`, `discharge-draft`
- [ ] Include risk reasons from step 1 in the AI context

## Also still open (from other docs)

- `docs/FORECAST_REMAINING.md` — A. compare drug candidates side by side, B. AI narration of the
  forecast (twin summary + how the drug changes the 5-year outlook)
- `docs/ACTIVE_CALL_REMAINING.md`
- Show the current episode status in the patient header and patients list
