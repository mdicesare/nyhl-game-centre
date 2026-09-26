// Game detail sheet. Lives on its own so both the Schedule list and the
// "last result" row on a Home team card can open the same overlay instead of
// each page growing its own copy.
import { useRef, useState } from 'react'

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
  // The handle bar always looked draggable, so it is: pulling it down
  // dismisses the sheet the same way the Close button does. Pointer events
  // cover touch and mouse alike; anything shy of a committed pull springs
  // back so a stray tap never closes the card.
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  // Once the visitor has grabbed the handle the mount animation is done
  // with — an animation would out-rank the inline transform mid-drag.
  const [grabbed, setGrabbed] = useState(false)
  const startY = useRef(0)
  const startT = useRef(0)
  // A drag that ends with the pointer over the backdrop fires a click there
  // after release; without this flag an aborted drag would read as a tap on
  // the scrim and close the sheet.
  const suppressBackdropClick = useRef(false)

  const onPointerDown = (e) => {
    if (!e.isPrimary) return
    setGrabbed(true)
    setDragging(true)
    startY.current = e.clientY
    startT.current = performance.now()
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e) => {
    if (!dragging) return
    const dy = e.clientY - startY.current
    setDragY(dy > 0 ? dy : 0)
  }
  const endDrag = (e) => {
    if (!dragging) return
    setDragging(false)
    const dy = Math.max(0, e.clientY - startY.current)
    const elapsed = Math.max(1, performance.now() - startT.current)
    // A committed pull or a quick flick dismisses; anything less springs
    // back into place.
    if (dy > 90 || (dy > 24 && dy / elapsed > 0.6)) {
      suppressBackdropClick.current = true
      setTimeout(() => { suppressBackdropClick.current = false }, 350)
      onClose()
    } else {
      setDragY(0)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm"
      onClick={() => { if (!suppressBackdropClick.current) onClose() }}
    >
      <div
        className={`bg-white dark:bg-slate-800 rounded-t-2xl w-full max-w-lg p-6 pb-8 shadow-2xl ${grabbed ? '' : 'animate-slide-up'}`}
        style={{
          transform: `translateY(${dragY}px)`,
          transition: dragging ? 'none' : 'transform 180ms ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Grab zone: the visible bar plus breathing room around it, sized
            so a thumb finds it without aiming. touch-none keeps a drag from
            turning into a scroll mid-gesture. */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={() => { setDragging(false); setDragY(0) }}
          className="w-full -mt-3 py-3 mb-1 cursor-grab active:cursor-grabbing touch-none select-none"
          aria-hidden="true"
        >
          <div className="w-12 h-1 bg-gray-300 dark:bg-slate-600 rounded-full mx-auto" />
        </div>

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
