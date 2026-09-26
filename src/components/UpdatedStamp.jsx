import { useData } from '../hooks/useData.jsx'

// The "Updated …" footer every data page used to carry a copy of, plus the
// manual way to ask for fresh data. iOS standalone PWAs have no
// pull-to-refresh, so instead of adding a hidden gesture (or fighting
// Android's built-in one) the control sits exactly where the freshness
// claim already is.
export default function UpdatedStamp() {
  const { lastUpdated, reload, loading } = useData()
  if (!lastUpdated) return null
  return (
    <p className="text-xs text-gray-400 dark:text-slate-500 text-center mt-8">
      Updated {formatTimestamp(lastUpdated)}
      <button
        type="button"
        onClick={() => reload()}
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
