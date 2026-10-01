/**
 * Tier-keep filter verification (CDP, headless Chrome, no deps).
 *
 * Checks the "changing division keeps your tier" behaviour on Standings,
 * Schedule and the TeamFinder cascade:
 *   - U14 Tier 1 -> switch to U15 (also has Tier 1) => tier STAYS
 *   - U14 Tier 1 -> switch to U09 (no Tier 1)       => tier resets to the gate
 *
 * Standings/Schedule use native <select>; TeamFinder uses the custom Select
 * (button + dropdown), so that part is driven by clicking real elements.
 * Run: node nyhl_filtercheck.mjs   (preview server must be on :4173)
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const BASE = process.env.BASE_URL || 'http://localhost:4173/nyhl-game-centre'
// External loads (GitHub Pages + its data JSONs) are slower than localhost.
const WAIT_MS = Number(process.env.WAIT_MS) || 12000
const PORT = 9333
const userDir = mkdtempSync(join(tmpdir(), 'nyhl-cdp-'))

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${userDir}`,
  '--no-first-run', '--no-default-browser-check',
  '--disable-gpu', '--window-size=1280,900',
  'about:blank',
], { stdio: 'ignore', windowsHide: true })

const checks = []
const check = (name, ok, detail = '') => {
  checks.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`)
}

const SEED = {
  savedTeams: [],
  activeTeam: null,
  season: '25-26',
  filters: { division: 'U14', tier: 'Tier 1', gameType: 'ALL', club: 'ALL' },
  scheduleFilter: 'all',
  viewPreference: 'list',
}
// The finder forces the current season on mount; seed it so no data reload
// races the dropdown reads.
const SEED27 = { ...SEED, season: '26-27' }

async function waitForJson(url, opts = {}, ms = 15000) {
  const t0 = Date.now()
  let lastErr
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(url, opts)
      if (r.ok) return await r.json()
      lastErr = new Error(`${r.status} ${r.statusText}`)
    } catch (e) { lastErr = e }
    await sleep(200)
  }
  throw new Error(`no response from ${url}: ${lastErr && lastErr.message}`)
}

// ---- page-side expressions ------------------------------------------------
// State of the two filter selects (only defined while both are rendered).
const E_STATE =
  `(() => {` +
  ` const sels=[...document.querySelectorAll('select')];` +
  ` const div=sels.find(s => [...s.options].some(o => /^U\\d+$/.test(o.value) || o.value==='OTH'));` +
  ` const tier=sels.find(s => s!==div && [...s.options].some(o => /^Tier /.test(o.value)));` +
  ` if (!div || !tier) return null;` +
  ` return { div: div.value, tier: tier.value };` +
  ` })()`

// Same, but only once `cond` holds — used so a wait can't return the state
// the page happened to be in before React processed the change.
const E_STATE_IF = (cond) =>
  `(() => { const s = ${E_STATE}; return s && (${cond}) ? s : null })()`

const E_SET_DIV = (v) =>
  `(() => {` +
  ` const sels=[...document.querySelectorAll('select')];` +
  ` const div=sels.find(s => [...s.options].some(o => /^U\\d+$/.test(o.value) || o.value==='OTH'));` +
  ` if (!div) return null;` +
  ` div.value=${JSON.stringify(v)};` +
  ` div.dispatchEvent(new Event('change', { bubbles:true }));` +
  ` return div.value; })()`

const E_TEXT = (needle) => `document.body.innerText.includes(${JSON.stringify(needle)})`

const E_SEED = (seed) =>
  `localStorage.setItem('nyhl-preferences', ${JSON.stringify(JSON.stringify(seed))}); true`

// custom Select helpers (TeamFinder): label -> wrapper -> Select root.
const E_LAB = (t) =>
  `[...document.querySelectorAll('label')].find(l => l.textContent.trim() === ${JSON.stringify(t)})`

const E_TRIGGER = (t) =>
  `(() => { const lab = ${E_LAB(t)}; if (!lab || !lab.nextElementSibling) return null;` +
  ` return lab.nextElementSibling.querySelector(':scope > button') || null })()`

// NB: must be evaluated in-page (`(${E_TRIGGER(...)} ? true : false)`) — a
// truthiness test in Node on the expression string is always true.
const E_HAS = (t) => `(${E_TRIGGER(t)} ? true : false)`

const E_CLICK = (t) => `(() => { const t = ${E_TRIGGER(t)}; if (!t) return false; t.click(); return true })()`

const E_OPTIONS = (t) =>
  `(() => { const lab = ${E_LAB(t)}; if (!lab || !lab.nextElementSibling) return null;` +
  ` const dd = lab.nextElementSibling.querySelector('div.absolute');` +
  ` if (!dd) return null;` +
  ` return [...dd.querySelectorAll('button')].map(b => b.textContent.trim()) })()`

const E_PICK = (t, v) =>
  `(() => { const lab = ${E_LAB(t)}; if (!lab || !lab.nextElementSibling) return false;` +
  ` const dd = lab.nextElementSibling.querySelector('div.absolute');` +
  ` if (!dd) return false;` +
  ` const btn = [...dd.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(v)});` +
  ` if (!btn) return false; btn.click(); return true })()`

const E_LABEL = (t) => `(() => { const t = ${E_TRIGGER(t)}; return t ? t.textContent.trim() : null })()`

let ws
try {
  await waitForJson(`http://127.0.0.1:${PORT}/json/version`)
  const target = await waitForJson(
    `http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(BASE + '/standings')}`,
    { method: 'PUT' }
  )

  ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws error')) })

  let id = 0
  const pending = new Map()
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data)
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id)
      pending.delete(msg.id)
      msg.error ? rej(new Error(msg.error.message)) : res(msg.result)
    }
  }
  const send = (method, params = {}) => new Promise((res, rej) => {
    const mid = ++id
    pending.set(mid, { res, rej })
    ws.send(JSON.stringify({ id: mid, method, params }))
  })

  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true })
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
    }
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
  // Evaluating while the page is still navigating throws "Execution context
  // was destroyed" — retry until the document is at rest.
  const evaluateRetry = async (expression, tries = 40) => {
    for (let i = 0; i < tries; i++) {
      try { return await evaluate(expression) } catch { /* mid-navigation */ }
      await sleep(300)
    }
    return null
  }
  const stateWhere = (cond, what) =>
    waitFor(E_STATE_IF(cond), what).catch(async () => {
      try { return await evaluate(E_STATE) } catch { return null }
    })
  const nav = async (url) => { await send('Page.navigate', { url }); await sleep(400) }

  // ---- Standings ----------------------------------------------------------
  await nav(`${BASE}/standings`)
  await waitFor(`document.querySelector('#root') && document.querySelector('#root').children.length > 0`, 'app mount')
  await evaluateRetry(E_SEED(SEED))
  await send('Page.reload', {})
  let st = await waitFor(E_STATE_IF(`s.div === 'U14' && s.tier === 'Tier 1'`), 'seeded U14/Tier 1 on Standings')
  check('Standings: seeded state (U14, Tier 1)', st.div === 'U14' && st.tier === 'Tier 1', JSON.stringify(st))
  check('Standings: no gate when seeded', !(await evaluate(E_TEXT('Choose a tier to see standings'))))

  await evaluate(E_SET_DIV('U15'))
  st = await stateWhere(`s.div === 'U15' && s.tier === 'Tier 1'`, 'tier kept after U14 -> U15')
  check('Standings: tier kept (U14 -> U15, both have Tier 1)', st && st.tier === 'Tier 1', JSON.stringify(st))
  check('Standings: division followed', st && st.div === 'U15', JSON.stringify(st))
  check('Standings: rows shown, no gate', !(await evaluate(E_TEXT('Choose a tier to see standings'))))

  await evaluate(E_SET_DIV('U09'))
  st = await stateWhere(`s.div === 'U09' && s.tier === 'ALL'`, 'tier reset after U14 -> U09')
  check('Standings: tier reset (U14 -> U09, U09 has no Tier 1)', st && st.tier === 'ALL', JSON.stringify(st))
  await waitFor(E_TEXT('Choose a tier to see standings'), 'tier gate on Standings')
  check('Standings: tier gate shown after reset', true)

  // ---- Schedule -----------------------------------------------------------
  await evaluateRetry(E_SEED(SEED))
  await nav(`${BASE}/schedule`)
  st = await waitFor(E_STATE_IF(`s.div === 'U14' && s.tier === 'Tier 1'`), 'seeded U14/Tier 1 on Schedule')
  check('Schedule: seeded state (U14, Tier 1)', st.div === 'U14' && st.tier === 'Tier 1', JSON.stringify(st))

  await evaluate(E_SET_DIV('U15'))
  st = await stateWhere(`s.div === 'U15' && s.tier === 'Tier 1'`, 'tier kept on Schedule')
  check('Schedule: tier kept (U14 -> U15)', st && st.tier === 'Tier 1', JSON.stringify(st))
  check('Schedule: games shown, no gate', !(await evaluate(E_TEXT('Choose a tier to see games'))))

  await evaluate(E_SET_DIV('U09'))
  st = await stateWhere(`s.div === 'U09' && s.tier === 'ALL'`, 'tier reset on Schedule')
  check('Schedule: tier reset (U14 -> U09)', st && st.tier === 'ALL', JSON.stringify(st))
  await waitFor(E_TEXT('Choose a tier to see games'), 'tier gate on Schedule')
  check('Schedule: tier gate shown after reset', true)

  // ---- TeamFinder (custom Select) -----------------------------------------
  await evaluateRetry(E_SEED(SEED27))
  await nav(`${BASE}/settings`)
  await waitFor(E_HAS('Division'), 'finder division select', WAIT_MS)

  // First division that actually offers tiers, and its first tier.
  await evaluate(E_CLICK('Division'))
  const allDivs = await waitFor(
    `(() => { const o = ${E_OPTIONS('Division')}; return o && o.length ? o : null })()`,
    'finder division options', WAIT_MS
  )
  await evaluate(E_CLICK('Division')) // close again; each loop iteration reopens

  let curDiv = null
  let keepT = null
  for (const d of allDivs) {
    await evaluate(E_CLICK('Division'))
    await evaluate(E_PICK('Division', d))
    await waitFor(`${E_LABEL('Division')} === ${JSON.stringify(d)}`, `picked division ${d}`)
    if (!(await evaluate(E_HAS('Tier')))) continue
    await evaluate(E_CLICK('Tier'))
    const tiers = await evaluate(E_OPTIONS('Tier'))
    if (tiers && tiers.length) {
      curDiv = d
      keepT = tiers[0]
      await evaluate(E_PICK('Tier', tiers[0]))
      break
    }
    await evaluate(E_CLICK('Tier')) // close the empty dropdown
  }
  check('TeamFinder: picked a division with tiers', Boolean(curDiv && keepT), `div=${curDiv} tier=${keepT}`)

  if (curDiv && keepT) {
    await waitFor(`${E_LABEL('Tier')} === ${JSON.stringify(keepT)}`, `tier ${keepT} selected`)
    let keepFound = false
    let resetFound = false
    for (const d of allDivs.filter((x) => x !== curDiv)) {
      await evaluate(E_CLICK('Division'))
      await evaluate(E_PICK('Division', d))
      await waitFor(`${E_LABEL('Division')} === ${JSON.stringify(d)}`, `picked division ${d}`)
      if (!(await evaluate(E_HAS('Tier')))) continue
      await evaluate(E_CLICK('Tier'))
      const tiers = (await evaluate(E_OPTIONS('Tier'))) || []
      await evaluate(E_CLICK('Tier')) // close without selecting
      const shown = await evaluate(E_LABEL('Tier'))
      if (tiers.includes(keepT)) {
        if (!keepFound) {
          check(`TeamFinder: tier kept (${curDiv} -> ${d}, has ${keepT})`, shown === keepT, `shows "${shown}"`)
          keepFound = true
        }
      } else if (!resetFound) {
        check(`TeamFinder: tier reset (${curDiv} -> ${d}, lacks ${keepT})`, shown === 'Choose a tier', `shows "${shown}"`)
        resetFound = true
      }
      if (keepFound && resetFound) break
    }
    if (!keepFound) check('TeamFinder: tier kept case', true, 'SKIPPED - no other division has this tier')
    if (!resetFound) check('TeamFinder: tier reset case', true, 'SKIPPED - every division has this tier')
  }
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
