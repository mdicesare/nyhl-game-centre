import { usePreferences } from '../hooks/usePreferences.jsx'

// Saved teams as one-tap filters, shown above the filter bar on Schedule and
// Standings. Tapping a chip follows that team, which snaps season, division
// and tier to its competition — the escape hatch for stale filters, so a
// parent who browsed another division last week gets back to their team
// without touching a dropdown. The active team's chip wears the blue.
export default function TeamChips({ onPick }) {
  const { savedTeams, activeTeam, setActiveTeam } = usePreferences()
  if (savedTeams.length === 0) return null
  return (
    <div className="flex gap-2 mb-3 overflow-x-auto -mx-4 px-4 pb-1">
      {savedTeams.map((team) => (
        <button
          key={team.name}
          type="button"
          onClick={() => {
            setActiveTeam(team.name)
            onPick?.()
          }}
          className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
            activeTeam?.toLowerCase() === team.name.toLowerCase()
              ? 'bg-nyhl-blue text-white border-nyhl-blue shadow-sm'
              : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-300 border-gray-200 dark:border-slate-600 hover:border-nyhl-blue dark:hover:border-blue-400'
          }`}
        >
          {team.name}
        </button>
      ))}
    </div>
  )
}
