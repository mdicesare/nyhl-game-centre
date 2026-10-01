/**
 * Filter persistence check against the DEPLOYED GitHub Pages app.
 *
 * GitHub Pages has no SPA fallback (deep URLs 404), so everything is driven
 * in-app from the root: "Just browse" -> /home, then the bottom-nav links.
 * Seeded prefs only load at boot, so reloads happen only at the root path.
 *
 *   Standings: seeded U14/Tier 1 -> U15 keeps Tier 1 -> U09 resets to gate
 *   Schedule : cross-page persistence (U09/ALL carried over) then the same
 *              keep (via U14 -> Tier 1 -> U15) and reset (-> U09) checks
 *   Finder   : landing "Find your team" -> division change keeps tier
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const BASE = process.env.BASE_URL || 'https://mdicesare.github.io/nyhl-game-centre'
const WAIT_MS = Number(process.env.WAIT_MS) || 30000
const PORT = 9335
const userDir = mkdtempSync(join(tmpdir(), 'nyhl-livef-'))

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

const SEED = {
  savedTeams: [], activeTeam: null, season: '25-26',
  filters: { division: 'U14', tier: 'Tier 1', gameType: 'ALL', club: 'ALL' },
  scheduleFilter: 'all', viewPreference: 'list',
}
const SEED27 = { ...SEED, season: '26-27' }
// Followed team whose competition matches the on-screen filters — the
// parent's report: this browse must show the whole competition, not just
// the followed team's games.
const SEED_FOLLOW = {
  savedTeams: [{ name: 'Vaughan Blue', division: 'U15', tier: 'Tier 1', season: '26-27' }],
  activeTeam: 'vaughan blue|26-27|u15|tier 1',
  season: '26-27',
  filters: { division: 'U15', tier: 'Tier 1', gameType: 'ALL', club: 'ALL' },
  scheduleFilter: 'all', viewPreference: 'list',
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

// ---- page-side expressions (same shapes as nyhl_filtercheck) -------------
const E_STATE =
  `(() => {` +
  ` const sels=[...document.querySelectorAll('select')];` +
  ` const div=sels.find(s => [...s.options].some(o => /^U\\d+$/.test(o.value) || o.value==='OTH'));` +
  ` const tier=sels.find(s => s!==div && [...s.options].some(o => /^Tier /.test(o.value)));` +
  ` if (!div || !tier) return null;` +
  ` return { div: div.value, tier: tier.value };` +
  ` })()`
const E_STATE_IF = (cond) =>
  `(() => { const s = ${E_STATE}; return s && (${cond}) ? s : null })()`
const E_SET = (which, v) =>
  `(() => {` +
  ` const sels=[...document.querySelectorAll('select')];` +
  ` const div=sels.find(s => [...s.options].some(o => /^U\\d+$/.test(o.value) || o.value==='OTH'));` +
  ` const sel = ${which === 'div' ? 'div' : 'sels.find(s => s!==div && [...s.options].some(o => /^Tier /.test(o.value)))'};` +
  ` if (!sel) return null;` +
  ` sel.value=${JSON.stringify(v)};` +
  ` sel.dispatchEvent(new Event('change', { bubbles:true }));` +
  ` return sel.value; })()`
const E_TEXT = (needle) => `document.body.innerText.includes(${JSON.stringify(needle)})`
const E_SEED = (seed) =>
  `localStorage.setItem('nyhl-preferences', ${JSON.stringify(JSON.stringify(seed))}); true`
const E_MOUNT = `document.querySelector('#root') && document.querySelector('#root').children.length > 0`
const E_PATH_ENDS = (suffix) =>
  `location.pathname.endsWith(${JSON.stringify(suffix)}) || location.pathname.endsWith(${JSON.stringify(suffix + '/')})`
const E_CLICK_TEXT = (text) =>
  `(() => { const el=[...document.querySelectorAll('button, a')].find(b =>` +
  ` b.textContent.replace(/\\s+/g,' ').trim().includes(${JSON.stringify(text)}));` +
  ` if (!el) return false; el.click(); return true })()`
const E_CLICK_HREF = (suffix) =>
  `(() => { const el=[...document.querySelectorAll('a')].find(a =>` +
  ` (a.getAttribute('href')||'').endsWith(${JSON.stringify(suffix)}));` +
  ` if (!el) return false; el.click(); return true })()`

// custom Select helpers (TeamFinder)
const E_LAB = (t) =>
  `[...document.querySelectorAll('label')].find(l => l.textContent.trim() === ${JSON.stringify(t)})`
const E_TRIGGER = (t) =>
  `(() => { const lab = ${E_LAB(t)}; if (!lab || !lab.nextElementSibling) return null;` +
  ` return lab.nextElementSibling.querySelector(':scope > button') || null })()`
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
    `http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(BASE + '/')}`, { method: 'PUT' })
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
  const evaluateRetry = async (expression, tries = 60) => {
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
  const nav = async (url) => { await send('Page.navigate', { url }); await sleep(500) }
  const clickPath = async (clickExpr, suffix, what) => {
    // Buttons only render once league data has loaded — give the live
    // connection the full WAIT_MS budget before declaring the click failed.
    const t0 = Date.now()
    let clicked = false
    while (Date.now() - t0 < WAIT_MS) {
      try { if (await evaluate(clickExpr)) { clicked = true; break } } catch { /* mid-nav */ }
      await sleep(300)
    }
    if (!clicked) throw new Error(`click failed: ${what}`)
    await waitFor(E_PATH_ENDS(suffix), what)
  }

  // ---- boot at root, seed, reload (prefs only load at boot) ---------------
  await nav(`${BASE}/`)
  await waitFor(E_MOUNT, 'app mount at root')
  await evaluateRetry(E_SEED(SEED))
  await send('Page.reload', {})
  await waitFor(E_MOUNT, 'app remount after seed')

  // ---- Standings ----------------------------------------------------------
  await clickPath(E_CLICK_TEXT('Just browse'), '/home', 'client nav to /home')
  await clickPath(E_CLICK_HREF('/standings'), '/standings', 'client nav to /standings')

  let st = await waitFor(E_STATE_IF(`s.div === 'U14' && s.tier === 'Tier 1'`), 'seeded U14/Tier 1 on live Standings')
  check('LIVE Standings: seeded state (U14, Tier 1)', st.div === 'U14' && st.tier === 'Tier 1', JSON.stringify(st))
  check('LIVE Standings: no gate when seeded', !(await evaluate(E_TEXT('Choose a tier to see standings'))))

  await evaluateRetry(E_SET('div', 'U15'))
  st = await stateWhere(`s.div === 'U15' && s.tier === 'Tier 1'`, 'tier kept after U14 -> U15 (live)')
  check('LIVE Standings: tier kept (U14 -> U15)', st && st.tier === 'Tier 1', JSON.stringify(st))
  check('LIVE Standings: rows shown, no gate', !(await evaluate(E_TEXT('Choose a tier to see standings'))))

  await evaluateRetry(E_SET('div', 'U09'))
  st = await stateWhere(`s.div === 'U09' && s.tier === 'ALL'`, 'tier reset after U14 -> U09 (live)')
  check('LIVE Standings: tier reset (U14 -> U09)', st && st.tier === 'ALL', JSON.stringify(st))
  await waitFor(E_TEXT('Choose a tier to see standings'), 'tier gate on live Standings')
  check('LIVE Standings: tier gate shown after reset', true)

  // ---- Schedule -----------------------------------------------------------
  await clickPath(E_CLICK_HREF('/schedule'), '/schedule', 'client nav to /schedule')
  st = await waitFor(E_STATE_IF(`s.div === 'U09' && s.tier === 'ALL'`), 'filters persisted across pages (live)')
  check('LIVE Schedule: filters persisted from Standings (U09/ALL)', st.div === 'U09' && st.tier === 'ALL', JSON.stringify(st))

  await evaluateRetry(E_SET('div', 'U14'))
  await stateWhere(`s.div === 'U14'`, 'set U14 on Schedule')
  await evaluateRetry(E_SET('tier', 'Tier 1'))
  await stateWhere(`s.tier === 'Tier 1'`, 'set Tier 1 on Schedule')
  await evaluateRetry(E_SET('div', 'U15'))
  st = await stateWhere(`s.div === 'U15' && s.tier === 'Tier 1'`, 'tier kept after U14 -> U15 (live schedule)')
  check('LIVE Schedule: tier kept (U14 -> U15)', st && st.tier === 'Tier 1', JSON.stringify(st))
  check('LIVE Schedule: games shown, no gate', !(await evaluate(E_TEXT('Choose a tier to see games'))))

  await evaluateRetry(E_SET('div', 'U09'))
  st = await stateWhere(`s.div === 'U09' && s.tier === 'ALL'`, 'tier reset on live Schedule')
  check('LIVE Schedule: tier reset (U14 -> U09)', st && st.tier === 'ALL', JSON.stringify(st))
  await waitFor(E_TEXT('Choose a tier to see games'), 'tier gate on live Schedule')
  check('LIVE Schedule: tier gate shown after reset', true)

  // ---- TeamFinder on the landing page (current season) --------------------
  await evaluateRetry(E_SEED(SEED27))
  await nav(`${BASE}/`)   // server-served root; picks up the reseeded prefs
  await waitFor(E_MOUNT, 'app mount for finder')
  if (!(await evaluateRetry(E_CLICK_TEXT('Find your team')))) throw new Error('Find your team click failed')
  await waitFor(E_HAS('Division'), 'finder division select')

  await evaluateRetry(E_CLICK('Division'))
  const allDivs = await waitFor(
    `(() => { const o = ${E_OPTIONS('Division')}; return o && o.length ? o : null })()`,
    'finder division options')
  await evaluateRetry(E_CLICK('Division')) // close; each loop iteration reopens

  let curDiv = null, keepT = null
  for (const d of allDivs) {
    await evaluateRetry(E_CLICK('Division'))
    await evaluateRetry(E_PICK('Division', d))
    await waitFor(`${E_LABEL('Division')} === ${JSON.stringify(d)}`, `picked division ${d}`)
    if (!(await evaluate(E_HAS('Tier')))) continue
    await evaluateRetry(E_CLICK('Tier'))
    const tiers = await evaluate(E_OPTIONS('Tier'))
    if (tiers && tiers.length) { curDiv = d; keepT = tiers[0]; await evaluateRetry(E_PICK('Tier', tiers[0])); break }
    await evaluateRetry(E_CLICK('Tier'))
  }
  check('LIVE TeamFinder: picked a division with tiers', Boolean(curDiv && keepT), `div=${curDiv} tier=${keepT}`)

  if (curDiv && keepT) {
    await waitFor(`${E_LABEL('Tier')} === ${JSON.stringify(keepT)}`, `tier ${keepT} selected`)
    let keepFound = false, resetFound = false
    for (const d of allDivs.filter((x) => x !== curDiv)) {
      await evaluateRetry(E_CLICK('Division'))
      await evaluateRetry(E_PICK('Division', d))
      await waitFor(`${E_LABEL('Division')} === ${JSON.stringify(d)}`, `picked division ${d}`)
      if (!(await evaluate(E_HAS('Tier')))) continue
      await evaluateRetry(E_CLICK('Tier'))
      const tiers = (await evaluate(E_OPTIONS('Tier'))) || []
      await evaluateRetry(E_CLICK('Tier')) // close without selecting
      const shown = await evaluate(E_LABEL('Tier'))
      if (tiers.includes(keepT)) {
        if (!keepFound) {
          check(`LIVE TeamFinder: tier kept (${curDiv} -> ${d}, has ${keepT})`, shown === keepT, `shows "${shown}"`)
          keepFound = true
        }
      } else if (!resetFound) {
        check(`LIVE TeamFinder: tier reset (${curDiv} -> ${d}, lacks ${keepT})`, shown === 'Choose a tier', `shows "${shown}"`)
        resetFound = true
      }
      if (keepFound && resetFound) break
    }
    if (!keepFound) check('LIVE TeamFinder: tier kept case', true, 'SKIPPED - no other division has this tier')
    if (!resetFound) check('LIVE TeamFinder: tier reset case', true, 'SKIPPED - every division has this tier')
  }

  // ---- Schedule browse with a followed team (the parent's report) --------
  // A saved active team whose competition matches the on-screen filters
  // must NOT narrow the list: browsing U15 Tier 1 shows every game in it
  // (teams the visitor does not follow included), no pin chip, and the own
  // team's games highlighted.
  await evaluateRetry(E_SEED(SEED_FOLLOW))
  await nav(`${BASE}/`)   // server-served root; prefs only load at boot
  await waitFor(E_MOUNT, 'app mount for followed-team browse')
  await waitFor(
    `location.pathname.includes('/home') || document.body.innerText.includes('Just browse')`,
    'home or landing for followed-team browse')
  if (await evaluateRetry(E_CLICK_TEXT('Just browse'))) {
    await waitFor(E_PATH_ENDS('/home'), 'client nav to /home (followed team)')
  }
  await clickPath(E_CLICK_HREF('/schedule'), '/schedule', 'client nav to /schedule (followed team)')

  st = await waitFor(E_STATE_IF(`s.div === 'U15' && s.tier === 'Tier 1'`), 'followed-team filters on live Schedule')
  check('LIVE Schedule: followed-team filters seeded', st && st.tier === 'Tier 1', JSON.stringify(st))
  check('LIVE Schedule: no pin chip on plain browse', !(await evaluateRetry(E_TEXT('Showing '))))
  check('LIVE Schedule: whole competition shown', await waitFor(E_TEXT('Ted Reeve'), 'a non-followed team in the live browse'))
  check('LIVE Schedule: own team highlighted', await evaluateRetry(`document.body.innerHTML.includes('from-nyhl-blue/5')`))

  // Card pin: scoped to the linked competition. The name "Vaughan Blue" is
  // reused across U07/U08/U14/U17 in 26-27 — none of those games may show.
  await clickPath(E_CLICK_HREF('/home'), '/home', 'back to /home')
  await clickPath(
    `(() => { const el=[...document.querySelectorAll('a')]` +
    `.find(a => (a.getAttribute('aria-label') || '') === 'Open Vaughan Blue schedule');` +
    ` if (!el) return false; el.click(); return true })()`,
    '/schedule', 'home card schedule button (aria-label)')
  await waitFor(E_TEXT('Showing Vaughan'), 'pin chip on card-pinned schedule')
  check('LIVE Schedule: card pin keeps its chip', true)
  check('LIVE Schedule: card pin shows the own-team game',
        await waitFor(E_TEXT('Leaside Red'), 'own U15 Tier 1 game under the pin'))
  check('LIVE Schedule: card pin scoped to U15 Tier 1',
        !(await evaluate(E_TEXT('George Bell'))))
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
