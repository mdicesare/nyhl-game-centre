import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { usePreferences } from '../hooks/usePreferences.jsx'
import { useData } from '../hooks/useData.jsx'

export default function Schedule() {
  const { filters, setFilters, clearFilters, activeTeam, scheduleFilter, setScheduleFilter } =
    usePreferences()
  const { games, divisions, tiers, arenas, allTeams, season, lastUpdated } = useData()
  const [showFilters, setShowFilters] = useState(false)
  const [selectedGame, setSelectedGame] = useState(null)

  // Apply filters
  const filteredGames = useMemo(() => {
    let result = games

    // Active team context
    if (activeTeam) {
      const lower = activeTeam.toLowerCase()
      result = result.filter(
        (g) => g.homeTeam.name.toLowerCase() === lower || g.awayTeam.name.toLowerCase() === lower
      )
    }

    // Filter dropdowns
    if (filters.division !== 'ALL') {
      result = result.filter((g) => g.division === filters.division)
    }
    if (filters.tier !== 'ALL') {
      result = result.filter((g) => g.tier === filters.tier)
    }
    if (filters.arena !== 'ALL') {
      result = result.filter((g) => g.arena === filters.arena)
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
  }, [games, filters, activeTeam, scheduleFilter])

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

  const activeFilterCount = Object.values(filters).filter((v) => v && v !== 'ALL').length

  return (
    <div className="px-4 py-6 max-w-lg mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold dark:text-white">Schedule</h1>
          {activeTeam && (
            <p className="text-sm text-nyhl-blue dark:text-blue-400">{activeTeam}</p>
          )}
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 text-sm bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 hover:border-nyhl-blue dark:hover:border-blue-500 transition-colors"
        >
          <span className="dark:text-slate-200">Filters</span>
          {activeFilterCount > 0 && (
            <span className="bg-nyhl-blue text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 mb-4 space-y-3 animate-scale-in">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Division</label>
            <select
              value={filters.division}
              onChange={(e) => setFilters({ division: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 dark:text-white"
            >
              <option value="ALL">All divisions</option>
              {divisions.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Tier</label>
            <select
              value={filters.tier}
              onChange={(e) => setFilters({ tier: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 dark:text-white"
            >
              <option value="ALL">All tiers</option>
              {tiers.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Arena</label>
            <select
              value={filters.arena}
              onChange={(e) => setFilters({ arena: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 dark:text-white"
            >
              <option value="ALL">All arenas</option>
              {arenas.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          {activeFilterCount > 0 && (
            <button
              onClick={clearFilters}
              className="text-sm text-red-600 hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

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
          <p className="text-gray-400 dark:text-slate-500 text-lg mb-2">No games found</p>
          <p className="text-gray-400 dark:text-slate-500 text-sm mb-4">
            Try changing your filters or date range.
          </p>
          {activeFilterCount > 0 && (
            <button
              onClick={clearFilters}
              className="text-sm text-nyhl-blue hover:underline"
            >
              Clear filters
            </button>
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
                  activeTeam={activeTeam}
                  onClick={() => setSelectedGame(game)}
                />
              ))}
            </div>
          </div>
        ))
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

function GameDetail({ game, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 rounded-t-2xl w-full max-w-lg p-6 pb-8 animate-slide-up shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-12 h-1 bg-gray-300 dark:bg-slate-600 rounded-full mx-auto mb-4" />

        <p className="text-xs text-gray-400 dark:text-slate-500 mb-4">
          {formatGameDate(game.date)} · {formatTime(game.time)}
        </p>

        <div className="flex items-center justify-between mb-6">
          <div className="flex-1 flex items-center gap-3">
            {game.homeTeam.logo && (
              <img
                src={`${import.meta.env.BASE_URL}images/teams/${game.homeTeam.logo}.png`}
                alt=""
                className="w-14 h-14 object-contain logo-glow"
                onError={(e) => { e.target.style.display = 'none' }}
              />
            )}
            <div>
              <p className="text-lg font-bold dark:text-white">{game.homeTeam.name}</p>
              <p className="text-sm text-gray-500 dark:text-slate-400">Home</p>
            </div>
          </div>

          {game.score ? (
            <div className="text-center px-6">
              <p className="text-4xl font-bold dark:text-white">
                {game.score.home} – {game.score.away}
              </p>
              <p className="text-xs text-gray-400 dark:text-slate-500 uppercase mt-1">
                {game.status === 'final' ? 'Final' : game.status}
              </p>
            </div>
          ) : (
            <div className="text-center px-6">
              <p className="text-2xl font-bold text-gray-300 dark:text-slate-600">vs</p>
            </div>
          )}

          <div className="flex-1 flex items-center justify-end gap-3">
            <div className="text-right">
              <p className="text-lg font-bold dark:text-white">{game.awayTeam.name}</p>
              <p className="text-sm text-gray-500 dark:text-slate-400">Away</p>
            </div>
            {game.awayTeam.logo && (
              <img
                src={`${import.meta.env.BASE_URL}images/teams/${game.awayTeam.logo}.png`}
                alt=""
                className="w-14 h-14 object-contain logo-glow"
                onError={(e) => { e.target.style.display = 'none' }}
              />
            )}
          </div>
        </div>

        <div className="space-y-2 text-sm border-t border-gray-100 dark:border-slate-700 pt-4">
          {game.arena && (
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-slate-400">Arena</span>
              <span className="font-medium dark:text-slate-200">{game.arena}</span>
            </div>
          )}
          {game.division && (
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-slate-400">Division</span>
              <span className="font-medium dark:text-slate-200">{game.division}</span>
            </div>
          )}
          {game.tier && (
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-slate-400">Tier</span>
              <span className="font-medium dark:text-slate-200">{game.tier}</span>
            </div>
          )}
          {game.gameType && (
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-slate-400">Type</span>
              <span className="font-medium dark:text-slate-200">{formatGameType(game.gameType)}</span>
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          className="w-full mt-6 bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-200 py-3 rounded-xl font-medium hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  )
}

// ---- Helpers ----

const GAME_TYPE_LABELS = {
  'FS': 'Fall Season',
  'WS': 'Winter Season',
  'PO': 'Playoff Round Robin',
  'PB': 'Playoff Elimination',
}

function formatGameType(type) {
  return GAME_TYPE_LABELS[type] || type
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
