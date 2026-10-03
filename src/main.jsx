import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { registerPwa } from './lib/pwa'
import { initAnalytics } from './lib/analytics'
import './index.css'

// Own the service worker registration (update checks + reload on deploy) —
// see src/lib/pwa.js. PROD-only, so the dev server never registers.
registerPwa()
// Anonymous page-view counts — see src/lib/analytics.js. Also gated to the
// deployed host, so local previews and test runs never send anything.
initAnalytics()

// Initialize dark mode from localStorage (default: dark)
if (localStorage.getItem('nyhl-dark-mode') === 'light') {
  // User explicitly chose light — do nothing
} else if (localStorage.getItem('nyhl-dark-mode') === null) {
  // First visit — default to dark
  document.documentElement.classList.add('dark')
} else {
  // Has a saved preference ('dark' or 'true')
  document.documentElement.classList.add('dark')
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
