// Service worker registration, owned here instead of the plugin's injected
// registerSW.js (which only calls register()), because the *update* path is
// what decides whether a redeploy ever reaches a phone:
//
//   · updateViaCache 'none' — GitHub Pages serves sw.js with a 10-minute
//     HTTP cache, and not every browser bypasses the cache for the worker
//     script on its own; never let a stale copy mean "no update available".
//   · controllerchange -> one guarded reload — the worker skips its waiting
//     phase on update (registerType autoUpdate), but the page it takes over
//     still runs the old bundle until something reloads it. The very first
//     install claims the page too, and that is not a redeploy, so only a
//     takeover by an already-established controller reloads.
//   · update() when the app returns to the foreground, and hourly — a mobile
//     tab stays open across days, and a navigation is otherwise the only
//     moment a browser looks for a new worker.
//
// Any failure here leaves the app running normally (online, possibly one
// version behind) — registration is an enhancement, not a boot requirement.
export function registerPwa() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

  const start = async () => {
    let reg
    try {
      reg = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL,
        updateViaCache: 'none',
      })
    } catch {
      return
    }

    let hadController = !!navigator.serviceWorker.controller
    let reloaded = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) {
        hadController = true
        return
      }
      if (reloaded) return
      reloaded = true
      window.location.reload()
    })

    const check = () => {
      reg.update().catch(() => {})
    }
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) check()
    })
    window.setInterval(check, 60 * 60 * 1000)
  }

  if (document.readyState === 'complete') start()
  else window.addEventListener('load', start)
}
