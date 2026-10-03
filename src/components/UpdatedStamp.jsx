import { useData } from '../hooks/useData.jsx'

// The single "Updated …" line plus the manual way to ask for fresh data,
// rendered inside the shared footer panel directly above the source credit
// — one copy, one place, on every page. iOS standalone PWAs have no
// pull-to-refresh, so instead of adding a hidden gesture (or fighting
// Android's built-in one) the control sits exactly where the freshness
// claim already is.
export default function UpdatedStamp() {
  const { lastUpdated, reload, loading } = useData()
  if (!lastUpdated) return null
  // The button is the manual way to ask for fresh data — and, when a deploy
  // is pending, to surface it: the update check either finds a new worker
  // (which takes over and reloads once, see src/lib/pwa.js) or there is
  // nothing to update and the data re-read below is the whole effect.
  const refresh = () => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((r) => r && r.update()).catch(() => {})
    }
    reload()
  }
  return (
    <p className="text-xs text-gray-400 dark:text-slate-500 text-center mb-2">
      Updated {formatTimestamp(lastUpdated)}
      <button
        type="button"
        onClick={refresh}
        disabled={loading}
        aria-label="Refresh data"
        className="ml-2 inline-flex items-center gap-1 text-nyhl-blue dark:text-blue-400 hover:underline disabled:opacity-60 disabled:no-underline"
      >
        {loading ? 'Refreshing…' : '⟳ Refresh'}
      </button>
    </p>
  )
}

function formatTimestamp(iso) {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}
