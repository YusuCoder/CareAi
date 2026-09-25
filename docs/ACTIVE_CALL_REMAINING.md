# Problem 2 — Automated patronage ("Aktiv chaqiruv"): what is left

## The brief

> Statsionardan (OvaBMU) chiqarilgan ogʻir bemorlar uchun hududiy oilaviy shifokorga
> avtomatik xabarnoma yoʻq: bemor uyga qaytgach, davomiy parvarishlash uziladi va
> holatni kuzatish oʻz-oʻziga qoladi.
>
> **Avtomatlashtirilgan patronaj tizimi (Continuity of Care):** Ogʻir bemor OvaBMUdan
> javob berilishi bilan tizim **avtomatik tarzda** hududiy oilaviy shifokorga
> "Aktiv chaqiruv" topshirigʻini yuboruvchi platforma. Shifokor **24 soat ichida**
> bemor holidan xabar olib, tizimda **tasdiqlashi shart**.

Three load-bearing words: **automatic**, **24 hours**, **confirm**.

## Where we stand

| Requirement | Status |
|---|---|
| Discharge is a recorded event | done — `hospitalizations.status = DISCHARGED` |
| Routed to the *territorial* clinic | done — `care_plans.receiving_organization_id` defaults to `patients.primary_clinic_id` |
| Responsibility given to a named person | done — `care_assignments` |
| Record continues after discharge | done — `twin_events.phase` HOSPITAL → HOME |
| Polyclinic sees incoming cases | done — `/incoming`, with an unassigned-count badge |
| Follow-up can be closed | done — `follow_up_candidates()` + completion flow |
| **Dispatch happens automatically** | **missing** |
| **A 24-hour obligation exists** | **missing** |
| **The doctor confirms contact in the system** | **missing** |

Roughly 85% of the brief is built. The missing 15% is the part the brief is actually about.

## Gap 1 — dispatch must be automatic

Today a hospital doctor creates the care plan by hand. If nobody does, nothing reaches
the polyclinic — which is precisely the failure the brief describes.

The task must be created by the database the moment a hospitalization becomes
`DISCHARGED`, with no human in the loop.

**Do not auto-create an approved care plan.** A care plan is a clinical document and
`project_structure.md` §32 requires a clinician to approve it. What is dispatched
automatically is the **obligation to make contact**, not a treatment decision. These are
different objects and must stay different.

## Gap 2 — the 24-hour obligation

Nothing in the schema expresses a deadline. `care_assignments` has `assigned_at` but no
`due_at`, no overdue state, no escalation.

The 24 hours is the product. It is the measurable promise, and it is what makes the
demo concrete: *"среднее время до первого контакта — N часов"*.

## Gap 3 — confirmation and escalation

The family doctor has no way to record that contact happened. Nothing distinguishes
"seen and patient is fine" from "nobody has looked at this yet", and nothing escalates
when the deadline passes.

## Proposed schema

A new table, separate from `care_assignments`, because it models an obligation with a
deadline rather than ongoing responsibility:

```sql
create table public.active_calls (
  id                 uuid primary key default gen_random_uuid(),
  patient_id         uuid not null references public.patients (id) on delete cascade,
  hospitalization_id uuid not null,              -- composite fk with patient_id
  organization_id    uuid not null references public.organizations (id),  -- territorial clinic
  care_plan_id       uuid,                       -- linked once a plan is approved
  status             public.active_call_status not null default 'PENDING',
  created_at         timestamptz not null default now(),
  due_at             timestamptz not null,       -- created_at + 24h
  acknowledged_by    uuid references public.profiles (id),
  acknowledged_at    timestamptz,
  completed_by       uuid references public.profiles (id),
  completed_at       timestamptz,
  outcome            public.active_call_outcome, -- CONTACTED / VISITED / UNREACHABLE / REFUSED / ESCALATED
  notes              text
);

create type public.active_call_status as enum
  ('PENDING', 'ACKNOWLEDGED', 'COMPLETED', 'OVERDUE', 'CANCELLED');
```

Notes:

- `due_at` is stored, not computed, so the window can differ per patient severity later.
- `OVERDUE` is derived at read time (`now() > due_at and status = 'PENDING'`). Do not
  rely on a background job to set it — the demo must be correct without a scheduler.
- One open call per hospitalization: partial unique index on `hospitalization_id`
  where `status in ('PENDING','ACKNOWLEDGED')`.

## Tasks

### Database
- [ ] `active_calls` table, two enums, indexes, the partial unique index
- [ ] Trigger on `hospitalizations`: on transition to `DISCHARGED`, insert an
      `active_calls` row for `patients.primary_clinic_id`, `due_at = now() + 24h`.
      Skip when the patient has no primary clinic, and record that as a visible problem
      rather than failing the discharge.
- [ ] New `twin_event_type` values: `ACTIVE_CALL_CREATED`, `ACTIVE_CALL_ACKNOWLEDGED`,
      `ACTIVE_CALL_COMPLETED`. Remember: **enum values need their own migration**
      (a value cannot be added and used in one transaction).
- [ ] Trigger writing those events, so the call appears on the patient timeline
- [ ] RLS: read for members of the receiving organization and of the discharging
      hospital; update for `POLYCLINIC_DOCTOR` / `NURSE` / `ORGANIZATION_ADMIN` of the
      receiving organization only
- [ ] `public.active_call_stats()` — median hours to first contact, overdue count,
      completed-within-24h percentage

### Frontend
- [ ] `/active-calls` route and nav item for polyclinic roles, badge = overdue count
- [ ] List: patient, discharging hospital, created, **live countdown**, overdue in red,
      sorted by `due_at` ascending
- [ ] «Принять в работу» → `ACKNOWLEDGED` (stops the clock on "nobody looked")
- [ ] «Подтвердить осмотр» → outcome picker + notes → `COMPLETED`
- [ ] Overdue block on the polyclinic dashboard, above everything else
- [ ] Patient twin header: show an open call with its countdown
- [ ] Stats strip somewhere visible — the SLA numbers are the demo's headline

### Seed
- [ ] One call created and completed inside the window (the good path)
- [ ] One **overdue** call (the failure the product catches)
- [ ] One acknowledged but not yet completed
- [ ] Existing discharged patients get calls with plausible histories

## Acceptance

The demo must be able to do this without anyone touching SQL:

1. Hospital doctor discharges a patient.
2. **Without any further action**, an active call appears in the polyclinic list with
   a 24-hour countdown.
3. Family doctor presses «Принять в работу», then «Подтвердить осмотр» with an outcome.
4. The call closes, the event lands on the patient timeline, the SLA statistic moves.
5. A separate patient whose 24 hours expired shows as overdue, in red, at the top.

## What not to do

- Do not auto-approve care plans. Dispatch the obligation, not the clinical decision.
- Do not mark a call complete because the patient sent a Telegram check-in. The brief
  requires the **doctor** to confirm.
- Do not compute `OVERDUE` in a cron job that might not be running during the demo.
