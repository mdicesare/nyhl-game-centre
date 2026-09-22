import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { usePreferences } from './usePreferences.jsx'

const DataContext = createContext(null)

const BASE = import.meta.env.BASE_URL

export function DataProvider({ children }) {
  // The season the user picked in preferences decides which snapshot we load.
  // Completed seasons are served from their own file and never re-scraped.
  const { season: selectedSeason } = usePreferences()

  const [schedule, setSchedule] = useState(null)
  const [standings, setStandings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Prefer the per-season snapshot; fall back to the default (current) file.
      const fetchJson = async (kind) => {
        if (selectedSeason) {
          const snapRes = await fetch(`${BASE}data/${kind}-${selectedSeason}.json`)
          if (snapRes.ok) return snapRes.json()
        }
        const res = await fetch(`${BASE}data/${kind}.json`)
        if (!res.ok) throw new Error(`${kind} fetch failed: ${res.status}`)
        return res.json()
      }

      const [schedData, standData] = await Promise.all([
        fetchJson('schedule'),
        fetchJson('standings'),
      ])

      // If we fell back to the default file and it belongs to a different
      // season, surface "no data" instead of showing the wrong year.
      const mismatch = selectedSeason && schedData.season && schedData.season !== selectedSeason

      setSchedule(mismatch ? { ...schedData, season: selectedSeason, games: [] } : schedData)
      setStandings(mismatch ? { ...standData, season: selectedSeason, standings: [] } : standData)
    } catch (err) {
      console.error('Failed to load data:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [selectedSeason])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Convenience getters
  const games = schedule?.games || []
  const standingsList = standings?.standings || []
  const metadata = schedule?.metadata || {}
  const season = schedule?.season || standings?.season || '26-27'

  // Get games for a specific team
  const getGamesForTeam = useCallback((teamName) => {
    if (!teamName) return games
    return games.filter(
      (g) => g.homeTeam.name === teamName || g.awayTeam.name === teamName
    )
  }, [games])

  // Get standings for a specific division/tier
  const getStandingsForCompetition = useCallback((division, tier) => {
    let filtered = standingsList
    if (division && division !== 'ALL') {
      filtered = filtered.filter((s) => s.division === division)
    }
    if (tier && tier !== 'ALL') {
      filtered = filtered.filter((s) => s.tier === tier)
    }
    return filtered
  }, [standingsList])

  // Get next game for a team
  const getNextGame = useCallback((teamName, division, tier) => {
    const now = new Date()
    const lower = teamName.toLowerCase()
    return games
      .filter(
        (g) =>
          (g.homeTeam.name.toLowerCase() === lower || g.awayTeam.name.toLowerCase() === lower) &&
          g.status === 'scheduled'
      )
      .filter((g) => {
        if (division && g.division && g.division !== division) return false
        if (tier && g.tier && g.tier !== tier) return false
        return true
      })
      .filter((g) => {
        const gameDate = new Date(`${g.date}T${g.time || '23:59'}`)
        return gameDate > now
      })
      .sort((a, b) => {
        const da = new Date(`${a.date}T${a.time || '00:00'}`)
        const db = new Date(`${b.date}T${b.time || '00:00'}`)
        return da - db
      })[0] || null
  }, [games])

  // Get last completed game for a team
  const getLastGame = useCallback((teamName, division, tier) => {
    const now = new Date()
    const lower = teamName.toLowerCase()
    return games
      .filter(
        (g) =>
          (g.homeTeam.name.toLowerCase() === lower || g.awayTeam.name.toLowerCase() === lower) &&
          g.status === 'final'
      )
      .filter((g) => {
        if (division && g.division && g.division !== division) return false
        if (tier && g.tier && g.tier !== tier) return false
        return true
      })
      .filter((g) => {
        const gameDate = new Date(`${g.date}T${g.time || '23:59'}`)
        return gameDate <= now
      })
      .sort((a, b) => {
        const da = new Date(`${a.date}T${a.time || '00:00'}`)
        const db = new Date(`${b.date}T${b.time || '00:00'}`)
        return db - da
      })[0] || null
  }, [games])

  // Get standings entry for a team (includes computed rank)
  const getTeamStanding = useCallback((teamName, division, tier) => {
    if (!teamName) return null
    const lower = teamName.toLowerCase()
    let pool = standingsList
    if (division) pool = pool.filter((s) => s.division === division)
    if (tier) pool = pool.filter((s) => s.tier === tier)
    // Sort standings by points desc, wins desc to determine rank
    const sorted = [...pool].sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts
      if (b.w !== a.w) return b.w - a.w
      return (b.gf - b.ga) - (a.gf - a.ga)
    })
    const idx = sorted.findIndex((s) => s.name.toLowerCase() === lower)
    if (idx === -1) return null
    return { ...sorted[idx], rank: idx + 1 }
  }, [standingsList])

  // Unique values for filters
  const divisions = [...new Set(games.map((g) => g.division).filter(Boolean))].sort()
  const tiers = [...new Set(games.map((g) => g.tier).filter(Boolean))].sort()
  const arenas = [...new Set(games.map((g) => g.arena).filter(Boolean))].sort()
  const standingsGameTypes = [...new Set(standingsList.map((s) => s.gameType).filter(Boolean))].sort()

  // Build per-team metadata: which divisions/tiers each team plays in
  const teamMeta = {}
  for (const g of games) {
    for (const side of ['homeTeam', 'awayTeam']) {
      const name = g[side]?.name
      if (!name) continue
      const key = name.toUpperCase()
      if (!teamMeta[key]) teamMeta[key] = { name, divisions: new Set(), tiers: new Set() }
      if (g.division) teamMeta[key].divisions.add(g.division)
      if (g.tier) teamMeta[key].tiers.add(g.tier)
    }
  }
  // Also add standings teams
  for (const s of standingsList) {
    const key = s.name?.toUpperCase()
    if (!key) continue
    if (!teamMeta[key]) teamMeta[key] = { name: s.name, divisions: new Set(), tiers: new Set() }
    if (s.division) teamMeta[key].divisions.add(s.division)
    if (s.tier) teamMeta[key].tiers.add(s.tier)
  }

  const allTeams = Object.values(teamMeta).map((t) => ({
    name: t.name,
    divisions: [...t.divisions],
    tiers: [...t.tiers],
  })).sort((a, b) => a.name.localeCompare(b.name))

  const value = {
    schedule,
    standings,
    games,
    standingsList,
    metadata,
    season,
    loading,
    error,
    lastUpdated: schedule?.scrapedAt || schedule?.lastUpdated || null,
    divisions,
    tiers,
    arenas,
    standingsGameTypes,
    allTeams,
    getGamesForTeam,
    getStandingsForCompetition,
    getNextGame,
    getLastGame,
    getTeamStanding,
    reload: loadData,
  }

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataProvider')
  return ctx
}
