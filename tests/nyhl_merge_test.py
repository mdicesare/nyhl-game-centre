"""Offline checks of the standings merge/season-rebind logic (no network)."""
import json
import shutil
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scraper"))
import nyhl_scrape as m  # noqa: E402

results = []


def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("PASS  " if cond else "FAIL  ") + name + (f"  [{detail}]" if detail else ""))


def g(division, i=0, season="26-27"):
    return {"id": f"{division}-{i}", "division": division, "season": season,
            "homeTeam": {"name": f"H{i}", "logo": None},
            "awayTeam": {"name": f"A{i}", "logo": None},
            "date": "2026-09-01", "time": "18:00", "status": "scheduled",
            "arena": "Rink 1", "tier": "Tier 1", "gameType": "FS"}


def s(division, name, season="26-27"):
    return {"name": name, "division": division, "tier": "Tier 1",
            "season": season, "gameType": "FS", "logo": None,
            "gp": 1, "w": 1, "l": 0, "t": 0, "pts": 2, "winPct": 1.0,
            "gfAvg": 3.0, "gaAvg": 1.0, "last10": "1-0-0", "streak": "W1",
            "home": "1-0-0", "away": "0-0-0"}


# ---- unit: merge_by_division ----
u15 = [g("U15", i) for i in range(4)]
u14 = [g("U14", i) for i in range(6)]
merged = m.merge_by_division(u14, u15)
check("merge: new U15 added alongside existing U14",
      len(merged) == 10 and {"U14", "U15"} <= {x["division"] for x in merged},
      f"{len(merged)} rows")

u15b = [g("U15", i) for i in range(5)]
merged2 = m.merge_by_division(u15, u15b)
check("merge: re-scraped division is replaced, not duplicated",
      len(merged2) == 5, f"{len(merged2)} rows")

check("merge: empty new rows preserve existing (schedule-only run)",
      m.merge_by_division(u14, []) == u14)

check("merge: rows without division replace wholesale (nothing to key on)",
      m.merge_by_division(u14, [{"id": "x"}]) == [{"id": "x"}])

check("merge: empty existing + new = new",
      m.merge_by_division([], u15) == u15)


# ---- unit: merge_standings listed_tiers (retire unlisted tiers) ----
def row(division, tier, gt, name="Team"):
    r = s(division, name)
    r["tier"], r["gameType"] = tier, gt
    return r


existing_st = [
    row("U10", "Tier 1", "FS"),   # fabricated FS row in a WS-only pod
    row("U10", "Tier 1", "WS"),
    row("U10", "Tier 2", "FS"),
    row("U14", "Tier 1", "FS"),   # tier listed but its table came back empty
]
listed = {
    ("U10", "FS"): {"Tier 2"},                    # no Tier 1 in the FS list
    ("U10", "WS"): {"Tier 1", "Tier 2"},
    ("U14", "FS"): {"Tier 1"},
}
fresh_st = [row("U10", "Tier 2", "FS", "Fresh"), row("U10", "Tier 1", "WS", "Fresh")]

merged_st = m.merge_standings(existing_st, fresh_st, listed)
keys = [(r["division"], r["tier"], r["gameType"]) for r in merged_st]
check("standings merge: unlisted tier retired (U10 Tier 1 FS)",
      ("U10", "Tier 1", "FS") not in keys)
check("standings merge: listed-but-empty slice carried (U14 Tier 1 FS)",
      ("U14", "Tier 1", "FS") in keys)
check("standings merge: fresh rows replace their slices",
      keys.count(("U10", "Tier 2", "FS")) == 1
      and keys.count(("U10", "Tier 1", "WS")) == 1
      and all(r["name"] == "Fresh" for r in merged_st
              if r["division"] == "U10") and len(merged_st) == 3,
      f"{len(merged_st)} rows")
check("standings merge: without listed_tiers the stale row carries on",
      ("U10", "Tier 1", "FS")
      in [(r["division"], r["tier"], r["gameType"])
          for r in m.merge_standings(existing_st, fresh_st)])
check("standings merge: empty run leaves everything untouched",
      m.merge_standings(existing_st, [], listed) == existing_st)


# ---- integration: write_output ----
tmp = Path(tempfile.mkdtemp(prefix="nyhl_merge_"))
m.OUTPUT_DIR = tmp
meta = {"source": "agilex"}


def read(name):
    p = tmp / name
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None


# (a) first scrape of the new season: U15 only
m.write_output([g("U15", i) for i in range(4)], [s("U15", "Team A")], meta, "26-27")
snap = read("schedule-26-27.json")
check("write: fresh season creates snapshot with U15 only",
      snap and snap["gameCount"] == 4 and {x["division"] for x in snap["games"]} == {"U15"},
      f"{snap['gameCount'] if snap else 'missing'} games")
check("write: default schedule mirrors current season",
      read("schedule.json") and read("schedule.json")["season"] == "26-27")
check("write: standings snapshot written",
      read("standings-26-27.json") and read("standings-26-27.json")["teamCount"] == 1)

# (b) THE BUG: cron's U14 run the next morning must not delete U15
m.write_output([g("U14", i) for i in range(6)], [s("U14", "Team B")], meta, "26-27")
snap = read("schedule-26-27.json")
divs = {x["division"] for x in snap["games"]}
check("BUG: U14 run keeps the U15 data",
      snap["gameCount"] == 10 and divs == {"U14", "U15"},
      f"{snap['gameCount']} games, divisions={sorted(divs)}")
st = read("standings-26-27.json")
check("BUG: U14 standings run keeps U15 standings",
      st["teamCount"] == 2 and {x["division"] for x in st["standings"]} == {"U14", "U15"},
      f"{st['teamCount']} rows")

# (c) schedule-only run must not blank the standings snapshot
m.write_output([g("U14", i) for i in range(6)], [], meta, "26-27")
check("schedule-only run leaves standings snapshot intact",
      read("standings-26-27.json")["teamCount"] == 2,
      f"{read('standings-26-27.json')['teamCount']} rows")

# (d) shrink guard still fires for the divisions this run covers
before = json.dumps(read("schedule-26-27.json"))
m.write_output([g("U14", i) for i in range(2)], [s("U14", "Team B")], meta, "26-27")
check("shrink guard: 2 games vs 6 cached U14 games is rejected",
      json.dumps(read("schedule-26-27.json")) == before)

# (e) totally empty scrape writes nothing
before = json.dumps(read("schedule-26-27.json"))
m.write_output([], [], meta, "26-27")
check("empty scrape leaves every file untouched",
      json.dumps(read("schedule-26-27.json")) == before)

# (f) 25-26 defaults are preserved as a snapshot before being replaced
shutil.rmtree(tmp)
tmp = Path(tempfile.mkdtemp(prefix="nyhl_pres_"))
m.OUTPUT_DIR = tmp
(tmp / "schedule.json").write_text(json.dumps(
    {"season": "25-26", "gameCount": 310, "games": [g("U14", i, "25-26") for i in range(3)]}), encoding="utf-8")
(tmp / "standings.json").write_text(json.dumps(
    {"season": "25-26", "teamCount": 12, "standings": [s("U14", "Old", "25-26")]}), encoding="utf-8")
m.write_output([g("U15", i) for i in range(4)], [s("U15", "Team A")], meta, "26-27")
check("prior season snapshot preserved before defaults are replaced",
      read("schedule-25-26.json") and read("schedule-25-26.json")["season"] == "25-26"
      and read("standings-25-26.json")["season"] == "25-26")
check("defaults now hold the new season",
      read("schedule.json")["season"] == "26-27" and read("schedule.json")["gameCount"] == 4)

# (g) schedule page unavailable: standings must still be saved
sched_before = (tmp / "schedule-26-27.json").read_text(encoding="utf-8")
default_sched_before = (tmp / "schedule.json").read_text(encoding="utf-8")
m.write_output([], [s("U15", "Team B")], meta, "26-27", write_schedule=False)
check("schedule unavailable: schedule snapshot untouched",
      (tmp / "schedule-26-27.json").read_text(encoding="utf-8") == sched_before)
check("schedule unavailable: default schedule untouched",
      (tmp / "schedule.json").read_text(encoding="utf-8") == default_sched_before)
st_g = read("standings-26-27.json")
check("schedule unavailable: standings still written",
      st_g and st_g["teamCount"] == 1 and st_g["standings"][0]["name"] == "Team B",
      st_g["standings"][0]["name"] if st_g else "missing")

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} passed")
shutil.rmtree(tmp, ignore_errors=True)
sys.exit(1 if failed else 0)
