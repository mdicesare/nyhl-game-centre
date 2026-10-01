/**
 * Standings star check — the star must mark the exact saved team instance
 * (name + season + division + tier), never another season's team that
 * happens to share the name.
 *
 * Scenarios (Vaughan Blue U15 Tier 1 exists in BOTH 25-26 and 26-27 data,
 * which is the reported bug: favourite the 26-27 instance, star shows on
 * the 25-26 table):
 *
 *   1. active = 26-27 instance, browsing 25-26  -> 0 visible stars
 *   2. same session, season switch to 26-27     -> exactly 1, Vaughan Blue
 *   3. active = 25-26 instance, browsing 25-26  -> exactly 1, Vaughan Blue
 *   4. mobile width, scenario 1 (card renderer) -> 0 visible stars
 *   5. mobile width, active = 25-26             -> exactly 1, Vaughan Blue
 *
 * BASE_URL defaults to the local preview (SPA fallback, deep links work).
 * GitHub Pages has no fallback, so with BASE_URL set the script seeds prefs
 * via on-new-document and walks in through the app's own buttons.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const BASE = process.env.BASE_URL || 'http://localhost:4173/nyhl-game-centre'
const LIVE = !BASE.startsWith('http://localhost')
const WAIT_MS = Number(process.env.WAIT_MS) || (LIVE ? 30000 : 12000)
const PORT = 9336
const userDir = mkdtempSync(join(tmpdir(), 'nyhl-star-'))

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${userDir}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1280,900',
  'about:blank',
], { stdio: 'ignore', windowsHide: true })

const checks = []
const check = (name, ok, detail = '') => {
  checks.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`)
}

// Same team, two seasons — the composite id is what "favourite" means.
const TEAM27 = { name: 'Vaughan Blue', division: 'U15', tier: 'Tier 1', season: '26-27' }
const TEAM26 = { ...TEAM27, season: '25-26' }
const tid = (t) => [t.name, t.season, t.division, t.tier]
  .map((s) => String(s).toLowerCase()).join('|')
const prefsFor = (active, season) => ({
  savedTeams: [TEAM27, TEAM26],
  activeTeam: tid(active),
  season,
  filters: { division: 'U15', tier: 'Tier 1', gameType: 'ALL', club: 'ALL' },
  scheduleFilter: 'all',
  viewPreference: 'list',
})

async function waitForJson(url, opts = {}, ms = 20000) {
  const t0 = Date.now()
  let err
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(url, opts); if (r.ok) return await r.json(); err = `${r.status}` }
    catch (e) { err = e.message }
    await sleep(200)
  }
  throw new Error(`${url}: ${err}`)
}

const E_MOUNT = `document.querySelector('#root') && document.querySelector('#root').children.length > 0`
const E_ROWS = `document.querySelectorAll('tbody tr').length > 0`
const E_TEXT = (needle) => `document.body.innerText.includes(${JSON.stringify(needle)})`
// Visible stars only: both renderers stay in the DOM, hidden by CSS.
const E_STARS = `(() => {
  const visible = (el) => el.getClientRects().length > 0
  const stars = [...document.querySelectorAll('span.text-nyhl-gold')].filter(visible)
  return { n: stars.length, rows: stars.map((s) => {
    const box = s.closest('tr') || s.closest('[role="button"]')
    return box ? box.innerText.replace(/\\s+/g, ' ') : ''
  }) }
})()`
const E_SET_SEASON = (v) => `(() => {
  const sel = [...document.querySelectorAll('select')]
    .find((s) => [...s.options].some((o) => o.value === '24-25'))
  if (!sel) return null
  sel.value = ${JSON.stringify(v)}
  sel.dispatchEvent(new Event('change', { bubbles: true }))
  return sel.value
})()`
const E_CLICK_TEXT = (text) =>
  `(() => { const el=[...document.querySelectorAll('button, a')].find(b =>` +
  ` b.textContent.replace(/\\s+/g,' ').trim().includes(${JSON.stringify(text)}));` +
  ` if (!el) return false; el.click(); return true })()`
const E_CLICK_HREF = (suffix) =>
  `(() => { const el=[...document.querySelectorAll('a')].find(a =>` +
  ` (a.getAttribute('href')||'').endsWith(${JSON.stringify(suffix)}));` +
  ` if (!el) return false; el.click(); return true })()`
const E_PATH_ENDS = (suffix) =>
  `location.pathname.endsWith(${JSON.stringify(suffix)}) || location.pathname.endsWith(${JSON.stringify(suffix + '/')})`

let ws
try {
  await waitForJson(`http://127.0.0.1:${PORT}/json/version`)
  const target = await waitForJson(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })
  ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws error')) })

  let id = 0
  const pending = new Map()
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data)
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id); pending.delete(msg.id)
      msg.error ? rej(new Error(msg.error.message)) : res(msg.result)
    }
  }
  const send = (method, params = {}) => new Promise((res, rej) => {
    const mid = ++id; pending.set(mid, { res, rej })
    ws.send(JSON.stringify({ id: mid, method, params }))
  })
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
    return r.result.value
  }
  const waitFor = async (expression, what, ms = WAIT_MS) => {
    const t0 = Date.now()
    let last
    while (Date.now() - t0 < ms) {
      try { last = await evaluate(expression) } catch { last = null }
      if (last) return last
      await sleep(150)
    }
    throw new Error(`timeout waiting for ${what} (last=${JSON.stringify(last)})`)
  }
  const evaluateRetry = async (expression, tries = 40) => {
    for (let i = 0; i < tries; i++) {
      try { return await evaluate(expression) } catch { /* mid-navigation */ }
      await sleep(300)
    }
    return null
  }
  const nav = async (url) => { await send('Page.navigate', { url }); await sleep(500) }
  const clickPath = async (clickExpr, suffix, what) => {
    const t0 = Date.now()
    let clicked = false
    while (Date.now() - t0 < WAIT_MS) {
      try { if (await evaluate(clickExpr)) { clicked = true; break } } catch { /* mid-nav */ }
      await sleep(300)
    }
    if (!clicked) throw new Error(`click failed: ${what}`)
    await waitFor(E_PATH_ENDS(suffix), what)
  }

  // Same-origin localStorage write, picked up by the next reload/navigation
  // (evaluate + reboot is the proven seeding path — addScriptToEvaluateOnNew
  // Document didn't fire reliably here).
  const setSeed = async (prefs) => {
    const expr =
      `localStorage.setItem('nyhl-preferences', ${JSON.stringify(JSON.stringify(prefs))}); true`
    if (!(await evaluateRetry(expr))) throw new Error('seed write failed')
    await sleep(300) // let any in-flight app save settle before rebooting
  }
  const boot = async (prefs) => {
    if (LIVE) {
      // Establish the origin first; then seed and reboot (deep URLs 404 on
      // GitHub Pages, so /standings is only reachable through the app's own
      // buttons — Landing auto-routes to /home when teams exist).
      await nav(`${BASE}/`)
      await waitFor(E_MOUNT, 'app mount at root')
      await setSeed(prefs)
      await nav(`${BASE}/`)
      await waitFor(E_PATH_ENDS('/home'), 'auto-route to /home')
      await clickPath(E_CLICK_HREF('/standings'), '/standings', 'nav to /standings')
    } else {
      await nav(`${BASE}/standings`)
      await waitFor(E_MOUNT, 'app mount')
      await setSeed(prefs)
      await send('Page.reload', {})
      await waitFor(E_MOUNT, 'app remount')
    }
    try {
      await waitFor(E_ROWS, 'standings rows')
    } catch (e) {
      const dump = await evaluate(`({
        prefs: (localStorage.getItem('nyhl-preferences') || 'NONE').slice(0, 260),
        text: document.body.innerText.slice(0, 260).replace(/\\n+/g, ' | '),
        selects: [...document.querySelectorAll('select')].map((s) => s.value),
        rows: document.querySelectorAll('tbody tr').length
      })`).catch(() => null)
      throw new Error(`${e.message} DUMP=${JSON.stringify(dump)}`)
    }
  }
  const expectStars = async (name, wantN, wantName) => {
    let got = { n: -1, rows: [] }
    try { got = await evaluate(E_STARS) } catch { /* reported below */ }
    const ok = got.n === wantN && (wantN === 0 || (got.rows[0] || '').includes(wantName))
    check(name, ok, JSON.stringify(got))
  }

  // ---- 1. active 26-27 instance, browsing 25-26: no star -----------------
  await boot(prefsFor(TEAM27, '25-26'))
  await expectStars('desktop: no star on other season (26-27 active, 25-26 shown)', 0, 'Vaughan Blue')

  // ---- 2. same session, switch season to the team's own year --------------
  await evaluateRetry(E_SET_SEASON('26-27'))
  await waitFor(
    `[...document.querySelectorAll('span')].some((s) => s.textContent === '2026–27')`,
    'season badge flipped to 2026–27')
  await waitFor(E_ROWS, 'rows after season switch')
  await expectStars('desktop: star on own season (26-27 active, 26-27 shown)', 1, 'Vaughan Blue')

  // ---- 3. active 25-26 instance, browsing 25-26 ---------------------------
  await boot(prefsFor(TEAM26, '25-26'))
  await expectStars('desktop: star on own instance (25-26 active, 25-26 shown)', 1, 'Vaughan Blue')

  // ---- 4/5. the mobile card renderer -------------------------------------
  await send('Emulation.setDeviceMetricsOverride',
    { width: 390, height: 844, deviceScaleFactor: 3, mobile: true })
  await boot(prefsFor(TEAM27, '25-26'))
  await expectStars('mobile: no star on other season (26-27 active, 25-26 shown)', 0, 'Vaughan Blue')

  await boot(prefsFor(TEAM26, '25-26'))
  await expectStars('mobile: star on own instance (25-26 active, 25-26 shown)', 1, 'Vaughan Blue')
} catch (e) {
  check('script completed without error', false, e.message)
} finally {
  try { ws && ws.close() } catch {}
  try { chrome.kill() } catch {}
  try { rmSync(userDir, { recursive: true, force: true }) } catch {}
}

const failed = checks.filter((c) => !c.ok)
console.log(`\n=== ${checks.length - failed.length}/${checks.length} checks passed ===`)
process.exit(failed.length ? 1 : 0)
