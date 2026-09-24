#!/usr/bin/env python3
"""
NYHL Schedule & Standings Scraper

Scrapes the Agilex SSP WebForms application used by NYHL's Game Centre.
No REST API exists — we replay ASP.NET ViewState to fetch rendered HTML pages,
then parse the server-side tables into normalized JSON.

Usage:
    python nyhl_scrape.py                    # scrape current season, all divisions
    python nyhl_scrape.py --division U14     # one division only
    python nyhl_scrape.py --club "Vaughan"   # one club only
    python nyhl_scrape.py --team-id 12345    # one team by Agilex data-teamid
    python nyhl_scrape.py --season 25-26     # historical season
    python nyhl_scrape.py --dry-run          # parse but don't write files
"""

import argparse
import json
import logging
import os
import re
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

AGILEX_BASE = "https://www.agilex.ca/SSP/Hockey"
SCHEDULE_URL = f"{AGILEX_BASE}/schedules.aspx?event=176"
STANDINGS_URL = f"{AGILEX_BASE}/Standings.aspx?event=171"

VIEWSTATE_GENERATOR = "EBDC8456"  # observed stable across sessions

USER_AGENT = (
    "NYHL-GameCentre/1.0 "
    "(scraper; contact: your-email@example.com) "
    "Python-requests/"
)

THROTTLE_SECONDS = 2.0

# Schedule HTML table ID
SCHEDULE_TABLE_ID = "sche_repeater"
# Standings HTML table ID
STANDINGS_TABLE_ID = "st_tblRepeater"

# Date format for Agilex form posts
AGILEX_DATE_FMT = "%d-%b-%Y"  # e.g. 31-Aug-2026

# Output paths (relative to project root)
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "public" / "data"
LOGO_DIR = Path(__file__).resolve().parent.parent / "public" / "images" / "teams"

# Logo base URL on Agilex (relative to /SSP/Hockey/ pages, ../ resolves to /SSP/)
LOGO_BASE_URL = f"{AGILEX_BASE}/../Images/NYHL/Logo"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("nyhl_scraper")


# ---------------------------------------------------------------------------
# HTTP session
# ---------------------------------------------------------------------------

def create_session() -> requests.Session:
    s = requests.Session()
    s.headers.update({
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
    })
    return s


def throttle():
    time.sleep(THROTTLE_SECONDS)


# Agilex degrades in two ways while it is publishing or rate-limiting, both
# answered with HTTP 200 and no error status:
#   1. a 253-byte "The requested URL is invalid." stub
#   2. a full-size page whose ViewState collapsed to a few hundred bytes
# Case 2 is the dangerous one: the page looks fine by byte count, but with no
# ViewState ASP.NET posts back with no control state, renders no dropdowns and
# no rows, and the scrape records "0 games" as fact. A healthy page here
# carries ~4.5KB of ViewState.
THROTTLE_MARKER = "The requested URL is invalid"
MIN_VIEWSTATE = 1000


def is_throttle_stub(html: str) -> bool:
    return THROTTLE_MARKER in html or len(html) < 1000


def has_full_viewstate(html: str) -> bool:
    return len(extract_viewstate(html).get("__VIEWSTATE", "")) >= MIN_VIEWSTATE


def request_with_retry(do_request, *, label: str, healthy=None, attempts: int = 8,
                       fatal: bool = True):
    """Repeat a request until Agilex serves a usable page.

    Backs off 5s, 10s, 20s, 40s, 60s... A degraded window lasted about five
    minutes while the new season was being published, so the retries are sized
    to outlast one rather than give up inside it.

    fatal=False returns None instead of exiting, for callers whose dataset can
    be skipped without endangering the other one — a dead schedule page must
    not stop standings from updating.
    """
    is_ok = healthy if healthy is not None else (lambda text: not is_throttle_stub(text))
    delay = 5
    for attempt in range(1, attempts + 1):
        resp = None
        failure = None
        try:
            resp = do_request()
            resp.raise_for_status()
        except requests.RequestException as exc:
            # A read timeout or a 5xx is the same story as a degraded page:
            # Agilex is publishing or rate-limiting. Letting it escape would
            # kill the whole run with a traceback on one slow response
            # instead of backing off and retrying like any other failure.
            # Drop resp too — an error page whose body happens to look healthy
            # must never be returned as if the request had succeeded.
            resp = None
            failure = f"{exc.__class__.__name__}: {exc}"
        if resp is not None and is_ok(resp.text):
            return resp
        if failure is None:
            failure = f"unhealthy response ({len(resp.text)} bytes)"
        log.warning(
            "%s: %s — attempt %d/%d, backing off %ds",
            label, failure, attempt, attempts, delay,
        )
        if attempt < attempts:
            time.sleep(delay)
            delay = min(delay * 2, 60)
    if not fatal:
        log.warning(
            "%s: still unhealthy after %d attempts — continuing without this "
            "dataset; matching files will be left exactly as they are.",
            label, attempts,
        )
        return None
    log.error(
        "%s: still unhealthy after %d attempts. Aborting without writing "
        "anything so the site keeps its last good data.",
        label, attempts,
    )
    sys.exit(1)


# ---------------------------------------------------------------------------
# Logo handling
# ---------------------------------------------------------------------------

def extract_logo_codes(html: str) -> set[str]:
    """Extract unique team logo codes from HTML (data-alt on logo images)."""
    soup = BeautifulSoup(html, "lxml")
    codes = set()
    for img in soup.find_all("img", class_="logo-img"):
        code = img.get("data-alt", "").strip()
        if code:
            codes.add(code)
    return codes


def download_logos(session: requests.Session, codes: set[str], dry_run: bool = False) -> dict[str, str]:
    """
    Download team logos from Agilex. Returns a mapping of code -> local filename.
    Only downloads logos that don't already exist locally.
    """
    if not codes:
        return {}

    LOGO_DIR.mkdir(parents=True, exist_ok=True)
    mapping = {}

    for code in sorted(codes):
        filename = f"{code}.png"
        local_path = LOGO_DIR / filename
        mapping[code] = filename

        if local_path.exists():
            log.debug("Logo %s already exists, skipping", code)
            continue

        url = f"{LOGO_BASE_URL}/{filename}"
        try:
            if dry_run:
                log.info("Dry run: would download logo %s from %s", code, url)
                continue

            log.info("Downloading logo: %s", code)
            resp = session.get(url, timeout=15)
            if resp.status_code == 200 and len(resp.content) > 100:
                local_path.write_bytes(resp.content)
                log.info("Saved logo %s (%d bytes)", code, len(resp.content))
            else:
                log.warning("Logo %s not found or too small (%d bytes)", code, len(resp.content))
            throttle()
        except Exception as e:
            log.warning("Failed to download logo %s: %s", code, e)

    return mapping


def get_team_logo(team_data_attr: str) -> str:
    """
    Extract logo code from a pipe-delimited data attribute.
    e.g. "3250|NORTH TORONTO|25-26|U14|SL" -> we need the logo code
    which comes from the img data-alt, not this attribute.
    Returns empty string - logo codes come from extract_logo_codes().
    """
    return ""


# ---------------------------------------------------------------------------
# ViewState extraction
# ---------------------------------------------------------------------------

def extract_viewstate(html: str) -> dict:
    """Extract ASP.NET ViewState fields from raw HTML."""
    soup = BeautifulSoup(html, "lxml")
    fields = {}
    for name in ("__VIEWSTATE", "__VIEWSTATEGENERATOR", "__EVENTVALIDATION", "__VIEWSTATEENCRYPTED"):
        tag = soup.find("input", {"name": name})
        if tag:
            fields[name] = tag.get("value", "")
        else:
            fields[name] = ""
    # If VIEWSTATEGENERATOR missing from page, use known value
    if not fields.get("__VIEWSTATEGENERATOR"):
        fields["__VIEWSTATEGENERATOR"] = VIEWSTATE_GENERATOR
    log.info("ViewState extracted — __VIEWSTATE length: %d", len(fields.get("__VIEWSTATE", "")))
    return fields


# ---------------------------------------------------------------------------
# Schedule scraping
# ---------------------------------------------------------------------------

def fetch_schedule_page(
    session: requests.Session,
    viewstate: dict,
    *,
    event_id: int = 176,
    division: str = "ALL",
    tier: str = "ALL",
    game_type: str = "ALL",
    club: str = "ALL",
    arena: str = "ALL",
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    event_target: str = "ddlDiv",
) -> str:
    """POST to schedules.aspx and return rendered HTML."""
    payload = {
        "__VIEWSTATE": viewstate["__VIEWSTATE"],
        "__VIEWSTATEGENERATOR": viewstate["__VIEWSTATEGENERATOR"],
        "__EVENTTARGET": event_target,
        "__EVENTARGUMENT": "",
        "lbEventID": str(event_id),
        "ddlDiv": division,
        "ddlTier": tier,
        "ddlType": game_type,
        "ddlClub": club,
        "ddlArena": arena,
    }
    if date_from:
        payload["dpFrom"] = date_from
    if date_to:
        payload["dpTo"] = date_to

    resp = request_with_retry(
        lambda: session.post(SCHEDULE_URL, data=payload, timeout=60),
        label="schedule POST",
    )
    # DEBUG: dump raw response
    debug_path = Path(__file__).resolve().parent / "debug_schedule.html"
    debug_path.write_text(resp.text, encoding="utf-8")
    log.debug("DEBUG: wrote %s (%d bytes)", debug_path, len(resp.text))
    return resp.text


def parse_schedule_table(html: str) -> list[dict]:
    """
    Parse the schedule repeater table into structured rows.

    Actual column layout (0-indexed):
      0: Date          - "26-Oct-2025 Sun" with data='2025-10-26' attribute
      1: Time          - "4:50 PM"
      2: Away logo     - <img> with data-alt='XX' (team code)
      3: Away team     - <a> link text: "Parkwoods"
      4: Score         - "2 : 1" or empty
      5: Home logo     - <img> with data-alt='XX' (team code)
      6: Home team     - <a> link text: "West Hill"
      7: Div/Cat       - "U14 / Tier 3" (combined)
      8: Type          - "FS"
      9: Arena         - "Heron Park 1"
     10: Status        - (often empty for completed games)
     11: Extra         - LiveBarn link or empty
    """
    soup = BeautifulSoup(html, "lxml")
    table = soup.find("table", {"id": SCHEDULE_TABLE_ID})
    if not table:
        log.warning("Schedule table '%s' not found in response", SCHEDULE_TABLE_ID)
        return []

    rows = []
    for tr in table.find_all("tr"):
        cells = tr.find_all("td")
        if len(cells) < 10:
            continue

        # Extract date from data attribute on the first td
        date_cell = cells[0]
        iso_date = date_cell.get("data", "")
        date_text = date_cell.get_text(strip=True)

        # Extract time
        time_text = cells[1].get_text(strip=True)

        # Extract away team from <a> tag in cell 3
        away_link = cells[3].find("a")
        away_name = away_link.get_text(strip=True) if away_link else cells[3].get_text(strip=True)

        # Extract away logo code from cell 2
        away_logo = ""
        away_img = cells[2].find("img", class_="logo-img")
        if away_img:
            away_logo = away_img.get("data-alt", "").strip()

        # Extract score (cell 4) — format is "2 : 1" or empty
        score_text = cells[4].get_text(strip=True)

        # Extract home team from <a> tag in cell 6
        home_link = cells[6].find("a")
        home_name = home_link.get_text(strip=True) if home_link else cells[6].get_text(strip=True)

        # Extract home logo code from cell 5
        home_logo = ""
        home_img = cells[5].find("img", class_="logo-img")
        if home_img:
            home_logo = home_img.get("data-alt", "").strip()

        # Division/tier combined in cell 7 — e.g. "U14 / Tier 3"
        div_tier = cells[7].get_text(strip=True)
        division = ""
        tier = ""
        if " / " in div_tier:
            parts = div_tier.split(" / ", 1)
            division = parts[0].strip()
            tier = parts[1].strip()
        elif div_tier:
            division = div_tier

        # Game type (cell 8)
        game_type = cells[8].get_text(strip=True)

        # Arena (cell 9)
        arena = cells[9].get_text(strip=True)

        # Status (cell 10, if present)
        status = cells[10].get_text(strip=True) if len(cells) > 10 else ""

        row = {
            "date": iso_date or date_text,
            "time": time_text,
            "awayTeam": {"id": "", "name": away_name, "logo": away_logo},
            "score": score_text,
            "homeTeam": {"id": "", "name": home_name, "logo": home_logo},
            "division": division,
            "tier": tier,
            "gameType": game_type,
            "arena": arena,
            "status": status,
        }
        rows.append(row)

    log.info("Parsed %d schedule rows", len(rows))
    return rows


# ---------------------------------------------------------------------------
# Standings scraping
# ---------------------------------------------------------------------------

def fetch_standings_page(
    session: requests.Session,
    viewstate: dict,
    *,
    event_id: int = 162,
    division: str = "ALL",
    tier: str = "ALL",
    season: str = "",
    game_type: str = "FS",
    event_target: str = "ddlDiv",
) -> str:
    """POST to Standings.aspx and return rendered HTML."""
    payload = {
        "__VIEWSTATE": viewstate["__VIEWSTATE"],
        "__VIEWSTATEGENERATOR": viewstate["__VIEWSTATEGENERATOR"],
        "__EVENTTARGET": event_target,
        "__EVENTARGUMENT": "",
        "lbEventID": str(event_id),
        "lbGameType": game_type,
        "ddlDiv": division,
        "ddlTier": tier,
        "ddlType": game_type,
    }
    if season:
        payload["ddlSeason"] = season

    resp = request_with_retry(
        lambda: session.post(STANDINGS_URL, data=payload, timeout=60),
        label=f"standings POST ({game_type} {division} {tier})",
        # The full-size page with a collapsed ViewState answers 200 and parses
        # to "no rows", which is indistinguishable from a season that has not
        # been published — refuse it here rather than record that as fact.
        healthy=has_full_viewstate,
    )
    # DEBUG: dump raw standings response
    debug_path = Path(__file__).resolve().parent / "debug_standings.html"
    debug_path.write_text(resp.text, encoding="utf-8")
    log.debug("DEBUG: wrote %s (%d bytes)", debug_path, len(resp.text))
    return resp.text


def parse_standings_table(html: str) -> list[dict]:
    """
    Parse the standings repeater table into structured rows.

    Actual column layout (0-indexed):
      0: Logo        - <img> with data="3250|TEAM NAME|25-26|U14|SL"
      1: Team        - <a> with data-teamid="3250" and data="3250|TEAM|25-26|U14|Tier 1"
      2: GP          - games played
      3: W-L-T       - combined record "9-0-1"
      4: PTS         - points
      5: WIN%        - win percentage ".950"
      6: GFA         - goals for average
      7: GAA         - goals against average
      8: GF          - goals for (total)
      9: GA          - goals against (total)
     10: GF/GA       - ratio
     11: Home        - home record "4-0-1"
     12: Away        - away record "5-0-0"
     13: P10         - past 10 games
     14: Streak      - "Won 7"
     15: PIM         - penalty minutes
    """
    soup = BeautifulSoup(html, "lxml")
    # A chained tier response can carry more than one repeater table (the one
    # left over from the previous selection plus the new one). Reading only
    # the first silently drops whichever tier rendered second, so take them
    # all — the caller keys rows on the tier each row declares about itself.
    tables = soup.find_all("table", {"id": STANDINGS_TABLE_ID})
    if not tables:
        log.warning("Standings table '%s' not found in response", STANDINGS_TABLE_ID)
        return []

    rows = []
    for table in tables:
        for tr in table.find_all("tr"):
            cells = tr.find_all("td")
            if len(cells) < 13:
                continue

            # Extract team identity from the data attribute on the <a> tag
            # Format: "3250|TEAM NAME|25-26|U14|Tier 1"
            team_cell = cells[1]
            a_tag = team_cell.find("a")
            team_id = ""
            team_name = team_cell.get("data", "").strip()
            division = ""
            tier = ""
            if a_tag:
                data_attr = a_tag.get("data", "")
                parts = data_attr.split("|")
                if len(parts) >= 5:
                    team_id = parts[0].strip()
                    team_name = parts[1].strip()
                    division = parts[3].strip()
                    tier = parts[4].strip()
                elif len(parts) >= 2:
                    team_id = parts[0].strip()
                    team_name = parts[1].strip()

            # If team name still empty, try the text content
            if not team_name:
                team_name = team_cell.get_text(strip=True)

            # Parse W-L-T record (combined in one column)
            wlt_text = cells[3].get_text(strip=True)
            w, l, t = 0, 0, 0
            if "-" in wlt_text:
                wlt_parts = wlt_text.split("-")
                if len(wlt_parts) == 3:
                    try:
                        w = int(wlt_parts[0])
                        l = int(wlt_parts[1])
                        t = int(wlt_parts[2])
                    except ValueError:
                        pass

            def safe_int(text):
                text = text.strip().replace(",", "")
                try:
                    return int(text)
                except (ValueError, TypeError):
                    return 0

            def safe_float(text):
                text = text.strip().replace(",", "")
                try:
                    return float(text)
                except (ValueError, TypeError):
                    return 0.0

            # Extract logo code from cell 0 (<img data-alt='NT9'>)
            logo_code = ""
            logo_img = cells[0].find("img", class_="logo-img")
            if logo_img:
                logo_code = logo_img.get("data-alt", "").strip()

            row = {
                "teamId": team_id,
                "name": team_name,
                "logo": logo_code,
                "division": division,
                "tier": tier,
                "gp": safe_int(cells[2].get_text(strip=True)),
                "w": w,
                "l": l,
                "t": t,
                "pts": safe_int(cells[4].get_text(strip=True)),
                "winPct": safe_float(cells[5].get_text(strip=True)),
                "gfAvg": safe_float(cells[6].get_text(strip=True)),
                "gaAvg": safe_float(cells[7].get_text(strip=True)),
                "gf": safe_int(cells[8].get_text(strip=True)),
                "ga": safe_int(cells[9].get_text(strip=True)),
                "home": cells[11].get_text(strip=True),
                "away": cells[12].get_text(strip=True),
                "last10": cells[13].get_text(strip=True) if len(cells) > 13 else "",
                "streak": cells[14].get_text(strip=True) if len(cells) > 14 else "",
                "pim": safe_int(cells[15].get_text(strip=True)) if len(cells) > 15 else 0,
            }
            rows.append(row)

    log.info("Parsed %d standings rows", len(rows))
    return rows


# ---------------------------------------------------------------------------
# Season date range
# ---------------------------------------------------------------------------

def get_season_date_range(season: str) -> tuple[str, str]:
    """
    Return (start_date, end_date) for a NYHL season string like '26-27'.
    NYHL seasons run roughly late August through March/April.
    """
    # Parse "26-27" -> start year 2026, end year 2027
    parts = season.split("-")
    start_year = 2000 + int(parts[0])
    end_year = 2000 + int(parts[1])
    start = datetime(start_year, 8, 25)
    end = datetime(end_year, 4, 30)
    return start.strftime(AGILEX_DATE_FMT), end.strftime(AGILEX_DATE_FMT)


def current_season(today: Optional[datetime] = None) -> str:
    """
    Work out which NYHL season is running right now.
    Seasons run 25-Aug -> 30-Apr, so:
      Aug-Dec  -> the season starts this calendar year
      Jan-Jul  -> the season started last calendar year
    """
    today = today or datetime.now()
    start = (today.year % 100) if today.month >= 8 else (today.year % 100) - 1
    return f"{start:02d}-{(start + 1) % 100:02d}"


def season_is_complete(season: str, today: Optional[datetime] = None) -> bool:
    """True once the season's end date (30-Apr) has passed."""
    _, end_str = get_season_date_range(season)
    end = datetime.strptime(end_str, AGILEX_DATE_FMT)
    return (today or datetime.now()) > end


def read_json(path: Path) -> Optional[dict]:
    """Read a JSON file, returning None if missing or unreadable."""
    if not path.exists():
        return None
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def preserve_existing_snapshots() -> None:
    """
    Copy the default schedule/standings files into per-season snapshots
    before they get replaced. This is what lets completed seasons stay
    cached locally instead of being scraped again every morning.
    """
    for kind in ("schedule", "standings"):
        default = OUTPUT_DIR / f"{kind}.json"
        data = read_json(default)
        if not data:
            continue
        season = data.get("season")
        if not season:
            continue
        snap = OUTPUT_DIR / f"{kind}-{season}.json"
        if snap.exists():
            continue
        with open(snap, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        log.info("Preserved existing %s as %s", default.name, snap.name)


def chunk_date_range(start_str: str, end_str: str, chunk_days: int = 30) -> list[tuple[str, str]]:
    """Split a date range into 30-day chunks."""
    fmt = "%d-%b-%Y"
    start = datetime.strptime(start_str, fmt)
    end = datetime.strptime(end_str, fmt)
    chunks = []
    current = start
    while current < end:
        chunk_end = min(current + timedelta(days=chunk_days), end)
        chunks.append((
            current.strftime(fmt),
            chunk_end.strftime(fmt),
        ))
        current = chunk_end + timedelta(days=1)
    return chunks


# ---------------------------------------------------------------------------
# Filter options discovery
# ---------------------------------------------------------------------------

def extract_select_options(html: str, select_id: str) -> list[str]:
    """Extract option values from a <select> element."""
    soup = BeautifulSoup(html, "lxml")
    sel = soup.find("select", {"id": select_id})
    if not sel:
        return []
    return [opt.get("value", "") for opt in sel.find_all("option")]


def discover_filters(html: str) -> dict:
    """Extract available filter options from the schedule page."""
    return {
        "divisions": extract_select_options(html, "ddlDiv"),
        "tiers": extract_select_options(html, "ddlTier"),
        "gameTypes": extract_select_options(html, "ddlType"),
        "clubs": extract_select_options(html, "ddlClub"),
        "arenas": extract_select_options(html, "ddlArena"),
        "seasons": extract_select_options(html, "ddlSeason"),
    }


# ---------------------------------------------------------------------------
# Data normalization
# ---------------------------------------------------------------------------

def normalize_game(raw: dict, season: str) -> dict:
    """Normalize a raw scraped schedule row into the application schema."""
    # Date is already ISO from the data attribute (e.g. "2025-10-26")
    game_date = raw.get("date", "")
    game_time = raw.get("time", "")

    # Try to convert 12h time to 24h
    if game_time:
        try:
            from datetime import datetime as _dt
            parsed_time = _dt.strptime(game_time, "%I:%M %p")
            game_time = parsed_time.strftime("%H:%M")
        except ValueError:
            pass

    # Parse score if present — format is "2 : 1" or "2:1"
    score = None
    status_text = raw.get("status", "").lower().strip()
    score_text = raw.get("score", "").strip()
    if score_text:
        # Handle "2 : 1", "2:1", etc.
        cleaned = score_text.replace(" ", "")
        if ":" in cleaned:
            parts = cleaned.split(":")
            if len(parts) == 2:
                try:
                    score = {"away": int(parts[0]), "home": int(parts[1])}
                except ValueError:
                    pass

    # Determine status category
    if score is not None:
        status_cat = "final"
    elif status_text in ("cancelled", "canceled"):
        status_cat = "cancelled"
    elif status_text in ("postponed", "ppd"):
        status_cat = "postponed"
    else:
        status_cat = "scheduled"

    away = raw.get("awayTeam", {})
    home = raw.get("homeTeam", {})

    # Build a stable ID
    game_id = f"{season}_{game_date}_{game_time}_{away.get('name', '')}_{home.get('name', '')}"

    return {
        "id": game_id,
        "date": game_date,
        "time": game_time,
        "homeTeam": {
            "id": home.get("id", ""),
            "name": home.get("name", ""),
            "logo": home.get("logo", ""),
        },
        "awayTeam": {
            "id": away.get("id", ""),
            "name": away.get("name", ""),
            "logo": away.get("logo", ""),
        },
        "division": raw.get("division", ""),
        "tier": raw.get("tier", ""),
        "gameType": raw.get("gameType", ""),
        "arena": raw.get("arena", ""),
        "status": status_cat,
        "score": score,
    }


def normalize_standings(raw: dict, season: str, division: str, tier: str) -> dict:
    """Normalize a raw standings row."""
    name = raw.get("name", "").strip()
    # Normalize to title case to match schedule data (e.g. "VAUGHAN BLUE" -> "Vaughan Blue")
    name = " ".join(word.capitalize() for word in name.split()) if name else name
    return {
        "teamId": raw.get("teamId", ""),
        "name": name,
        "logo": raw.get("logo", ""),
        "division": raw.get("division", division),
        "tier": raw.get("tier", tier),
        "season": season,
        "gp": raw.get("gp", 0),
        "w": raw.get("w", 0),
        "l": raw.get("l", 0),
        "t": raw.get("t", 0),
        "pts": raw.get("pts", 0),
        "winPct": raw.get("winPct", 0.0),
        "gfAvg": raw.get("gfAvg", 0.0),
        "gaAvg": raw.get("gaAvg", 0.0),
        "gf": raw.get("gf", 0),
        "ga": raw.get("ga", 0),
        "home": raw.get("home", ""),
        "away": raw.get("away", ""),
        "last10": raw.get("last10", ""),
        "streak": raw.get("streak", ""),
        "pim": raw.get("pim", 0),
    }


# ---------------------------------------------------------------------------
# Main scraper
# ---------------------------------------------------------------------------

def scrape_schedules(
    session: requests.Session,
    viewstate: dict,
    *,
    season: str = "26-27",
    division: str = "ALL",
    club: str = "ALL",
    arena: str = "ALL",
    tier: str = "ALL",
) -> list[dict]:
    """Scrape schedules for an entire season in 30-day chunks."""
    start_str, end_str = get_season_date_range(season)
    chunks = chunk_date_range(start_str, end_str, chunk_days=30)
    log.info("Scraping schedules: %d chunks from %s to %s", len(chunks), start_str, end_str)

    all_games = []
    for i, (chunk_start, chunk_end) in enumerate(chunks, 1):
        log.info("Chunk %d/%d: %s → %s", i, len(chunks), chunk_start, chunk_end)
        html = fetch_schedule_page(
            session,
            viewstate,
            division=division,
            club=club,
            arena=arena,
            tier=tier,
            date_from=chunk_start,
            date_to=chunk_end,
        )
        raw_rows = parse_schedule_table(html)
        for raw in raw_rows:
            game = normalize_game(raw, season)
            all_games.append(game)
        if i < len(chunks):
            throttle()

    log.info("Total schedule games scraped: %d", len(all_games))
    return all_games


def scrape_standings(
    session: requests.Session,
    *,
    season: str = "26-27",
    division: str = "ALL",
    tier: str = "ALL",
) -> list[dict]:
    """Scrape standings for a season, walking every division and tier.

    The standings page builds its tier dropdown *per division*: a fresh page
    only offers the default division's first tier, so a tier posted together
    with the division change is rejected by ASP.NET and quietly falls back to
    Tier 1 — which is why every snapshot used to hold Tier 1 only. Reaching
    the other tiers takes two chained POSTs per game type:

      __EVENTTARGET=ddlDiv   -> the response carries this division's real
                                tier list plus the default tier's table
      __EVENTTARGET=ddlTier  -> one POST per remaining tier, replaying the
                                ViewState the response above just returned

    Division "ALL" walks every division the page lists, because unlike the
    schedule page the standings page has no ALL option to post. Each POST is
    throttled, and a POST that exhausts its retries aborts the whole run
    instead of writing a half-scraped tier set over a complete one.
    """
    # GET standings page to harvest its ViewState and event ID
    log.info("Fetching standings page for ViewState...")
    resp = request_with_retry(
        lambda: session.get(STANDINGS_URL, timeout=60),
        label="standings GET",
        healthy=has_full_viewstate,
    )
    viewstate = extract_viewstate(resp.text)
    throttle()

    # Extract lbEventID from hidden field (varies by season/event)
    soup = BeautifulSoup(resp.text, "lxml")
    event_id_input = soup.find("input", {"id": "lbEventID"})
    event_id = int(event_id_input.get("value", 162)) if event_id_input else 162
    log.info("Standings event ID: %d", event_id)

    # Discover available game types from the standings page
    type_select = soup.find("select", {"id": "ddlType"})
    game_types = ["FS"]
    if type_select:
        game_types = [
            opt.get("value", "FS")
            for opt in type_select.find_all("option")
            if opt.get("value")
        ]
    log.info("Available standings game types: %s", game_types)

    # Unlike the schedule page, ddlDiv here has no ALL option — resolve it to
    # the real list so "ALL" means every division rather than the default one.
    divisions = extract_select_options(resp.text, "ddlDiv")
    if division != "ALL":
        divisions = [division]
    elif not divisions:
        divisions = ["ALL"]
    log.info("Standings divisions to scrape: %s", divisions)

    results = []
    for div in divisions:
        for gt in game_types:
            # Step 1: pick the division. This is the postback that populates
            # the tier dropdown for it, and the response already contains the
            # default tier's table.
            html = fetch_standings_page(
                session,
                viewstate,
                event_id=event_id,
                division=div,
                tier="ALL",
                season=season,
                game_type=gt,
            )
            throttle()
            tier_options = extract_select_options(html, "ddlTier") or ["Tier 1"]
            wanted = (
                tier_options if tier == "ALL"
                else [t for t in tier_options if t == tier] or [tier]
            )

            counted = {}
            for raw in parse_standings_table(html):
                raw_tier = (raw.get("tier") or "").strip()
                # An explicit --tier run keeps only that tier; with tier=ALL
                # accept whatever the server chose to show for this division.
                if tier != "ALL" and raw_tier and raw_tier != tier:
                    continue
                entry = normalize_standings(raw, season, div, raw_tier or tier)
                entry["gameType"] = gt
                results.append(entry)
                counted[raw_tier or "?"] = counted.get(raw_tier or "?", 0) + 1

            # Step 2: chain a tier selection for every tier that response did
            # not already hand us. Only that response's ViewState carries the
            # dropdown list the posted tier has to appear in — the page's own
            # still lists just the default division's first tier.
            chain = extract_viewstate(html)
            for t in wanted:
                if t in counted:
                    continue
                page = fetch_standings_page(
                    session,
                    chain,
                    event_id=event_id,
                    division=div,
                    tier=t,
                    season=season,
                    game_type=gt,
                    event_target="ddlTier",
                )
                chain = extract_viewstate(page)
                kept = 0
                for raw in parse_standings_table(page):
                    raw_tier = (raw.get("tier") or "").strip()
                    # A tier the server does not recognise falls back to its
                    # own selection — never record that as the tier asked for.
                    if raw_tier and raw_tier != t:
                        continue
                    entry = normalize_standings(raw, season, div, raw_tier or t)
                    entry["gameType"] = gt
                    results.append(entry)
                    kept += 1
                counted[t] = kept
                throttle()
            log.info(
                "Standings %s %s %s (tiers %s): %s",
                season, div, gt, "/".join(wanted),
                ", ".join(f"{k}={v}" for k, v in sorted(counted.items())) or "no rows",
            )

    # One team appears once per tier and game type. A chained response can
    # echo the previous selection and a response can carry more than one
    # repeater table, so dedupe on identity rather than trust either.
    unique, seen = [], set()
    for entry in results:
        key = (
            entry.get("season"), entry.get("division"), entry.get("tier"),
            entry.get("gameType"), entry.get("teamId") or entry.get("name"),
        )
        if key in seen:
            continue
        seen.add(key)
        unique.append(entry)
    if len(unique) != len(results):
        log.info("Dropped %d duplicate standings rows", len(results) - len(unique))

    log.info("Total standings entries scraped: %d", len(unique))
    return unique


def merge_by_division(existing_rows: list[dict], new_rows: list[dict]) -> list[dict]:
    """
    Keep rows for divisions this run did not scrape, replace the ones it did.

    A --division run has to be additive across runs. The snapshot is written
    wholesale, so without this a U15 scrape followed by the cron's U14 run the
    next morning would silently delete U15. Rows with no division are treated
    as belonging to the new run, since there is nothing to key them on.
    """
    if not new_rows:
        # This run produced nothing for this dataset (e.g. schedule-only) —
        # hold on to what is cached rather than blanking the snapshot.
        return existing_rows
    new_divisions = {r.get("division") for r in new_rows if r.get("division")}
    if not new_divisions:
        return new_rows
    carried = [r for r in existing_rows if r.get("division") not in new_divisions]
    if carried:
        log.info(
            "Carried forward %d rows from divisions not scraped this run: %s",
            len(carried),
            sorted({r.get("division") for r in carried if r.get("division")}),
        )
    return carried + new_rows


def merge_standings(existing_rows: list[dict], new_rows: list[dict]) -> list[dict]:
    """
    Keep rows for every (division, tier, game type) this run returned nothing for.

    Division-level merging is too coarse for standings: the site serves each
    tier and each game type as its own table, and one of them can come back
    with no table at all while the others are fine — 25-26 U14 Winter Season
    served six rows one night and nothing the next, during the new-season
    publishing. Replacing the division wholesale would delete rows the run
    never actually looked at, so a slice is only replaced when the run
    produced rows for it. A slice that legitimately empties stays stale until
    the season rolls over to a fresh snapshot — the same bargain the rest of
    the scraper makes: never turn a blank response into fact.
    """
    if not new_rows:
        # This run produced no standings at all — hold on to what is cached
        # rather than blanking the file.
        return existing_rows

    def key_of(row):
        return (row.get("division"), row.get("tier"), row.get("gameType"))

    new_slices = {key_of(r) for r in new_rows}
    carried = [r for r in existing_rows if key_of(r) not in new_slices]
    if carried:
        log.info(
            "Carried forward %d standings rows from slices this run returned "
            "nothing for: %s",
            len(carried),
            sorted({"/".join(str(p) for p in key_of(r)) for r in carried}),
        )
    return carried + new_rows


def write_output(
    games: list[dict],
    standings: list[dict],
    metadata: dict,
    season: str,
    dry_run: bool = False,
    write_schedule: bool = True,
):
    """Write normalized JSON to public/data/."""
    now = datetime.utcnow().isoformat() + "Z"

    # Drop standings rows that came back without a team name — the site emits
    # placeholder rows like this before a season has real data in it.
    standings = [s for s in standings if (s.get("name") or "").strip()]

    schedule_payload = {
        "season": season,
        "scrapedAt": now,
        "gameCount": len(games),
        "games": games,
        "metadata": metadata,
    }

    standings_payload = {
        "season": season,
        "scrapedAt": now,
        "teamCount": len(standings),
        "standings": standings,
    }

    if dry_run:
        log.info("Dry run — would write %d games, %d standings entries%s",
                 len(games), len(standings),
                 "" if write_schedule else " (schedule skipped)")
        log.info("Sample game: %s", json.dumps(games[0], indent=2) if games else "none")
        log.info("Sample standing: %s", json.dumps(standings[0], indent=2) if standings else "none")
        return

    # Never let an empty scrape overwrite working data. This is what happens
    # when a new season exists in the dropdown but its schedule hasn't been
    # published yet, and when a scrape silently fails and returns no rows.
    if not games and not standings:
        log.warning(
            "SKIP: Season %s returned no usable data (0 games, 0 standings "
            "rows). The schedule is probably not published yet — leaving all "
            "existing files untouched.",
            season,
        )
        return

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    schedule_path = OUTPUT_DIR / "schedule.json"
    standings_path = OUTPUT_DIR / "standings.json"

    # Keep whatever the default files currently hold as a per-season snapshot
    # before we overwrite them, so completed seasons stay cached locally.
    preserve_existing_snapshots()

    season_schedule_path = OUTPUT_DIR / f"schedule-{season}.json"
    season_standings_path = OUTPUT_DIR / f"standings-{season}.json"

    # Cache this run is being measured against and merged into. Fall back to
    # the default file when it belongs to the same season (it may be newer than
    # a snapshot that has not been written yet).
    existing = read_json(season_schedule_path)
    if existing is None:
        fallback = read_json(schedule_path)
        if fallback and fallback.get("season") == season:
            existing = fallback
    existing_standings = read_json(season_standings_path)
    if existing_standings is None:
        fallback = read_json(standings_path)
        if fallback and fallback.get("season") == season:
            existing_standings = fallback
    existing_games = existing.get("games", []) if existing else []
    existing_standings_rows = existing_standings.get("standings", []) if existing_standings else []

    # Safety: don't overwrite good data with bad. Compare against the snapshot
    # for this same season, and only over divisions the new scrape covers, so a
    # single-division run is never measured against an all-divisions dataset.
    # A rejected schedule must not take standings down with it, so this drops
    # the schedule rather than bailing out of the whole write.
    if write_schedule and existing and existing.get("season") in (None, season):
        new_divisions = {g.get("division") for g in games if g.get("division")}
        comparable = [
            g for g in existing_games
            if not new_divisions or g.get("division") in new_divisions
        ]
        if comparable and len(games) < len(comparable) * 0.5:
            log.warning(
                "SKIP schedule: New scrape has %d games but cached %s has %d "
                "in divisions %s — possible scrape failure. Keeping the cached "
                "schedule and still writing standings.",
                len(games), season, len(comparable), sorted(new_divisions),
            )
            write_schedule = False

    # Merge instead of replace: this run owns only the divisions it scraped
    # and only the dataset it actually returned rows for. When the schedule
    # could not be fetched at all, every schedule file is left as-is rather
    # than recording an empty season as fact — the app reads the snapshot
    # ahead of the default file, so a wrong 0 here would be shown as truth.
    merged_games = existing_games
    if write_schedule:
        merged_games = merge_by_division(existing_games, games)
        schedule_payload["games"] = merged_games
        schedule_payload["gameCount"] = len(merged_games)
    # Standings merge per (division, tier, game type) rather than per
    # division — those are separate tables on the site, and one that comes
    # back empty must not erase the tables that did return rows.
    merged_standings = merge_standings(existing_standings_rows, standings)
    standings_payload["standings"] = merged_standings
    standings_payload["teamCount"] = len(merged_standings)

    # Write the per-season snapshots — these are the long-lived caches.
    if write_schedule:
        with open(season_schedule_path, "w", encoding="utf-8") as f:
            json.dump(schedule_payload, f, indent=2, ensure_ascii=False)
        log.info("Wrote %s (%d games)", season_schedule_path.name, len(merged_games))
    with open(season_standings_path, "w", encoding="utf-8") as f:
        json.dump(standings_payload, f, indent=2, ensure_ascii=False)
    log.info("Wrote %s (%d teams)", season_standings_path.name, len(merged_standings))

    # Mirror into the default files the app falls back to. Each file is guarded
    # separately so a partial scrape (games but no standings, or the other way
    # round) can't blank out half of what the site is already showing.
    is_current = season == current_season()

    if not write_schedule:
        log.info("Default schedule untouched: schedule page was unavailable this run")
    elif is_current or not schedule_path.exists():
        if merged_games:
            with open(schedule_path, "w", encoding="utf-8") as f:
                json.dump(schedule_payload, f, indent=2, ensure_ascii=False)
            log.info("Updated default schedule (%d games)", len(merged_games))
        else:
            log.warning("Default schedule untouched: new scrape has 0 games")
    else:
        log.info(
            "Season %s is not the current season (%s) — default schedule untouched",
            season, current_season(),
        )

    if is_current or not standings_path.exists():
        if merged_standings:
            with open(standings_path, "w", encoding="utf-8") as f:
                json.dump(standings_payload, f, indent=2, ensure_ascii=False)
            log.info("Updated default standings (%d teams)", len(merged_standings))
        else:
            log.warning("Default standings untouched: new scrape has 0 teams")
    else:
        log.info(
            "Season %s is not the current season (%s) — default standings untouched",
            season, current_season(),
        )


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="NYHL Schedule & Standings Scraper")
    parser.add_argument("--season", default="current",
                        help="Season e.g. 25-26, or 'current' to auto-detect (default)")
    parser.add_argument("--division", default="ALL", help="Filter to division, e.g. U14")
    parser.add_argument("--tier", default="ALL", help="Filter to tier, e.g. Tier 2")
    parser.add_argument("--club", default="ALL", help="Filter to club name")
    parser.add_argument("--arena", default="ALL", help="Filter to arena")
    parser.add_argument("--team-id", default=None, help="Filter to one team by Agilex data-teamid")
    parser.add_argument("--schedule-only", action="store_true", help="Skip standings scrape")
    parser.add_argument("--standings-only", action="store_true", help="Skip schedule scrape")
    parser.add_argument("--dry-run", action="store_true", help="Parse but don't write files")
    parser.add_argument("--force", action="store_true",
                        help="Scrape even if the season is complete and already cached")
    parser.add_argument("--verbose", action="store_true", help="Enable debug logging")
    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    # Resolve the season — "current" works it out from today's date.
    if args.season.strip().lower() in ("current", "auto", ""):
        season = current_season()
        log.info("Auto-detected current season: %s", season)
    else:
        season = args.season

    # Completed seasons are scraped once and then served from the local
    # snapshot, so we make zero requests to Agilex for them.
    if not args.force and season_is_complete(season):
        snapshot = OUTPUT_DIR / f"schedule-{season}.json"
        default = read_json(OUTPUT_DIR / "schedule.json")
        cached = snapshot.exists() or (default and default.get("season") == season)
        if cached:
            log.info(
                "Season %s ended %s — cached snapshot present. "
                "Skipping scrape (0 requests to Agilex). Use --force to re-scrape.",
                season, get_season_date_range(season)[1],
            )
            return
        log.info("Season %s has ended but no cached snapshot — scraping once.", season)

    session = create_session()

    # Step 1: GET initial page to harvest ViewState
    log.info("Fetching initial page for ViewState...")
    resp = request_with_retry(
        lambda: session.get(SCHEDULE_URL, timeout=60),
        label="schedule GET",
        healthy=has_full_viewstate,
        fatal=False,
    )
    schedule_ok = resp is not None
    viewstate = None
    filters = {}
    if schedule_ok:
        # DEBUG: dump initial GET response
        debug_path = Path(__file__).resolve().parent / "debug_get.html"
        debug_path.write_text(resp.text, encoding="utf-8")
        log.debug("DEBUG: wrote %s (%d bytes)", debug_path, len(resp.text))
        viewstate = extract_viewstate(resp.text)
        throttle()

        # Step 2: Discover available filters
        log.info("Discovering filter options...")
        filters = discover_filters(resp.text)
        log.info("Available divisions: %s", filters.get("divisions", []))
        log.info("Available tiers: %s", filters.get("tiers", []))
        log.info("Available clubs: %d options", len(filters.get("clubs", [])))
        log.info("Available arenas: %d options", len(filters.get("arenas", [])))
    else:
        log.warning(
            "Schedule page unavailable — standings will still be scraped, and "
            "every schedule file will be left exactly as it is rather than "
            "written as an empty season."
        )

    metadata = {
        "divisions": filters.get("divisions", []),
        "tiers": filters.get("tiers", []),
        "clubs": filters.get("clubs", []),
        "arenas": filters.get("arenas", []),
        "gameTypes": filters.get("gameTypes", []),
    }

    # Discover available seasons from the standings page (schedule page doesn't have ddlSeason)
    log.info("Discovering available seasons from standings page...")
    try:
        standings_resp = session.get(STANDINGS_URL, timeout=60)
        standings_resp.raise_for_status()
        seasons = extract_select_options(standings_resp.text, "ddlSeason")
        if seasons:
            metadata["seasons"] = seasons
            log.info("Available seasons: %s", seasons)
        else:
            metadata["seasons"] = [season]
            log.info("No seasons dropdown found, using: %s", season)
        throttle()
    except Exception as e:
        log.warning("Could not discover seasons: %s", e)
        metadata["seasons"] = [season]

    log.info("NYHL Scraper — season %s", season)

    games = []
    standings = []

    # Step 3: Scrape schedules
    if not args.standings_only and schedule_ok:
        games = scrape_schedules(
            session,
            viewstate,
            season=season,
            division=args.division,
            club=args.club,
            arena=args.arena,
            tier=args.tier,
        )

    # Step 4: Scrape standings
    if not args.schedule_only:
        standings = scrape_standings(
            session,
            season=season,
            division=args.division,
            tier=args.tier,
        )

    # Step 5: Collect and download team logos
    all_logo_codes = set()
    for game in games:
        all_logo_codes.add(game.get("awayTeam", {}).get("logo", ""))
        all_logo_codes.add(game.get("homeTeam", {}).get("logo", ""))
    for team in standings:
        all_logo_codes.add(team.get("logo", ""))
    all_logo_codes.discard("")  # remove empty strings

    if all_logo_codes:
        log.info("Found %d unique team logos to download", len(all_logo_codes))
        logo_mapping = download_logos(session, all_logo_codes, dry_run=args.dry_run)
        metadata["logos"] = logo_mapping
    else:
        log.info("No team logos found in scraped data")

    # Step 6: Write output
    write_output(games, standings, metadata, season,
                 dry_run=args.dry_run, write_schedule=schedule_ok)

    log.info("Done.")


if __name__ == "__main__":
    main()
