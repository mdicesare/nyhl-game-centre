import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

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
