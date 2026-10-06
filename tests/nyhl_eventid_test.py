"""Offline checks for the standings event discovery (no network).

The site hands out its page -> event mapping through Event.js; NYHL's
standings event has been re-created more than once (162 -> 171 -> 185) and
walks against a stale id answer with a page that carries no table at all,
which reads as "nothing published" and keeps the old zeros forever. These
checks pin the parser against the real file, the resolver's three paths
offline, and the row parser against a real response from the current event.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scraper"))
import nyhl_scrape as m  # noqa: E402

REAL_EVENT_JS = (ROOT / "tests" / "fixtures" / "event.js").read_text(
    encoding="utf-8")

failed = 0


def check(label, ok, detail=""):
    global failed
    failed += 0 if ok else 1
    print(f"{'PASS' if ok else 'FAIL'}  {label}"
          + (f" -> {detail}" if detail else ""))


# --- parse_standings_event_id ------------------------------------------------

cases = [
    # The real file as served by the site (captured 2026-10-05).
    ("real Event.js (2026-10-05)", REAL_EVENT_JS, 185),
    ("minified one-liner",
     "var g_EventID={NYHL:{Standings:162,Schedules:162}}", 162),
    ("NYHL block without Standings",
     "var g_EventID = { NYHL: { Schedules: 176 } };", None),
    ("Standings outside the NYHL block is a red herring",
     "// Standings: 999\nvar g_EventID = { NYHL: { Schedules: 1 } };", None),
    ("no NYHL client",
     "var g_EventID = { OHL: { Standings: 9 } };", None),
    ("non-numeric id",
     "var g_EventID = { NYHL: { Standings: abc } };", None),
    ("garbage", "<html>404 Not Found</html>", None),
    ("empty", "", None),
]
for label, js, want in cases:
    got = m.parse_standings_event_id(js)
    check(f"parse: {label}", got == want, f"{got} (want {want})")

# --- resolve_standings_event: fallback / adoption / cache, offline -----------

original_fetch = m.request_with_retry
original_url = m.STANDINGS_URL
try:
    # 1) map fetch fails -> the fallback URL stays put.
    m._STANDINGS_EVENT_RESOLVED = False
    m.STANDINGS_URL = "https://example.invalid/Standings.aspx?event=0"
    m.request_with_retry = lambda *a, **k: None
    got = m.resolve_standings_event(None)
    check("resolver: failed map keeps fallback URL",
          got == "https://example.invalid/Standings.aspx?event=0", got)

    # 2) a live map -> the reported event id is adopted.
    m._STANDINGS_EVENT_RESOLVED = False

    class FakeResp:
        text = REAL_EVENT_JS

    m.request_with_retry = lambda *a, **k: FakeResp()
    got = m.resolve_standings_event(None)
    check("resolver: live map adopted",
          got.endswith("/Standings.aspx?event=185"), got)

    # 3) already resolved -> no fetch, URL unchanged.
    m.request_with_retry = lambda *a, **k: (_ for _ in ()).throw(
        AssertionError("resolver fetched on the cached path"))
    got = m.resolve_standings_event(None)
    check("resolver: cached path is network-free",
          got == m.STANDINGS_URL and got.endswith("event=185"), got)
finally:
    m.request_with_retry = original_fetch
    m.STANDINGS_URL = original_url
    m._STANDINGS_EVENT_RESOLVED = False

# --- parse_standings_table against a real response from event 185 ------------
# U15 Tier 1 after the first completed game (Vaughan Blue 4-2 Leaside,
# 2026-10-05) — the table the stale event 171 stopped serving entirely.

html = (ROOT / "tests" / "fixtures" / "standings_u15_fs_event185.html").read_text(
    encoding="utf-8")
rows = m.parse_standings_table(html)
by_name = {r["name"]: r for r in rows}


def row(name, **want):
    got = by_name.get(name)
    return got is not None and all(got.get(k) == v for k, v in want.items())


row_checks = [
    ("10 rows parsed", len(rows) == 10),
    ("all rows U15 / Tier 1",
     all(r.get("division") == "U15" and r.get("tier") == "Tier 1" for r in rows)),
    ("Vaughan Blue 1 GP, win 4-2, 2 pts",
     row("VAUGHAN BLUE", gp=1, w=1, l=0, pts=2, gf=4, ga=2)),
    ("Leaside Red 1 GP, loss 2-4",
     row("LEASIDE RED", gp=1, w=0, l=1, pts=0, gf=2, ga=4)),
    ("a team still at 0 GP",
     row("NORTH TORONTO", gp=0, w=0, pts=0)),
]
for label, ok in row_checks:
    check(f"fixture response: {label}", ok)

total = len(cases) + 3 + len(row_checks)
print(f"\n{total - failed}/{total} passed")
sys.exit(1 if failed else 0)
