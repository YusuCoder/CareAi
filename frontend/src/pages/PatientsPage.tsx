import { useMemo, useState } from 'react'

import { DashboardLayout } from '../components/layout/DashboardLayout'
import { EmptyState, Panel, PatientRow } from '../components/PatientRow'
import { usePatients } from '../lib/queries'
import { t } from '../lib/i18n'

export const PatientsPage: React.FC = () => {
  const { data: patients, loading, error } = usePatients()
  const [query, setQuery] = useState<string>('')

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return patients
    return patients.filter((patient) =>
      [patient.last_name, patient.first_name, String(patient.patient_number)]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    )
  }, [patients, query])

  return (
    <DashboardLayout
      title={t.patients.title}
      subtitle={t.patients.subtitle}
      actions={
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t.patients.search}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none transition-[border-color,box-shadow] focus-visible:border-primary focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-primary)_18%,transparent)] sm:w-64"
        />
      }
    >
      {error && (
        <p className="mb-4 border-l-2 border-risk-critical py-1 pl-3 text-sm text-risk-critical">{error}</p>
      )}

      <Panel>
        {loading && <EmptyState>{t.common.loading}</EmptyState>}
        {!loading && filtered.length === 0 && (
          <EmptyState>{query ? t.patients.notFound : t.patients.empty}</EmptyState>
        )}
        <ul className="divide-y divide-border">
          {filtered.map((patient) => (
            <PatientRow key={patient.id} patient={patient} />
          ))}
        </ul>
      </Panel>
    </DashboardLayout>
  )
}
