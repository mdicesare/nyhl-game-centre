"""Offline checks of the page-health predicates (no network)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scraper"))
import nyhl_scrape as m  # noqa: E402

STUB = ("<html><body><div>The requested URL is invalid.</div></body></html>")
HOLLOW = "<html><head></head><body>" + ("x" * 11000) + \
         '<input type="hidden" name="__VIEWSTATE" id="__VIEWSTATE" value="abc" /></body></html>'
HEALTHY = "<html><head></head><body>" + ("x" * 20000) + \
          '<input type="hidden" name="__VIEWSTATE" id="__VIEWSTATE" value="' + ("v" * 4588) + \
          '" /></body></html>'

cases = [
    ("rate-limit stub (253B)", STUB, True, False),
    ("hollow 11.6KB / VS 384", HOLLOW, False, False),
    ("healthy 22KB / VS 4588", HEALTHY, False, True),
]

failed = 0
for label, html, want_stub, want_vs in cases:
    got_stub = m.is_throttle_stub(html)
    got_vs = m.has_full_viewstate(html)
    ok = (got_stub == want_stub) and (got_vs == want_vs)
    failed += 0 if ok else 1
    print(f"{'PASS' if ok else 'FAIL'}  {label:26} "
          f"stub={got_stub}(want {want_stub})  full_vs={got_vs}(want {want_vs})")

# A POST response that is healthy must pass the default predicate too.
print(f"\nMIN_VIEWSTATE={m.MIN_VIEWSTATE}  marker={m.THROTTLE_MARKER!r}")
print(f"{len(cases) - failed}/{len(cases)} passed")
sys.exit(1 if failed else 0)
