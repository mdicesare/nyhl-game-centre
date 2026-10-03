import { teamId } from '../lib/teams.js'

// One tap back to a saved team — the "I've been poking at the selects and now
// just want my team's games again" row for a parent. Sits directly under the
// filter bar on Schedule and Standings, in a single horizontally scrollable
// line so it costs one row of screen height however many teams are saved. On
// Standings it takes over the spot the summary pills used to occupy: the
// dropdowns already say what is selected, while these chips actually take you
// somewhere.
//
// onSelect does the page's own jump (Schedule pins the team, Standings picks
// its competition); isActive marks the chip whose target the view is already
// on. Renders nothing with no teams saved, so deep links stay as quiet as
// before.
export default function TeamQuickFilter({ teams, isActive, onSelect }) {
  if (!teams || teams.length === 0) return null

  // The same club team recurs across seasons (this year's U15 squad was last
  // year's U14 team), so duplicate names carry their season to stay
  // distinguishable — and to say which season the chip will jump to.
  const nameCounts = {}
  for (const t of teams) nameCounts[t.name] = (nameCounts[t.name] || 0) + 1

  return (
    <div
      className="flex items-center gap-2 mb-4 overflow-x-auto"
      role="group"
      aria-label="Quick team filters"
    >
      <span className="text-xs text-gray-400 dark:text-slate-500 shrink-0 whitespace-nowrap">
        My teams
      </span>
      {teams.map((team) => {
        const label =
          nameCounts[team.name] > 1 && team.season
            ? `${team.name} · ${team.season}`
            : team.name
        const active = isActive ? isActive(team) : false
        return (
          <button
            key={teamId(team)}
            type="button"
            onClick={() => onSelect(team)}
            aria-label={`Quick filter ${label}`}
            aria-pressed={active}
            className={
              active
                ? 'shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold bg-nyhl-blue text-white'
                : 'shrink-0 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 border border-gray-200 dark:border-slate-600 hover:border-nyhl-blue hover:text-nyhl-blue'
            }
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
