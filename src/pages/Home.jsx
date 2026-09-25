import { useState } from 'react'
import { Link } from 'react-router-dom'
import { usePreferences } from '../hooks/usePreferences.jsx'
import { useData } from '../hooks/useData.jsx'
import GameDetail, { formatGameDate, formatTime, formatGameType } from '../components/GameDetail.jsx'
import { teamScheduleLink, teamStandingsLink } from '../lib/links.js'

export default function Home() {
  const { savedTeams, activeTeam, setActiveTeam, hasTeams } = usePreferences()
  const { getNextGame, getLastGame, getTeamStanding, seasonReady, allTeams, season, lastUpdated, loading } = useData()
  const [selectedGame, setSelectedGame] = useState(null)

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
        {displayTeams.map((team, index) => {
          const standing = getTeamStanding(team)
          // Each card is read from the team's own season, which may not be
          // the one on screen. Until that snapshot lands, say so rather than
          // claiming the team has no games.
          const ready = seasonReady(team.season || season)
          return (
            <TeamCard
              key={team.name}
              team={team}
              isActive={activeTeam?.toLowerCase() === team.name.toLowerCase()}
              nextGame={getNextGame(team)}
              lastGame={getLastGame(team)}
              standing={standing}
              ready={ready}
              // Logos live on the schedule and standings rows, but a team can
              // have neither and still deserve its crest on the card.
              logo={standing?.logo || team.logo || allTeams.find((t) => t.name === team.name)?.logo || null}
              onSelect={() => setActiveTeam(team.name)}
              onOpenGame={setSelectedGame}
              index={index}
              globalSeason={season}
            />
          )
        })}
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

      {selectedGame && (
        <GameDetail game={selectedGame} onClose={() => setSelectedGame(null)} />
      )}
    </div>
  )
}

// The card is deliberately not one big link. Three sections lead to three
// different places — the record to Standings, the next game to Schedule, the
// last result to its own overlay — so each one is its own target with its own
// hover affordance, and the card body only picks the active team.
function TeamCard({
  team,
  isActive,
  nextGame,
  lastGame,
  standing,
  ready = true,
  logo,
  onSelect,
  onOpenGame,
  index = 0,
  globalSeason,
}) {
  const isWin = lastGame && lastGame.score && (
    (lastGame.homeTeam.name.toLowerCase() === team.name.toLowerCase() && lastGame.score.home > lastGame.score.away) ||
    (lastGame.awayTeam.name.toLowerCase() === team.name.toLowerCase() && lastGame.score.away > lastGame.score.home)
  )
  const isLoss = lastGame && lastGame.score && !isWin && (
    lastGame.score.home !== lastGame.score.away
  )

  const cardSeason = team.season || globalSeason
  const competition = [team.division, team.tier].filter(Boolean).join(' · ')
  const logoSrc = logo ? `${import.meta.env.BASE_URL}images/teams/${logo}.png` : null

  return (
    <div
      onClick={onSelect}
      className={`relative block rounded-2xl border-2 p-4 transition-all animate-slide-up overflow-hidden cursor-pointer ${
        isActive
          ? 'bg-gradient-to-r from-nyhl-blue/5 to-nyhl-blue/10 border-nyhl-blue shadow-lg dark:from-nyhl-blue/10 dark:to-nyhl-blue/20 dark:border-blue-400'
          : 'bg-white dark:bg-slate-800 border-gray-100 dark:border-slate-700 hover:border-gray-200 dark:hover:border-slate-600'
      }`}
      style={{ animationDelay: `${index * 100}ms` }}
    >
      {/* Logo watermark */}
      {logoSrc && (
        <img
          src={logoSrc}
          alt=""
          className="absolute -right-4 -bottom-4 w-28 h-28 object-contain opacity-[0.06] dark:opacity-[0.08] pointer-events-none select-none"
          onError={(e) => { e.target.style.display = 'none' }}
        />
      )}

      {/* Team identity */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          {logoSrc ? (
            <img
              src={logoSrc}
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
              {competition || formatSeasonLabel(cardSeason)}
            </p>
          </div>
        </div>
        {isActive && (
          <span className="text-xs bg-nyhl-blue text-white px-3 py-1 rounded-full font-medium shadow-sm">
            Active
          </span>
        )}
      </div>

      {/* Record → Standings */}
      {standing && (
        <Link
          to={teamStandingsLink(team, standing.gameType)}
          aria-label={`${team.name} standings`}
          className="group flex items-center gap-3 mb-4 p-3 rounded-xl bg-gray-50 dark:bg-slate-700/50 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
        >
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500 mb-2">
              {formatSeasonLabel(cardSeason)} · {formatGameType(standing.gameType)}
            </p>
            <div className="flex items-center gap-4">
              <div className="text-center">
                {/* A place is only a place once someone has played — before
                    that it is just the order the rows came in. */}
                <p className="text-2xl font-bold text-nyhl-blue dark:text-blue-400">
                  {standing.ranked ? ordinal(standing.rank) : '—'}
                </p>
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
          </div>
          <Chevron label="standings" />
        </Link>
      )}

      {/* Next game → that team's own schedule */}
      <Link
        to={teamScheduleLink(team)}
        aria-label={`${team.name} schedule`}
        className="group block mb-3 p-3 -mx-3 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
      >
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide">
            Next Game
          </p>
          <Chevron label="schedule" />
        </div>
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
          <p className="text-sm text-gray-400 dark:text-slate-500">
            {ready ? 'No upcoming games' : 'Loading…'}
          </p>
        )}
      </Link>

      {/* Last result → game detail overlay */}
      {lastGame && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onOpenGame(lastGame)
          }}
          className={`w-full text-left text-sm border-t pt-3 rounded-xl transition-colors hover:bg-gray-50 dark:hover:bg-slate-700/50 ${
            isWin ? 'border-green-200 dark:border-green-800' :
            isLoss ? 'border-red-200 dark:border-red-800' :
            'border-gray-100 dark:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <p className="text-xs text-gray-400 dark:text-slate-500">Last result</p>
              {isWin && <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full font-medium">W</span>}
              {isLoss && <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-2 py-0.5 rounded-full font-medium">L</span>}
            </div>
            <Chevron label="game detail" />
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
        </button>
      )}
    </div>
  )
}

// Marks a section as its own tap target without adding button chrome.
function Chevron({ label }) {
  return (
    <span
      aria-hidden="true"
      className="text-gray-300 dark:text-slate-600 group-hover:text-nyhl-blue dark:group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all shrink-0"
    >
      ›<span className="sr-only">Open {label}</span>
    </span>
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

function formatSeasonLabel(s) {
  if (!s) return ''
  const [y1, y2] = String(s).split('-')
  return y2 ? `20${y1}–${y2}` : String(s)
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}
