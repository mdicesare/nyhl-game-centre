import { useState, useMemo } from 'react'
import { usePreferences } from '../hooks/usePreferences.jsx'
import { useData } from '../hooks/useData.jsx'
import Select from './Select.jsx'

// Last three seasons we keep a snapshot for.
const SEASONS = [
  { value: '26-27', label: '2026–27' },
  { value: '25-26', label: '2025–26' },
  { value: '24-25', label: '2024–25' },
]

function seasonLabel(value) {
  return SEASONS.find((s) => s.value === value)?.label || value
}

/**
 * "Find my team": season -> division -> tier -> team -> add.
 *
 * Shared by the Landing onboarding page and the Teams settings page so both
 * save the same division/tier/season metadata. A team saved without it can't
 * be matched against the right standings, since several divisions reuse the
 * same team names.
 *
 * The season select writes straight to the shared preference, because that
 * value is what decides which snapshot the data layer loads — so the list
 * below always shows the season on screen.
 */
export default function TeamFinder({
  onAdded,
  onCancel,
  backLabel = 'Back',
  ctaLabel = 'Add team',
  showSeason = true,
}) {
  const { season, setSeason, savedTeams, addTeam, setActiveTeam } = usePreferences()
  const { allTeams, divisions, tiers, sourceSeason, loading } = useData()

  const [selectedDivision, setSelectedDivision] = useState('')
  const [selectedTier, setSelectedTier] = useState('')
  const [selectedTeam, setSelectedTeam] = useState('')

  const savedNames = useMemo(
    () => new Set(savedTeams.map((t) => t.name.toLowerCase())),
    [savedTeams]
  )

  const filteredTeams = useMemo(() => {
    return allTeams
      .filter((t) => !savedNames.has(t.name.toLowerCase()))
      .filter((team) => {
        if (selectedDivision && !team.divisions.includes(selectedDivision)) return false
        if (selectedTier && !team.tiers.includes(selectedTier)) return false
        return true
      })
  }, [allTeams, savedNames, selectedDivision, selectedTier])

  const unfilteredCount = useMemo(
    () => allTeams.filter((t) => !savedNames.has(t.name.toLowerCase())).length,
    [allTeams, savedNames]
  )

  // The selected season drives what the data layer loaded, so "has data"
  // simply means the loaded snapshot actually contains teams.
  const hasData = allTeams.length > 0

  const handleSeasonChange = (value) => {
    setSeason(value)
    setSelectedDivision('')
    setSelectedTier('')
    setSelectedTeam('')
  }

  const handleAdd = () => {
    if (!selectedTeam) return
    const team = {
      name: selectedTeam,
      division: selectedDivision || undefined,
      tier: selectedTier || undefined,
      season,
    }
    addTeam(team)
    setActiveTeam(selectedTeam)
    setSelectedTeam('')
    onAdded?.(team)
  }

  return (
    <div className="w-full space-y-4 text-left">
      {showSeason && (
        <div>
          <label className="block text-sm text-gray-500 dark:text-slate-400 mb-2">Season</label>
          <Select value={season} onChange={handleSeasonChange} options={SEASONS} />
        </div>
      )}

      {loading ? (
        <div className="text-center py-6 text-sm text-gray-500 dark:text-slate-400">
          Loading league data...
        </div>
      ) : !hasData ? (
        <div className="text-center py-8 rounded-xl bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-slate-700">
          <p className="text-4xl mb-3">📅</p>
          <p className="text-gray-700 dark:text-slate-200 font-medium mb-1">
            No team data yet for {seasonLabel(season)}
          </p>
          <p className="text-gray-500 dark:text-slate-400 text-sm">
            {sourceSeason && sourceSeason !== season
              ? `${seasonLabel(season)} hasn't been published yet.`
              : "The season hasn't started yet."}
          </p>
          {sourceSeason && sourceSeason !== season && (
            <button
              onClick={() => handleSeasonChange(sourceSeason)}
              className="mt-3 text-sm font-medium text-nyhl-blue dark:text-blue-400 hover:underline"
            >
              Show {seasonLabel(sourceSeason)} teams →
            </button>
          )}
        </div>
      ) : (
        <>
          {divisions.length > 0 && (
            <div>
              <label className="block text-sm text-gray-500 dark:text-slate-400 mb-2">Division</label>
              <Select
                value={selectedDivision}
                onChange={setSelectedDivision}
                placeholder="All divisions"
                options={divisions.map((d) => ({ value: d, label: d }))}
              />
            </div>
          )}

          {tiers.length > 0 && (
            <div>
              <label className="block text-sm text-gray-500 dark:text-slate-400 mb-2">Tier</label>
              <Select
                value={selectedTier}
                onChange={setSelectedTier}
                placeholder="All tiers"
                options={tiers.map((t) => ({ value: t, label: t }))}
              />
            </div>
          )}

          <div>
            <label className="block text-sm text-gray-500 dark:text-slate-400 mb-2">
              Team ({filteredTeams.length} available)
            </label>
            <div className="max-h-48 overflow-y-auto rounded-xl bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-slate-700">
              {filteredTeams.length === 0 ? (
                <div className="px-4 py-3 text-gray-500 dark:text-slate-400 text-sm">
                  {unfilteredCount === 0
                    ? 'All teams already added.'
                    : 'No teams found. Try adjusting your filters.'}
                </div>
              ) : (
                filteredTeams.map((team) => (
                  <button
                    key={team.name}
                    onClick={() => setSelectedTeam(team.name)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-200 dark:border-white/5 transition-colors last:border-b-0 ${
                      selectedTeam === team.name
                        ? 'bg-nyhl-blue/10 text-nyhl-blue dark:bg-nyhl-gold/20 dark:text-nyhl-gold font-semibold'
                        : 'hover:bg-gray-50 dark:hover:bg-white/5'
                    }`}
                  >
                    <span className="text-gray-900 dark:text-white">{team.name}</span>
                    {(team.divisions.length > 0 || team.tiers.length > 0) && (
                      <span className="text-xs text-gray-400 dark:text-slate-500 ml-2">
                        {[...team.divisions, ...team.tiers].join(' · ')}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {!loading && (
        <div className="flex gap-3 pt-2">
          {onCancel && (
            <button
              onClick={onCancel}
              className="flex-1 border border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-300 py-3 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
            >
              {backLabel}
            </button>
          )}
          <button
            onClick={handleAdd}
            disabled={!selectedTeam || !hasData}
            className={`${onCancel ? 'flex-1' : 'w-full'} bg-nyhl-blue text-white font-semibold py-3 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors`}
          >
            {ctaLabel}
          </button>
        </div>
      )}
    </div>
  )
}
