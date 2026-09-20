import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { DataProvider } from './hooks/useData.jsx'
import { PreferencesProvider } from './hooks/usePreferences.jsx'
import Layout from './components/Layout'
import Landing from './pages/Landing'
import Home from './pages/Home'
import Schedule from './pages/Schedule'
import Standings from './pages/Standings'
import Settings from './pages/Settings'

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL !== '/' ? '/nyhl-game-centre' : ''} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <PreferencesProvider>
        <DataProvider>
          <Routes>
            {/* Landing is shown when no teams are saved */}
            <Route path="/" element={<Landing />} />

            {/* Main app routes */}
            <Route element={<Layout />}>
              <Route path="/home" element={<Home />} />
              <Route path="/schedule" element={<Schedule />} />
              <Route path="/standings" element={<Standings />} />
              <Route path="/settings" element={<Settings />} />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </DataProvider>
      </PreferencesProvider>
    </BrowserRouter>
  )
}
