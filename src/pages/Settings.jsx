import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePreferences } from '../hooks/usePreferences.jsx'
import TeamFinder from '../components/TeamFinder.jsx'
import { teamId } from '../lib/teams.js'
import { SEASONS } from '../lib/seasons.js'

// "25-26" -> "2025-26", the same label the data pages and finder show.
const seasonLabel = (value) => SEASONS.find((s) => s.value === value)?.label || value

export default function Settings() {
  const { savedTeams, activeTeam, setActiveTeam, removeTeam } = usePreferences()
  const navigate = useNavigate()
  const [confirmRemove, setConfirmRemove] = useState(null)
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'))

  // Collapsed by default so the team list stays compact
  const [showAdd, setShowAdd] = useState(false)

  // Removing the last team swaps this section back to the full team finder,
  // so drop the stale "add another" expansion before it can resurface.
  useEffect(() => {
    if (savedTeams.length === 0) setShowAdd(false)
  }, [savedTeams.length])

  // Sync dark mode state when localStorage changes from other sources
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'))
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  const toggleDark = () => {
    document.documentElement.classList.toggle('dark')
    const nowDark = document.documentElement.classList.contains('dark')
    setIsDark(nowDark)
    localStorage.setItem('nyhl-dark-mode', nowDark ? 'dark' : 'light')
  }

  const handleRemoveTeam = (id) => {
    removeTeam(id)
    setConfirmRemove(null)
  }

  return (
    <div className="px-4 py-6 max-w-lg mx-auto animate-fade-in">
      <h1 className="text-2xl font-bold mb-6 dark:text-white">Teams & Settings</h1>

      {/* Saved teams */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-3">
          My Teams ({savedTeams.length})
        </h2>

        {savedTeams.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
            <p className="font-medium dark:text-slate-200">Find your team</p>
            <p className="text-sm text-gray-500 dark:text-slate-400 mb-3">
              Pick your division and team to start following their games.
            </p>
            <TeamFinder />
          </div>
        ) : (
          <div className="space-y-2">
            {savedTeams.map((team) => (
              <div
                key={teamId(team)}
                className={`rounded-xl border p-3 flex items-center justify-between transition-colors ${
                  teamId(team) === activeTeam
                    ? 'bg-gradient-to-r from-nyhl-blue/5 to-nyhl-blue/10 border-nyhl-blue/30 dark:from-nyhl-blue/10 dark:to-nyhl-blue/20 dark:border-blue-500/30'
                    : 'bg-white dark:bg-slate-800 border-gray-100 dark:border-slate-700'
                }`}
              >
                <div>
                  <p className={`font-medium ${teamId(team) === activeTeam ? 'text-nyhl-blue dark:text-blue-400' : 'dark:text-slate-200'}`}>
                    {team.name}
                  </p>
                  {team.season && (
                    <p className="text-xs text-gray-500 dark:text-slate-400">
                      {seasonLabel(team.season)}
                      {team.division ? ` · ${team.division}` : ''}
                      {team.tier ? ` · ${team.tier}` : ''}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setActiveTeam(team)
                      navigate('/schedule')
                    }}
                    className="text-xs text-nyhl-blue hover:underline"
                  >
                    {teamId(team) === activeTeam ? 'Active' : 'Set active'}
                  </button>
                  {confirmRemove === teamId(team) ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleRemoveTeam(teamId(team))}
                        className="text-xs text-red-600 font-medium"
                      >
                        Remove
                      </button>
                      <button
                        onClick={() => setConfirmRemove(null)}
                        className="text-xs text-gray-400 dark:text-slate-500"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmRemove(teamId(team))}
                      className="text-xs text-gray-400 dark:text-slate-500 hover:text-red-500"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add team */}
        {!showAdd && savedTeams.length > 0 && (
          <button
            onClick={() => setShowAdd(true)}
            className="w-full mt-3 text-sm text-nyhl-blue hover:underline py-2"
          >
            + Add another team
          </button>
        )}

        {showAdd && savedTeams.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 mt-3 animate-scale-in">
            <TeamFinder
              backLabel="Cancel"
              onCancel={() => setShowAdd(false)}
              onAdded={() => setShowAdd(false)}
            />
          </div>
        )}
      </section>

      {/* Appearance */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-3">
          Appearance
        </h2>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium dark:text-slate-200">Light Mode</p>
              <p className="text-sm text-gray-500 dark:text-slate-400">Switch to lighter theme</p>
            </div>
            <button
              onClick={toggleDark}
              className={`relative w-12 h-7 rounded-full transition-colors ${
                isDark ? 'bg-nyhl-blue' : 'bg-gray-300'
              }`}
              aria-label="Toggle dark mode"
            >
              <span className={`absolute top-1 w-5 h-5 rounded-full shadow-md transition-all ${
                isDark
                  ? 'left-6 bg-white'
                  : 'left-1 bg-nyhl-navy'
              }`} />
            </button>
          </div>
        </div>
      </section>

      {/* About */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-3">
          About
        </h2>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 text-sm text-gray-500 dark:text-slate-400 space-y-2">
          <p>
            North York Hockey League Game Center — Schedules, standings, and results for your NYHL teams.
          </p>
          <p>
            Data sourced from the NYHL/Agilex Game Centre. Updated regularly.
          </p>
          <p>
            This is an unofficial fan tool and is not affiliated with NYHL or Agilex.
          </p>
        </div>
      </section>

      {/* Clear all data */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-3">
          Data
        </h2>
        <ClearDataButton />
      </section>
    </div>
  )
}

function ClearDataButton() {
  const [confirmClear, setConfirmClear] = useState(false)

  const handleClear = () => {
    // Clear all NYHL-related localStorage keys
    const keys = Object.keys(localStorage).filter((k) => k.startsWith('nyhl-'))
    keys.forEach((k) => localStorage.removeItem(k))
    // Reload to reset all state
    window.location.href = '/nyhl-game-centre/'
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-gray-700 dark:text-slate-200">Clear All Data</p>
          <p className="text-sm text-gray-500 dark:text-slate-400">
            Remove saved teams, preferences, and settings
          </p>
        </div>
        {!confirmClear ? (
          <button
            onClick={() => setConfirmClear(true)}
            className="text-sm text-red-500 border border-red-300 dark:border-red-700 px-3 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            Clear
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={handleClear}
              className="text-sm text-white bg-red-600 px-3 py-1.5 rounded-lg hover:bg-red-700 transition-colors"
            >
              Yes, clear
            </button>
            <button
              onClick={() => setConfirmClear(false)}
              className="text-sm text-gray-500 dark:text-slate-400 hover:underline"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
