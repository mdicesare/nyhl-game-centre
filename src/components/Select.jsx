import { useState, useRef, useEffect } from 'react'

/**
 * Custom select dropdown that gives us full control over styling.
 * Replaces <select> where we need consistent visual treatment.
 */
export default function Select({ value, onChange, options, placeholder, className = '' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selected = options.find((o) => o.value === value)
  const displayLabel = selected?.label || placeholder || 'Select...'

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-3 rounded-xl bg-white/10 dark:bg-slate-800 text-left border border-white/20 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-nyhl-gold flex items-center justify-between"
      >
        <span className={selected ? 'text-white dark:text-slate-200' : 'text-blue-200 dark:text-slate-400'}>
          {displayLabel}
        </span>
        <svg
          className={`w-4 h-4 text-blue-300 dark:text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-800 border-2 border-gray-200 dark:border-slate-600 rounded-xl shadow-lg max-h-60 overflow-y-auto">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value)
                setOpen(false)
              }}
              className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors first:rounded-t-xl last:rounded-b-xl ${
                opt.value === value
                  ? 'bg-nyhl-blue/10 dark:bg-nyhl-blue/20 text-nyhl-blue dark:text-blue-400 font-semibold'
                  : 'text-gray-700 dark:text-slate-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
