# CareTwin AI

> **One patient. One continuous Digital Twin.**\
> CareTwin AI is an AI-assisted continuity-of-care platform connecting
> hospital discharge, polyclinic follow-up, nurse monitoring, and
> patient-reported data around one persistent longitudinal patient
> record.

## Overview

CareTwin AI addresses a critical transition in healthcare: treatment may
finish in the hospital, but the patient's condition continues to change
after discharge.

Each patient has **one persistent Digital Twin**. Hospitalizations are
episodes in that longitudinal history rather than isolated patient
records. After discharge, the same Twin can continue receiving
observations, follow-up information, patient check-ins, and future
device data.

``` text
Hospital → Digital Twin → Polyclinic → Home Monitoring
                                      ↓
                              Risk Engine + AI
                                      ↓
                              Nurse → Doctor
```

AI assists medical professionals by summarizing relevant history,
preparing drafts, and explaining detected changes. It does **not**
independently diagnose, prescribe treatment, or replace clinical
judgment.

------------------------------------------------------------------------

## Problem

After a seriously ill patient is discharged:

-   the hospital has finished the inpatient episode;
-   the territorial polyclinic must continue care;
-   a nurse or family doctor needs to be assigned;
-   new symptoms and measurements may appear at home;
-   medical staff cannot continuously inspect every discharged patient
    manually.

CareTwin preserves continuity across this transition and helps the care
team identify patients who may require attention.

------------------------------------------------------------------------

## Core Principle

### One patient = one persistent Digital Twin

A hospitalization is an episode. The Digital Twin persists.

The Twin can contain:

-   patient profile;
-   hospitalizations;
-   diagnoses and allergies;
-   medications and procedures;
-   laboratory results;
-   vital-sign observations;
-   care plans and assignments;
-   device information;
-   longitudinal events;
-   post-discharge measurements and symptoms.

Historical clinical information should be retained with timestamps and
statuses instead of silently overwritten.

------------------------------------------------------------------------

## Architecture

``` text
┌──────────────────────┐      ┌──────────────────────┐
│     Hospital UI      │      │ Polyclinic/Nurse UI │
│  React + TypeScript  │      │  React + TypeScript │
└──────────┬───────────┘      └──────────┬───────────┘
           └──────────────┬───────────────┘
                          ▼
              ┌──────────────────────┐
              │ Supabase Edge       │
              │ Functions           │
              │ Deno + TypeScript   │
              └──────────┬───────────┘
                         │
       ┌─────────────────┼─────────────────┐
       ▼                 ▼                 ▼
┌─────────────┐   ┌─────────────┐   ┌──────────────┐
│  Supabase   │   │ Risk Engine │   │   AI Layer   │
│ PostgreSQL  │   │ rules/trends│   │ LLM + context│
│ Auth + RLS  │   └──────┬──────┘   └──────┬───────┘
└─────────────┘          └──────────┬───────┘
                                   ▼
                             Nurse / Doctor
```

Patient input channels feed the same Digital Twin pipeline:

``` text
Telegram ──────┐
CareTwin App ──┼──> Patient Input ──> Digital Twin
Devices ───────┤                         │
Clinician ─────┘                         ▼
                                    Risk Engine
                                         ↓
                                     AI Context
                                         ↓
                                  Nurse / Doctor
```

------------------------------------------------------------------------

## Technology Stack

  -----------------------------------------------------------------------
  Layer                   Technology              Why
  ----------------------- ----------------------- -----------------------
  Frontend                React + TypeScript      Reusable role-based
                                                  clinical UI with strong
                                                  typing

  Build                   Vite                    Fast, lightweight
                                                  frontend development

  Database                Supabase PostgreSQL     Strong relational model
                                                  for longitudinal
                                                  medical data

  Authentication          Supabase Auth           Authentication
                                                  integrated with the
                                                  data layer

  Authorization           Supabase RLS            Role-, organization-,
                                                  and assignment-aware
                                                  access

  Backend/API             Supabase Edge Functions Server-side
                                                  Deno/TypeScript without
                                                  a separate API server

  AI                      LLM API via server-side Contextual summaries,
                          functions               explanations,
                                                  assistants, drafts

  Realtime                Supabase Realtime       Immediate alerts and
                                                  patient-state updates

  Patient channel         Telegram                Low-friction
                                                  post-discharge
                                                  check-ins and SOS

  Risk evaluation         Deterministic rules +   Reproducible monitoring
                          trends                  separated from LLM
                                                  behavior
  -----------------------------------------------------------------------

### Why not Python/FastAPI?

The original plan considered Python + FastAPI. The current MVP uses
**Supabase Edge Functions with Deno/TypeScript**.

This keeps the hackathon architecture smaller, reduces operational
overhead, and allows the team to share TypeScript between frontend and
server-side logic. Python can be introduced later if specialized ML
workloads require it.

------------------------------------------------------------------------

## What AI Does

AI is **not** the medical source of truth. PostgreSQL stores the
structured record.

### AI Discharge Assistant

Uses hospitalization data to prepare a **draft** discharge summary. A
clinician reviews and approves it.

### Digital Twin Summary

Retrieves relevant longitudinal information and turns it into a concise
clinical summary.

### Follow-up Assistance

Can prepare a draft post-discharge monitoring plan from available
patient context. The clinician remains responsible for approval.

### Risk Explanation

The deterministic Risk Engine identifies measurable changes first. AI
then combines the detected factors with relevant Digital Twin history to
explain **what changed and why the patient was surfaced for review**.

### Patient / Clinician Assistant

Example questions:

-   What changed after discharge?
-   Summarize the latest hospitalization.
-   Show relevant history for the current condition.
-   Which recent measurements contributed to this alert?

### Human-in-the-loop

``` text
Risk Engine → detects measurable patterns
AI          → summarizes and explains
Nurse       → verifies the patient
Doctor      → makes the clinical decision
```

AI must not silently create a final diagnosis or independently prescribe
treatment.

------------------------------------------------------------------------

## Risk Engine

The post-discharge Risk Engine is designed to evaluate structured
observations and trends separately from the LLM.

Example synthetic demo:

``` text
SpO₂:        95 → 94 → 92 → 89 %
Temperature: 36.8 → 37.1 → 37.6 → 38.2 °C
Heart rate:  78 → 84 → 96 → 106 bpm
Symptom:     worsening dyspnea
```

Possible engine output:

``` text
Risk level: HIGH

Factors:
- falling SpO₂ trend
- rising temperature
- rising heart rate
- worsening reported symptom
```

The AI layer can then explain these factors using relevant patient
history.

> **Important:** hackathon thresholds and synthetic scenarios are
> demonstrations unless clinically validated. Do not represent them as
> validated medical decision rules.

------------------------------------------------------------------------

## Main Post-Discharge Workflow

``` text
1. Hospital doctor completes treatment
                ↓
2. Discharge is prepared and approved
                ↓
3. Digital Twin is updated
                ↓
4. Care case is transferred to the polyclinic
                ↓
5. Nurse / family doctor is assigned
                ↓
6. Patient returns home
                ↓
7. Telegram / device / clinician adds new observations
                ↓
8. Risk Engine evaluates values and trends
                ↓
9. AI explains relevant changes using Twin context
                ↓
10. Nurse receives an alert and verifies the patient
                ↓
11. Case is escalated to a doctor when required
```

**Discharge changes where care happens --- not whether care continues.**

------------------------------------------------------------------------

## SOS Workflow

CareTwin also supports a medical SOS concept:

``` text
Patient SOS
    ↓
Location + Patient ID + Timestamp
    ↓
Edge Function / backend event
    ↓
Realtime
    ↓
Nurse Dashboard
    ↓
Digital Twin context
    ↓
Nurse / Doctor
```

The SOS channel is an **additional clinical escalation mechanism**, not
a replacement for native phone Emergency SOS or official emergency
services.

The same backend event can later support different sources:

``` text
Telegram /sos ──────┐
CareTwin App ────────┼──> Medical SOS Event
Supported device ────┘
```

------------------------------------------------------------------------

## Current Status

### Implemented

-   Hospital UI
-   Polyclinic / Nurse UI
-   Role-based experience
-   Patient records
-   Persistent Digital Twin
-   Hospitalizations
-   Diagnoses
-   Allergies
-   Medications
-   Procedures
-   Laboratory results
-   Observations
-   Care plans
-   Care assignments
-   Devices and device sync schema
-   Twin event history
-   Supabase PostgreSQL
-   Supabase Auth
-   Row Level Security
-   AI discharge draft
-   AI summaries / assistant
-   AI-supported drug/treatment functions

### Next Priorities

1.  **Risk Engine** --- trend calculation, configurable rules,
    LOW/MEDIUM/HIGH and risk factors.
2.  **Telegram check-ins** --- collect measurements, symptoms and
    adherence information.
3.  **Realtime nurse alerts** --- dashboard updates without manual
    refresh.
4.  **AI risk explanation** --- Risk Engine factors + relevant Digital
    Twin context.
5.  **Nurse verification workflow** --- contact, repeat measurement,
    note, verify, escalate.
6.  **Shared Context Builder** --- centralize patient-context retrieval
    used by AI functions.
7.  **Device simulator / gateway** --- send readings through the same
    ingestion pipeline.

### Future

-   Health platform / wearable integrations
-   Production device gateway
-   Clinically validated risk models/rules
-   Expanded audit and observability
-   Production security and compliance review
-   Clinical validation and governance

------------------------------------------------------------------------

## Database Model

Important domain tables include:

``` text
patients
digital_twins
hospitalizations
diagnoses
allergies
medications
procedures
lab_results
observations
care_plans
care_assignments
organizations
organization_memberships
profiles
devices
device_sync_log
twin_events
```

### Data Rules

-   One patient should have one persistent Digital Twin.
-   A new hospitalization must not create a duplicate patient.
-   Preserve historical diagnoses, medications, procedures, observations
    and episodes.
-   Store timestamps and provenance for observations.
-   Distinguish hospital, polyclinic, nurse, patient and device inputs.
-   Enforce clinical access through authorization rules, not only UI
    visibility.

------------------------------------------------------------------------

## Roles & Access

Typical roles:

``` text
SUPER_ADMIN
ORGANIZATION_ADMIN
HOSPITAL_DOCTOR
POLYCLINIC_DOCTOR
NURSE
```

-   **Hospital Doctor:** authorized hospital patients, treatment and
    discharge.
-   **Polyclinic Doctor:** transferred/authorized patients, relevant
    Twin history, follow-up and alerts.
-   **Nurse:** assigned patients, observations, follow-up and escalation
    workflow.
-   **Organization Admin:** staff and organization administration; admin
    status should not automatically mean unrestricted clinical access.
-   **Super Admin:** platform-level administration according to
    deployment policy.

------------------------------------------------------------------------

## Security Principles

-   Never expose the Supabase service-role key in the frontend.
-   Never expose LLM/API secrets in React.
-   Keep privileged secrets in server-side Edge Function configuration.
-   Use RLS as a real authorization boundary.
-   Validate server-side inputs.
-   Do not rely only on frontend role checks.
-   Keep AI-generated clinical content reviewable.
-   Record important workflow events for auditability.
-   Do not expose raw infrastructure/API errors to clinical users.

------------------------------------------------------------------------

## Quick Start & Demo Accounts

Use the following steps to run and test CareTwin AI locally.

### 1. Install dependencies

``` bash
npm i
```

### 2. Start the application

``` bash
npm run dev
```

Open the local URL shown in the terminal (typically
`http://localhost:5173`).

### 3. Test the role-based workflows

Three demo accounts are available. Each account opens a different
CareTwin role and can be used to test the complete
hospital-to-polyclinic workflow.

  Role               Email                         Password
  ------------------ ----------------------------- --------------
  Hospital Doctor    `doctor.demo@twincare.test`   `Ry28290405`
  Nurse              `nurse.demo@twincare.test`    `Ry28290405`
  Polyclinic Admin   `admin.demo@twincare.test`    `Ry28290405`

### Recommended Test Flow

**Hospital Doctor**

1.  Sign in with `doctor.demo@twincare.test`.
2.  Open a patient and review the Digital Twin.
3.  Review hospitalization information and patient history.
4.  Test AI-assisted features such as summaries or the discharge draft.
5.  Complete the discharge workflow and transfer follow-up care to the
    polyclinic.

**Polyclinic Admin**

1.  Sign out and sign in with `admin.demo@twincare.test`.
2.  Review incoming/transferred patients.
3.  Open the patient's continuity-of-care information.
4.  Assign the patient to a nurse for post-discharge monitoring.

**Nurse**

1.  Sign out and sign in with `nurse.demo@twincare.test`.
2.  Open assigned patients / active follow-up cases.
3.  Review the patient's Digital Twin and post-discharge information.
4.  Test available follow-up, patient monitoring, alert, or SOS
    workflows.

> **Demo credentials:** These accounts are intended only for
> testing/hackathon demonstration. Do not reuse these credentials for
> production accounts or real patient data.

------------------------------------------------------------------------

## Local Development

### Prerequisites

-   Node.js
-   npm
-   Git
-   Supabase CLI if using local Supabase development

### Clone

``` bash
git clone <YOUR_REPOSITORY_URL>
cd <YOUR_REPOSITORY_DIRECTORY>
```

### Install

``` bash
npm install
```

### Environment

Create the local environment file expected by the repository.

Typical frontend Supabase variables:

``` env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Use the **actual environment variable names from this repository** if
they differ.

AI/API credentials belong in server-side secrets, not frontend `VITE_*`
variables.

Example:

``` bash
supabase secrets set YOUR_AI_API_KEY=...
```

### Run Frontend

``` bash
npm run dev
```

### Local Supabase

If local Supabase is configured:

``` bash
supabase start
```

Apply the repository's migrations before testing database-dependent
functionality.

### Edge Functions

Use the Supabase CLI with the function names under the project's
Supabase functions directory.

Do not move server-side API keys into the frontend for local testing.

------------------------------------------------------------------------

## Development Guidelines

When contributing:

1.  Preserve **one patient = one Digital Twin**.
2.  Reuse the existing model before adding duplicate tables.
3.  Keep longitudinal history append-oriented where possible.
4.  Keep privileged operations and secrets server-side.
5.  Respect existing RLS policies.
6.  Separate deterministic risk logic from LLM explanations.
7.  Clearly identify AI-generated drafts.
8.  Do not let AI silently create final diagnoses or prescriptions.
9.  Record source and timestamp for observations.
10. Test role-based access for every new clinical feature.

------------------------------------------------------------------------

## Recommended Hackathon Demo

Show **one complete patient journey**, not disconnected screens:

1.  Open a synthetic patient in the hospital.
2.  Show the existing Digital Twin.
3.  Complete discharge.
4.  Let CareTwin AI prepare a draft.
5.  Doctor reviews and approves it.
6.  Transfer continuity of care to the polyclinic.
7.  Assign a nurse.
8.  Submit worsening synthetic measurements through Telegram.
9.  Risk Engine changes the patient's risk state.
10. Realtime pushes an alert to the nurse dashboard.
11. AI explains the change using relevant Digital Twin context.
12. Nurse verifies the patient and escalates to the doctor.

------------------------------------------------------------------------

## Roadmap

``` text
FOUNDATION
Hospital + Polyclinic UI
Digital Twin
Supabase + Auth + RLS
AI Functions
        │
        ▼
MVP MONITORING LOOP
Telegram Check-in
        ↓
Risk Engine
        ↓
Realtime Alert
        ↓
AI Explanation
        ↓
Nurse Verification
        ↓
Doctor Escalation
        │
        ▼
NEXT
Shared Context Builder
Device Simulator
Wearable Integrations
Clinical Validation
Production Hardening
```

------------------------------------------------------------------------

## Disclaimer

CareTwin AI is currently a **prototype / hackathon project**.

Synthetic patient data, demonstration thresholds, simulated device
measurements, and AI-generated content must not be interpreted as
validated medical advice or a certified clinical decision-support
system.

A production deployment would require appropriate clinical validation,
security review, privacy/compliance assessment, governance, monitoring,
and approval processes applicable to the deployment jurisdiction.

------------------------------------------------------------------------

## Vision

> **A patient should not disappear from the care process when they leave
> the hospital.**

The **Digital Twin** preserves continuity.\
The **Risk Engine** watches measurable change.\
**AI** makes longitudinal context easier to understand.\
The **nurse** verifies.\
The **doctor** decides.

### Discharge changes where care happens --- not whether care continues.
