import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

// Anonymous page-view counts with GoatCounter (goatcounter.com): no
// cookies, no cross-site tracking — just which pages of this app get
// opened. The counter endpoint is public by design.
//
// Loaded ONLY on the deployed site. count.js filters localhost itself, but
// not injecting off-domain at all keeps every local battery, preview and
// sim run out of the dashboard and off the network entirely.
const HOST = 'mdicesare.github.io'
const ENDPOINT = 'https://nyhlcustom.goatcounter.com/count'

// Called once from main.jsx, before the router mounts.
export function initAnalytics() {
  if (!import.meta.env.PROD || window.location.hostname !== HOST) return

  // no_onload: count.js would otherwise fire the initial pageview itself,
  // on its own timing and with its own path rules — every pageview is sent
  // from usePageView instead, so loads and SPA route changes go through one
  // path. Set before the script tag is appended (count.js preserves what's
  // already on window.goatcounter).
  window.goatcounter = { no_onload: true }

  const s = document.createElement('script')
  s.src = 'https://gc.zgo.at/count.js'
  s.dataset.goatcounter = ENDPOINT
  s.async = true
  document.head.appendChild(s)
}

// One pageview per pathname change. Query-only changes (the ?team= pin,
// persisted filter params) are the same page and are deliberately not
// counted — otherwise filter tinkering would fragment the dashboard into
// dozens of near-identical "pages". Instant redirects (the landing page's
// auto-route to /home) are skipped by settling first, so only the route the
// visitor actually lands on is counted.
//
// count.js is async: if it hasn't arrived yet (slow network, adblock,
// offline) retry briefly, then give up silently — analytics must never
// affect the app.
export function usePageView() {
  const { pathname } = useLocation()
  useEffect(() => {
    let retry
    const settle = setTimeout(() => {
      const send = () => {
        const gc = window.goatcounter
        if (!gc || typeof gc.count !== 'function') return false
        gc.count({ path: pathname })
        return true
      }
      if (send()) return
      const t0 = Date.now()
      retry = setInterval(() => {
        if (send() || Date.now() - t0 > 5000) clearInterval(retry)
      }, 100)
    }, 300)
    return () => {
      clearTimeout(settle)
      clearInterval(retry)
    }
  }, [pathname])
}
