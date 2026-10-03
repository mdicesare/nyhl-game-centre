/**
 * 404 shim check against a GitHub Pages-like server (nyhl_simserver.py:
 * missing paths answer with 404.html AND a 404 status, like GitHub Pages).
 *
 * Order matters: the service worker's navigateFallback takes over as soon as
 * the app has loaded once, so the shim must be exercised BEFORE that.
 *
 *   1. missing file on a cold profile (no SW)     -> honest 404 message,
 *      no redirect, no app boot; misses report 404|text/html
 *   2. deep route + query on a cold profile       -> shim restores path and
 *      query, rows render, redirect key cleared
 *   3. /schedule deep route (SW may now be live)  -> lands there either way
 *   4. unknown route                              -> router wildcard lands
 *      on the app shell
 *   5. missing file with SW active                -> shell or 404 message,
 *      never a broken half-state
 *   6. plain shell load                           -> unaffected
 *   7. PWA update contract                        -> sw.js skips waiting,
 *      data JSONs out of the cache-first precache, registration with
 *      updateViaCache 'none', injected register script gone
 *   8. analytics contract                         -> counter wiring in the
 *      bundle, no tracker injected off the deployed host
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4180/nyhl-game-centre'
const WAIT_MS = Number(process.env.WAIT_MS) || 15000
const PORT = 9337
const userDir = mkdtempSync(join(tmpdir(), 'nyhl-404-'))

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
const E_NOTFOUND = `document.body && document.body.innerText.includes('Page not found')`
const E_STATE = `(() => {
  const sels = [...document.querySelectorAll('select')]
  const div = sels.find((s) => [...s.options].some((o) => /^U\\d+$/.test(o.value) || o.value === 'OTH'))
  const tier = sels.find((s) => s !== div && [...s.options].some((o) => /^Tier /.test(o.value)))
  return div && tier ? { div: div.value, tier: tier.value } : null
})()`

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
    const r = await send('Runtime.evaluate',
      { expression, returnByValue: true, awaitPromise: true })
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
  const nav = async (url) => { await send('Page.navigate', { url }); await sleep(400) }
  const pageState = () =>
    evaluate(`({ path: location.pathname, search: location.search,
      key: sessionStorage.getItem('nyhl-redirect'),
      app: Boolean(document.querySelector('#root') && document.querySelector('#root').children.length),
      sw: (navigator.serviceWorker && navigator.serviceWorker.controller) ? 'controlled' : 'uncontrolled',
      notFound: document.body ? document.body.innerText.includes('Page not found') : false })`)
  const statusOf = (url) =>
    evaluate(`fetch(${JSON.stringify(url)}).then((r) => r.status + '|' + (r.headers.get('content-type') || '')).catch((e) => 'ERR:' + e.message)`)

  // ---- 1. missing file on a cold profile (shim must NOT redirect) --------
  await nav(`${BASE}/assets/missing-bundle.js`)
  await waitFor(E_NOTFOUND, '404 message for missing file')
  const p1 = await pageState()
  check('cold: missing file stays on the 404 message', p1.notFound && p1.path.includes('missing-bundle.js'), JSON.stringify(p1))
  check('cold: no app boot, no redirect key', !p1.app && p1.key === null, JSON.stringify(p1))
  const fileStatus = await statusOf(`${BASE}/assets/missing-bundle.js`)
  const routeStatus = await statusOf(`${BASE}/standings`)
  check('misses answer 404|text/html (GitHub Pages contract)',
    fileStatus.startsWith('404|text/html') && routeStatus.startsWith('404|text/html'),
    `file=${fileStatus} route=${routeStatus}`)

  // ---- 2. deep route + query on a cold profile (the shim itself) ---------
  await nav(`${BASE}/standings?season=25-26&division=U14&tier=Tier%201`)
  await waitFor(E_MOUNT, 'app boot on deep /standings')
  await waitFor(E_ROWS, 'rows on deep /standings')
  const st2 = await evaluate(E_STATE).catch(() => null)
  const p2 = await pageState()
  check('shim: path restored', p2.path === '/nyhl-game-centre/standings', p2.path)
  check('shim: query applied (U14, Tier 1)', st2 && st2.div === 'U14' && st2.tier === 'Tier 1', JSON.stringify(st2))
  check('shim: redirect key cleared', p2.key === null, String(p2.key))

  // ---- 3. /schedule (shim or SW shell, either lands here) ----------------
  await nav(`${BASE}/schedule`)
  await waitFor(E_MOUNT, 'app boot on /schedule')
  const p3 = await pageState()
  check('deep link /schedule: lands on the route', p3.path === '/nyhl-game-centre/schedule', JSON.stringify(p3))

  // ---- 4. unknown route -> router wildcard -> shell ----------------------
  await nav(`${BASE}/garbage-path`)
  await waitFor(E_MOUNT, 'app boot after unknown route')
  await sleep(600) // let <Navigate replace> run
  const p4 = await pageState()
  check('unknown route: app shell reached',
    p4.app && (p4.path === '/nyhl-game-centre' || p4.path === '/nyhl-game-centre/'),
    JSON.stringify(p4))

  // ---- 5. missing file again, SW may be active now -----------------------
  await nav(`${BASE}/assets/missing-bundle.js`)
  await sleep(900)
  const p5 = await pageState()
  check('missing file (SW active): shell or 404 message, never broken',
    p5.key === null && (p5.notFound || p5.app), JSON.stringify(p5))

  // ---- 6. plain shell load unaffected ------------------------------------
  await nav(`${BASE}/`)
  await waitFor(E_MOUNT, 'app boot at shell')
  const p6 = await pageState()
  check('shell: boots clean, no stray restore',
    (p6.path === '/nyhl-game-centre/' || p6.path === '/nyhl-game-centre') && p6.key === null, JSON.stringify(p6))

  // ---- 7. PWA update contract (a redeploy must reach the phone) ----------
  // Everything the update path rests on: our own registration (the plugin's
  // injected registerSW.js is gone) with updateViaCache 'none' so a cached
  // sw.js can't mean "no update", a worker that skips its waiting phase, and
  // the data JSONs kept OUT of the cache-first precache — precache matches
  // before the runtime NetworkFirst route, so precached data would answer
  // with the last deploy's copy until a worker update happened to land.
  const swText = await (await fetch(`${BASE}/sw.js`)).text()
  check('pwa: worker skips waiting and claims clients',
    swText.includes('skipWaiting') && swText.includes('clientsClaim'))
  check('pwa: data JSONs out of the precache (NetworkFirst owns them)',
    !swText.includes('data/schedule-26-27.json') && swText.includes('nyhl-data'))
  const regNone = await waitFor(
    `navigator.serviceWorker.getRegistration().then(r => !!(r && r.updateViaCache === 'none'))`,
    'registration with updateViaCache none')
  check('pwa: registration bypasses the HTTP cache', regNone)
  check('pwa: injected register script gone (registration is ours)',
    await evaluate(`!document.querySelector('script[id="vite-plugin-pwa:register-sw"]')`))

  // ---- 8. analytics contract ----------------------------------------------
  // The GoatCounter wiring must ship in the bundle, but the tracker script
  // may only ever appear on the deployed host: this sim runs on 127.0.0.1,
  // so nothing may be injected here (local runs stay off the dashboard and
  // off the network entirely).
  const idxHtml = await (await fetch(`${BASE}/`)).text()
  const bundleName = (idxHtml.match(/assets\/index-[\w-]+\.js/) || [])[0]
  const bundle = bundleName ? await (await fetch(`${BASE}/${bundleName}`)).text() : ''
  check('analytics: bundle carries the counter wiring',
    Boolean(bundleName) &&
      bundle.includes('nyhlcustom.goatcounter.com') &&
      bundle.includes('gc.zgo.at') &&
      bundle.includes('no_onload'),
    bundleName || 'bundle not found in index.html')
  check('analytics: no tracker injected off the deployed host',
    await evaluate(`!document.querySelector('script[data-goatcounter]')`))
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
