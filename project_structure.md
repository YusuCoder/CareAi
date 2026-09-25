# CareTwin AI
## Continuous Digital Twin & Post-Discharge Care Platform

> Hackathon Healthcare Project  
> Status: MVP / Prototype

---

# 1. Project Overview

CareTwin AI is a healthcare continuity platform built around a persistent **Digital Twin of the patient**.

The platform connects:

- Central hospitals
- Local polyclinics
- Hospital doctors
- Family doctors
- Nurses
- Patients

The primary goal is to prevent seriously ill patients from being "lost" from medical supervision after discharge from a central hospital.

The patient's Digital Twin continues to exist and evolve after discharge.

Hospital treatment, diagnoses, procedures, laboratory results, vital signs, medications, symptoms, home monitoring data, follow-up activity, and risk events become part of one continuous longitudinal patient record.

---

# 2. Problems We Are Solving

This project combines two healthcare problems.

## Problem A — Loss of follow-up after discharge

Seriously ill patients may receive intensive monitoring while hospitalized.

However, after discharge:

- the local family doctor may not immediately know that the patient was discharged;
- the local polyclinic may not receive structured follow-up responsibilities;
- no specific nurse may be assigned;
- medication adherence may not be monitored;
- symptoms may not be collected systematically;
- deterioration may be discovered too late;
- information between the central hospital and local polyclinic becomes fragmented.

The transition:

Hospital → Home

can therefore become a dangerous gap in care.

---

## Problem B — Fragmented patient data

Medical information is often distributed across separate visits, organizations, documents, and systems.

There is no continuously updated representation of the patient's condition.

CareTwin solves this using a persistent:

# Patient Digital Twin

The Digital Twin represents the patient's longitudinal medical state across:

Hospital → Discharge → Home → Polyclinic → Recovery

---

# 3. Core Product Idea

The central concept is:

> ONE PATIENT = ONE DIGITAL TWIN

A patient must NEVER have separate Digital Twins for different hospitals or polyclinics.

The Digital Twin follows the patient.

Organizations receive authorized access to the same longitudinal patient record.

DO NOT implement:

Central Hospital Patient Copy
→ Polyclinic Patient Copy

Implement:

                    Patient
                       │
                       ▼
                 Digital Twin
                       │
          ┌────────────┴────────────┐
          │                         │
   Central Hospital            Polyclinic
       Access                    Access

This is one of the most important architectural rules of the entire project.

---

# 4. Main Patient Journey

The main MVP scenario is a seriously ill or post-operative patient.

Example:

Akmal Karimov is treated at a central hospital.

The complete flow:

Patient arrives at Central Hospital
        ↓
Search for existing patient
        ↓
Existing Digital Twin found
        OR
New patient + Digital Twin created
        ↓
Hospitalization created
        ↓
Diagnoses / observations / labs recorded
        ↓
Treatment / procedure
        ↓
Doctor decides to discharge patient
        ↓
Discharge summary
        ↓
Post-discharge Care Plan created
        ↓
Patient's primary polyclinic identified
        ↓
Care case sent to local polyclinic
        ↓
Nurse / family doctor assigned
        ↓
Patient returns home
        ↓
Remote monitoring begins
        ↓
Telegram reminders + check-ins
        ↓
Patient submits symptoms / measurements
        ↓
Digital Twin updated
        ↓
Risk Engine evaluates changes
        ↓
Normal
OR
Potential deterioration detected
        ↓
Responsible medical worker alerted
        ↓
Medical worker reviews patient
        ↓
Intervention / contact / visit
        ↓
Digital Twin continues updating

The Central Hospital can continue seeing the patient's post-discharge trajectory when authorized.

---

# 5. Product Principle

Hospital discharge does NOT terminate the patient journey.

It changes the responsible level of care.

Before discharge:

Central Hospital
→ Primary responsibility

After discharge:

Local Polyclinic / Family Doctor / Nurse
→ Follow-up responsibility

Digital Twin
→ Continues throughout both phases

---

# 6. System Actors

## 6.1 Central Hospital

A central hospital treats the patient during hospitalization.

Hospital users may include:

- Organization Admin
- Hospital Doctor

Main responsibilities:

- Find/create patient
- Access Digital Twin
- Create hospitalization
- Add medical information
- Record diagnosis
- Record observations
- Record laboratory results
- Record procedures
- Record medications
- Discharge patient
- Create/approve follow-up care plan
- Review post-discharge status where authorized

---

## 6.2 Local Polyclinic

The patient's territorial/local medical organization.

Main responsibilities:

- Receive discharged patient cases
- Review care plan
- Assign responsible medical worker
- Monitor patients after discharge
- Respond to alerts

Users may include:

- Organization Admin
- Polyclinic Doctor
- Family Doctor
- Nurse

---

## 6.3 Nurse

A nurse may be assigned to a patient's post-discharge care.

The nurse should eventually have:

My Patients
Tasks
Alerts
Patient Digital Twin
Patient Timeline
Check-ins
Visits / Interventions

A nurse must NOT automatically have access to every patient.

Access must be based on organization membership and/or patient assignment.

---

## 6.4 Patient

For the hackathon MVP, the patient does NOT require a complex mobile application.

The primary patient interaction channel will be:

Telegram Bot

The patient can eventually receive:

- Medication reminders
- Measurement reminders
- Follow-up questions
- Appointment reminders
- Simple health check-ins

The patient can submit:

- Temperature
- Pain level
- Blood pressure
- Symptoms
- Medication confirmation
- Other requested observations

---

# 7. Organization Architecture

Users and organizations are separate concepts.

DO NOT put `organization_id` directly into a user profile.

Relationship:

auth.users
    ↓
profiles
    ↓
organization_memberships
    ↓
organizations

A medical professional may eventually belong to more than one organization.

Example:

Dr. Karimov
    ├── Central Hospital
    └── Private Clinic

---

# 8. Current Database — Stage 1

Stage 1 currently contains 8 core tables.

## organizations

Represents healthcare organizations.

Examples:

- Central Hospital
- Polyclinic
- Private Clinic
- Rehabilitation Center

---

## profiles

Application profile corresponding 1:1 with:

Supabase `auth.users`

Contains basic user information.

---

## organization_memberships

Connects users with healthcare organizations and roles.

Possible roles include:

- SUPER_ADMIN
- ORGANIZATION_ADMIN
- HOSPITAL_DOCTOR
- POLYCLINIC_DOCTOR
- NURSE

---

## patients

Master patient identity.

Important:

A patient is NOT owned by a hospital.

A patient may have a:

`primary_clinic_id`

which identifies their territorial/local polyclinic.

---

## digital_twins

Persistent Digital Twin identity.

Critical constraint:

`patient_id` MUST be UNIQUE.

Therefore:

ONE PATIENT = ONE DIGITAL TWIN.

The `digital_twins` table should NOT contain the entire medical record as a huge JSON document.

Medical history must be normalized into dedicated tables.

---

## hospitalizations

Represents an inpatient episode.

Example:

Patient
→ Namangan Central Hospital
→ Admission
→ Treatment
→ Discharge

---

## care_plans

Represents follow-up care created around discharge.

Important fields conceptually include:

- patient
- hospitalization
- source organization
- receiving organization
- creator
- approving clinician
- instructions
- status

Future AI may generate a DRAFT care plan.

AI must NOT automatically approve the final clinical care plan.

A clinician must remain responsible for approval.

---

## care_assignments

Transfers follow-up responsibility to a specific organization and medical worker.

Example:

Akmal Karimov
        ↓
Post-operative Care Plan
        ↓
Polyclinic #17
        ↓
Nurse Dilnoza

---

# 9. Stage 2 — Digital Twin Medical Data

The next database stage adds medical information.

Planned tables:

- diagnoses
- observations
- lab_results
- medications
- procedures
- allergies
- twin_events

Do not add unnecessary medical modules before these are working.

---

# 10. Diagnoses

Purpose:

Store historical and active diagnoses.

Example:

Type 2 Diabetes
Status: ACTIVE
Diagnosed: 2023

Hypertension
Status: ACTIVE
Diagnosed: 2021

Post-operative condition
Status: ACTIVE

Possible conceptual fields:

- id
- patient_id
- hospitalization_id
- name
- code
- type
- status
- diagnosed_at
- resolved_at
- recorded_by
- created_at
- updated_at

---

# 11. Observations

`observations` will be one of the most important tables in the system.

It stores longitudinal measurements and patient-reported observations.

Examples:

- TEMPERATURE
- HEART_RATE
- BLOOD_PRESSURE
- SPO2
- RESPIRATORY_RATE
- WEIGHT
- PAIN
- NAUSEA
- WEAKNESS
- DIZZINESS
- WOUND_REDNESS

An observation should include its source.

Possible sources:

- HOSPITAL
- POLYCLINIC
- NURSE
- PATIENT
- DEVICE

Example:

Patient: Akmal Karimov
Type: TEMPERATURE
Value: 38.2
Unit: °C
Source: PATIENT
Recorded at: 2026-09-26 09:03

The source matters because the Digital Twin must distinguish clinical measurements from patient-reported home measurements.

---

# 12. Laboratory Results

Store laboratory measurements separately from generic observations.

Examples:

- Hemoglobin
- WBC
- CRP
- Glucose
- Creatinine

Example:

CRP
18 mg/L
HIGH

The system should support historical comparison.

Example:

Sep 20 → CRP 45
Sep 22 → CRP 28
Sep 24 → CRP 18
Sep 27 → CRP 7

This allows the Digital Twin to visualize trends.

---

# 13. Medications

Store medications prescribed to the patient.

Conceptually:

- medication name
- dosage
- dosage unit
- frequency
- route
- instructions
- start date
- end date
- status
- prescribing clinician

Later stages may add:

`medication_intakes`

for adherence tracking.

Do NOT build a full pharmacy system for the hackathon.

---

# 14. Procedures

Represents medical procedures/interventions.

Examples:

- Surgery
- CT
- Diagnostic procedure
- Other intervention

Procedures should appear in the Digital Twin timeline.

---

# 15. Allergies

Simple patient allergy information.

Examples:

Substance
Reaction
Severity
Status

This is intentionally a small module for the MVP.

---

# 16. Twin Events

`twin_events` is a core component of the product.

It provides a chronological event stream for the patient's Digital Twin.

Example:

2026-09-20 10:20
HOSPITAL_ADMISSION

2026-09-20 12:30
DIAGNOSIS_ADDED

2026-09-21 14:00
PROCEDURE_COMPLETED

2026-09-24 11:00
PATIENT_DISCHARGED

2026-09-24 11:01
CARE_PLAN_CREATED

2026-09-24 11:40
NURSE_ASSIGNED

2026-09-25 09:00
PATIENT_CHECK_IN

2026-09-26 09:03
OBSERVATION_RECORDED

2026-09-26 09:04
RISK_LEVEL_CHANGED

2026-09-26 09:04
ALERT_CREATED

This powers the visual Patient Journey / Timeline.

`twin_events` may use JSONB metadata for event-specific metadata.

However:

DO NOT use `twin_events.metadata` as a replacement for normalized medical tables.

The medical source of truth remains in dedicated tables.

---

# 17. Digital Twin UI Concept

The Digital Twin must NOT look like a boring collection of database tables.

The first screen should answer:

1. Who is this patient?
2. Why were they hospitalized?
3. What is their current condition?
4. What changed recently?
5. Are they recovering or deteriorating?
6. Who is currently responsible for them?
7. Is immediate attention required?

Example:

--------------------------------------------------
AKMAL KARIMOV                       HIGH RISK
58 years • Post-op Day 5

Digital Twin                       Updated 3m ago
--------------------------------------------------

Temperature       38.2°C            ↑ Worsening
Heart Rate        92 bpm            Stable
SpO2              97%               Stable
Pain              8/10              ↑ Worsening
Medication        92%               Good
Recovery                             Attention

NEW:
Weakness reported 2 hours ago
--------------------------------------------------

Below this:

- AI Summary
- Trends
- Diagnoses
- Labs
- Medications
- Care Plan
- Timeline

---

# 18. Patient Journey UI

The timeline is one of the most important visual components.

Example:

                 HOSPITAL                 HOME
────────────────────────│────────────────────────

Sep 20
● Admission
│
├── Diagnosis
│
Sep 21
● Surgery
│
Sep 24
● Discharge
│
├──────────── Digital Twin continues
│
│                            Sep 25
│                            ● Home check-in
│
│                            Sep 26
│                            ● Temperature ↑
│
│                            ● Pain ↑
│
│                            ● HIGH RISK
│
│                            ● Nurse notified

The transition from hospital to home should be visually obvious.

---

# 19. Stage 3 — API / Backend

After the Stage 2 database is stable, implement the application API.

Expected conceptual endpoints may include:

GET /patients

GET /patients/:id

GET /patients/:id/twin

GET /patients/:id/timeline

POST /hospitalizations

GET /hospitalizations/:id

POST /patients/:id/observations

POST /patients/:id/labs

POST /patients/:id/diagnoses

POST /patients/:id/medications

POST /patients/:id/procedures

POST /hospitalizations/:id/discharge

GET /care-plans/:id

GET /care-assignments

POST /care-assignments/:id/accept

Exact implementation may change depending on architecture.

Do not create unnecessary endpoints when Supabase access patterns can safely handle them.

---

# 20. Stage 4 — Central Hospital Interface

Central Hospital MVP should support:

Dashboard
Patients
Patient Search
Patient Digital Twin
Hospitalizations
Patient Admission
Medical History
Discharge
Post-discharge Monitoring

Main demo flow:

Doctor searches patient
        ↓
Opens Digital Twin
        ↓
Reviews history
        ↓
Current hospitalization
        ↓
Discharge
        ↓
Care Plan
        ↓
Transfer follow-up responsibility

---

# 21. Stage 5 — Polyclinic Interface

The polyclinic needs a different workflow.

Main pages:

Dashboard
Incoming Patients
Assignments
Patients
Alerts

Important page:

# Incoming Patients

Example:

NEW DISCHARGED PATIENT

Akmal Karimov
58 years

Source:
Namangan Central Hospital

Care Plan:
Post-operative recovery

Priority:
High

[Open Case]

The polyclinic then assigns:

Nurse Dilnoza

or another authorized medical worker.

---

# 22. Stage 6 — Nurse Interface

Nurse dashboard:

My Patients
Today's Tasks
Alerts
Patient Twin

Example:

MY PATIENTS

Akmal Karimov
Post-op Day 3
MEDIUM RISK
Next check-in: 18:00

Madina Rasulova
Post-op Day 5
HIGH RISK
Attention required

The nurse should only access patients authorized through the organization/care-assignment model.

---

# 23. Stage 7 — Telegram Patient Monitoring

For the MVP, use Telegram instead of building a full patient mobile application.

Telegram Bot should eventually support:

Medication reminders

Example:

"Please remember your scheduled medication."

Check-ins:

"How are you feeling today?"

Temperature:

"Please enter your temperature."

Pain:

"Rate your pain from 0 to 10."

Symptoms:

"Do you have nausea?"

"Do you feel weak?"

"Do you notice unusual redness/swelling?"

Questions must eventually depend on the patient's care plan.

Not every patient should receive identical questions.

---

# 24. Patient Check-ins

Future table:

`patient_check_ins`

The check-in system connects:

Telegram
    ↓
Patient Response
    ↓
Backend
    ↓
Observation
    ↓
Digital Twin
    ↓
Risk Engine

Patient-reported measurements become part of the longitudinal Twin.

---

# 25. Stage 8 — Risk Engine

Risk detection should NOT initially depend entirely on an LLM.

Create a deterministic/configurable rule engine.

Conceptually:

new observation
      ↓
Risk Engine
      ↓
configured clinical/demo rules
      ↓
LOW / MEDIUM / HIGH / CRITICAL
      ↓
potential alert

Example trajectory:

Temperature:
37.1 → 37.4 → 38.2

Pain:
4 → 5 → 8

New symptom:
Weakness

Result:

Potential deterioration detected.

The system should raise an alert for medical review.

IMPORTANT:

For hackathon/demo scenarios, thresholds may be predefined demonstration rules.

Do not present unvalidated demo rules as clinically validated medical guidance.

---

# 26. Alerts

Future `alerts` table.

Conceptually:

- patient
- care plan
- severity
- type
- reason
- assigned medical worker
- status
- created_at
- reviewed_at
- resolved_at

Example:

HIGH PRIORITY

Patient:
Akmal Karimov

Reason:
Temperature increased
37.1 → 37.4 → 38.2

Pain increased
4 → 5 → 8

New symptom:
Weakness

Responsible:
Nurse Dilnoza

The medical worker decides the clinical action.

The AI/system does NOT independently make final clinical decisions.

---

# 27. Stage 9 — AI Layer

AI is an assistant around the Digital Twin.

AI is NOT the Digital Twin itself.

Architecture:

                    Digital Twin Data
                           │
             ┌─────────────┼─────────────┐
             │             │             │
             ▼             ▼             ▼
      AI Summarizer   AI Parser    AI Communication
             │             │             │
             └─────────────┼─────────────┘
                           │
                     Human Review

---

# 28. AI Feature 1 — Discharge Parser

Input:

Hospital discharge summary / epicrisis

AI extracts structured information such as:

- diagnosis
- procedures
- medications
- monitoring requirements
- follow-up schedule
- symptoms to monitor
- warning signs

AI generates a DRAFT.

A clinician reviews and approves it.

Rule:

AI prepares.
Doctor approves.

---

# 29. AI Feature 2 — Digital Twin Summary

Doctors and nurses should not need to manually read dozens of events.

AI can summarize recent changes.

Example:

"During the last 72 hours, the patient's reported temperature increased from 37.1°C to 38.2°C and reported pain increased from 4/10 to 8/10. A new complaint of weakness was recorded. The configured monitoring rules raised the patient's risk level and notified the responsible medical worker."

The summary must be based on actual stored data.

AI must NOT invent observations.

---

# 30. AI Feature 3 — Patient Communication

AI may help convert clinician-approved monitoring plans into patient-friendly language.

Example:

Instead of:

"Monitor postoperative hyperthermia."

Patient receives:

"Please measure your temperature and send the result."

AI communication must remain constrained by the approved care plan.

---

# 31. AI Feature 4 — Personalized Check-ins

Different conditions require different monitoring.

Post-operative patient:

- temperature
- pain
- nausea
- weakness
- wound condition

Heart-related care:

- blood pressure
- heart rate
- shortness of breath
- swelling
- weight

Diabetes-related care:

- glucose
- medication adherence
- relevant symptoms

AI may help generate questions from an approved care plan.

---

# 32. AI Safety Principles

AI must NOT autonomously:

- make a final diagnosis;
- prescribe medication;
- change medication;
- approve a clinical care plan;
- make a final treatment decision;
- claim certainty where the data does not support it.

AI may:

- structure information;
- summarize records;
- prepare draft care plans;
- generate patient-friendly messages;
- identify configured patterns;
- prioritize information;
- assist with monitoring;
- suggest that medical review is needed.

Human medical professionals remain responsible for clinical decisions.

---

# 33. Authentication

Use Supabase Auth.

Authentication:

Supabase auth.users

Application identity:

profiles

Organization access:

organization_memberships

Never create a separate custom password system.

Never store plain-text passwords.

---

# 34. Authorization / RLS

Healthcare information is sensitive.

Row Level Security must be used.

Never implement policies such as:

authenticated → SELECT all patients

or:

USING (true)

for sensitive medical data.

Expected future access model:

SUPER_ADMIN
→ platform administration

CENTRAL HOSPITAL DOCTOR
→ authorized patients being treated / followed

POLYCLINIC ADMIN
→ care cases belonging to their organization

POLYCLINIC DOCTOR
→ authorized patients/cases

NURSE
→ assigned patients/care plans

PATIENT
→ only own allowed patient-facing information if patient authentication is added

RLS should follow the principle of least privilege.

---

# 35. Security Rules

Never:

- expose Supabase service_role key to frontend;
- commit secrets;
- make medical records publicly readable;
- disable RLS just to fix frontend errors;
- create anonymous medical-data access;
- copy production patient data into demo environments;
- log sensitive medical information unnecessarily.

Use environment variables.

The hackathon should primarily use synthetic patient data.

---

# 36. Synthetic Data

For the hackathon, use synthetic/demo patients.

Never imply synthetic patients are real.

One main demo patient should have a rich history.

Example:

Akmal Karimov
58 years
Synthetic patient

History:

Hypertension
Diabetes

Current episode:

Hospital admission
→ diagnosis
→ procedure
→ recovery
→ discharge
→ local follow-up
→ home monitoring
→ deterioration scenario
→ nurse alert

The demo should prioritize quality of one complete patient journey over hundreds of incomplete patients.

---

# 37. Recommended Demo Scenario

The final live demo should show one continuous story.

## Step 1

Doctor logs into Central Hospital.

## Step 2

Search:

Akmal Karimov

## Step 3

Open Digital Twin.

Show:

- patient overview
- diagnoses
- medical history
- labs
- vitals
- medications
- timeline

## Step 4

Show current hospitalization.

## Step 5

Doctor selects:

Discharge Patient

## Step 6

AI processes discharge information.

A draft post-discharge care plan is created.

## Step 7

Doctor reviews and approves.

## Step 8

System determines:

Primary clinic:
Polyclinic #17

## Step 9

Polyclinic receives:

New Discharged Patient

## Step 10

Polyclinic assigns:

Nurse Dilnoza

## Step 11

Patient receives Telegram check-in.

## Step 12

Patient reports:

Temperature: 38.2°C
Pain: 8/10
Weakness: Yes

## Step 13

Data enters the Digital Twin.

## Step 14

Risk Engine detects deterioration according to configured monitoring rules.

## Step 15

Nurse receives alert.

## Step 16

Central Hospital can see the updated patient trajectory where authorized.

## Step 17

Open Digital Twin Timeline.

Show the complete journey:

Hospital
→ Treatment
→ Discharge
→ Home
→ Monitoring
→ Deterioration
→ Medical response

This is the main WOW moment.

---

# 38. MVP Development Order

Follow this order unless there is a strong technical reason not to.

## Stage 1 — Core Database

STATUS: IMPLEMENTED

Tables:

- organizations
- profiles
- organization_memberships
- patients
- digital_twins
- hospitalizations
- care_plans
- care_assignments

---

## Stage 2 — Medical Digital Twin

NEXT

Implement:

- diagnoses
- observations
- lab_results
- medications
- procedures
- allergies
- twin_events

Then create one rich synthetic patient.

---

## Stage 3 — Core Backend

Implement patient/twin/hospitalization/care APIs or equivalent safe Supabase data layer.

---

## Stage 4 — Central Hospital UI

Implement:

- Login
- Dashboard
- Patients
- Patient Twin
- Hospitalization
- Discharge
- Care Plan

---

## Stage 5 — Polyclinic UI

Implement:

- Incoming Patients
- Patient Case
- Staff Assignment
- Monitoring

---

## Stage 6 — Nurse UI

Implement:

- My Patients
- Tasks
- Patient Twin
- Alerts

---

## Stage 7 — Patient Telegram Bot

Implement:

- Patient linking
- Reminders
- Check-ins
- Observation collection

---

## Stage 8 — Risk Engine + Alerts

Implement deterministic/configurable monitoring rules and alert workflow.

---

## Stage 9 — AI

Implement:

- discharge parser;
- care-plan draft generation;
- Twin summary;
- patient-friendly communication;
- personalized check-in generation.

---

## Stage 10 — Demo & Polish

Focus on:

- reliability;
- clean UI;
- realistic synthetic data;
- smooth transitions;
- understandable patient journey;
- clear alert demonstration.

---

# 39. Out of Scope for Initial MVP

Do NOT waste hackathon time implementing:

- full national EHR integration;
- insurance;
- billing;
- pharmacy inventory;
- genomic data;
- raw ECG processing;
- full DICOM/PACS infrastructure;
- advanced medical imaging;
- dozens of disease modules;
- real clinical prediction models without validation;
- full patient mobile application;
- microservice architecture;
- Kafka/event streaming infrastructure;
- complicated Kubernetes infrastructure;
- autonomous medical decision-making.

The goal is to prove the care-continuity concept.

---

# 40. Technology Direction

Current preferred stack:

Frontend:
- React
- TypeScript
- Tailwind CSS

Backend:
- existing project architecture should be respected;
- Python/FastAPI may be used where a dedicated backend is required.

Database:
- Supabase
- PostgreSQL

Authentication:
- Supabase Auth

Realtime:
- Supabase Realtime where useful

Patient Communication:
- Telegram Bot

AI:
- LLM API

Risk Detection:
- deterministic/configurable rules first

Hosting:
- choose the simplest reliable hackathon deployment approach.

Do not introduce new infrastructure without a clear reason.

---

# 41. Architectural Principles for Coding Agents

All AI coding agents working on this repository MUST follow these rules.

## Rule 1

Read this README before making architectural changes.

## Rule 2

ONE PATIENT = ONE DIGITAL TWIN.

Never violate this invariant.

## Rule 3

Do not duplicate patient records between organizations.

## Rule 4

Medical history should use normalized tables.

Do not place the entire Digital Twin into one JSON object.

## Rule 5

`twin_events` is an event/timeline layer, not the primary medical data store.

## Rule 6

Do not redesign existing database architecture without first inspecting migrations and relationships.

## Rule 7

Never modify or delete working migrations casually.

Use new migrations for schema evolution.

## Rule 8

Do not disable RLS to solve authorization problems.

## Rule 9

Never expose service-role credentials to frontend code.

## Rule 10

AI-generated clinical content must be treated as draft/assistive information where appropriate.

## Rule 11

Human clinicians retain final clinical authority.

## Rule 12

Prefer simple, maintainable hackathon architecture over unnecessary enterprise complexity.

## Rule 13

Before implementing a major feature:

1. inspect existing code;
2. inspect database schema;
3. identify existing patterns;
4. explain intended changes;
5. then implement.

## Rule 14

Do not create duplicate tables/features when an existing abstraction already solves the problem.

## Rule 15

Keep the final demo flow functional at all times.

A smaller working system is preferable to a larger broken system.

---

# 42. Source of Truth Priority

When an AI coding agent finds conflicting assumptions, use this priority:

1. Current database migrations/schema
2. This README architecture
3. Existing working application contracts
4. Feature-specific documentation
5. Agent assumptions

If the database and this README conflict in a significant way, STOP and report the conflict before making destructive architectural changes.

---

# 43. Product Definition

CareTwin is NOT:

- just an EHR;
- just a Telegram bot;
- just an AI chatbot;
- just a hospital dashboard;
- just a patient monitoring app.

CareTwin is:

> A continuous Digital Twin and care coordination platform that follows a patient from hospital treatment through discharge and into home recovery, connecting hospitals, local healthcare workers and patients through one continuously updated longitudinal record.

---

# 44. Core Pitch

A hospital knows a lot about a patient while they are inside the hospital.

The problem begins when the patient goes home.

CareTwin keeps the patient's medical journey alive after discharge.

The Digital Twin continues updating through follow-up care, patient-reported data, clinical observations and medical interventions.

When the patient's condition changes, the responsible healthcare worker can be informed instead of waiting until the next scheduled visit.

The goal is simple:

> Discharge should change where care happens — not end the continuity of care.

---

# 45. Final Architecture Vision

                         ┌─────────────────────┐
                         │       PATIENT       │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │    DIGITAL TWIN     │
                         │                     │
                         │ Diagnoses           │
                         │ Observations        │
                         │ Labs                │
                         │ Medications         │
                         │ Procedures          │
                         │ Allergies           │
                         │ Timeline            │
                         └──────────┬──────────┘
                                    │
                  ┌─────────────────┼─────────────────┐
                  │                 │                 │
                  ▼                 ▼                 ▼
            CENTRAL            POLYCLINIC          PATIENT
            HOSPITAL                                 │
                  │                 │                 │
               Doctor          Doctor/Nurse       Telegram
                  │                 │                 │
                  └─────────────────┼─────────────────┘
                                    │
                                    ▼
                              NEW PATIENT DATA
                                    │
                                    ▼
                              DIGITAL TWIN
                                    │
                                    ▼
                               RISK ENGINE
                                    │
                         ┌──────────┴──────────┐
                         │                     │
                         ▼                     ▼
                       NORMAL               ALERT
                                               │
                                               ▼
                                      MEDICAL WORKER
                                               │
                                               ▼
                                         HUMAN DECISION


# 46. Current Development Status

Current completed foundation:

- [x] organizations
- [x] profiles
- [x] organization_memberships
- [x] patients
- [x] digital_twins
- [x] hospitalizations
- [x] care_plans
- [x] care_assignments

Next:

- [ ] diagnoses
- [ ] observations
- [ ] lab_results
- [ ] medications
- [ ] procedures
- [ ] allergies
- [ ] twin_events

Then:

- [ ] synthetic demo patient
- [ ] Digital Twin API/data layer
- [ ] Central Hospital UI
- [ ] discharge workflow
- [ ] Polyclinic incoming cases
- [ ] nurse assignment
- [ ] Telegram patient monitoring
- [ ] patient check-ins
- [ ] Risk Engine
- [ ] alerts
- [ ] AI discharge parser
- [ ] AI Twin summary
- [ ] final demo flow


# 47. Immediate Next Task

The current immediate development objective is:

## Stage 2 — Medical Digital Twin Schema

Do NOT jump ahead and build unrelated features until the Digital Twin medical data model is stable.

The next implementation should add:

diagnoses
observations
lab_results
medications
procedures
allergies
twin_events

while preserving all Stage 1 architecture and migrations.

---

CareTwin AI
Continuous care. One patient. One evolving Digital Twin.