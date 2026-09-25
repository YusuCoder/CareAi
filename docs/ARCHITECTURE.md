# TwinCare — Architecture

TwinCare combines a **Patient Digital Twin** with **continuity of care after hospital discharge**. A seriously ill patient treated in a central hospital keeps being monitored after discharge: responsibility for follow-up passes to the patient's local polyclinic, where a nurse or family doctor is assigned.

## Core invariant

> **ONE PATIENT = ONE DIGITAL TWIN.**
>
> Organizations do not receive duplicated patient records.
> They receive authorized access to the same longitudinal Digital Twin.

```
                  Patient
                     |
               Digital Twin
                     |
          -----------------------
          |                     |
     Hospital access      Polyclinic access
   (hospitalization)   (care plan / assignment)
```

The database enforces this with `UNIQUE (patient_id)` on `digital_twins` and a trigger that creates the twin whenever a patient is created. No table carries an "owner organization" for a patient; access is derived from relationships: hospitalizations, care plans and care assignments.

## Stack

| Layer | Technology |
|---|---|
| Database | Supabase PostgreSQL 17, Row Level Security |
| Auth | Supabase Auth (`auth.users` → `public.profiles`) |
| Schema management | SQL migrations in `supabase/migrations/` |

## Stages

- **Stage 1 (done):** database foundation: identities, organizations, memberships, patients, Digital Twins, hospitalizations, care plans, care assignments.
- **Stage 2 (current):** normalized clinical history — diagnoses, observations, lab results, medications, procedures, allergies — and `twin_events`, the trigger-written, append-only timeline that turns those records into the patient journey.
- **Next:** organization-scoped RLS policies, then the Central Hospital UI, the polyclinic hand-over, the nurse workspace, Telegram monitoring, the risk engine and the AI layer.

See [DATABASE_ARCHITECTURE.md](./DATABASE_ARCHITECTURE.md) for the full data model.
