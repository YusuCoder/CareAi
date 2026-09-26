import { useCallback, useRef, useState } from 'react'

import { supabase } from './supabase'
import type { RiskLevel } from './database.types'

export interface AssistantPatient {
  id: string
  patient_number: number | null
  name: string
  birth_date: string | null
  age: number | null
  gender: string
  national_id: string | null
  district: string | null
  risk_level: RiskLevel | null
  twin_status: string | null
}

/** Записи двойника, как они лежат в базе: модель их не пересказывает. */
export interface AssistantRecord {
  patient: AssistantPatient
  allergies: { id: string; substance: string; reaction: string; severity: string }[]
  diagnoses_active: { id: string; name: string; code: string; since: string }[]
  diagnoses_past: { id: string; name: string; code: string; since: string; resolved: string }[]
  medications: { id: string; text: string }[]
  labs_abnormal: { id: string; date: string; analyte: string; value: string; flag: string }[]
  hospitalizations: { id: string; from: string; to: string; diagnosis: string; active: boolean }[]
  events: { id: string; date: string; title: string; severity: string }[]
  lifestyle: { id: string; text: string }[]
}

export type HighlightLevel = 'DANGER' | 'WARN' | 'INFO'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  /** Пациент, выбранный кликом по карточке. */
  patientId?: string
  patients?: AssistantPatient[]
  record?: AssistantRecord | null
  overview?: string
  highlights?: { level: HighlightLevel; text: string; evidence: { id: string; text: string }[] }[]
  suggestions?: string[]
  failed?: boolean
}

interface Reply {
  reply: string
  overview: string
  highlights: NonNullable<ChatMessage['highlights']>
  suggestions: string[]
  patients: AssistantPatient[]
  record: AssistantRecord | null
  error?: string
}

/**
 * Диалог с функцией patient-assistant. История хранится только в браузере и
 * уходит на сервер целиком на каждом ходе; вместе с ответами передаются id
 * показанных пациентов, чтобы модель могла сослаться на них без повторного поиска.
 */
export function usePatientAssistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const busy = useRef(false)

  const send = useCallback(
    async (content: string, patientId?: string) => {
      const trimmed = content.trim()
      if (!trimmed || busy.current) return
      busy.current = true
      setLoading(true)

      const next: ChatMessage[] = [...messages, { role: 'user', content: trimmed, patientId }]
      setMessages(next)

      const payload = next
        .filter((message) => !message.failed)
        .map((message) => ({
          role: message.role,
          content: message.content || (message.record ? `Показана сводка: ${message.record.patient.name}` : ''),
          patientId: message.patientId,
          patients: message.patients?.map((patient) => ({
            id: patient.id,
            label: `${patient.name}, карта №${patient.patient_number ?? '—'}`,
          })) ?? (message.record
            ? [{ id: message.record.patient.id, label: `${message.record.patient.name} (открыта сводка)` }]
            : undefined),
        }))

      try {
        const { data, error } = await supabase.functions.invoke<Reply>('patient-assistant', {
          body: { messages: payload },
        })

        if (error || !data || data.error) {
          console.error('[patient-assistant] failed', error ?? data)
          setMessages([...next, { role: 'assistant', content: '', failed: true }])
        } else {
          setMessages([
            ...next,
            {
              role: 'assistant',
              content: data.reply,
              patients: data.patients,
              record: data.record,
              overview: data.overview,
              highlights: data.highlights,
              suggestions: data.suggestions,
            },
          ])
        }
      } catch (caught) {
        console.error('[patient-assistant] request failed', caught)
        setMessages([...next, { role: 'assistant', content: '', failed: true }])
      } finally {
        busy.current = false
        setLoading(false)
      }
    },
    [messages],
  )

  const reset = useCallback(() => setMessages([]), [])

  return { messages, loading, send, reset }
}
