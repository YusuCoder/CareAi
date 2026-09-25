import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AuthProvider } from './contexts/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { LoginPage } from './pages/LoginPage'
import { HomePage } from './pages/HomePage'

/**
 * Routes are deliberately thin for now. The hospital, polyclinic and nurse
 * areas all land on the connection check until their real screens are built.
 */
export const App: React.FC = () => (
  <BrowserRouter>
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <HomePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/hospital"
          element={
            <ProtectedRoute allow={['HOSPITAL_DOCTOR', 'ORGANIZATION_ADMIN', 'SUPER_ADMIN']}>
              <HomePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/polyclinic"
          element={
            <ProtectedRoute allow={['POLYCLINIC_DOCTOR', 'ORGANIZATION_ADMIN', 'SUPER_ADMIN']}>
              <HomePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/nurse"
          element={
            <ProtectedRoute allow={['NURSE']}>
              <HomePage />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  </BrowserRouter>
)
