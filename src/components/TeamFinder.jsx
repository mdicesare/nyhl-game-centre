import { useState, useMemo, useEffect, useRef } from 'react'
import { usePreferences } from '../hooks/usePreferences.jsx'
import { useData } from '../hooks/useData.jsx'
import Select from './Select.jsx'
import { SEASONS, CURRENT_SEASON } from '../lib/seasons.js'

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
 * The steps cascade and each one is required: divisions come from the loaded
 * season, tiers from the chosen division, and teams only from the full
 * season/division/tier combination. Nothing outside that combo is ever
 * offered, and there is no "all divisions" state that would fall back to
 * listing the whole league.
 *
 * The season select writes straight to the shared preference, because that
 * value is what decides which snapshot the data layer loads. Opening the
 * finder resets it to the current season and gives the previous one back on
 * close unless a team was added. Settings hides the select — season is picked
 * on the data pages or during first-time setup.
 */
export default function TeamFinder({
  onAdded,
  onCancel,
  backLabel = 'Back',
  ctaLabel = 'Add team',
  showSeason = true,
}) {
  const { season, setSeason, savedTeams, addTeam, setActiveTeam } = usePreferences()
  const { allTeams, sourceSeason, loading } = useData()

  const [selectedDivision, setSelectedDivision] = useState('')
  const [selectedTier, setSelectedTier] = useState('')
  const [selectedTeam, setSelectedTeam] = useState('')

  // A team search always opens on the current season. The stored season is a
  // browsing scope — it follows the active team's year, or whatever was last
  // looked at on Standings/Schedule — so the finder was quietly starting on
  // last year's rosters. The visitor's own season comes back if they leave
  // without adding anyone, so opening this panel never rewrites the season
  // the data pages were showing.
  const seasonAtOpen = useRef(season)
  const addedRef = useRef(false)
  useEffect(() => {
    if (season !== CURRENT_SEASON) setSeason(CURRENT_SEASON)
    return () => {
      if (!addedRef.current && seasonAtOpen.current !== CURRENT_SEASON) {
        setSeason(seasonAtOpen.current)
      }
    }
    // Mount/unmount only: a season picked inside the finder has to stick
    // while it is open, and re-running this would fight that choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const savedNames = useMemo(
    () => new Set(savedTeams.map((t) => t.name.toLowerCase())),
    [savedTeams]
  )

  // Step 1: divisions that exist in the loaded season.
  const divisionOptions = useMemo(
    () => [...new Set(allTeams.flatMap((t) => t.divisions))].sort(),
    [allTeams]
  )

  // Step 2: teams in the chosen division — that scope is what defines the
  // tier options, so you never see a tier this division doesn't play.
  const divisionScoped = useMemo(
    () =>
      selectedDivision
        ? allTeams.filter((t) => t.divisions.includes(selectedDivision))
        : allTeams,
    [allTeams, selectedDivision]
  )
  const tierOptions = useMemo(
    () => [...new Set(divisionScoped.flatMap((t) => t.tiers))].sort(),
    [divisionScoped]
  )

  // Step 3: teams inside the season/division/tier combination, less saved ones.
  const comboTeams = useMemo(
    () => divisionScoped.filter((t) => t.tiers.includes(selectedTier)),
    [divisionScoped, selectedTier]
  )
  const filteredTeams = useMemo(
    () => comboTeams.filter((t) => !savedNames.has(t.name.toLowerCase())),
    [comboTeams, savedNames]
  )

  const hasData = allTeams.length > 0
  const needsDivision = divisionOptions.length > 0
  const divisionChosen = !needsDivision || Boolean(selectedDivision)
  const showTier = divisionChosen && tierOptions.length > 0
  const ready = divisionChosen && (!showTier || Boolean(selectedTier))

  // Each step invalidates everything below it, including the picked team, so
  // the Add button can never submit a team that isn't visible in the list.
  const handleSeasonChange = (value) => {
    setSeason(value)
    setSelectedDivision('')
    setSelectedTier('')
    setSelectedTeam('')
  }
  const handleDivisionChange = (value) => {
    setSelectedDivision(value)
    setSelectedTier('')
    setSelectedTeam('')
  }
  const handleTierChange = (value) => {
    setSelectedTier(value)
    setSelectedTeam('')
  }

  const handleAdd = () => {
    if (!selectedTeam) return
    const team = {
      name: selectedTeam,
      division: selectedDivision || undefined,
      tier: selectedTier || undefined,
      season,
      // Carry the crest through so the confirmation screen shows the real
      // logo instead of a generic puck. Not persisted meaningfully — older
      // saved teams without it fall back to a lookup at render time.
      logo: comboTeams.find((t) => t.name === selectedTeam)?.logo || undefined,
    }
    addTeam(team)
    setActiveTeam(selectedTeam)
    // The season this finder set up is now the visitor's real season — don't
    // restore the old one when the panel closes.
    addedRef.current = true
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
          {needsDivision && (
            <div>
              <label className="block text-sm text-gray-500 dark:text-slate-400 mb-2">Division</label>
              <Select
                value={selectedDivision}
                onChange={handleDivisionChange}
                placeholder="Choose a division"
                options={divisionOptions.map((d) => ({ value: d, label: d }))}
              />
            </div>
          )}

          {showTier && (
            <div>
              <label className="block text-sm text-gray-500 dark:text-slate-400 mb-2">Tier</label>
              <Select
                value={selectedTier}
                onChange={handleTierChange}
                placeholder="Choose a tier"
                options={tierOptions.map((t) => ({ value: t, label: t }))}
              />
            </div>
          )}

          {!ready ? (
            <div className="rounded-xl bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-slate-700 px-4 py-5 text-center text-sm text-gray-500 dark:text-slate-400">
              {!divisionChosen
                ? 'Choose a division to see the teams in it.'
                : 'Choose a tier to see the teams in it.'}
            </div>
          ) : (
            <div>
              <label className="block text-sm text-gray-500 dark:text-slate-400 mb-2">
                Team ({filteredTeams.length} available)
              </label>
              <div className="max-h-48 overflow-y-auto rounded-xl bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-slate-700">
                {filteredTeams.length === 0 ? (
                  <div className="px-4 py-3 text-gray-500 dark:text-slate-400 text-sm">
                    {comboTeams.length === 0
                      ? 'No teams in this division and tier.'
                      : 'All teams already added.'}
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
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
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
