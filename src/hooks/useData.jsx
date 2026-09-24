import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { usePreferences } from './usePreferences.jsx'

const DataContext = createContext(null)

const BASE = import.meta.env.BASE_URL

export function DataProvider({ children }) {
  // The season the user picked in preferences decides which snapshot we load.
  // Completed seasons are served from their own file and never re-scraped.
  const { season: selectedSeason, filters } = usePreferences()

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

      // Remember the season the file really is for. When the selected season
      // has no snapshot yet this is what lets the UI point at one that does.
      const sourceSeason = schedData.season || standData.season || null

      setSchedule(
        mismatch
          ? { ...schedData, season: selectedSeason, sourceSeason, games: [] }
          : { ...schedData, sourceSeason }
      )
      setStandings(
        mismatch
          ? { ...standData, season: selectedSeason, sourceSeason, standings: [] }
          : { ...standData, sourceSeason }
      )
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

  // Unique values for filters. Derived from both sources: a scrape can land
  // standings without a schedule (and vice versa), and the standings-only
  // divisions would otherwise be impossible to filter on.
  const divisions = [...new Set(
    [...games.map((g) => g.division), ...standingsList.map((s) => s.division)].filter(Boolean)
  )].sort()
  const tiers = [...new Set(
    [...games.map((g) => g.tier), ...standingsList.map((s) => s.tier)].filter(Boolean)
  )].sort()
  const standingsGameTypes = [...new Set(standingsList.map((s) => s.gameType).filter(Boolean))].sort()

  // Tiers that exist inside one division. Filter rows must mirror the team
  // finder's cascade, otherwise you can pick a tier that division never plays
  // and get an empty table that looks like missing data.
  const tiersFor = (division) => {
    if (!division || division === 'ALL') return tiers
    return [...new Set(
      [...games, ...standingsList]
        .filter((row) => row.division === division)
        .map((row) => row.tier)
        .filter(Boolean)
    )].sort()
  }

  // Standings publish one row per game type, so every team appears more than
  // once in the raw list. Ranking across all of them counts a team twice and
  // invents places that don't exist ("8th" in a 6-team division). A type is
  // always required — fall back to the first one this season has rather than
  // offering an "All types" that would mix tables. Living here rather than in
  // the Standings page so the rank on a Home card always matches the table.
  const effectiveGameType =
    filters.gameType && filters.gameType !== 'ALL' && standingsGameTypes.includes(filters.gameType)
      ? filters.gameType
      : standingsGameTypes[0] || null

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
    // One game type only: the table the Standings page shows is built the
    // same way, so the place shown here and the place there agree.
    if (effectiveGameType) pool = pool.filter((s) => s.gameType === effectiveGameType)
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
  }, [standingsList, effectiveGameType])

  // Build per-team metadata: which divisions/tiers each team plays in, plus
  // its logo code so a team can be shown before any standings row is found.
  const teamMeta = {}
  for (const g of games) {
    for (const side of ['homeTeam', 'awayTeam']) {
      const name = g[side]?.name
      if (!name) continue
      const key = name.toUpperCase()
      if (!teamMeta[key]) teamMeta[key] = { name, divisions: new Set(), tiers: new Set(), logo: null }
      if (g.division) teamMeta[key].divisions.add(g.division)
      if (g.tier) teamMeta[key].tiers.add(g.tier)
      if (g[side].logo && !teamMeta[key].logo) teamMeta[key].logo = g[side].logo
    }
  }
  // Also add standings teams
  for (const s of standingsList) {
    const key = s.name?.toUpperCase()
    if (!key) continue
    if (!teamMeta[key]) teamMeta[key] = { name: s.name, divisions: new Set(), tiers: new Set(), logo: null }
    if (s.division) teamMeta[key].divisions.add(s.division)
    if (s.tier) teamMeta[key].tiers.add(s.tier)
    if (s.logo && !teamMeta[key].logo) teamMeta[key].logo = s.logo
  }

  const allTeams = Object.values(teamMeta).map((t) => ({
    name: t.name,
    divisions: [...t.divisions],
    tiers: [...t.tiers],
    logo: t.logo,
  })).sort((a, b) => a.name.localeCompare(b.name))

  const value = {
    schedule,
    standings,
    games,
    standingsList,
    metadata,
    season,
    // Season the loaded snapshot actually belongs to (differs from `season`
    // when the selected one has no data yet).
    sourceSeason: schedule?.sourceSeason || standings?.sourceSeason || null,
    loading,
    error,
    lastUpdated: schedule?.scrapedAt || schedule?.lastUpdated || null,
    divisions,
    tiers,
    standingsGameTypes,
    effectiveGameType,
    tiersFor,
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
