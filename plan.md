                        CareTwin Architecture

 ┌──────────────────┐                       ┌──────────────────┐
 │ Central Hospital │                       │    Polyclinic    │
 │   React + TS     │                       │    React + TS    │
 └────────┬─────────┘                       └────────┬─────────┘
          │                                          │
          └──────────────────┬───────────────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ Python / FastAPI│
                    │   API Layer     │
                    └────────┬────────┘
                             │
          ┌──────────────────┼─────────────────────┐
          │                  │                     │
          ▼                  ▼                     ▼
 ┌────────────────┐  ┌────────────────┐   ┌────────────────┐
 │   Supabase     │  │  Risk Engine   │   │    AI Layer    │
 │  PostgreSQL    │  │    Python      │   │      LLM       │
 └───────┬────────┘  └────────────────┘   └────────────────┘
         │
         │
         ▼
 ┌──────────────────────────────────────────────────┐
 │                 DIGITAL TWIN                     │
 │                                                  │
 │ Diagnoses │ Labs │ Vitals │ Meds │ Procedures   │
 │ Allergies │ Hospitalizations │ Events │ Devices  │
 └────────────────────────┬─────────────────────────┘
                          ▲
                          │
               ┌──────────┴──────────┐
               │                     │
          Telegram Bot          Device Gateway
               │                     │
            Patient           Wearables / IoT