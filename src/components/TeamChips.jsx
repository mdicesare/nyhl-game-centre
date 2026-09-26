import { usePreferences } from '../hooks/usePreferences.jsx'
import { teamId } from '../lib/teams.js'

// Saved teams as one-tap filters, shown above the filter bar on Schedule and
// Standings. Tapping a chip follows that team, which snaps season, division
// and tier to its competition — the escape hatch for stale filters, so a
// parent who browsed another division last week gets back to their team
// without touching a dropdown. The active team's chip wears the blue, and a
// name followed in more than one season carries its year so the twins stay
// tellable apart.
export default function TeamChips({ onPick }) {
  const { savedTeams, activeTeam, setActiveTeam } = usePreferences()
  if (savedTeams.length === 0) return null
  const nameCount = (name) => savedTeams.filter((t) => t.name === name).length
  return (
    <div className="flex gap-2 mb-3 overflow-x-auto -mx-4 px-4 pb-1">
      {savedTeams.map((team) => (
        <button
          key={teamId(team)}
          type="button"
          onClick={() => {
            setActiveTeam(team)
            onPick?.()
          }}
          className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
            teamId(team) === activeTeam
              ? 'bg-nyhl-blue text-white border-nyhl-blue shadow-sm'
              : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-300 border-gray-200 dark:border-slate-600 hover:border-nyhl-blue dark:hover:border-blue-400'
          }`}
        >
          {nameCount(team.name) > 1 ? `${team.name} (${team.season})` : team.name}
        </button>
      ))}
    </div>
  )
}
