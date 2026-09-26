import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { usePreferences } from '../hooks/usePreferences.jsx'
import { useData } from '../hooks/useData.jsx'
import GameDetail from '../components/GameDetail.jsx'
import TeamChips from '../components/TeamChips.jsx'

export default function Schedule() {
  const {
    filters,
    setFilters,
    clearFilters,
    activeTeam,
    savedTeams,
    scheduleFilter,
    setScheduleFilter,
    season,
    setSeason,
  } = usePreferences()
  const { games, divisions, tiersFor, lastUpdated } = useData()
  const [selectedGame, setSelectedGame] = useState(null)

  // A standings row (or a Home card) links here as /schedule?team=…&division=
  // …&tier=…&season=… so the schedule opens on the team that was just clicked
  // rather than on whoever the visitor happens to follow. The team rides as a
  // removable chip while its competition pre-fills the selects below — the
  // list stays that one team's games until the chip is cleared, then browses
  // exactly the division and tier the link showed.
  const [searchParams, setSearchParams] = useSearchParams()
  const focusTeam = searchParams.get('team')

  // The link that pinned this team carries its whole competition as well, so
  // the selects open pre-filled (U15 / Tier 1) instead of on "Choose a
  // division…" while the page claims to show that team's games. Consume those
  // parameters once — the team pin stays until its chip is cleared, and filter
  // picks the visitor makes later must stick.
  useEffect(() => {
    const linkedSeason = searchParams.get('season')
    const linkedDivision = searchParams.get('division')
    const linkedTier = searchParams.get('tier')
    if (!linkedSeason && !linkedDivision && !linkedTier) return
    if (linkedSeason && linkedSeason !== season) setSeason(linkedSeason)
    const patch = {}
    if (linkedDivision) patch.division = linkedDivision
    if (linkedTier) patch.tier = linkedTier
    if (Object.keys(patch).length) setFilters(patch)
    const next = new URLSearchParams(searchParams)
    next.delete('season')
    next.delete('division')
    next.delete('tier')
    setSearchParams(next, { replace: true })
  }, [searchParams])

  // The active team's name filter only rides along when the filters on screen
  // really are that team's competition — season, division and tier together.
  // When they diverge the filters win and the page browses normally: a parent
  // who moved on to another division gets that division's games instead of an
  // empty list the active team's name could never match. Teams stored without
  // division/tier only check the season, as before. A pinned team always
  // wins — its season link has just been applied above.
  const followedTeam = savedTeams.find((t) => t.name === activeTeam)
  const followsTeamFilters =
    !activeTeam ||
    !followedTeam ||
    ((!followedTeam.season || followedTeam.season === season) &&
      (!followedTeam.division || filters.division === followedTeam.division) &&
      (!followedTeam.tier || filters.tier === followedTeam.tier))
  const displayTeam = focusTeam || (followsTeamFilters ? activeTeam : null)

  // One competition at a time, same rule as Standings: a visitor who has only
  // picked a season would otherwise get every division and tier's games in a
  // single list. Picking a single team is the other way in.
  const hasData = games.length > 0
  const needsDivision = divisions.length > 0 && filters.division === 'ALL'
  const tierOptions = needsDivision ? [] : tiersFor(filters.division)
  const needsTier = tierOptions.length > 0 && filters.tier === 'ALL'
  const awaitingFilters = hasData && !focusTeam && (needsDivision || needsTier)

  // Apply filters
  const filteredGames = useMemo(() => {
    let result = games

    // Team context: the pinned team wins over the followed one, since the
    // visitor explicitly asked to see that team's games.
    const teamFilter = displayTeam
    if (teamFilter) {
      const lower = teamFilter.toLowerCase()
      result = result.filter(
        (g) => g.homeTeam.name.toLowerCase() === lower || g.awayTeam.name.toLowerCase() === lower
      )
    }

    // Filter dropdowns — hidden while a team is pinned, so don't apply them.
    if (!focusTeam) {
      if (filters.division !== 'ALL') {
        result = result.filter((g) => g.division === filters.division)
      }
      if (filters.tier !== 'ALL') {
        result = result.filter((g) => g.tier === filters.tier)
      }
    }

    // Schedule filter: upcoming / completed
    const now = new Date()
    if (scheduleFilter === 'upcoming') {
      result = result.filter((g) => {
        if (g.status === 'final' || g.status === 'cancelled') return false
        const d = new Date(`${g.date}T${g.time || '23:59'}`)
        return d >= now
      })
    } else if (scheduleFilter === 'completed') {
      result = result.filter((g) => g.status === 'final')
    }

    return result.sort((a, b) => {
      const da = new Date(`${a.date}T${a.time || '00:00'}`)
      const db = new Date(`${b.date}T${b.time || '00:00'}`)
      return da - db
    })
  }, [games, filters, displayTeam, focusTeam, scheduleFilter])

  // Group by month
  const groupedGames = useMemo(() => {
    const groups = {}
    for (const game of filteredGames) {
      const key = game.date
        ? new Date(game.date + 'T12:00:00').toLocaleDateString('en-US', {
            month: 'long',
            year: 'numeric',
          })
        : 'Other'
      if (!groups[key]) groups[key] = []
      groups[key].push(game)
    }
    return groups
  }, [filteredGames])

  // Schedule only applies division/tier. gameType and club share the
  // filter object but are never read here, so they must not show as active.
  // While a team is pinned those two selects are hidden, so they don't count.
  const hasActiveFilters =
    !focusTeam && (filters.division !== 'ALL' || filters.tier !== 'ALL')
  const isNarrowed = hasActiveFilters || scheduleFilter !== 'all'

  // Back to the normal division/tier view.
  const clearFocus = () => setSearchParams({}, { replace: true })

  return (
    <div className="px-4 py-6 max-w-lg mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <h1 className="text-2xl font-bold dark:text-white">Schedule</h1>
        <span className="bg-nyhl-blue text-white text-sm font-semibold px-3 py-1 rounded-full">
          20{season.split('-')[0]}–{season.split('-')[1]}
        </span>
        {displayTeam && (
          <span className="w-full text-sm text-nyhl-blue dark:text-blue-400">
            {displayTeam}
          </span>
        )}
      </div>

      {/* One tap back to a saved team: snaps season, division and tier to it */}
      <TeamChips onPick={() => { if (focusTeam) clearFocus() }} />

      {/* Filter bar */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <select
          value={season}
          onChange={(e) => setSeason(e.target.value)}
          className={SELECT_CLS}
        >
          <option value="26-27">2026–27</option>
          <option value="25-26">2025–26</option>
          <option value="24-25">2024–25</option>
        </select>

        {/* While a team is pinned these stay visible and pre-filled from its
            link; touching one drops the pin and browses the picked
            competition instead. */}
        <select
          value={filters.division}
          onChange={(e) => {
            if (focusTeam) clearFocus()
            setFilters({ division: e.target.value, tier: 'ALL' })
          }}
          className={SELECT_CLS}
        >
          <option value="ALL">Choose a division…</option>
          {filters.division !== 'ALL' && !divisions.includes(filters.division) && (
            <option value={filters.division}>{filters.division}</option>
          )}
          {divisions.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>

        {!needsDivision && tierOptions.length > 0 && (
          <select
            value={filters.tier}
            onChange={(e) => {
              if (focusTeam) clearFocus()
              setFilters({ tier: e.target.value })
            }}
            className={SELECT_CLS}
          >
            <option value="ALL">Choose a tier…</option>
            {filters.tier !== 'ALL' && !tierOptions.includes(filters.tier) && (
              <option value={filters.tier}>{filters.tier}</option>
            )}
            {tierOptions.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="text-sm text-red-600 hover:underline whitespace-nowrap"
          >
            Clear
          </button>
        )}
      </div>

      {/* Nothing to show until a competition is picked */}
      {awaitingFilters ? (
        <div className="text-center py-12 rounded-xl bg-gray-50 dark:bg-slate-800/50 border border-gray-100 dark:border-slate-700">
          <p className="text-4xl mb-4">📅</p>
          <p className="text-gray-600 dark:text-slate-300 text-lg mb-2">
            Choose a {needsDivision ? 'division' : 'tier'} to see games
          </p>
          <p className="text-gray-400 dark:text-slate-500 text-sm max-w-sm mx-auto">
            The schedule is shown one division and tier at a time, so you're only
            ever looking at games that are actually on.
          </p>
        </div>
      ) : (
      <div>
      {/* Active filter summary — the pinned team and the pre-filled
          competition read together while a link's team is on screen */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {focusTeam && (
          <span className="inline-flex items-center gap-2 bg-nyhl-blue text-white text-xs font-medium px-2.5 py-1 rounded-full">
            Showing {focusTeam}'s games
            <button
              onClick={clearFocus}
              aria-label="Back to all games"
              className="hover:text-blue-200 transition-colors"
            >
              ✕
            </button>
          </span>
        )}
        {filters.division !== 'ALL' && (
          <span className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs font-medium px-2.5 py-1 rounded-full">
            {filters.division}
          </span>
        )}
        {filters.tier !== 'ALL' && (
          <span className="bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 text-xs font-medium px-2.5 py-1 rounded-full">
            {filters.tier}
          </span>
        )}
      </div>

      {/* Upcoming / Completed tabs */}
      <div className="flex bg-gray-100 dark:bg-slate-800 rounded-lg p-1 mb-4">
        {[
          { key: 'all', label: 'All' },
          { key: 'upcoming', label: 'Upcoming' },
          { key: 'completed', label: 'Completed' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setScheduleFilter(key)}
            className={`flex-1 text-sm py-2 rounded-md transition-all ${
              scheduleFilter === key
                ? 'bg-white dark:bg-slate-700 shadow-sm font-semibold text-nyhl-blue dark:text-blue-400'
                : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Game list */}
      {filteredGames.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-4xl mb-4">🏒</p>
          {focusTeam && hasData ? (
            <>
              <p className="text-gray-600 dark:text-slate-300 text-lg mb-2">
                No games for {focusTeam} in {formatSeasonLabel(season)}
              </p>
              <p className="text-gray-400 dark:text-slate-500 text-sm mb-4">
                This team may not be scheduled yet in this season.
              </p>
              <button
                onClick={clearFocus}
                className="text-sm text-nyhl-blue hover:underline"
              >
                Back to all games
              </button>
            </>
          ) : hasData ? (
            <>
              <p className="text-gray-600 dark:text-slate-300 text-lg mb-2">
                No games match these filters
              </p>
              <p className="text-gray-400 dark:text-slate-500 text-sm mb-4">
                Try a different division, tier or view.
              </p>
              {isNarrowed && (
                <button
                  onClick={() => {
                    clearFilters()
                    setScheduleFilter('all')
                  }}
                  className="text-sm text-nyhl-blue hover:underline"
                >
                  Clear filters
                </button>
              )}
            </>
          ) : (
            <>
              <p className="text-gray-600 dark:text-slate-300 text-lg mb-2">
                No schedule data yet for {formatSeasonLabel(season)}
              </p>
              <p className="text-gray-400 dark:text-slate-500 text-sm">
                The season may not have started yet. Check back soon!
              </p>
            </>
          )}
        </div>
      ) : (
        Object.entries(groupedGames).map(([month, monthGames]) => (
          <div key={month} className="mb-6">
            <h2 className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-2">
              {month}
            </h2>
            <div className="space-y-2">
              {monthGames.map((game) => (
                <GameCard
                  key={game.id}
                  game={game}
                  activeTeam={displayTeam}
                  onClick={() => setSelectedGame(game)}
                />
              ))}
            </div>
          </div>
        ))
      )}
      </div>
      )}

      {lastUpdated && (
        <p className="text-xs text-gray-400 dark:text-slate-500 text-center mt-8">
          Updated {formatTimestamp(lastUpdated)}
        </p>
      )}

      {/* Game detail modal */}
      {selectedGame && (
        <GameDetail game={selectedGame} onClose={() => setSelectedGame(null)} />
      )}
    </div>
  )
}

function GameCard({ game, activeTeam, onClick }) {
  const lower = activeTeam?.toLowerCase() || ''
  const isHome = game.homeTeam.name.toLowerCase() === lower
  const isAway = game.awayTeam.name.toLowerCase() === lower
  const isMyTeam = isHome || isAway

  // Determine if my team won/lost/tied
  const hasScore = game.score && game.score.home !== undefined && game.score.away !== undefined
  const isTie = hasScore && game.score.home === game.score.away
  const isWin = hasScore && !isTie && (
    (isHome && game.score.home > game.score.away) ||
    (isAway && game.score.away > game.score.home)
  )
  const isLoss = hasScore && isMyTeam && !isWin && !isTie

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border p-3 transition-all card-hover ${
        isMyTeam
          ? 'bg-gradient-to-r from-nyhl-blue/5 to-nyhl-blue/10 border-nyhl-blue/30 dark:from-nyhl-blue/10 dark:to-nyhl-blue/20 dark:border-blue-500/30'
          : 'bg-white dark:bg-slate-800 border-gray-100 dark:border-slate-700 hover:border-gray-200 dark:hover:border-slate-600'
      }`}
    >
      {/* Date / Time */}
      <p className="text-xs text-gray-400 dark:text-slate-500 mb-2">
        {formatGameDate(game.date)} · {formatTime(game.time)}
      </p>

      {/* Teams + Score */}
      <div className="flex items-center justify-between">
        <div className="flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            {game.homeTeam.logo && (
              <img
                src={`${import.meta.env.BASE_URL}images/teams/${game.homeTeam.logo}.png`}
                alt=""
                className="w-6 h-6 object-contain"
                onError={(e) => { e.target.style.display = 'none' }}
              />
            )}
            <p className={`text-sm font-medium ${
              isHome ? 'text-nyhl-blue dark:text-blue-400' : 'dark:text-slate-200'
            } ${hasScore && game.score.home > game.score.away ? 'font-bold' : ''}`}>
              {game.homeTeam.name}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {game.awayTeam.logo && (
              <img
                src={`${import.meta.env.BASE_URL}images/teams/${game.awayTeam.logo}.png`}
                alt=""
                className="w-6 h-6 object-contain"
                onError={(e) => { e.target.style.display = 'none' }}
              />
            )}
            <p className={`text-sm font-medium ${
              isAway ? 'text-nyhl-blue dark:text-blue-400' : 'dark:text-slate-200'
            } ${hasScore && game.score.away > game.score.home ? 'font-bold' : ''}`}>
              {game.awayTeam.name}
            </p>
          </div>
        </div>

        {hasScore ? (
          <div className="text-right">
            <p className={`text-xl font-bold ${
              isWin ? 'text-green-600 dark:text-green-400' :
              isLoss ? 'text-red-600 dark:text-red-400' :
              'dark:text-white'
            }`}>{game.score.home}</p>
            <p className={`text-xl font-bold ${
              isWin ? 'text-green-600 dark:text-green-400' :
              isLoss ? 'text-red-600 dark:text-red-400' :
              'dark:text-white'
            }`}>{game.score.away}</p>
            <p className="text-xs text-gray-400 dark:text-slate-500 uppercase mt-0.5">
              {game.status === 'final' ? 'Final' : game.status}
            </p>
          </div>
        ) : (
          <div className="text-right">
            <p className="text-sm font-medium text-gray-400 dark:text-slate-500">
              {formatTime(game.time)}
            </p>
            <p className="text-xs text-gray-400 dark:text-slate-500 uppercase mt-1">{game.status}</p>
          </div>
        )}
      </div>

      {/* Arena */}
      {game.arena && (
        <p className="text-xs text-gray-400 dark:text-slate-500 mt-2">📍 {game.arena}</p>
      )}
    </button>
  )
}

// ---- Helpers ----

// Same styling as the Standings filter row so the two pages read as one UI.
const SELECT_CLS =
  'px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 dark:text-white'

function formatSeasonLabel(s) {
  // "25-26" → "2025–26"
  const [y1, y2] = s.split('-')
  return `20${y1}–${y2}`
}

function formatTimestamp(iso) {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function formatGameDate(dateStr) {
  try {
    const d = new Date(dateStr + 'T12:00:00')
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return dateStr
  }
}

function formatTime(timeStr) {
  if (!timeStr) return ''
  try {
    const [h, m] = timeStr.split(':')
    const d = new Date()
    d.setHours(parseInt(h), parseInt(m))
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  } catch {
    return timeStr
  }
}
