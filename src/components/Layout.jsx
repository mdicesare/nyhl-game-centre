import { Outlet, NavLink, useLocation } from 'react-router-dom'
import Footer from './Footer'
import { usePreferences } from '../hooks/usePreferences.jsx'

const navItems = [
  { to: '/home', label: 'Home', icon: HomeIcon },
  { to: '/schedule', label: 'Schedule', icon: CalendarIcon },
  { to: '/standings', label: 'Standings', icon: TrophyIcon },
  { to: '/settings', label: 'Teams', icon: SettingsIcon },
]

export default function Layout() {
  const { activeTeam, season } = usePreferences()
  const location = useLocation()

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-slate-900 transition-colors pb-20">
      {/* Top bar */}
      <header className="gradient-navy text-white px-4 py-3 flex items-center justify-between sticky top-0 z-30 shadow-lg">
        <a href="https://nyhl.on.ca/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
          <img src={`${import.meta.env.BASE_URL}images/NYHLLogo-h150.png`} alt="NYHL" className="h-8 w-auto" />
        </a>
        <div className="flex items-center gap-3">
          {activeTeam && (
            <span className="text-sm text-blue-200 hidden sm:block">
              {activeTeam}
            </span>
          )}
          <span className="text-xs bg-white/10 px-2 py-1 rounded backdrop-blur">
            {season}
          </span>
        </div>
      </header>

      {/* Active filter indicator */}
      <FilterBar />

      {/* Main content */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      <Footer />

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-gray-200 dark:border-slate-700 z-30 safe-area-bottom transition-colors shadow-[0_-2px_10px_rgba(0,0,0,0.05)] dark:shadow-[0_-2px_10px_rgba(0,0,0,0.3)]">
        <div className="flex justify-around items-center h-16 max-w-lg mx-auto">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 px-3 py-2 text-xs transition-all ${
                  isActive
                    ? 'text-nyhl-blue font-semibold scale-110'
                    : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
                }`
              }
            >
              <Icon className="w-6 h-6" />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}

function FilterBar() {
  const { filters } = usePreferences()
  const location = useLocation()

  const activeFilters = Object.entries(filters).filter(
    ([, v]) => v && v !== 'ALL'
  )

  if (activeFilters.length === 0) return null
  // Only show on schedule page (standings has inline filters)
  if (location.pathname !== '/schedule') return null

  const label = activeFilters
    .map(([, v]) => v)
    .join(' · ')

  return (
    <div className="bg-nyhl-ice dark:bg-nyhl-navy/50 text-nyhl-navy dark:text-blue-200 text-sm px-4 py-2 border-b border-blue-100 dark:border-slate-700 transition-colors">
      {label}
    </div>
  )
}

// ---- Simple SVG icons ----

function HomeIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
    </svg>
  )
}

function CalendarIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  )
}

function TrophyIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0116.27 9.728M18.75 4.236V4.5c0 2.108-.966 3.99-2.48 5.228m0 0a6.015 6.015 0 01-2.27.308 6.015 6.015 0 01-2.27-.308" />
    </svg>
  )
}

function SettingsIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}
