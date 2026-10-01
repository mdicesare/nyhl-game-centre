"""Full-record agreement: standings row vs schedule-derived record per team+type.
Only GP-equal was checked before; verify W-L-T/GF/GA/home/away too."""
import json
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def season_check(season):
    sch = json.load(open(ROOT / 'public' / 'data' / f'schedule-{season}.json',
                         encoding='utf-8'))
    st = json.load(open(ROOT / 'public' / 'data' / f'standings-{season}.json',
                        encoding='utf-8'))

    rec = defaultdict(lambda: defaultdict(lambda: [0, 0, 0, 0, 0, 0, 0, 0, 0]))
    # w,l,t,gf,ga,hw,hl,ht,aw,al,at -> use dict instead
    rec = defaultdict(lambda: defaultdict(lambda: dict(
        n=0, w=0, l=0, t=0, gf=0, ga=0, hw=0, hl=0, ht=0, aw=0, al=0, at=0)))
    for g in sch['games']:
        s = g.get('score') or {}
        if s.get('away') is None or s.get('home') is None:
            continue
        for side in ('awayTeam', 'homeTeam'):
            # Key lowercased: the app compares team/division/tier names with
            # toLowerCase() everywhere, so only a case difference in the source
            # (Vaughan Jcc vs Vaughan JCC) is cosmetic, not a data mismatch.
            team = g[side]['name'].lower()
            key = ((g.get('division') or '').lower(), (g.get('tier') or '').lower(),
                   team, g.get('gameType'))
            r = rec[key][g.get('gameType')]
            home = side == 'homeTeam'
            mine = s['home'] if home else s['away']
            theirs = s['away'] if home else s['home']
            r['n'] += 1; r['gf'] += mine; r['ga'] += theirs
            if mine > theirs:
                r['w'] += 1
                r['hw' if home else 'aw'] += 1
            elif mine < theirs:
                r['l'] += 1
                r['hl' if home else 'al'] += 1
            else:
                r['t'] += 1
                r['ht' if home else 'at'] += 1

    buckets = defaultdict(int)
    po_examples, own_examples, bad = [], [], []
    for t in st['standings']:
        gt = t.get('gameType')
        key = ((t.get('division') or '').lower(), (t.get('tier') or '').lower(),
               t['name'].lower(), gt)
        actual = rec.get(key, {}).get(gt)
        own = (actual and actual['n'] == t.get('gp')
               and actual['w'] == t.get('w') and actual['l'] == t.get('l')
               and actual['t'] == t.get('t') and actual['gf'] == t.get('gf')
               and actual['ga'] == t.get('ga')
               and f"{actual['hw']}-{actual['hl']}-{actual['ht']}" == (t.get('home') or '')
               and f"{actual['aw']}-{actual['al']}-{actual['at']}" == (t.get('away') or ''))
        if own:
            buckets['FULL-RECORD-OK'] += 1
            continue
        # search all types for a full-record match
        hit = None
        for ogt in ('FS', 'WS', 'PO', 'PB'):
            okey = ((t.get('division') or '').lower(), (t.get('tier') or '').lower(),
                    t['name'].lower(), ogt)
            o = rec.get(okey, {}).get(ogt)
            if (o and o['n'] == t.get('gp') and o['w'] == t.get('w')
                    and o['l'] == t.get('l') and o['t'] == t.get('t')
                    and o['gf'] == t.get('gf') and o['ga'] == t.get('ga')
                    and f"{o['hw']}-{o['hl']}-{o['ht']}" == (t.get('home') or '')
                    and f"{o['aw']}-{o['al']}-{o['at']}" == (t.get('away') or '')):
                hit = ogt
                break
        if hit:
            buckets[f'row-is-{hit}-record'] += 1
            if len(po_examples) < 6:
                po_examples.append((t['division'], t['tier'], t['name'], gt,
                                    t.get('gp'), hit))
        else:
            buckets['NO-MATCH'] += 1
            if len(bad) < 6:
                bad.append((t['division'], t['tier'], t['name'], gt, t.get('gp'),
                            actual['n'] if actual else 0))
    print(f'=== {season}: {len(st["standings"])} rows ===')
    for b, n in sorted(buckets.items()):
        print(f'  {b}: {n}')
    for e in po_examples:
        print(f'    wrong: {e[0]}/{e[1]} {e[2]} labeled {e[3]} GP={e[4]} but is {e[5]}')
    for e in bad:
        print(f'    no-match: {e[0]}/{e[1]} {e[2]} labeled {e[3]} GP={e[4]} sched={e[5]}')
    return sum(n for b, n in buckets.items() if b.startswith('row-is-'))

wrong = sum(season_check(s) for s in ('25-26', '24-25', '26-27'))
if wrong:
    print(f'FAIL: {wrong} wrong-type row(s)')
    sys.exit(1)
print('OK: no wrong-type rows')
