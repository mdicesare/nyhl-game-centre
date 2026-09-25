import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { usePreferences } from './usePreferences.jsx'

const DataContext = createContext(null)

const BASE = import.meta.env.BASE_URL

export function DataProvider({ children }) {
  // The season the user picked in preferences decides which snapshot we load.
  // Completed seasons are served from their own file and never re-scraped.
  const { season: selectedSeason, filters, savedTeams } = usePreferences()

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

  // Saved teams are followed across seasons while the visitor browses a
  // different one, so the seasons they play in load alongside the viewed
  // one. Home reads its cards from here: a team's next game and record live
  // in the team's own season file, never in whatever is currently on screen.
  const [teamSnapshots, setTeamSnapshots] = useState({})
  const snapshotFlight = useRef(new Set())
  const teamSeasonKeys = [...new Set(
    (savedTeams || []).map((t) => t?.season).filter((s) => s && s !== selectedSeason)
  )]

  useEffect(() => {
    for (const seasonKey of teamSeasonKeys) {
      if (teamSnapshots[seasonKey] || snapshotFlight.current.has(seasonKey)) continue
      snapshotFlight.current.add(seasonKey)
      const grab = async (kind) => {
        try {
          const res = await fetch(`${BASE}data/${kind}-${seasonKey}.json`)
          return res.ok ? await res.json() : null
        } catch {
          return null
        }
      }
      // A season without a snapshot settles as an empty one instead of
      // retrying on every render — "no data" is the honest answer there.
      Promise.all([grab('schedule'), grab('standings')])
        .then(([sched, stand]) => {
          setTeamSnapshots((prev) => ({ ...prev, [seasonKey]: { schedule: sched, standings: stand } }))
        })
        .finally(() => snapshotFlight.current.delete(seasonKey))
    }
    // The key array is rebuilt each render; its joined form is what actually
    // changed if a saved team or the viewed season did.
  }, [teamSeasonKeys.join('|'), teamSnapshots, selectedSeason])

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

  // The snapshot a saved team's cards are read from: its own season, even
  // while a different one is being browsed. Teams stored without a season
  // (saved before that field existed) fall back to the viewed one.
  const snapshotFor = (seasonKey) => {
    if (!seasonKey || seasonKey === selectedSeason) {
      return { schedule, standings }
    }
    return teamSnapshots[seasonKey] || null
  }

  // False only while that season's file is still in flight, so Home can say
  // "Loading…" instead of "No upcoming games" during the fetch.
  const seasonReady = useCallback((seasonKey) => {
    if (!seasonKey || seasonKey === selectedSeason) return !loading
    return Boolean(teamSnapshots[seasonKey])
  }, [loading, selectedSeason, teamSnapshots])

  // Get next game for a team, from the team's own season snapshot.
  const getNextGame = useCallback((team) => {
    if (!team?.name) return null
    const snap = snapshotFor(team.season)
    const list = snap?.schedule?.games || []
    const now = new Date()
    const lower = team.name.toLowerCase()
    return list
      .filter(
        (g) =>
          (g.homeTeam.name.toLowerCase() === lower || g.awayTeam.name.toLowerCase() === lower) &&
          g.status === 'scheduled'
      )
      .filter((g) => {
        if (team.division && g.division && g.division !== team.division) return false
        if (team.tier && g.tier && g.tier !== team.tier) return false
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
  }, [schedule, standings, teamSnapshots, selectedSeason])

  // Get last completed game for a team, from the team's own season snapshot.
  const getLastGame = useCallback((team) => {
    if (!team?.name) return null
    const snap = snapshotFor(team.season)
    const list = snap?.schedule?.games || []
    const now = new Date()
    const lower = team.name.toLowerCase()
    return list
      .filter(
        (g) =>
          (g.homeTeam.name.toLowerCase() === lower || g.awayTeam.name.toLowerCase() === lower) &&
          g.status === 'final'
      )
      .filter((g) => {
        if (team.division && g.division && g.division !== team.division) return false
        if (team.tier && g.tier && g.tier !== team.tier) return false
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
  }, [schedule, standings, teamSnapshots, selectedSeason])

  // Standings entry for a team (with its computed place), read from the
  // team's own season. The ranked table is every row sharing the team's
  // division/tier/game type — the same slice the Standings page shows — so
  // the place on the card and the place in that table agree.
  const getTeamStanding = useCallback((team) => {
    if (!team?.name) return null
    const snap = snapshotFor(team.season)
    const rows = snap?.standings?.standings || []
    const lower = team.name.toLowerCase()
    let pool = rows.filter(
      (s) =>
        (s.name || '').toLowerCase() === lower &&
        (!team.division || s.division === team.division) &&
        (!team.tier || s.tier === team.tier)
    )
    if (!pool.length) return null
    // One game type only. Prefer the visitor's current choice when this team
    // actually has a table in it, otherwise the team's own first type — a
    // remembered filter must never make the record vanish.
    const types = [...new Set(pool.map((s) => s.gameType).filter(Boolean))].sort()
    const gameType = types.includes(filters.gameType) ? filters.gameType : types[0] || null
    if (gameType) pool = pool.filter((s) => s.gameType === gameType)
    if (!pool.length) return null
    // The whole table, not just this team's row — a rank needs the company.
    const table = rows.filter((s) => {
      if (team.division && s.division !== team.division) return false
      if (team.tier && s.tier !== team.tier) return false
      if (gameType && s.gameType !== gameType) return false
      return true
    })
    // Points, then wins, then goal difference, with the site's own row order
    // breaking ties — the Standings page lists rows in that same order, so
    // card and table never disagree.
    const sorted = [...table].sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts
      if (b.w !== a.w) return b.w - a.w
      return (b.gf - b.ga) - (a.gf - a.ga)
    })
    const idx = sorted.findIndex((s) => s.name.toLowerCase() === lower)
    if (idx === -1) return null
    // Until someone in the table has played, a place is just the order the
    // rows came in — flag it so Home can show "—" instead of a meaningless
    // "2nd" off an all-zero table.
    const ranked = sorted.some((s) => Number(s.gp) > 0)
    return { ...sorted[idx], rank: idx + 1, ranked }
  }, [standings, teamSnapshots, selectedSeason, filters.gameType])

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
    seasonReady,
    reload: loadData,
  }

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataProvider')
  return ctx
}
