import { Link } from 'react-router-dom'
import { usePreferences } from '../hooks/usePreferences.jsx'
import { useData } from '../hooks/useData.jsx'

export default function Home() {
  const { savedTeams, activeTeam, setActiveTeam, hasTeams } = usePreferences()
  const { getNextGame, getLastGame, getTeamStanding, season, lastUpdated, loading } = useData()

  if (!hasTeams) {
    return <NoTeams />
  }

  const displayTeams = savedTeams.slice(0, 3)
  const extraCount = savedTeams.length - 3

  return (
    <div className="px-4 py-6 max-w-lg mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold dark:text-white">My Teams</h1>
        </div>
      </div>

      <div className="space-y-4">
        {displayTeams.map((team, index) => (
          <TeamCard
            key={team.name}
            team={team}
            isActive={activeTeam?.toLowerCase() === team.name.toLowerCase()}
            nextGame={getNextGame(team.name)}
            lastGame={getLastGame(team.name)}
            standing={getTeamStanding(team.name)}
            onSelect={() => setActiveTeam(team.name)}
            index={index}
            globalSeason={season}
          />
        ))}
      </div>

      {extraCount > 0 && (
        <Link
          to="/settings"
          className="block text-center text-sm text-nyhl-blue mt-4 hover:underline"
        >
          + {extraCount} more {extraCount === 1 ? 'team' : 'teams'}
        </Link>
      )}

      {/* Quick access links */}
      <div className="mt-8 grid grid-cols-2 gap-3">
        <Link
          to="/schedule"
          className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4 text-center card-hover"
        >
          <span className="text-2xl">📅</span>
          <p className="text-sm font-medium mt-1 dark:text-slate-200">All Games</p>
        </Link>
        <Link
          to="/standings"
          className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4 text-center card-hover"
        >
          <span className="text-2xl">📊</span>
          <p className="text-sm font-medium mt-1 dark:text-slate-200">Standings</p>
        </Link>
      </div>

      {lastUpdated && (
        <p className="text-xs text-gray-400 dark:text-slate-500 text-center mt-8">
          Updated {formatTimestamp(lastUpdated)}
        </p>
      )}
    </div>
  )
}

function TeamCard({ team, isActive, nextGame, lastGame, standing, onSelect, index = 0, globalSeason }) {
  const isWin = lastGame && lastGame.score && (
    (lastGame.homeTeam.name.toLowerCase() === team.name.toLowerCase() && lastGame.score.home > lastGame.score.away) ||
    (lastGame.awayTeam.name.toLowerCase() === team.name.toLowerCase() && lastGame.score.away > lastGame.score.home)
  )
  const isLoss = lastGame && lastGame.score && !isWin && (
    lastGame.score.home !== lastGame.score.away
  )

  return (
    <Link
      to="/schedule"
      onClick={onSelect}
      className={`relative block rounded-2xl border-2 p-4 transition-all card-hover animate-slide-up overflow-hidden ${
        isActive
          ? 'bg-gradient-to-r from-nyhl-blue/5 to-nyhl-blue/10 border-nyhl-blue shadow-lg dark:from-nyhl-blue/10 dark:to-nyhl-blue/20 dark:border-blue-400'
          : 'bg-white dark:bg-slate-800 border-gray-100 dark:border-slate-700 hover:border-gray-200 dark:hover:border-slate-600'
      }`}
      style={{ animationDelay: `${index * 100}ms` }}
    >
      {/* Logo watermark */}
      {standing?.logo && (
        <img
          src={`${import.meta.env.BASE_URL}images/teams/${standing.logo}.png`}
          alt=""
          className="absolute -right-4 -bottom-4 w-28 h-28 object-contain opacity-[0.06] dark:opacity-[0.08] pointer-events-none select-none"
          onError={(e) => { e.target.style.display = 'none' }}
        />
      )}

      {/* Team identity */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          {standing?.logo ? (
            <img
              src={`${import.meta.env.BASE_URL}images/teams/${standing.logo}.png`}
              alt=""
              className="w-14 h-14 object-contain logo-glow"
              onError={(e) => { e.target.style.display = 'none' }}
            />
          ) : (
            <div className="w-14 h-14 bg-gray-100 dark:bg-slate-700 rounded-full flex items-center justify-center">
              <span className="text-2xl">🏒</span>
            </div>
          )}
          <div>
            <h2 className="font-bold text-lg dark:text-white">{team.name}</h2>
            <p className="text-sm text-gray-500 dark:text-slate-400">
              {team.season ? `20${team.season.split('-')[0]}–${team.season.split('-')[1]}` : globalSeason}
              {team.division && ` · ${team.division}`}
            </p>
          </div>
        </div>
        {isActive && (
          <span className="text-xs bg-nyhl-blue text-white px-3 py-1 rounded-full font-medium shadow-sm">
            Active
          </span>
        )}
      </div>

      {/* Standing summary - more visual */}
      {standing && (
        <div className="flex items-center gap-4 mb-4 p-3 rounded-xl bg-gray-50 dark:bg-slate-700/50">
          <div className="text-center">
            <p className="text-2xl font-bold text-nyhl-blue dark:text-blue-400">{ordinal(standing.rank)}</p>
            <p className="text-xs text-gray-500 dark:text-slate-400">Place</p>
          </div>
          <div className="h-8 w-px bg-gray-200 dark:bg-slate-600" />
          <div className="text-center">
            <p className="text-2xl font-bold dark:text-white">{standing.pts}</p>
            <p className="text-xs text-gray-500 dark:text-slate-400">Points</p>
          </div>
          <div className="h-8 w-px bg-gray-200 dark:bg-slate-600" />
          <div className="text-center">
            <p className="text-lg font-bold dark:text-white">{standing.w}-{standing.l}-{standing.t}</p>
            <p className="text-xs text-gray-500 dark:text-slate-400">Record</p>
          </div>
        </div>
      )}

      {/* Next game */}
      <div className="mb-3">
        <p className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide mb-1">
          Next Game
        </p>
        {nextGame ? (
          <div className="text-sm">
            <p className="font-medium dark:text-slate-200">
              {formatGameDate(nextGame.date)} · {formatTime(nextGame.time)}
            </p>
            <p className="text-gray-600 dark:text-slate-300">
              {nextGame.homeTeam.name} vs {nextGame.awayTeam.name}
            </p>
            {nextGame.arena && (
              <p className="text-gray-400 dark:text-slate-500 text-xs mt-0.5">📍 {nextGame.arena}</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-400 dark:text-slate-500">No upcoming games</p>
        )}
      </div>

      {/* Last result */}
      {lastGame && (
        <div className={`text-sm border-t pt-3 ${
          isWin ? 'border-green-200 dark:border-green-800' :
          isLoss ? 'border-red-200 dark:border-red-800' :
          'border-gray-100 dark:border-slate-700'
        }`}>
          <div className="flex items-center gap-2">
            <p className="text-xs text-gray-400 dark:text-slate-500">Last result</p>
            {isWin && <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full font-medium">W</span>}
            {isLoss && <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-2 py-0.5 rounded-full font-medium">L</span>}
          </div>
          <div className="flex items-center justify-between mt-1">
            <p className="font-medium dark:text-slate-200">
              {lastGame.homeTeam.name} vs {lastGame.awayTeam.name}
            </p>
            {lastGame.score && (
              <p className={`font-bold text-lg ${
                isWin ? 'text-green-600 dark:text-green-400' :
                isLoss ? 'text-red-600 dark:text-red-400' :
                'dark:text-white'
              }`}>
                {lastGame.score.home}–{lastGame.score.away}
              </p>
            )}
          </div>
        </div>
      )}
    </Link>
  )
}

function NoTeams() {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12">
      <div className="text-center animate-fade-in">
        <div className="flex items-center justify-center gap-3 mb-4">
          <img src={`${import.meta.env.BASE_URL}images/NYHLLogo-h150.png`} alt="NYHL" className="h-14 w-auto" />
          <span className="text-5xl">🏒</span>
        </div>
        <h1 className="text-2xl font-bold mb-1 dark:text-white">Welcome to NYHL Game Center</h1>
        <p className="text-gray-500 dark:text-slate-400 mb-6">
          Browse the league or add a team to personalize your experience.
        </p>
        <div className="space-y-3">
          <Link
            to="/standings"
            className="block bg-nyhl-blue text-white font-semibold py-3 px-8 rounded-xl shadow-lg hover:shadow-xl transition-all hover:scale-105"
          >
            View Standings
          </Link>
          <Link
            to="/schedule"
            className="block bg-transparent border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 font-medium py-3 px-8 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
          >
            View Schedule
          </Link>
          <Link
            to="/"
            className="block text-sm text-nyhl-blue hover:underline"
          >
            + Add a team
          </Link>
        </div>
      </div>
    </div>
  )
}

// ---- Helpers ----

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

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}
