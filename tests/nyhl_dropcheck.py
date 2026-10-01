"""Live test of the listed_tiers drop: walk U13 only, merge, expect its
fabricated u13/tier 2/FS slice to retire while un-walked divisions keep
theirs (scope check) and every healthy slice survives."""
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scraper'))
import nyhl_scrape as ns  # noqa: E402

SEASON = '25-26'
existing = json.load(open(
    ROOT / 'public' / 'data' / f'standings-{SEASON}.json',
    encoding='utf-8'))['standings']

listed = {}
rows = ns.scrape_standings(
    ns.create_session(), season=SEASON, division='ALL',
    only_divisions={'u13'}, listed_tiers=listed)
listed_view = {f'{k[0]}/{k[1]}': sorted(v) for k, v in listed.items()}
print('listed_tiers:', listed_view)
print('fresh u13 rows:', len(rows))

assert set(listed) == {('U13', 'FS'), ('U13', 'WS')}, listed_view
assert listed[('U13', 'FS')] == {'Tier 1', 'Tier 3'}, listed_view
assert listed[('U13', 'WS')] == {'Tier 1', 'Tier 2', 'Tier 3'}, listed_view

# A fabricated row in an un-walked division must survive the merge: the
# listed_tiers gate may only touch slices this run actually walked.
existing.append(dict(existing[0], division='UZZ', tier='Tier 9'))

merged = ns.merge_standings(existing, rows, listed)

stale = [r for r in merged
         if r.get('division') == 'U13' and r.get('tier') == 'Tier 2'
         and r.get('gameType') == 'FS']
print('stale u13/tier 2/FS rows remaining:', len(stale))
assert not stale, 'stale slice was not dropped'

u13 = [r for r in merged if r.get('division') == 'U13']
print('u13 rows after merge:', len(u13),
      sorted({(r['tier'], r['gameType']) for r in u13}))
assert len(u13) == 48, len(u13)   # the fresh walk replaces every walked u13 slice

# Scope: every un-walked slice must keep exactly its rows (stale or not) —
# the listed_tiers gate may only drop within slices walked this run.
def slice_counts(rs):
    c = Counter((r.get('division'), r.get('tier'), r.get('gameType')) for r in rs)
    return {k: n for k, n in c.items() if k[0] != 'U13'}

assert slice_counts(merged) == slice_counts(existing), 'un-walked slices changed'
assert len([r for r in merged if r.get('division') == 'UZZ']) == 1, \
    'stale row in an un-walked division was dropped'
print(f'un-walked slices preserved exactly: {len(slice_counts(existing))}')

existing_u13 = len([r for r in existing if r.get('division') == 'U13'])
assert len(merged) == len(existing) - existing_u13 + len(rows), \
    (len(existing), existing_u13, len(rows), len(merged))
print(f"rows: {len(existing)} -> {len(merged)} "
      f"(walked u13 replaced: {existing_u13} -> {len(rows)} fresh)")
print('OK')
