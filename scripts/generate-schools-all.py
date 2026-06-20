"""
Generates public/data/schools-{slug}.json for all 650 constituencies.

Data source: Ofsted management information — state-funded schools latest
inspections. This single CSV contains both DfE GIAS fields (including
Parliamentary constituency) and Ofsted inspection outcomes per school.

The CSV covers all state-funded schools in England only (~543 constituencies).
Welsh, Scottish and NI constituencies will produce empty schools lists.

Usage:
  python3 scripts/generate-schools-all.py

The Ofsted CSV is cached at scripts/data/ofsted-outcomes.csv. To refresh it,
update CSV_URL and delete the cached file, or just run the script which will
re-download if the cached file is absent.

Output: public/data/schools-{slug}.json for every slug in constituencies.ts.
"""

import csv
import json
import os
import re
import sys
import urllib.request
import collections

ROOT    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_URL = (
    "https://assets.publishing.service.gov.uk/media/6a06d8adee62840dba48a304/"
    "Management_information_-_state-funded_schools_-_latest_inspections_as_at_30_Apr_2026.csv"
)
CSV_CACHE  = os.path.join(ROOT, "scripts", "data", "ofsted-outcomes.csv")
OUT_DIR    = os.path.join(ROOT, "public", "data")
CONSTS_TS  = os.path.join(ROOT, "src", "data", "constituencies.ts")
SOURCE_URL = (
    "https://www.gov.uk/government/statistical-data-sets/"
    "monthly-management-information-ofsteds-school-inspections-outcomes"
)

# ── 1. Download CSV if not cached ─────────────────────────────────────────

if not os.path.exists(CSV_CACHE):
    print(f"Downloading Ofsted CSV → {CSV_CACHE}")
    urllib.request.urlretrieve(CSV_URL, CSV_CACHE)
else:
    print(f"Using cached Ofsted CSV: {CSV_CACHE}")

# ── 2. Build name → slug lookup from constituencies.ts ───────────────────

print("Loading constituencies.ts …")
with open(CONSTS_TS) as f:
    txt = f.read()

# All slugs in the file
name_to_slug: dict[str, str] = {}
for m in re.finditer(r'name:\s*"([^"]+)".*?slug:\s*"([^"]+)"', txt, re.DOTALL):
    name_to_slug[m.group(1)] = m.group(2)

# Case-insensitive fallback map
name_lower_to_slug: dict[str, str] = {k.lower(): v for k, v in name_to_slug.items()}

all_slugs = list(name_to_slug.values())
print(f"  {len(all_slugs)} constituencies")

# ── 3. Helper functions (same logic as build-schools-data.py) ─────────────

NUMERIC_GRADE = {"1": "Outstanding", "2": "Good", "3": "Requires Improvement", "4": "Inadequate"}


def parse_ungraded(s: str) -> str:
    s = (s or "").strip()
    if not s or s == "NULL":
        return ""
    if s.startswith("School remains "):
        rest = s[len("School remains "):]
        for sep in (" (", " - "):
            if sep in rest:
                rest = rest.split(sep, 1)[0]
        return rest.strip()
    return ""


def rating_for(row: dict) -> str:
    g = (row.get("Latest OEIF overall effectiveness") or "").strip()
    if g in NUMERIC_GRADE:
        return NUMERIC_GRADE[g]
    return parse_ungraded(row.get("Ungraded inspection overall outcome")) or "Not inspected"


def coerce_type(phase: str, type_ed: str) -> str:
    p = (phase or "").lower()
    t = (type_ed or "").lower()
    if any(k in p for k in ("primary", "nursery", "infant", "junior")):
        return "Primary"
    if "secondary" in p:
        return "Secondary"
    if "special" in p or "special" in t or "pupil referral" in t:
        return "Special"
    return "Other"


def parse_int(s: str) -> int:
    try:
        return int((s or "").strip() or 0)
    except ValueError:
        return 0


# ── 4. Read CSV and bucket by slug ────────────────────────────────────────

print("Reading Ofsted CSV …")
schools_by_slug: dict[str, list[dict]] = collections.defaultdict(list)
unresolved: set[str] = set()
total_rows = 0

with open(CSV_CACHE, encoding="latin-1") as f:
    for row in csv.DictReader(f):
        pc = (row.get("Parliamentary constituency") or "").strip()
        if not pc:
            continue
        total_rows += 1

        # Direct name match first, then case-insensitive fallback
        slug = name_to_slug.get(pc) or name_lower_to_slug.get(pc.lower())
        if not slug:
            unresolved.add(pc)
            continue

        lo  = parse_int(row.get("Statutory lowest age"))
        hi  = parse_int(row.get("Statutory highest age"))
        schools_by_slug[slug].append({
            "urn":         parse_int(row.get("URN")),
            "name":        (row.get("School name") or "").strip(),
            "type":        coerce_type(row.get("Ofsted phase"), row.get("Type of education")),
            "ofstedRating": rating_for(row),
            "postcode":    (row.get("Postcode") or "").strip(),
            "ageRange":    f"{lo}-{hi}" if (lo and hi) else "",
            "pupils":      parse_int(row.get("Total number of pupils")),
        })

print(f"  {total_rows:,} school rows read")
print(f"  {len(schools_by_slug)} constituencies matched")
if unresolved:
    print(f"  Unresolved constituency names ({len(unresolved)}): {sorted(unresolved)}")

# ── 5. Write one JSON file per slug ───────────────────────────────────────

print(f"Writing JSON files to {OUT_DIR} …")
os.makedirs(OUT_DIR, exist_ok=True)

written    = 0
empty      = 0
total_schools = 0

for slug in all_slugs:
    schools = schools_by_slug.get(slug, [])
    schools.sort(key=lambda s: (s["type"], s["name"]))

    path = os.path.join(OUT_DIR, f"schools-{slug}.json")
    with open(path, "w") as f:
        json.dump({
            "source":    "Ofsted state-funded schools management information (Apr 2026)",
            "sourceUrl": SOURCE_URL,
            "schools":   schools,
        }, f, separators=(",", ":"))

    if schools:
        written += 1
        total_schools += len(schools)
    else:
        empty += 1

print(f"\nDone.")
print(f"  Files written:              {written + empty:,} ({len(all_slugs)} total slugs)")
print(f"  With school data:           {written:,}")
print(f"  Empty (Wales/Scotland/NI):  {empty:,}")
print(f"  Total schools across all:   {total_schools:,}")
