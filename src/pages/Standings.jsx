import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { usePreferences } from '../hooks/usePreferences.jsx'
import { useData } from '../hooks/useData.jsx'
// A standings row leads to that team's own schedule, not to whatever team the
// visitor happens to follow.
import { teamScheduleLink } from '../lib/links.js'

const GAME_TYPE_LABELS = {
  'FS': 'Fall Season',
  'WS': 'Winter Season',
  'PO': 'Playoff Round Robin',
  'PB': 'Playoff Elimination',
}

function formatSeasonLabel(s) {
  // "25-26" → "2025–26"
  const [y1, y2] = s.split('-')
  return `20${y1}–${y2}`
}

export default function Standings() {
  const { filters, setFilters, clearFilters, activeTeam, season, setSeason } = usePreferences()
  // effectiveGameType lives in useData so the place shown on a Home card is
  // always the place shown in this table.
  const { standingsList, divisions, tiersFor, standingsGameTypes, effectiveGameType, lastUpdated } =
    useData()
  const [expandedTeam, setExpandedTeam] = useState(null)

  const hasData = standingsList.length > 0

  // One competition at a time. Without this a fresh visitor who only picks a
  // season gets every division and tier stacked into a single table where the
  // ranking means nothing. Division is required first because tier options are
  // scoped to it — the same cascade the team finder uses.
  const needsDivision = divisions.length > 0 && filters.division === 'ALL'
  const tierOptions = needsDivision ? [] : tiersFor(filters.division)
  const needsTier = tierOptions.length > 0 && filters.tier === 'ALL'
  const awaitingFilters = hasData && (needsDivision || needsTier)

  // Apply filters
  const filteredStandings = useMemo(() => {
    let result = standingsList

    if (filters.division !== 'ALL') {
      result = result.filter((s) => s.division === filters.division)
    }
    if (filters.tier !== 'ALL') {
      result = result.filter((s) => s.tier === filters.tier)
    }
    if (effectiveGameType) {
      result = result.filter((s) => s.gameType === effectiveGameType)
    }

    return result
  }, [standingsList, filters.division, filters.tier, effectiveGameType])

  // A game type is always chosen, so it isn't part of "clear the filters".
  const hasActiveFilters = filters.division !== 'ALL' || filters.tier !== 'ALL'

  return (
    <div className="px-4 py-6 max-w-5xl mx-auto animate-fade-in">
      {/* Header with season badge */}
      <div className="flex items-center gap-3 mb-5">
        <h1 className="text-2xl font-bold dark:text-white">Standings</h1>
        <span className="bg-nyhl-blue text-white text-sm font-semibold px-3 py-1 rounded-full">
          20{season.split('-')[0]}–{season.split('-')[1]}
        </span>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <select
          value={season}
          onChange={(e) => setSeason(e.target.value)}
          className="px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 dark:text-white"
        >
          <option value="26-27">2026–27</option>
          <option value="25-26">2025–26</option>
          <option value="24-25">2024–25</option>
        </select>

        {divisions.length > 0 && (
          <select
            value={filters.division}
            onChange={(e) => setFilters({ division: e.target.value, tier: 'ALL' })}
            className="px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 dark:text-white"
          >
            <option value="ALL">Choose a division…</option>
            {/* Keep a remembered filter selectable even if the loaded season lacks it */}
            {filters.division !== 'ALL' && !divisions.includes(filters.division) && (
              <option value={filters.division}>{filters.division}</option>
            )}
            {divisions.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        )}

        {!needsDivision && tierOptions.length > 0 && (
          <select
            value={filters.tier}
            onChange={(e) => setFilters({ tier: e.target.value })}
            className="px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 dark:text-white"
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

        {standingsGameTypes.length > 0 && (
          <select
            value={effectiveGameType || ''}
            onChange={(e) => setFilters({ gameType: e.target.value })}
            className="px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 dark:text-white"
          >
            {standingsGameTypes.map((gt) => (
              <option key={gt} value={gt}>{GAME_TYPE_LABELS[gt] || gt}</option>
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

      {/* Nothing to rank until a competition is picked */}
      {awaitingFilters ? (
        <div className="text-center py-12 rounded-xl bg-gray-50 dark:bg-slate-800/50 border border-gray-100 dark:border-slate-700">
          <p className="text-4xl mb-4">📋</p>
          <p className="text-gray-600 dark:text-slate-300 text-lg mb-2">
            Choose a {needsDivision ? 'division' : 'tier'} to see standings
          </p>
          <p className="text-gray-400 dark:text-slate-500 text-sm max-w-sm mx-auto">
            Standings are shown one division and tier at a time, so the table only
            ever ranks teams that actually play each other.
          </p>
        </div>
      ) : (
      <div>
      {/* Active filter summary */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
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
        {effectiveGameType && (
          <span className="bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-xs font-medium px-2.5 py-1 rounded-full">
            {GAME_TYPE_LABELS[effectiveGameType] || effectiveGameType}
          </span>
        )}
      </div>

      {/* Standings list */}
      {filteredStandings.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-4xl mb-4">📋</p>
          {hasData ? (
            <>
              <p className="text-gray-600 dark:text-slate-300 text-lg mb-2">
                No teams match these filters
              </p>
              <p className="text-gray-400 dark:text-slate-500 text-sm mb-4">
                Try a different division or tier.
              </p>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="text-sm text-nyhl-blue hover:underline"
                >
                  Clear filters
                </button>
              )}
            </>
          ) : (
            <>
              <p className="text-gray-600 dark:text-slate-300 text-lg mb-2">
                No standings data yet for {formatSeasonLabel(season)}
              </p>
              <p className="text-gray-400 dark:text-slate-500 text-sm">
                The season may not have started yet. Check back soon!
              </p>
            </>
          )}
        </div>
      ) : (
        <>
          {/* Desktop table (hidden on mobile) */}
          <div className="hidden md:block">
            <StandingsTable
              standings={filteredStandings}
              activeTeam={activeTeam}
            />
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {filteredStandings.map((team, i) => (
              <TeamRow
                key={team.teamId || team.name}
                team={team}
                rank={i + 1}
                isActive={activeTeam?.toLowerCase() === team.name.toLowerCase()}
                isExpanded={expandedTeam === team.name}
                onToggle={() =>
                  setExpandedTeam(expandedTeam === team.name ? null : team.name)
                }
              />
            ))}
          </div>
        </>
      )}
      </div>
      )}

      {lastUpdated && (
        <p className="text-xs text-gray-400 dark:text-slate-500 text-center mt-8">
          Updated {formatTimestamp(lastUpdated)}
        </p>
      )}
    </div>
  )
}

// ---- Desktop Table ----

function StandingsTable({ standings, activeTeam }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-x-auto shadow-lg">
      <table className="w-full text-sm whitespace-nowrap">
        <thead>
          <tr className="bg-nyhl-navy dark:bg-[#1a2d47] text-white text-xs uppercase tracking-wide">
            <th className="text-left px-3 py-3 w-8">#</th>
            <th className="text-left px-3 py-3">Team</th>
            <th className="text-center px-2 py-3 w-10">GP</th>
            <th className="text-center px-2 py-3 w-10">W</th>
            <th className="text-center px-2 py-3 w-10">L</th>
            <th className="text-center px-2 py-3 w-10">T</th>
            <th className="text-center px-2 py-3 w-10">PTS</th>
            <th className="text-center px-2 py-3 w-12">W%</th>
            <th className="text-center px-2 py-3 w-10">GF</th>
            <th className="text-center px-2 py-3 w-10">GA</th>
            <th className="text-center px-2 py-3 w-10">DIFF</th>
            <th className="text-center px-2 py-3 w-14">L10</th>
            <th className="text-center px-3 py-3 w-16">Streak</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((team, i) => {
            const gf = (team.gfAvg * team.gp).toFixed(0)
            const ga = (team.gaAvg * team.gp).toFixed(0)
            const diff = gf - ga
            const isUserTeam = activeTeam?.toLowerCase() === team.name.toLowerCase()

            return (
              <tr
                key={team.teamId || team.name}
                className={`border-t border-gray-100 dark:border-slate-700 transition-colors ${
                  isUserTeam
                    ? 'bg-gradient-to-r from-nyhl-blue/5 to-nyhl-blue/10 dark:from-nyhl-blue/10 dark:to-nyhl-blue/20'
                    : 'hover:bg-gray-50 dark:hover:bg-slate-700/50'
                }`}
              >
                <td className="px-3 py-3 font-medium text-gray-500 dark:text-slate-400">{i + 1}</td>
                <td className="px-3 py-3 font-medium">
                  <div className="flex items-center gap-2">
                    {team.logo && (
                      <img
                        src={`${import.meta.env.BASE_URL}images/teams/${team.logo}.png`}
                        alt=""
                        className="w-7 h-7 object-contain"
                        onError={(e) => { e.target.style.display = 'none' }}
                      />
                    )}
                    {isUserTeam && <span className="text-nyhl-gold">★</span>}
                    <Link
                      to={teamScheduleLink(team)}
                      aria-label={`${team.name} schedule`}
                      className={`hover:text-nyhl-blue hover:underline ${
                        isUserTeam ? 'text-nyhl-blue dark:text-blue-400 font-semibold' : 'dark:text-slate-200'
                      }`}
                    >
                      {team.name}
                    </Link>
                  </div>
                </td>
                <td className="text-center px-2 py-3 dark:text-slate-300">{team.gp}</td>
                <td className="text-center px-2 py-3 dark:text-slate-300">{team.w}</td>
                <td className="text-center px-2 py-3 dark:text-slate-300">{team.l}</td>
                <td className="text-center px-2 py-3 dark:text-slate-300">{team.t}</td>
                <td className="text-center px-2 py-3 font-bold text-nyhl-navy dark:text-white text-base">{team.pts}</td>
                <td className="text-center px-2 py-3 dark:text-slate-300">{team.winPct.toFixed(3)}</td>
                <td className="text-center px-2 py-3 dark:text-slate-300">{gf}</td>
                <td className="text-center px-2 py-3 dark:text-slate-300">{ga}</td>
                <td className={`text-center px-2 py-3 font-bold ${
                  diff > 0 ? 'text-green-600 dark:text-green-400' :
                  diff < 0 ? 'text-red-600 dark:text-red-400' :
                  'dark:text-slate-300'
                }`}>
                  {diff > 0 ? `+${diff}` : diff}
                </td>
                <td className="text-center px-2 py-3 text-gray-500 dark:text-slate-400">{team.last10}</td>
                <td className="text-center px-3 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    team.streak?.toLowerCase().startsWith('w')
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                      : team.streak?.toLowerCase().startsWith('l')
                      ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                      : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                  }`}>
                    {team.streak}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ---- Mobile Team Row ----

function TeamRow({ team, rank, isActive, isExpanded, onToggle }) {
  const gf = (team.gfAvg * team.gp).toFixed(0)
  const ga = (team.gaAvg * team.gp).toFixed(0)
  const diff = gf - ga
  const link = teamScheduleLink(team)

  // The row is a div rather than a button because the team name inside it is
  // a real link to that team's schedule — nesting a link in a button is
  // invalid HTML and browsers drop the inner target. Everything else on the
  // row still expands the detail panel.
  const toggleOnKey = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onToggle()
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={toggleOnKey}
      className={`w-full text-left rounded-xl border p-3 transition-all card-hover cursor-pointer ${
        isActive
          ? 'bg-gradient-to-r from-nyhl-blue/5 to-nyhl-blue/10 border-nyhl-blue/30 dark:from-nyhl-blue/10 dark:to-nyhl-blue/20 dark:border-blue-500/30'
          : 'bg-white dark:bg-slate-800 border-gray-100 dark:border-slate-700'
      }`}
    >
      {/* Main row */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-gray-400 dark:text-slate-500 w-6">{rank}</span>
          {team.logo && (
            <img
              src={`${import.meta.env.BASE_URL}images/teams/${team.logo}.png`}
              alt=""
              className="w-7 h-7 object-contain"
              onError={(e) => { e.target.style.display = 'none' }}
            />
          )}
          <Link
            to={link}
            aria-label={`${team.name} schedule`}
            onClick={(e) => e.stopPropagation()}
            className={`font-semibold hover:text-nyhl-blue hover:underline ${
              isActive ? 'text-nyhl-blue dark:text-blue-400' : 'dark:text-slate-200'
            }`}
          >
            {isActive && <span className="mr-1 text-nyhl-gold">★</span>}
            {team.name}
          </Link>
        </div>
        <span className="font-bold text-xl text-nyhl-navy dark:text-white">{team.pts}</span>
      </div>

      {/* Summary line */}
      <div className="ml-9 text-sm text-gray-500 dark:text-slate-400">
        <span>{team.gp} GP</span> · <span>{team.w}-{team.l}-{team.t}</span> ·{' '}
        <span className={diff > 0 ? 'text-green-600 dark:text-green-400 font-medium' : diff < 0 ? 'text-red-600 dark:text-red-400 font-medium' : ''}>
          {diff > 0 ? `+${diff}` : diff} GD
        </span>
        {team.streak && (
          <span className={`ml-1 px-1.5 py-0.5 rounded text-xs font-medium ${
            team.streak?.toLowerCase().startsWith('w')
              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
              : team.streak?.toLowerCase().startsWith('l')
              ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
              : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
          }`}>
            {team.streak}
          </span>
        )}
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="mt-3 ml-9 pt-3 border-t border-gray-100 dark:border-slate-700 grid grid-cols-2 gap-2 text-sm animate-fade-in">
          <Detail label="Win %" value={team.winPct.toFixed(3)} />
          <Detail label="Goals" value={`${gf}–${ga}`} />
          <Detail label="Home" value={team.home} />
          <Detail label="Away" value={team.away} />
          <Detail label="Last 10" value={team.last10} />
          <Detail label="PIM" value={team.pim || '—'} />
          <Link
            to={link}
            onClick={(e) => e.stopPropagation()}
            className="col-span-2 text-nyhl-blue dark:text-blue-400 text-sm font-medium hover:underline"
          >
            View {team.name}'s schedule →
          </Link>
        </div>
      )}
    </div>
  )
}

function Detail({ label, value }) {
  return (
    <div>
      <span className="text-gray-400 dark:text-slate-500 text-xs">{label}</span>
      <p className="font-medium dark:text-slate-200">{value}</p>
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
