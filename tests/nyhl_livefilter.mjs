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
 *   Analytics: tracker injected with the counter endpoint, route changes
 *              recorded, query-only pin toggles not counted as pageviews
 *              (count.js itself is network-blocked for this suite)
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
// Recorder standing in for the tracker: the app's usePageView calls
// window.goatcounter.count(), which lands in __gcHits instead of on the
// wire (count.js itself can't load — blocked below). Re-run after every
// full page load: a new document resets both objects.
const E_STUB_GC =
  `(() => { window.__gcHits = [];` +
  ` window.goatcounter = { no_onload: true, count: (v) => {` +
  `   window.__gcHits.push((v && v.path) || location.pathname); return true } };` +
  ` return true })()`

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
  // Start on about:blank, not the app: the tracker block below has to be in
  // place before the first page load, or the real count.js could slip in
  // between load and setup (the boot section navigates to BASE right after).
  const target = await waitForJson(
    `http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })
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
  // Block the analytics before the first load: test traffic must never
  // reach the counters, and the real count.js must not overwrite the
  // recorder stub installed after each load below.
  await send('Network.enable')
  await send('Network.setBlockedURLs', { urls: ['*gc.zgo.at*', '*goatcounter.com*'] })
  await nav(`${BASE}/`)
  await waitFor(E_MOUNT, 'app mount at root')
  await evaluateRetry(E_SEED(SEED))
  await send('Page.reload', {})
  await waitFor(E_MOUNT, 'app remount after seed')
  await evaluate(E_STUB_GC)

  const gcEndpoint = await evaluate(
    `(() => { const s = document.querySelector('script[data-goatcounter]');` +
    ` return s ? s.getAttribute('data-goatcounter') : null })()`)
  check('LIVE Analytics: tracker injected with the counter endpoint',
    gcEndpoint === 'https://nyhlcustom.goatcounter.com/count', String(gcEndpoint))

  // ---- Standings ----------------------------------------------------------
  await clickPath(E_CLICK_TEXT('Just browse'), '/home', 'client nav to /home')
  await clickPath(E_CLICK_HREF('/standings'), '/standings', 'client nav to /standings')

  check('LIVE Analytics: SPA route changes counted',
    await waitFor(
      `(window.__gcHits || []).some(p => p.endsWith('/home')) &&` +
      ` (window.__gcHits || []).some(p => p.endsWith('/standings'))`,
      'recorded hits for /home and /standings'),
    JSON.stringify(await evaluate(`window.__gcHits || []`)))

  let st = await waitFor(E_STATE_IF(`s.div === 'U14' && s.tier === 'Tier 1'`), 'seeded U14/Tier 1 on live Standings')
  check('LIVE Standings: seeded state (U14, Tier 1)', st.div === 'U14' && st.tier === 'Tier 1', JSON.stringify(st))
  check('LIVE Standings: no gate when seeded', !(await evaluate(E_TEXT('Choose a tier to see standings'))))
  check('LIVE Standings: quick filter hidden without saved teams',
    !(await evaluate(`document.querySelectorAll('[aria-label^="Quick filter "]').length > 0`)))

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
  await evaluate(E_STUB_GC)
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
    // Each rule must be observed from a selected tier: visiting a division
    // without it clears the value (that IS the reset rule), so probe each
    // candidate from the original division with the tier back in place —
    // otherwise a division that has the tier looks like a keep failure just
    // because an earlier one reset it.
    const pickDivision = async (d) => {
      await evaluateRetry(E_CLICK('Division'))
      await evaluateRetry(E_PICK('Division', d))
      await waitFor(`${E_LABEL('Division')} === ${JSON.stringify(d)}`, `picked division ${d}`)
    }
    const tierOptionsNow = async () => {
      if (!(await evaluate(E_HAS('Tier')))) return null
      await evaluateRetry(E_CLICK('Tier'))
      const opts = (await evaluate(E_OPTIONS('Tier'))) || []
      await evaluateRetry(E_CLICK('Tier')) // close without selecting
      return opts
    }
    const ensureTier = async () => {
      if ((await evaluate(E_LABEL('Tier'))) === keepT) return
      await evaluateRetry(E_CLICK('Tier'))
      await evaluateRetry(E_PICK('Tier', keepT))
      await waitFor(`${E_LABEL('Tier')} === ${JSON.stringify(keepT)}`, `reselected ${keepT}`)
    }

    // Rule 1: switching to another division that also plays this tier keeps it.
    let keepFound = false
    for (const d of allDivs.filter((x) => x !== curDiv)) {
      await pickDivision(curDiv)
      await ensureTier()
      await pickDivision(d)
      const tiers = await tierOptionsNow()
      if (!tiers || !tiers.includes(keepT)) continue
      const shown = await evaluate(E_LABEL('Tier'))
      check(`LIVE TeamFinder: tier kept (${curDiv} -> ${d}, has ${keepT})`, shown === keepT, `shows "${shown}"`)
      keepFound = true
      break
    }
    if (!keepFound) check('LIVE TeamFinder: tier kept case', true, 'SKIPPED - no other division has this tier')

    // Rule 2: a division without it resets to the gate — again probed with
    // the tier actually selected, or the check would pass off a stale clear.
    let resetFound = false
    for (const d of allDivs.filter((x) => x !== curDiv)) {
      await pickDivision(curDiv)
      await ensureTier()
      await pickDivision(d)
      const tiers = await tierOptionsNow()
      if (!tiers || tiers.includes(keepT)) continue
      const shown = await evaluate(E_LABEL('Tier'))
      check(`LIVE TeamFinder: tier reset (${curDiv} -> ${d}, lacks ${keepT})`, shown === 'Choose a tier', `shows "${shown}"`)
      resetFound = true
      break
    }
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
  await evaluate(E_STUB_GC)
  await waitFor(
    `location.pathname.includes('/home') || document.body.innerText.includes('Just browse')`,
    'home or landing for followed-team browse')
  if (await evaluateRetry(E_CLICK_TEXT('Just browse'))) {
    await waitFor(E_PATH_ENDS('/home'), 'client nav to /home (followed team)')
  }
  await clickPath(E_CLICK_HREF('/schedule'), '/schedule', 'client nav to /schedule (followed team)')

  st = await waitFor(E_STATE_IF(`s.div === 'U15' && s.tier === 'Tier 1'`), 'followed-team filters on live Schedule')
  check('LIVE Schedule: followed-team filters seeded', st && st.tier === 'Tier 1', JSON.stringify(st))
  check('LIVE Schedule: no pin on plain browse', !(await evaluate(`location.search.includes('team=')`)))
  check('LIVE Schedule: whole competition shown', await waitFor(E_TEXT('Ted Reeve'), 'a non-followed team in the live browse'))
  check('LIVE Schedule: own team highlighted', await evaluateRetry(`document.body.innerHTML.includes('from-nyhl-blue/5')`))

  // ---- Quick team filter (one tap back to a saved team) -------------------
  // The chip must exist for a saved team and land in the same pin state the
  // card link produces below — so drop it again (its chip's ✕) and restore
  // the plain browse, keeping that next segment just as strict as before.
  check('LIVE Schedule: quick team filter present',
    await waitFor(`document.querySelectorAll('[aria-label^="Quick filter "]').length === 1`,
      'quick filter chip on live Schedule'))
  const CHIP_SEL = '[aria-label="Quick filter Vaughan Blue"]'
  const E_CHIP_LIT =
    `(() => { const c = document.querySelector('${CHIP_SEL}');` +
    ` return !!c && c.getAttribute('aria-pressed') === 'true' })()`
  const E_CHIP_CLICK =
    `(() => { const c = document.querySelector('${CHIP_SEL}');` +
    ` if (!c) return false; c.click(); return true })()`
  // The pin only changes the query string — pathname-only counting in
  // usePageView means these toggles must not show up as pageviews.
  const hitsBeforePin = await evaluate(`(window.__gcHits || []).length`)
  await waitFor(E_CHIP_CLICK, 'quick filter chip click')
  await waitFor(E_CHIP_LIT, 'lit chip after the quick filter click')
  check('LIVE Schedule: quick filter pins the team (chip lit)',
    await evaluate(`!document.body.innerText.includes('Showing ')`),
    'pill stays hidden for a saved team')
  // The lit chip is also the way back: tap it again and the pin drops.
  await waitFor(E_CHIP_CLICK, 'active chip click (toggle off)')
  await waitFor(
    `(() => { const c = document.querySelector('${CHIP_SEL}');` +
    ` return !!c && c.getAttribute('aria-pressed') === 'false' &&` +
    ` !location.search.includes('team=') })()`,
    'pin dropped by the chip toggle')
  await waitFor(E_TEXT('Ted Reeve'), 'whole competition back after the chip toggle')
  check('LIVE Schedule: active chip toggles the pin off', true)
  const hitsAfterPin = await evaluate(`(window.__gcHits || []).length`)
  check('LIVE Analytics: pin toggle (query-only) is not a pageview',
    hitsAfterPin === hitsBeforePin, `${hitsBeforePin} -> ${hitsAfterPin} hits`)

  // Card pin: scoped to the linked competition. The name "Vaughan Blue" is
  // reused across U07/U08/U14/U17 in 26-27 — none of those games may show.
  await clickPath(E_CLICK_HREF('/home'), '/home', 'back to /home')
  await clickPath(
    `(() => { const el=[...document.querySelectorAll('a')]` +
    `.find(a => (a.getAttribute('aria-label') || '') === 'Open Vaughan Blue schedule');` +
    ` if (!el) return false; el.click(); return true })()`,
    '/schedule', 'home card schedule button (aria-label)')
  await waitFor(E_CHIP_LIT, 'active quick chip on card-pinned schedule')
  check('LIVE Schedule: card pin marked by the active chip',
    await evaluate(`!document.body.innerText.includes('Showing ')`),
    'pill hidden — the chip carries the pin for a saved team')
  check('LIVE Schedule: card pin shows the own-team game',
        await waitFor(E_TEXT('Leaside Red'), 'own U15 Tier 1 game under the pin'))
  check('LIVE Schedule: card pin scoped to U15 Tier 1',
        !(await evaluate(E_TEXT('George Bell'))))

  // ---- Game type filter (fall / winter / playoffs) ------------------------
  // Drop the pin first (tap its lit quick chip — the pill's ✕ stays hidden
  // while a chip carries the pin), then check the type select: a fall-only
  // slice offers only what it plays, and a season with all four types
  // narrows and restores the list.
  if (await evaluateRetry(E_CHIP_CLICK)) {
    await waitFor(E_TEXT('Ted Reeve'), 'whole competition back after the pin drops')
  }
  check('LIVE Schedule: pin dropped for the type segment',
    !(await evaluate(`location.search.includes('team=')`)))

  const E_TYPE_SELECT =
    `(() => { const s=[...document.querySelectorAll('select')]` +
    `.find(s => [...s.options].some(o => o.value==='FS'));` +
    ` if (!s) return null;` +
    ` return { opts: [...s.options].map(o => o.textContent.trim()) }; })()`
  const E_SET_TYPE = (v) =>
    `(() => { const s=[...document.querySelectorAll('select')]` +
    `.find(s => [...s.options].some(o => o.value==='FS'));` +
    ` if (!s) return false;` +
    ` s.value=${JSON.stringify(v)};` +
    ` s.dispatchEvent(new Event('change', { bubbles:true })); return true })()`
  const E_SET_SEASON = (v) =>
    `(() => { const s=[...document.querySelectorAll('select')]` +
    `.find(s => [...s.options].some(o => o.value===${JSON.stringify(v)}));` +
    ` if (!s) return false;` +
    ` s.value=${JSON.stringify(v)};` +
    ` s.dispatchEvent(new Event('change', { bubbles:true })); return true })()`
  const E_CARDS = `document.querySelectorAll('button.rounded-xl').length`
  const E_BADGE = (t) =>
    `(() => [...document.querySelectorAll('button.rounded-xl span')].some(s => s.textContent === ${JSON.stringify(t)}))()`

  const ty = await waitFor(E_TYPE_SELECT, 'type select on live Schedule')
  check('LIVE Schedule: type select is data-derived (fall-only slice)',
    ty.opts.includes('All types') && ty.opts.includes('Fall Season') && !ty.opts.includes('Winter Season'),
    JSON.stringify(ty.opts))
  check('LIVE Schedule: rows carry a fall badge',
    await waitFor(E_BADGE('Fall'), 'fall badge on a live row'))

  // 25-26 U14 Tier 1 is frozen data with all four types: winter narrows the
  // list to its games (badged Winter), All types puts the whole slice back.
  await evaluateRetry(E_SET_SEASON('25-26'))
  await waitFor(
    `(() => { const s=[...document.querySelectorAll('select')].find(s => [...s.options].some(o => o.value==='25-26')); return s && s.value==='25-26' })()`,
    'season select on 25-26')
  await evaluateRetry(E_SET('div', 'U14'))
  await evaluateRetry(E_SET('tier', 'Tier 1'))
  const ty4 = await waitFor(
    `(() => { const t = ${E_TYPE_SELECT}; return t && t.opts.includes('Playoff Round Robin') ? t : null })()`,
    'all four types offered on 25-26 U14 Tier 1')
  check('LIVE Schedule: 25-26 slice offers all four types',
    ty4.opts.includes('Winter Season'), JSON.stringify(ty4.opts))

  await waitFor(`${E_CARDS} > 0`, 'game cards on 25-26 U14 Tier 1')
  const allCount = await evaluate(E_CARDS)
  await evaluateRetry(E_SET_TYPE('WS'))
  await waitFor(`${E_CARDS} > 0 && ${E_CARDS} < ${allCount}`, 'winter narrows the live list')
  check('LIVE Schedule: winter narrows the list', true, `${allCount} -> ${await evaluate(E_CARDS)}`)
  check('LIVE Schedule: narrowed rows are badged Winter', await evaluate(E_BADGE('Winter')))

  await evaluateRetry(E_SET_TYPE('ALL'))
  await waitFor(`${E_CARDS} === ${allCount}`, 'all types restore the live list')
  check('LIVE Schedule: all types restore the list', true, `${allCount} cards`)
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
