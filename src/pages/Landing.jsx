import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePreferences } from '../hooks/usePreferences.jsx'
import { useData } from '../hooks/useData.jsx'
import TeamFinder from '../components/TeamFinder.jsx'
import Footer from '../components/Footer.jsx'

export default function Landing() {
  const { hasTeams } = usePreferences()
  const { loading } = useData()

  const navigate = useNavigate()

  const [step, setStep] = useState('pick') // pick | search | done
  const [addedTeam, setAddedTeam] = useState(null)

  // Visitors who already follow a team skip setup. Once a team is added here
  // we hold on the confirmation step instead of bouncing straight to Home.
  useEffect(() => {
    if (hasTeams && addedTeam === null) navigate('/home', { replace: true })
  }, [hasTeams, addedTeam, navigate])

  if (hasTeams && addedTeam === null) {
    return null
  }

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900 text-white flex flex-col">
      <div className="max-w-lg mx-auto px-4 py-12 flex flex-col items-center text-center flex-1 w-full">
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

        {/* Loading state (the search step renders its own) */}
        {loading && step !== 'search' && (
          <div className="text-gray-500 dark:text-blue-200 mb-8">
            Loading league data...
          </div>
        )}

        {/* Team selection flow */}
        {step === 'pick' && !loading && (
          <div className="w-full space-y-3">
            <button
              onClick={() => setStep('search')}
              className="w-full bg-nyhl-blue text-white rounded-xl px-6 py-4 hover:bg-blue-700 transition-colors text-left"
            >
              <span className="block font-semibold text-lg">Find your team</span>
              <span className="block text-xs font-normal text-blue-100 mt-1">
                Pick your season, division and tier to follow a team. Its schedule,
                standings and next game show up on Home.
              </span>
            </button>

            <button
              onClick={() => navigate('/home', { replace: true })}
              className="w-full bg-transparent border border-gray-300 dark:border-blue-300 text-gray-600 dark:text-blue-200 rounded-xl px-6 py-4 hover:bg-gray-100 dark:hover:bg-blue-800/50 transition-colors text-left"
            >
              <span className="block font-medium">Just browse</span>
              <span className="block text-xs font-normal text-gray-400 dark:text-blue-300/60 mt-1">
                Skip setup and look at the full league. You can add a team later
                from Teams.
              </span>
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
        {step === 'search' && (
          <TeamFinder
            onAdded={(team) => {
              setAddedTeam(team)
              setStep('done')
            }}
            onCancel={() => setStep(addedTeam ? 'done' : 'pick')}
          />
        )}

        {/* Done / confirmation */}
        {step === 'done' && addedTeam && (
          <div className="w-full space-y-6">
            <div className="bg-gray-100 dark:bg-white/10 rounded-xl p-6">
              <p className="text-sm text-gray-500 dark:text-blue-200 mb-3">You're following:</p>
              <div className="flex items-center gap-3">
                {addedTeam.logo ? (
                  <img
                    src={`${import.meta.env.BASE_URL}images/teams/${addedTeam.logo}.png`}
                    alt=""
                    className="w-12 h-12 object-contain logo-glow shrink-0"
                    onError={(e) => { e.currentTarget.style.display = 'none' }}
                  />
                ) : (
                  <span className="text-3xl shrink-0">🏒</span>
                )}
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{addedTeam.name}</p>
              </div>
              {addedTeam.division && (
                <p className="text-gray-500 dark:text-blue-200 mt-1">
                  {addedTeam.division} {addedTeam.tier ? `· ${addedTeam.tier}` : ''}
                </p>
              )}
            </div>

            <button
              onClick={() => setStep('search')}
              className="w-full bg-transparent border border-gray-300 dark:border-blue-300 text-gray-600 dark:text-blue-200 py-3 rounded-xl hover:bg-gray-100 dark:hover:bg-blue-800/50 transition-colors"
            >
              Add another team
            </button>

            <button
              onClick={() => navigate('/home', { replace: true })}
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
