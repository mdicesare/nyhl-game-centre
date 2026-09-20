import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePreferences } from '../hooks/usePreferences.jsx'
import { useData } from '../hooks/useData.jsx'

export default function Settings() {
  const { savedTeams, activeTeam, setActiveTeam, removeTeam, season, setSeason } =
    usePreferences()
  const { divisions, allTeams, season: dataSeason } = useData()
  const navigate = useNavigate()
  const [confirmRemove, setConfirmRemove] = useState(null)
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'))

  // Quick add team state
  const [showAdd, setShowAdd] = useState(false)
  const [newTeamSearch, setNewTeamSearch] = useState('')
  const { addTeam } = usePreferences()

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

  const availableTeams = allTeams.filter(
    (t) => !savedTeams.some((s) => s.name === t)
  )

  const filteredAvailable = newTeamSearch
    ? availableTeams.filter((t) =>
        t.toLowerCase().includes(newTeamSearch.toLowerCase())
      )
    : availableTeams

  const handleAddTeam = (teamName) => {
    addTeam({ name: teamName })
    setNewTeamSearch('')
    setShowAdd(false)
  }

  const handleRemoveTeam = (name) => {
    removeTeam(name)
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
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-6 text-center">
            <p className="text-gray-400 dark:text-slate-500 mb-3">No teams saved yet</p>
            <button
              onClick={() => setShowAdd(true)}
              className="text-sm text-nyhl-blue hover:underline"
            >
              Add your first team
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {savedTeams.map((team) => (
              <div
                key={team.name}
                className={`rounded-xl border p-3 flex items-center justify-between transition-colors ${
                  activeTeam?.toLowerCase() === team.name.toLowerCase()
                    ? 'bg-gradient-to-r from-nyhl-blue/5 to-nyhl-blue/10 border-nyhl-blue/30 dark:from-nyhl-blue/10 dark:to-nyhl-blue/20 dark:border-blue-500/30'
                    : 'bg-white dark:bg-slate-800 border-gray-100 dark:border-slate-700'
                }`}
              >
                <div>
                  <p className={`font-medium ${activeTeam?.toLowerCase() === team.name.toLowerCase() ? 'text-nyhl-blue dark:text-blue-400' : 'dark:text-slate-200'}`}>
                    {team.name}
                  </p>
                  {team.division && (
                    <p className="text-xs text-gray-500 dark:text-slate-400">
                      {team.division}
                      {team.tier ? ` · ${team.tier}` : ''}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setActiveTeam(team.name)
                      navigate('/schedule')
                    }}
                    className="text-xs text-nyhl-blue hover:underline"
                  >
                    {activeTeam?.toLowerCase() === team.name.toLowerCase() ? 'Active' : 'Set active'}
                  </button>
                  {confirmRemove === team.name ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleRemoveTeam(team.name)}
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
                      onClick={() => setConfirmRemove(team.name)}
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

        {showAdd && (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 mt-3 animate-scale-in">
            <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">
              Search teams
            </label>
            <input
              type="text"
              value={newTeamSearch}
              onChange={(e) => setNewTeamSearch(e.target.value)}
              placeholder="e.g. Toronto Aeros"
              className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm mb-3 bg-white dark:bg-slate-700 dark:text-white placeholder-gray-400 dark:placeholder-slate-500"
              autoFocus
            />
            <div className="max-h-48 overflow-y-auto">
              {filteredAvailable.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-slate-500 py-2">
                  {newTeamSearch ? 'No matching teams' : 'All teams already added'}
                </p>
              ) : (
                filteredAvailable.map((name) => (
                  <button
                    key={name}
                    onClick={() => handleAddTeam(name)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-700 rounded-lg dark:text-slate-200 transition-colors"
                  >
                    {name}
                  </button>
                ))
              )}
            </div>
            <button
              onClick={() => {
                setShowAdd(false)
                setNewTeamSearch('')
              }}
              className="w-full mt-3 text-sm text-gray-500 dark:text-slate-400 hover:underline"
            >
              Cancel
            </button>
          </div>
        )}
      </section>

      {/* Season */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-3">
          Season
        </h2>
        <select
          value={season}
          onChange={(e) => setSeason(e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 dark:text-white"
        >
          <option value="26-27">2026–27</option>
          <option value="25-26">2025–26</option>
          <option value="24-25">2024–25</option>
          <option value="23-24">2023–24</option>
          <option value="22-23">2022–23</option>
        </select>
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
      <section>
        <h2 className="text-sm font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-3">
          About
        </h2>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 text-sm text-gray-500 dark:text-slate-400 space-y-2">
          <p>
            NYHL Game Centre — A better way to follow your NYHL teams.
          </p>
          <p>
            Data sourced from the NYHL/Agilex Game Centre. Updated regularly.
          </p>
          <p>
            This is an unofficial fan tool and is not affiliated with NYHL or Agilex.
          </p>
        </div>
      </section>
    </div>
  )
}
