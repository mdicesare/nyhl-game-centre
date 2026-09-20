import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePreferences } from '../hooks/usePreferences.jsx'
import { useData } from '../hooks/useData.jsx'
import Select from '../components/Select.jsx'

export default function Landing() {
  const { hasTeams, savedTeams, addTeam, setActiveTeam } = usePreferences()
  const { divisions, tiers, allTeams, season, loading } = useData()
  const navigate = useNavigate()

  const [step, setStep] = useState('pick') // pick | search | done
  const [selectedDivision, setSelectedDivision] = useState('')
  const [selectedTier, setSelectedTier] = useState('')
  const [selectedTeam, setSelectedTeam] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
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
  const filteredTeams = allTeams.filter((name) => {
    if (searchQuery) {
      return name.toLowerCase().includes(searchQuery.toLowerCase())
    }
    // Without division/tier data on team names, we show all
    // The real filtering happens once we have division/tier metadata
    return true
  })

  const handleAddTeam = () => {
    if (!selectedTeam) return
    const team = {
      name: selectedTeam,
      division: selectedDivision || undefined,
      tier: selectedTier || undefined,
    }
    addTeam(team)
    setActiveTeam(selectedTeam)
    setAddedTeam(team)
    setStep('done')
  }

  const handleContinue = () => {
    navigate('/home', { replace: true })
  }

  const handleExplore = () => {
    navigate('/home', { replace: true })
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-nyhl-navy to-blue-900 text-white">
      <div className="max-w-lg mx-auto px-4 py-12 flex flex-col items-center text-center">
        {/* Header */}
        <div className="text-6xl mb-4">🏒</div>
        <h1 className="text-3xl font-bold mb-2">NYHL Game Centre</h1>
        <p className="text-blue-200 text-lg mb-8">
          A better way to follow your NYHL teams.
          <br />
          Schedules · Standings · Results
        </p>

        {/* Loading state */}
        {loading && (
          <div className="text-blue-200 mb-8">
            Loading league data...
          </div>
        )}

        {/* Team selection flow */}
        {!loading && step === 'pick' && (
          <div className="w-full space-y-4">
            <button
              onClick={() => setStep('search')}
              className="w-full bg-white text-nyhl-navy font-semibold py-4 px-6 rounded-xl text-lg hover:bg-blue-50 transition-colors"
            >
              Find your team
            </button>

            <button
              onClick={handleExplore}
              className="w-full bg-transparent border border-blue-300 text-blue-200 font-medium py-3 px-6 rounded-xl hover:bg-blue-800/50 transition-colors"
            >
              Explore NYHL
            </button>
          </div>
        )}

        {/* Search step */}
        {!loading && step === 'search' && (
          <div className="w-full space-y-4">
            <div>
              <label className="block text-sm text-blue-200 mb-2 text-left">
                Search for your team
              </label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="e.g. Vaughan Rangers"
                className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-blue-300 focus:outline-none focus:ring-2 focus:ring-nyhl-gold"
                autoFocus
              />
            </div>

            {/* Division filter */}
            {divisions.length > 0 && (
              <div>
                <label className="block text-sm text-blue-200 mb-2 text-left">
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
            {tiers.length > 0 && (
              <div>
                <label className="block text-sm text-blue-200 mb-2 text-left">
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
            <div>
              <label className="block text-sm text-blue-200 mb-2 text-left">
                Team ({filteredTeams.length} available)
              </label>
              <div className="max-h-48 overflow-y-auto rounded-xl bg-white/5 border border-white/10">
                {filteredTeams.length === 0 && (
                  <div className="px-4 py-3 text-blue-300 text-sm">
                    No teams found. Try adjusting your search.
                  </div>
                )}
                {filteredTeams.map((name) => (
                  <button
                    key={name}
                    onClick={() => setSelectedTeam(name)}
                    className={`w-full text-left px-4 py-3 border-b border-white/5 transition-colors ${
                      selectedTeam === name
                        ? 'bg-nyhl-gold/20 text-nyhl-gold font-semibold'
                        : 'hover:bg-white/5'
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setStep('pick')}
                className="flex-1 bg-transparent border border-blue-300 text-blue-200 py-3 rounded-xl hover:bg-blue-800/50 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleAddTeam}
                disabled={!selectedTeam}
                className="flex-1 bg-nyhl-gold text-nyhl-navy font-semibold py-3 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed hover:bg-yellow-400 transition-colors"
              >
                Add team
              </button>
            </div>
          </div>
        )}

        {/* Done / confirmation */}
        {!loading && step === 'done' && addedTeam && (
          <div className="w-full space-y-6">
            <div className="bg-white/10 rounded-xl p-6">
              <p className="text-sm text-blue-200 mb-2">You're following:</p>
              <p className="text-2xl font-bold">🏒 {addedTeam.name}</p>
              {addedTeam.division && (
                <p className="text-blue-200 mt-1">
                  {addedTeam.division} {addedTeam.tier ? `· ${addedTeam.tier}` : ''}
                </p>
              )}
            </div>

            <button
              onClick={() => {
                setSelectedTeam('')
                setSelectedDivision('')
                setSelectedTier('')
                setSearchQuery('')
                setAddedTeam(null)
                setStep('search')
              }}
              className="w-full bg-transparent border border-blue-300 text-blue-200 py-3 rounded-xl hover:bg-blue-800/50 transition-colors"
            >
              Add another team
            </button>

            <button
              onClick={handleContinue}
              className="w-full bg-white text-nyhl-navy font-semibold py-4 px-6 rounded-xl text-lg hover:bg-blue-50 transition-colors"
            >
              Continue →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
