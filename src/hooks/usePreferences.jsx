import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const PreferencesContext = createContext(null)

const STORAGE_KEY = 'nyhl-preferences'

const DEFAULT_PREFS = {
  savedTeams: [],       // [{ name, division, tier, label? }]
  activeTeam: null,     // currently focused team name
  season: '26-27',
  // Shared filter context (persists across Schedule ↔ Standings)
  filters: {
    division: 'ALL',
    tier: 'ALL',
    gameType: 'ALL',
    club: 'ALL',
    arena: 'ALL',
  },
  scheduleFilter: 'all', // 'all' | 'upcoming' | 'completed'
  viewPreference: 'list', // 'list' | 'calendar' (future)
}

function loadPreferences() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_PREFS
    const parsed = JSON.parse(raw)
    return {
      ...DEFAULT_PREFS,
      ...parsed,
      // Merge filters individually: an older/partial record missing a key
      // would otherwise turn the filter selects uncontrolled.
      filters: { ...DEFAULT_PREFS.filters, ...(parsed.filters || {}) },
    }
  } catch {
    return DEFAULT_PREFS
  }
}

function savePreferences(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch (e) {
    console.warn('Failed to save preferences:', e)
  }
}

export function PreferencesProvider({ children }) {
  const [prefs, setPrefs] = useState(loadPreferences)

  // Persist on every change
  useEffect(() => {
    savePreferences(prefs)
  }, [prefs])

  const addTeam = useCallback((team) => {
    setPrefs((p) => {
      // Avoid duplicates
      if (p.savedTeams.some((t) => t.name === team.name)) return p
      return { ...p, savedTeams: [...p.savedTeams, team] }
    })
  }, [])

  const removeTeam = useCallback((teamName) => {
    setPrefs((p) => ({
      ...p,
      savedTeams: p.savedTeams.filter((t) => t.name !== teamName),
      activeTeam: p.activeTeam === teamName ? null : p.activeTeam,
    }))
  }, [])

  const setActiveTeam = useCallback((teamName) => {
    setPrefs((p) => {
      const team = p.savedTeams.find((t) => t.name === teamName)
      const updates = { activeTeam: teamName }
      // Pre-fill filters with the team's division/tier if available
      if (team) {
        updates.filters = {
          ...p.filters,
          division: team.division || 'ALL',
          tier: team.tier || 'ALL',
        }
        // Following a team means looking at its season's data, so the
        // schedule and standings open on the year that team plays in.
        if (team.season) updates.season = team.season
      }
      return { ...p, ...updates }
    })
  }, [])

  const setSeason = useCallback((season) => {
    setPrefs((p) => ({ ...p, season }))
  }, [])

  const setFilters = useCallback((filters) => {
    setPrefs((p) => ({ ...p, filters: { ...p.filters, ...filters } }))
  }, [])

  const clearFilters = useCallback(() => {
    setPrefs((p) => ({ ...p, filters: DEFAULT_PREFS.filters }))
  }, [])

  const setScheduleFilter = useCallback((filter) => {
    setPrefs((p) => ({ ...p, scheduleFilter: filter }))
  }, [])

  const hasTeams = prefs.savedTeams.length > 0

  const value = {
    ...prefs,
    hasTeams,
    addTeam,
    removeTeam,
    setActiveTeam,
    setSeason,
    setFilters,
    clearFilters,
    setScheduleFilter,
  }

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  )
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext)
  if (!ctx) throw new Error('usePreferences must be used within PreferencesProvider')
  return ctx
}
