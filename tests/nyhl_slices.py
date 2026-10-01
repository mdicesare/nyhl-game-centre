"""Group the wrong-type rows by slice to see the pattern."""
import json
from collections import defaultdict
from pathlib import Path

def load(p):
    return json.load(open(p, encoding='utf-8'))

ROOT = Path(__file__).resolve().parents[1]
sch = load(ROOT / 'public' / 'data' / 'schedule-25-26.json')
st = load(ROOT / 'public' / 'data' / 'standings-25-26.json')

rec = defaultdict(lambda: defaultdict(lambda: dict(
    n=0, w=0, l=0, t=0, gf=0, ga=0)))
for g in sch['games']:
    s = g.get('score') or {}
    if s.get('away') is None or s.get('home') is None:
        continue
    for side in ('awayTeam', 'homeTeam'):
        key = ((g.get('division') or '').lower(), (g.get('tier') or '').lower(),
               g[side]['name'].lower(), g.get('gameType'))
        r = rec[key][g.get('gameType')]
        home = side == 'homeTeam'
        mine, theirs = (s['home'], s['away']) if home else (s['away'], s['home'])
        r['n'] += 1; r['gf'] += mine; r['ga'] += theirs
        if mine > theirs: r['w'] += 1
        elif mine < theirs: r['l'] += 1
        else: r['t'] += 1

def tup(r):
    return (r['n'], r['w'], r['l'], r['t'], r['gf'], r['ga'])

slices = defaultdict(lambda: {'isWS': 0, 'ok': 0, 'nomatch': 0, 'teams': []})
for t in st['standings']:
    gt = t.get('gameType')
    div, tier = (t.get('division') or '').lower(), (t.get('tier') or '').lower()
    key = (div, tier, t['name'].lower(), gt)
    want = (t.get('gp'), t.get('w'), t.get('l'), t.get('t'), t.get('gf'), t.get('ga'))
    own = rec.get(key, {}).get(gt)
    sl = slices[(div, tier, gt)]
    if own and tup(own) == want:
        sl['ok'] += 1
        continue
    hit = None
    for ogt in ('FS', 'WS', 'PO', 'PB'):
        if ogt == gt: continue
        o = rec.get((div, tier, t['name'].lower(), ogt), {}).get(ogt)
        if o and tup(o) == want:
            hit = ogt
            break
    if hit:
        sl['isWS'] += 1
        sl['teams'].append(f"{t['name']}(GP{t.get('gp')})")
    else:
        sl['nomatch'] += 1

print(f"{'slice':<34} {'ok':>4} {'isWS':>5} {'nom':>4}  teams-with-wrong-record")
for k in sorted(slices):
    sl = slices[k]
    if sl['isWS'] or sl['nomatch']:
        flag = ' <== WRONG-TYPE' if sl['isWS'] else ''
        print(f"{k[0]}/{k[1]}/{k[2]:<20} {sl['ok']:>4} {sl['isWS']:>5} {sl['nomatch']:>4}  "
              f"{', '.join(sl['teams'][:12])}{flag}")
print('\nAll slices (summary):')
for k in sorted(slices):
    sl = slices[k]
    print(f"  {k[0]}/{k[1]}/{k[2]}: ok={sl['ok']} isWS={sl['isWS']} nomatch={sl['nomatch']}")
