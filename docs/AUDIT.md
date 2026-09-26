# CareTwin AI — Project Audit

*Date: 2026-09-26 · Scope: whole repository plus the linked Supabase project `wrjttmjkawtqjpgveyzj` (read-only inspection)*

## 1. Verdict

CareTwin is a well-built **demo**. It is not yet a **POC**: a proof of concept has to show the main flow working on data nobody prepared by hand, and it has to be safe enough to show on realistic data.

**What is strong**
- The data model is careful: one patient = one twin, access derived from relationships, an append-only timeline written by triggers, and CHECK constraints on state machines.
- RLS covers every table.
- AI safety design is good: the model only explains, every AI claim must cite a record ID, and the code computes all numbers and verdicts.

**What stops it being a POC**
1. **The patient journey cannot start from the UI.** There is no screen to register a patient, admit them, create a care plan, or manage staff. Every patient comes from `seed.sql`.
2. **The database cannot be reproduced.** The live project has **0 recorded migrations**. The schema was applied by hand, applied migration files were edited later, and side-patch scripts exist.
3. **There are real access-control holes.** Some writes grant access to any patient. Audit fields can be forged from the browser.
4. **Parts of the architecture diagram don't exist in code**: the risk engine, Telegram bot, device gateway and FastAPI layer.
5. **No tests, no CI, no deploy pipeline.** Only 2 commits exist; about 60 files of work are uncommitted.

---

## 2. Tech stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React 19.2, TypeScript 6.0, Vite 8, React Router 7 | SPA, single bundle (~700 KB JS, no code splitting) |
| Styling | Tailwind CSS 4 (`@tailwindcss/vite`), plus some hand-written CSS files | Google Fonts (Golos Text, Literata) |
| Lint | oxlint (template config, 2 rules) | No formatter configured |
| State and data | Hand-written `useQuery` hooks over `supabase-js` | No cache, no retry, no invalidation |
| Backend | Supabase: PostgreSQL 17, Auth (email + password), PostgREST, RLS | No custom API server |
| Server logic | PL/pgSQL triggers and RPCs (`discharge_patient`, `simulation_inputs`, `follow_up_candidates`, `active_call_stats`) | Most business rules live in the DB, which is good |
| Edge functions | Deno: `twin-summary`, `treatment-simulation`, `drug-check`, `patient-assistant`, `discharge-draft` | `openai@4`, default model `gpt-4.1-mini` |
| AI | OpenAI Chat Completions, JSON mode, tool calling (assistant) | Patient data leaves the country; see §4 |
| Simulation | Deterministic logistic model in `_shared/simulation-model.ts` | Coefficients are demo values, and the code says so |
| i18n | One `ru` string table, `lib/i18n.ts` (~1,000 lines) | No Uzbek |
| Tooling | Supabase MCP, Supabase CLI link | No `supabase/config.toml` |

**Planned in `ARCHITECTURE.md` / `project_structure.md` but absent:** Python/FastAPI API layer, Python risk engine, Telegram bot, device gateway / wearable ingestion. The `devices`, `device_sync_log` and `private.device_connections` tables exist, but nothing writes to them except the seed.

---

## 3. What is actually built

| Area | State |
|---|---|
| Login, role-based navigation, membership switcher | Done |
| Patient twin page (Now / History / Forecast tabs, vitals, labs, meds, diagnoses) | Done (read) |
| Discharge workflow: one RPC, AI draft, pre-discharge checks, follow-up visits | Done |
| Automatic "active call" with a 24 h SLA, acknowledge/complete, stats | Done |
| Polyclinic incoming cases, assignments, follow-up closure | Done |
| Treatment simulation + AI drug check with cited evidence | Done (demo coefficients) |
| AI shift summary, AI patient-search assistant | Done |
| Patient registration / search-or-create | **Missing** |
| Admission (create hospitalization) | **Missing.** `/admissions` only lists admissions |
| Care plans page | **Placeholder** (`SectionPendingPage`) |
| Staff / membership management | **Placeholder** |
| Risk scoring of twins | **Missing.** `digital_twins.risk_level` is only ever set by the seed |
| Patient-side channel (Telegram check-ins) | **Missing** |
| Wearable / device data ingestion | **Missing** (schema only) |
| Notifications (SMS / push / email to the family doctor) | **Missing.** "Automatic dispatch" is a DB row the doctor must go and look at |

---

## 4. Security and compliance findings (ranked)

### Critical

**S1. Writing a relationship row grants access to any patient.**
`private.can_access_patient()` grants access when there is a hospitalization, care plan or primary-clinic link to the user's org ([rls_policies.sql:115](../supabase/migrations/20260925170000_rls_policies.sql#L115)). The INSERT policies don't check that the user could already see the patient:
- `"Hospital staff can admit"` only checks `has_org_role(organization_id, …)`. A hospital doctor can insert a hospitalization with **any** `patient_id` and immediately read that patient's full record.
- `"Source organization can create care plans"` has the same gap for polyclinic doctors.
- `"Update accessible patients"` allows changing `primary_clinic_id` and `created_by`, so an org can take a patient over.

UUIDs are hard to guess, which lowers the risk but doesn't remove it. **Fix:** do admission through a `SECURITY DEFINER` RPC that looks the patient up by `national_id` and logs the access (break-glass). Add `can_access_patient(patient_id)` to the insert `WITH CHECK`s. Restrict updatable columns on `patients`.

**S2. Patient data is sent to OpenAI (US) with no legal basis.**
Full names, birth dates, districts, diagnoses, labs and allergies go to `api.openai.com` from all four AI functions. `twin-summary` sends names for up to 80 events. Uzbekistan's Law on Personal Data (Art. 27-1) requires citizens' personal data to be stored and processed on servers in Uzbekistan. Health data is a special category. **Fix for the POC:** pseudonymize before sending (drop names and IDs; use `[P1]`-style handles, as `drug-check` already does for records). Put the provider behind one adapter so it can be swapped for a local or in-country model. Record the data-flow decision.

**S3. Clinical drafts are stored in the browser and survive logout.**
`dischargeDraftStore` writes full discharge drafts (diagnoses, meds, labs) to `localStorage` ([dischargeDraftStore.ts](../frontend/src/lib/dischargeDraftStore.ts)). `signOut()` only clears the membership key ([AuthContext.tsx:118](../frontend/src/contexts/AuthContext.tsx#L118)), so on a shared ward PC the next user can read them. **Fix:** a `discharge_drafts` table under RLS (the file's own TODO says this), or at minimum clear `caretwin.*` keys on sign-out.

### High

**S4. Audit fields can be forged from the client.**
`activeCalls.ts` sends `acknowledged_by` / `completed_by` from the browser ([activeCalls.ts:96](../frontend/src/lib/activeCalls.ts#L96), [:112](../frontend/src/lib/activeCalls.ts#L112)). The `active_calls_stamp` trigger fills in timestamps but not actors. The UPDATE policy also lets any polyclinic user change `due_at`, `status` (back to `PENDING`) or `outcome` on any call in their org, which means **the SLA metric can be edited**. **Fix:** set `*_by := auth.uid()` in the trigger. Make `due_at`, `created_at` and `patient_id` immutable. Allow only forward status transitions, or better, do this through `acknowledge_call()` / `complete_call()` RPCs.

**S5. SECURITY DEFINER trigger functions can be called over REST.** The Supabase advisor reports that `care_plan_visits_after_write()` and `care_plans_dispatch_active_call()` are executable by `anon` and `authenticated`. The later migrations forgot the `revoke execute` that earlier ones include.

**S6. `simulation_inputs` has a mutable `search_path`** (advisor warning). It was re-created by `update_simulation_inputs.sql`, which dropped the `set search_path = ''`.

**S7. Edge functions use `Access-Control-Allow-Origin: *`, with no rate limits or cost caps.** Any logged-in user can call the AI functions as often as they like. `useShiftSummary` also fires an OpenAI call automatically on **every** Overview page mount ([ai.ts:62](../frontend/src/lib/ai.ts#L62)). **Fix:** restrict the origin, add a per-user quota table, and cache the summary for N minutes.

### Medium

- **S8.** Leaked-password protection is off in Supabase Auth. There is no MFA and no password policy.
- **S9.** No access audit log: reads of patient records are not logged. Clinical systems need "who viewed what".
- **S10.** `treatment-simulation` ignores errors from the `allergies` and `medications` queries ([index.ts:77](../supabase/functions/treatment-simulation/index.ts#L77)). If they fail, the drug safety check **fails open** and returns "no warnings".
- **S11.** `drug-check` allergy matching uses `name.includes(substance)`. An empty or very short substance string matches everything; short class roots (`прил`, `олол`, `дипин`) can also match the wrong drug.
- **S12.** `discharge_patient()` reads the hospitalization status without `FOR UPDATE`. Two concurrent submits can both pass the check and insert duplicate diagnoses and medications.
- **S13.** An edge function **`dynamic-action`** is deployed to the project but does not exist in the repo. Nobody can tell what it does from the source. Delete it or commit it.

---

## 5. Hardcoded values inventory

| What | Where | Should become |
|---|---|---|
| Risk model coefficients, drift, `INTERVENTIONS`, `DRUG_CLASSES` (effects, creatinine thresholds, risk ratios) | [_shared/simulation-model.ts](../supabase/functions/_shared/simulation-model.ts) | Versioned reference tables (`drug_classes`, `model_coefficients` with `source`/`citation`/`version`), with the model version stored on each simulation result |
| Two overlapping drug lists (`INTERVENTIONS` and `DRUG_CLASSES` repeat the same numbers) | same file | One source |
| Drug and allergy matching by Russian substring roots | same file, `drug-check` | Coded drug dictionary (ATC codes / INN) on `medications` and `allergies` |
| Family-history keywords (`инфаркт`, `диабет`…) and the `'risk'`/`'high'` genetic-marker convention | `familyFactors()` | Structured fields (relation + condition code) |
| 24 h SLA | active-call trigger (`interval '24 hours'`) | Per-organization or per-severity setting (the column comment already plans this) |
| Default follow-up visits (day 3 HOME, day 10 CLINIC, day 21 CALL), 30-day plan, plan title | [discharge.ts:365-409](../frontend/src/lib/discharge.ts#L365) | Care-plan templates by diagnosis |
| Time windows: 72 h summary, 2-day "silent" threshold, 7-day extension, 30-day event window, `WINDOW_DAYS` | `twin-summary`, `ContinuityStrip.tsx`, `closure.ts`, `patient-assistant`, `postDischarge.ts` | One config module / org settings |
| Query limits: 2000 events, 400 observations, 300/150 in discharge, 80/60 in AI functions | `twin.ts`, `discharge.ts`, functions | Pagination plus date-windowed queries |
| AI model name `gpt-4.1-mini`, temperatures, `max_tokens`, all prompts in Russian inside code | each function | `_shared/ai.ts` with provider/model config; prompts versioned |
| Timezone: summary transcript formatted in **UTC** ([twin-summary:98](../supabase/functions/twin-summary/index.ts#L98)); Uzbekistan is UTC+5 | `twin-summary` | `Asia/Tashkent` or the org's timezone. Today the model is told times that are 5 hours off. |
| Role → route lists | [App.tsx:18-21](../frontend/src/App.tsx#L18) and [navigation.ts](../frontend/src/lib/navigation.ts) | One permission map used by both |
| All UI text in Russian; demo accounts shown on the login screen (`i18n.ts:976`) | `i18n.ts` | Add `uz`, and show demo hints only in dev |
| Supabase project ref | `.mcp.json`, `supabase/.temp/*`, plus stray copies in `functions/supabase/.temp` and `functions/twin-summary/supabase/.temp` | Remove the stray folders and git-ignore `.temp` |
| Demo users `*.demo@twincare.test`, organizations, patients | `seed.sql` | Fine for dev; add a separate staging seed |

---

## 6. Engineering hygiene

| Issue | Detail |
|---|---|
| **Migrations are not the source of truth** | Remote `list_migrations` returns **empty**. `20260926110000_patient_profile.sql` was modified after being applied, and `update_simulation_inputs.sql` / `localize_demo_data.sql` are manual patches. A fresh `supabase db reset` will not reproduce production. |
| No `supabase/config.toml` | No local stack. Function settings (`verify_jwt`) and auth config are not in code. |
| No tests | Nothing covers the simulation maths, RLS, triggers or UI. RLS especially needs pgTAP tests (see S1 and S4). |
| No CI/CD | No `.github/`, no build/lint/type-check gate, no function deploy pipeline. |
| Version control | 2 commits; roughly 60 new or changed files uncommitted, including 6 migrations and 3 edge functions. One disk failure away from losing the project. |
| TypeScript strictness | `strict` is **not** enabled in `frontend/tsconfig.app.json`; edge functions have `"strict": false` and a hand-written `types.d.ts` stub for Deno. Many `as unknown as` / `as never` casts. |
| Generated types drift | `database.types.ts` is edited by hand (it shows as modified in git) instead of being generated with `supabase gen types`. |
| Duplicated code | `cors`, `json()`, `failure()`, `text()`, `day()`, the OpenAI client setup, and the "build record transcript with [ID] refs" logic are copied across 5 functions. Move them to `_shared/`. |
| Data fetching | Hand-rolled `useQuery`: no caching, no refetch-on-focus, no mutation invalidation, errors only as strings. A list of `usePatients()` loads **all** patients with no pagination. |
| No realtime | New active calls and overdue state only appear on reload or when the countdown timer ticks. The Supabase Realtime channel is unused. |
| No error boundary, no code splitting | One runtime error blanks the app; the 700 KB bundle loads every page. |
| No observability | Only `console.error` in functions; nothing in the frontend (no Sentry etc.). |
| Docs out of date | `frontend/README.md` is the Vite template. `ARCHITECTURE.md` still says Stage 2 is current and lists FastAPI/Python. There is no root README with setup steps, and `.env.example` is referenced by the error message in `supabase.ts` but doesn't exist. |
| Build not verified here | `node` wasn't on the audit shell's PATH, so `tsc -b` / `oxlint` were not run as part of this audit. |

---

## 7. Roadmap to a POC

Ordered by what a POC reviewer would hit first.

### P0 — must have (makes it a real POC)

1. **Make the DB reproducible.** Run `supabase db pull` into a baseline migration, delete the patch scripts, stop editing applied migrations, and add `config.toml`. Verify with `supabase db reset` on a branch.
2. **Commit everything and add CI**: type-check, lint, build, and `supabase db lint` on every push.
3. **Close the access holes** (S1, S4, S5, S6): an admission RPC with lookup by `national_id`; `can_access_patient` in insert checks; column-restricted updates; actors stamped by triggers; revoke execute on trigger functions; restore `search_path`.
4. **Build the missing start of the journey**: patient search-or-register, then admit (create hospitalization). Without these, the demo depends on the seed.
5. **Pseudonymize data before it goes to the LLM** (S2), and put the provider behind one `_shared/ai.ts` adapter.
6. **Move discharge drafts server-side** (S3).
7. **pgTAP tests for RLS**: for each role, "can read / cannot read / cannot write" on the core tables. This is the cheapest way to show the access model holds.

### P1 — should have (makes it convincing)

8. **Notify the family doctor.** A DB webhook or `pg_net` call to an edge function that sends Telegram/SMS when an active call is created or becomes overdue. Right now "automatic dispatch" is invisible until someone opens the page.
9. **Minimal risk engine.** Compute `digital_twins.risk_level` from rules on new observations and labs (for example, abnormal vitals or a critical lab raises the level), and log `RISK_CHANGED`. The UI already shows risk everywhere, but nothing ever sets it.
10. **Minimal patient channel.** A Telegram bot for daily check-ins (symptoms, BP, glucose) that writes `observations` with `source = PATIENT`. That makes the "twin continues at home" claim true.
11. **Realtime subscriptions** for active calls and incoming cases.
12. **Staff management page** (invite user, assign role), which replaces the placeholder.
13. **Reference-data tables** for drug classes, coefficients (with citations) and care-plan templates, replacing the constants in §5.
14. **Access audit log**, plus rate limits and a cache on the AI functions (S7, S9).
15. **Fix the timezone and fail-closed issues** (S10, S11, and UTC in `twin-summary`).

### P2 — nice to have

16. Adopt TanStack Query, turn on `strict` TS, add route-level code splitting and an error boundary.
17. Uzbek locale.
18. Sentry (or similar) in the frontend and functions.
19. Replace the demo coefficients with a published model (SCORE2-Diabetes / UKPDS / MAGGIC) and cite it; compare candidates side by side (`FORECAST_REMAINING.md` §A).
20. Wearable ingestion through one provider, using the existing `devices` schema.
21. Rewrite the README and `ARCHITECTURE.md` to describe what actually exists: Supabase-only, no FastAPI.

---

### Appendix — Supabase advisor output (security), 2026-09-26

| Level | Finding |
|---|---|
| WARN | `care_plan_visits_after_write()` is SECURITY DEFINER and executable by `anon` and `authenticated` |
| WARN | `care_plans_dispatch_active_call()` is SECURITY DEFINER and executable by `anon` and `authenticated` |
| WARN | `public.simulation_inputs` has a mutable `search_path` |
| WARN | Leaked password protection is disabled |
| INFO | `private.device_connections` has RLS enabled but no policies (intended: `service_role` only) |

Remediation guide: https://supabase.com/docs/guides/database/database-linter
