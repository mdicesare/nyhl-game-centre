# Tests

Suites for the scraper, the data and the app. Every suite derives its paths
from its own location, so run them from anywhere. Exit code 0 = pass.

## Scraper (offline)

| command | checks | what it guards |
|---|---|---|
| `python tests/nyhl_merge_test.py` | 23 | merge/season-rebind/write logic: slices replaced not duplicated, `listed_tiers` drop, shrink/empty-run guards, snapshot handling |
| `python tests/nyhl_health_test.py` | 3 | page-health predicates: throttle stub, hollow vs full ViewState |

## Data (offline, validates the committed `public/data`)

| command | what it guards |
|---|---|
| `python tests/nyhl_fullcheck.py` | every standings row must equal the schedule-derived record; **exits 1 on wrong-type rows** (known source quirks land in NO-MATCH and stay informational) |
| `python tests/nyhl_slices.py` | groups NO-MATCH/wrong rows by slice (diagnostic, always exit 0) |

## Scraper (live — hits agilex.ca with the polite 2 s throttle)

| command | what it guards |
|---|---|
| `python tests/nyhl_dropcheck.py` | `listed_tiers` drop: walked slice replaced fresh, stale listed-but-missing tier retired, un-walked slices (incl. a fabricated stale row) preserved |

## UI batteries (need a build + preview server)

```
npm run build
npm.cmd run preview -- --port 4173 --strictPort
powershell -NoProfile -ExecutionPolicy Bypass -File tests/nyhl-uitest.ps1    # 74 checks
powershell -NoProfile -ExecutionPolicy Bypass -File tests/nyhl-histtest.ps1  # 22 checks
```

The batteries write their seed HTML files into `dist/` themselves (the
preview server's document root) — rerun `npm run build` afterwards to clear
them.

## CDP suites (headless Chrome)

```
node tests/nyhl_filtercheck.mjs   # 15 — division/tier gates + keep rules   (default :4173)
node tests/nyhl_starcheck.mjs     #  5 — star marks the exact team instance (default :4173)
node tests/nyhl_404check.mjs      # 10 — 404 shim contract                  (needs the sim server below)
node tests/nyhl_livefilter.mjs    # 18 — filter persistence + followed-team browse on production   (hits the live site)
```

Environment overrides: `BASE_URL` (target site), `WAIT_MS` (load patience),
`CHROME_PATH` (only needed when Chrome is not at the Windows default).

404 sim server — GitHub Pages semantics (404 status **plus** a `404.html`
body), which `vite preview` does not reproduce:

```
python tests/nyhl_simserver.py [DIST] [PORT]   # defaults: <repo>/dist, 4180
```

## CI

Every push to `main` runs the three offline Python suites in GitHub Actions
(`deploy.yml` → Tests job) and blocks the deploy until they pass. The UI
batteries are local-only for now.
