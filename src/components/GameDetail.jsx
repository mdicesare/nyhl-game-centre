// Game detail sheet. Lives on its own so both the Schedule list and the
// "last result" row on a Home team card can open the same overlay instead of
// each page growing its own copy.

const GAME_TYPE_LABELS = {
  'FS': 'Fall Season',
  'WS': 'Winter Season',
  'PO': 'Playoff Round Robin',
  'PB': 'Playoff Elimination',
}

export function formatGameType(type) {
  return GAME_TYPE_LABELS[type] || type
}

export function formatGameDate(dateStr) {
  try {
    const d = new Date(dateStr + 'T12:00:00')
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return dateStr
  }
}

export function formatTime(timeStr) {
  if (!timeStr) return ''
  try {
    const [h, m] = timeStr.split(':')
    const d = new Date()
    d.setHours(parseInt(h), parseInt(m))
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  } catch {
    return timeStr
  }
}

export default function GameDetail({ game, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 rounded-t-2xl w-full max-w-lg p-6 pb-8 animate-slide-up shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-12 h-1 bg-gray-300 dark:bg-slate-600 rounded-full mx-auto mb-4" />

        <p className="text-xs text-gray-400 dark:text-slate-500 mb-4">
          {formatGameDate(game.date)} · {formatTime(game.time)}
        </p>

        <div className="flex items-center justify-between gap-2 mb-6">
          <div className="flex-1 min-w-0 flex items-center gap-2 sm:gap-3">
            {game.homeTeam.logo && (
              <img
                src={`${import.meta.env.BASE_URL}images/teams/${game.homeTeam.logo}.png`}
                alt=""
                className="w-9 h-9 sm:w-14 sm:h-14 object-contain logo-glow shrink-0"
                onError={(e) => { e.target.style.display = 'none' }}
              />
            )}
            <div className="min-w-0">
              {/* flex children default to min-width:auto, so a long name kept
                  its intrinsic width and painted over the score. */}
              <p className="text-sm sm:text-lg font-bold dark:text-white break-words">{game.homeTeam.name}</p>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400">Home</p>
            </div>
          </div>

          {game.score ? (
            <div className="text-center px-2 sm:px-6 shrink-0">
              <p className="text-2xl sm:text-4xl font-bold dark:text-white whitespace-nowrap">
                {game.score.home} – {game.score.away}
              </p>
              <p className="text-[10px] sm:text-xs text-gray-500 dark:text-slate-500 uppercase mt-1">
                {game.status === 'final' ? 'Final' : game.status}
              </p>
            </div>
          ) : (
            <div className="text-center px-2 sm:px-6 shrink-0">
              <p className="text-xl sm:text-2xl font-bold text-gray-300 dark:text-slate-600">vs</p>
            </div>
          )}

          <div className="flex-1 min-w-0 flex items-center justify-end gap-2 sm:gap-3">
            <div className="min-w-0 text-right">
              <p className="text-sm sm:text-lg font-bold dark:text-white break-words">{game.awayTeam.name}</p>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400">Away</p>
            </div>
            {game.awayTeam.logo && (
              <img
                src={`${import.meta.env.BASE_URL}images/teams/${game.awayTeam.logo}.png`}
                alt=""
                className="w-9 h-9 sm:w-14 sm:h-14 object-contain logo-glow shrink-0"
                onError={(e) => { e.target.style.display = 'none' }}
              />
            )}
          </div>
        </div>

        <div className="space-y-2 text-sm border-t border-gray-100 dark:border-slate-700 pt-4">
          {game.arena && (
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-slate-400">Arena</span>
              <span className="font-medium dark:text-slate-200">{game.arena}</span>
            </div>
          )}
          {game.division && (
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-slate-400">Division</span>
              <span className="font-medium dark:text-slate-200">{game.division}</span>
            </div>
          )}
          {game.tier && (
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-slate-400">Tier</span>
              <span className="font-medium dark:text-slate-200">{game.tier}</span>
            </div>
          )}
          {game.gameType && (
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-slate-400">Type</span>
              <span className="font-medium dark:text-slate-200">{formatGameType(game.gameType)}</span>
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          className="w-full mt-6 bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-200 py-3 rounded-xl font-medium hover:bg-200 dark:hover:bg-slate-600 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  )
}
