import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { CURRENT_SEASON } from '../lib/seasons.js'
import { teamId } from '../lib/teams.js'

const PreferencesContext = createContext(null)

const STORAGE_KEY = 'nyhl-preferences'

const DEFAULT_PREFS = {
  savedTeams: [],       // [{ name, division, tier, season, label? }]
  activeTeam: null,     // id (see teamId) of the active saved team
  season: '26-27',
  // Shared filter context (persists across Schedule ↔ Standings)
  filters: {
    division: 'ALL',
    tier: 'ALL',
    gameType: 'ALL',
    club: 'ALL',
  },
  scheduleFilter: 'all', // 'all' | 'upcoming' | 'completed'
  viewPreference: 'list', // 'list' | 'calendar' (future)
}

function loadPreferences() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_PREFS
    const parsed = JSON.parse(raw)
    // Teams saved before the season field existed get stamped with the
    // current season — every one of them was added while it was on screen,
    // and without this their card links ship no season and land on
    // whichever year was last browsed.
    const savedTeams = (parsed.savedTeams || []).map((team) =>
      team.season ? team : { ...team, season: CURRENT_SEASON }
    )
    // The active team used to be stored as a plain name; names are no
    // longer unique, so upgrade a stored name to the id of the first saved
    // team it matches, and drop it when nothing does. Ids pass straight
    // through.
    let activeTeam = parsed.activeTeam ?? null
    if (activeTeam && !savedTeams.some((t) => teamId(t) === activeTeam)) {
      const byName = savedTeams.find(
        (t) => t.name && t.name.toLowerCase() === String(activeTeam).toLowerCase()
      )
      activeTeam = byName ? teamId(byName) : null
    }
    return {
      ...DEFAULT_PREFS,
      ...parsed,
      savedTeams,
      activeTeam,
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
      // One entry per season/division/tier — the same name may be followed
      // again in another season, but never twice in the same one.
      if (p.savedTeams.some((t) => teamId(t) === teamId(team))) return p
      return { ...p, savedTeams: [...p.savedTeams, team] }
    })
  }, [])

  const removeTeam = useCallback((id) => {
    setPrefs((p) => ({
      ...p,
      savedTeams: p.savedTeams.filter((t) => teamId(t) !== id),
      activeTeam: p.activeTeam === id ? null : p.activeTeam,
    }))
  }, [])

  // Accepts the team object (preferred — filters come straight off it) or an
  // id/name string, which is resolved against the saved list.
  const setActiveTeam = useCallback((team) => {
    setPrefs((p) => {
      const id = typeof team === 'string' ? team : teamId(team)
      const entry =
        typeof team === 'string'
          ? p.savedTeams.find((t) => teamId(t) === id) ||
            p.savedTeams.find((t) => t.name?.toLowerCase() === String(team).toLowerCase())
          : team
      const updates = { activeTeam: entry ? teamId(entry) : id }
      // Pre-fill filters with the team's division/tier if available
      if (entry) {
        updates.filters = {
          ...p.filters,
          division: entry.division || 'ALL',
          tier: entry.tier || 'ALL',
        }
        // Following a team means looking at its season's data, so the
        // schedule and standings open on the year that team plays in.
        if (entry.season) updates.season = entry.season
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

  // The name behind the active id, for headers and labels that used to read
  // activeTeam directly. Falls back to matching a stored plain name so an
  // un-migrated value still renders somewhere.
  const activeEntry = prefs.savedTeams.find((t) => teamId(t) === prefs.activeTeam)
  const activeTeamName = activeEntry
    ? activeEntry.name
    : prefs.savedTeams.find((t) => t.name === prefs.activeTeam)?.name || null

  const value = {
    ...prefs,
    hasTeams,
    activeTeamName,
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
