"""Quick fix: scrape just standings for U14 and merge into existing data."""
import json
import sys
sys.path.insert(0, str(__import__('pathlib').Path(__file__).resolve().parent))
from nyhl_scrape import create_session, scrape_standings, throttle

DATA_DIR = __import__('pathlib').Path(__file__).resolve().parent.parent / "public" / "data"

session = create_session()

# Scrape U14 standings for all game types
print("Scraping U14 Tier 1 standings...")
standings = scrape_standings(session, season="25-26", division="U14", tier="ALL")
print(f"Got {len(standings)} standings entries")
for s in standings:
    print(f"  {s['name']:20s} {s['division']:5s} {s['tier']:8s} GP={s['gp']} W={s['w']} L={s['l']} PTS={s['pts']}")

# Also scrape Tier 2 and Tier 3
for tier in ["Tier 2", "Tier 3"]:
    tier_standings = scrape_standings(session, season="25-26", division="U14", tier=tier)
    print(f"  {tier}: {len(tier_standings)} entries")
    standings.extend(tier_standings)

# Load existing schedule data and merge standings
schedule_path = DATA_DIR / "schedule.json"
standings_path = DATA_DIR / "standings.json"

with open(schedule_path, "r", encoding="utf-8") as f:
    schedule_data = json.load(f)

# Build the standings payload
from datetime import datetime
now = datetime.utcnow().isoformat() + "Z"

standings_payload = {
    "season": "25-26",
    "lastUpdated": now,
    "standings": standings,
    "metadata": schedule_data.get("metadata", {}),
}

with open(standings_path, "w", encoding="utf-8") as f:
    json.dump(standings_payload, f, indent=2, ensure_ascii=False)
print(f"\nWrote {len(standings)} standings to {standings_path}")
