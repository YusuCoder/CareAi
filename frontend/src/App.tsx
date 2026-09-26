import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AuthProvider } from './contexts/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { LoginPage } from './pages/LoginPage'
import { OverviewPage } from './pages/OverviewPage'
import { PatientsPage } from './pages/PatientsPage'
import { IncomingPage } from './pages/IncomingPage'
import { AttentionPage } from './pages/AttentionPage'
import { ActiveCallsPage } from './pages/ActiveCallsPage'
import { AdmissionsPage } from './pages/AdmissionsPage'
import { DischargePage } from './pages/DischargePage'
import { PostDischargePage } from './pages/PostDischargePage'
import { AssignmentsPage } from './pages/AssignmentsPage'
import { SectionPendingPage } from './pages/SectionPendingPage'
import { PatientTwinPage } from './pages/PatientTwinPage'
import { t } from './lib/i18n'

const HOSPITAL = ['HOSPITAL_DOCTOR', 'ORGANIZATION_ADMIN', 'SUPER_ADMIN'] as const
const POLYCLINIC = ['POLYCLINIC_DOCTOR', 'ORGANIZATION_ADMIN', 'SUPER_ADMIN'] as const
const CARE_TEAM = ['POLYCLINIC_DOCTOR', 'NURSE', 'ORGANIZATION_ADMIN', 'SUPER_ADMIN'] as const
const CLINICAL = ['HOSPITAL_DOCTOR', 'POLYCLINIC_DOCTOR', 'ORGANIZATION_ADMIN', 'SUPER_ADMIN'] as const

export const App: React.FC = () => (
  <BrowserRouter>
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route path="/" element={<ProtectedRoute><OverviewPage /></ProtectedRoute>} />

        <Route
          path="/patients"
          element={<ProtectedRoute allow={[...CLINICAL]}><PatientsPage /></ProtectedRoute>}
        />
        <Route
          path="/patients/:patientId"
          element={<ProtectedRoute><PatientTwinPage /></ProtectedRoute>}
        />

        <Route
          path="/admissions"
          element={<ProtectedRoute allow={[...HOSPITAL]}><AdmissionsPage /></ProtectedRoute>}
        />
        <Route
          path="/discharge/:hospitalizationId"
          element={<ProtectedRoute allow={[...HOSPITAL]}><DischargePage /></ProtectedRoute>}
        />
        <Route
          path="/care-plans"
          element={<ProtectedRoute allow={[...HOSPITAL]}><SectionPendingPage title={t.nav.carePlans} /></ProtectedRoute>}
        />
        <Route
          path="/post-discharge"
          element={<ProtectedRoute allow={[...HOSPITAL]}><PostDischargePage /></ProtectedRoute>}
        />

        <Route
          path="/incoming"
          element={<ProtectedRoute allow={[...POLYCLINIC]}><IncomingPage /></ProtectedRoute>}
        />
        <Route
          path="/assignments"
          element={<ProtectedRoute allow={[...POLYCLINIC]}><AssignmentsPage /></ProtectedRoute>}
        />

        <Route
          path="/active-calls"
          element={<ProtectedRoute allow={[...CARE_TEAM]}><ActiveCallsPage /></ProtectedRoute>}
        />

        <Route path="/attention" element={<ProtectedRoute><AttentionPage /></ProtectedRoute>} />

        <Route
          path="/staff"
          element={<ProtectedRoute allow={['ORGANIZATION_ADMIN', 'SUPER_ADMIN']}><SectionPendingPage title={t.nav.staff} /></ProtectedRoute>}
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  </BrowserRouter>
)
