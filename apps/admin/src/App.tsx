import { Navigate, Route, Routes } from "react-router-dom"

import { AppLayout } from "@/components/layout/AppLayout"
import { ProtectedRoute } from "@/routes/ProtectedRoute"
import LoginPage from "@/pages/LoginPage"
import LeadsPage from "@/pages/LeadsPage"
import CrmPage from "@/pages/CrmPage"
import SettingsPage from "@/pages/SettingsPage"

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          {/* Rose: o CRM é a tela inicial. */}
          <Route index element={<CrmPage />} />
          <Route path="crm" element={<Navigate to="/" replace />} />
          <Route path="leads" element={<LeadsPage />} />
          <Route path="configuracoes" element={<SettingsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
