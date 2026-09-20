import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePreferences } from '../hooks/usePreferences.jsx'
import { useData } from '../hooks/useData.jsx'
import Select from '../components/Select.jsx'
import Footer from '../components/Footer.jsx'

export default function Landing() {
  const { hasTeams, addTeam, setActiveTeam, setSeason } = usePreferences()
  const { allTeams, season: dataSeason, loading } = useData()

  // Hardcoded seasons — last 3 years
  const seasons = [
    { value: '26-27', label: '2026–27' },
    { value: '25-26', label: '2025–26' },
    { value: '24-25', label: '2024–25' },
  ]

  // Hardcoded lists so users can browse any division even if we only scraped one
  const divisions = ['U07','U08','U09','U10','U11','U12','U13','U14','U15','U16','U17','U18','U21','OTH']
  const tiers = ['Tier 1', 'Tier 2', 'Tier 3']
  const navigate = useNavigate()

  const [step, setStep] = useState('pick') // pick | search | done
  const [selectedSeason, setSelectedSeason] = useState('26-27')
  const [selectedDivision, setSelectedDivision] = useState('')
  const [selectedTier, setSelectedTier] = useState('')
  const [selectedTeam, setSelectedTeam] = useState('')
  const [addedTeam, setAddedTeam] = useState(null)

  // Redirect to home if user already has teams
  useEffect(() => {
    if (hasTeams) {
      navigate('/home', { replace: true })
    }
  }, [hasTeams, navigate])

  if (hasTeams) {
    return null
  }

  // Filter teams based on selections
  const filteredTeams = allTeams.filter((team) => {
    // Division filter
    if (selectedDivision && !team.divisions.includes(selectedDivision)) {
      return false
    }
    // Tier filter
    if (selectedTier && !team.tiers.includes(selectedTier)) {
      return false
    }
    return true
  })

  const handleAddTeam = () => {
    if (!selectedTeam) return
    const team = {
      name: selectedTeam,
      division: selectedDivision || undefined,
      tier: selectedTier || undefined,
      season: selectedSeason,
    }
    addTeam(team)
    setActiveTeam(selectedTeam)
    setSeason(selectedSeason)
    setAddedTeam(team)
    setStep('done')
  }

  const handleContinue = () => {
    navigate('/home', { replace: true })
  }

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900 text-white flex flex-col">
      <div className="max-w-lg mx-auto px-4 py-12 flex flex-col items-center text-center flex-1">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <img src={`${import.meta.env.BASE_URL}images/NYHLLogo-h150.png`} alt="NYHL" className="h-14 w-auto" />
          <span className="text-5xl">🏒</span>
        </div>
        <h1 className="text-3xl font-bold mb-1 dark:text-white text-gray-900">North York Hockey League</h1>
        <h2 className="text-xl text-nyhl-blue dark:text-blue-400 mb-1">Game Center — Team Setup</h2>
        <p className="text-gray-500 dark:text-blue-300 text-sm mb-8">
          Schedules · Standings · Results
        </p>

        {/* Loading state */}
        {loading && (
          <div className="text-gray-500 dark:text-blue-200 mb-8">
            Loading league data...
          </div>
        )}

        {/* Team selection flow */}
        {!loading && step === 'pick' && (
          <div className="w-full space-y-3">
            <button
              onClick={() => setStep('search')}
              className="w-full bg-nyhl-blue text-white font-semibold py-4 px-6 rounded-xl text-lg hover:bg-blue-700 transition-colors"
            >
              Find your team
            </button>

            <button
              onClick={() => navigate('/home', { replace: true })}
              className="w-full bg-transparent border border-gray-300 dark:border-blue-300 text-gray-600 dark:text-blue-200 font-medium py-3 px-6 rounded-xl hover:bg-gray-100 dark:hover:bg-blue-800/50 transition-colors"
            >
              Just browse
            </button>

            <a
              href="https://nyhl.on.ca/"
              target="_blank"
              rel="noopener noreferrer"
              className="block text-sm text-gray-400 dark:text-blue-300/60 hover:text-gray-600 dark:hover:text-blue-300 transition-colors"
            >
              Explore North York Hockey League ↗
            </a>
          </div>
        )}

        {/* Search step */}
        {!loading && step === 'search' && (
          <div className="w-full space-y-4">
            {/* Season picker */}
            <div>
              <label className="block text-sm text-gray-500 dark:text-blue-200 mb-2 text-left">
                Season
              </label>
              <Select
                value={selectedSeason}
                onChange={setSelectedSeason}
                options={seasons}
              />
            </div>

            {/* Division filter */}
            {selectedSeason === dataSeason && divisions.length > 0 && (
              <div>
                <label className="block text-sm text-gray-500 dark:text-blue-200 mb-2 text-left">
                  Division
                </label>
                <Select
                  value={selectedDivision}
                  onChange={setSelectedDivision}
                  placeholder="All divisions"
                  options={divisions.map((d) => ({ value: d, label: d }))}
                />
              </div>
            )}

            {/* Tier filter */}
            {selectedSeason === dataSeason && tiers.length > 0 && (
              <div>
                <label className="block text-sm text-gray-500 dark:text-blue-200 mb-2 text-left">
                  Tier
                </label>
                <Select
                  value={selectedTier}
                  onChange={setSelectedTier}
                  placeholder="All tiers"
                  options={tiers.map((t) => ({ value: t, label: t }))}
                />
              </div>
            )}

            {/* Team list */}
            {selectedSeason === dataSeason ? (
              <div>
                <label className="block text-sm text-gray-500 dark:text-blue-200 mb-2 text-left">
                  Team ({filteredTeams.length} available)
                </label>
                <div className="max-h-48 overflow-y-auto rounded-xl bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10">
                  {filteredTeams.length === 0 && (
                    <div className="px-4 py-3 text-gray-400 dark:text-blue-300 text-sm">
                      No teams found. Try adjusting your filters.
                    </div>
                  )}
                  {filteredTeams.map((team) => (
                    <button
                      key={team.name}
                      onClick={() => setSelectedTeam(team.name)}
                      className={`w-full text-left px-4 py-3 border-b border-gray-200 dark:border-white/5 transition-colors ${
                        selectedTeam === team.name
                          ? 'bg-nyhl-blue/10 text-nyhl-blue dark:bg-nyhl-gold/20 dark:text-nyhl-gold font-semibold'
                          : 'hover:bg-gray-50 dark:hover:bg-white/5'
                      }`}
                    >
                      <span className="text-gray-900 dark:text-white">{team.name}</span>
                    {team.divisions.length > 0 && (
                      <span className="text-xs text-gray-400 dark:text-blue-300 ml-2">
                        {team.divisions.join(', ')}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
            ) : (
              <div className="text-center py-8 rounded-xl bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10">
                <p className="text-4xl mb-3">📅</p>
                <p className="text-gray-600 dark:text-slate-300 font-medium mb-1">
                  No team data yet for {seasons.find((s) => s.value === selectedSeason)?.label}
                </p>
                <p className="text-gray-400 dark:text-slate-500 text-sm">
                  The {seasons.find((s) => s.value === selectedSeason)?.label} season hasn't started yet.
                  Select 2025–26 to browse last season's teams.
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setStep('pick')}
                className="flex-1 bg-transparent border border-gray-300 dark:border-blue-300 text-gray-600 dark:text-blue-200 py-3 rounded-xl hover:bg-gray-100 dark:hover:bg-blue-800/50 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleAddTeam}
                disabled={!selectedTeam}
                className="flex-1 bg-nyhl-blue text-white font-semibold py-3 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
              >
                Add team
              </button>
            </div>
          </div>
        )}

        {/* Done / confirmation */}
        {!loading && step === 'done' && addedTeam && (
          <div className="w-full space-y-6">
            <div className="bg-gray-100 dark:bg-white/10 rounded-xl p-6">
              <p className="text-sm text-gray-500 dark:text-blue-200 mb-2">You're following:</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">🏒 {addedTeam.name}</p>
              {addedTeam.division && (
                <p className="text-gray-500 dark:text-blue-200 mt-1">
                  {addedTeam.division} {addedTeam.tier ? `· ${addedTeam.tier}` : ''}
                </p>
              )}
            </div>

            <button
              onClick={() => {
                setSelectedTeam('')
                setSelectedSeason('26-27')
                setSelectedDivision('')
                setSelectedTier('')
                setAddedTeam(null)
                setStep('search')
              }}
              className="w-full bg-transparent border border-gray-300 dark:border-blue-300 text-gray-600 dark:text-blue-200 py-3 rounded-xl hover:bg-gray-100 dark:hover:bg-blue-800/50 transition-colors"
            >
              Add another team
            </button>

            <button
              onClick={handleContinue}
              className="w-full bg-nyhl-blue text-white font-semibold py-4 px-6 rounded-xl text-lg hover:bg-blue-700 transition-colors"
            >
              Continue →
            </button>
          </div>
        )}
      </div>
      <Footer />
    </div>
  )
}
