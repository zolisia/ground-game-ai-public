#!/usr/bin/env python3
# Refresh public/data/schools-{slug}.json for every constituency we currently
# expose in the dashboard. Reads the latest OFSTED "state-funded schools —
# latest inspections" CSV from gov.uk's publishing assets and filters by the
# CSV's `Parliamentary constituency` column (the column is sourced directly
# from DfE GIAS records, so it tracks the 2024 boundary names exactly).
#
# Usage:
#   1. Find the latest CSV URL on
#      https://www.gov.uk/government/statistical-data-sets/monthly-management-information-ofsteds-school-inspections-outcomes
#      (look for "Management_information_-_state-funded_schools_-_latest_inspections_as_at_<DATE>.csv")
#   2. Update CSV_URL below.
#   3. Run from the repo root:  python3 scripts/build-schools-data.py
#
# Independent / non-state-funded schools are out of scope — the OFSTED MI CSV
# only covers state-funded schools. That matches the existing SchoolsPanel
# expectations.

import csv
import json
import os
import sys
import urllib.request

CSV_URL = "https://assets.publishing.service.gov.uk/media/6a06d8adee62840dba48a304/Management_information_-_state-funded_schools_-_latest_inspections_as_at_30_Apr_2026.csv"

# Add a new entry here when a constituency is added to the dashboard's
# SELECTABLE_CONSTITUENCIES list. The value is the OFSTED CSV's exact
# Parliamentary constituency name (Title Case, matches getFullData(slug).constituency.name).
CONSTITUENCIES = {
    "braintree": "Braintree",
    "clacton": "Clacton",
    "walthamstow": "Walthamstow",
    "sheffield-central": "Sheffield Central",
    "leeds-central-and-headingley": "Leeds Central and Headingley",
    "south-basildon-and-east-thurrock": "South Basildon and East Thurrock",
    "great-yarmouth": "Great Yarmouth",
    "streatham-and-croydon-north": "Streatham and Croydon North",
    "lewisham-east": "Lewisham East",
}

NUMERIC_GRADE = {"1": "Outstanding", "2": "Good", "3": "Requires Improvement", "4": "Inadequate"}


def parse_ungraded(s: str) -> str:
    # "School remains Good" → "Good"
    # "School remains Outstanding (Concerns) - S5 Next" → "Outstanding"
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


def main():
    csv_path = "/tmp/ofsted_schools_latest.csv"
    print(f"Downloading {CSV_URL}")
    urllib.request.urlretrieve(CSV_URL, csv_path)
    out_dir = os.path.join(os.path.dirname(__file__), "..", "public", "data")
    os.makedirs(out_dir, exist_ok=True)

    out: dict[str, list[dict]] = {slug: [] for slug in CONSTITUENCIES}
    with open(csv_path, encoding="latin-1") as f:
        for row in csv.DictReader(f):
            pc = (row.get("Parliamentary constituency") or "").strip()
            for slug, name in CONSTITUENCIES.items():
                if pc == name:
                    lo, hi = parse_int(row.get("Statutory lowest age")), parse_int(row.get("Statutory highest age"))
                    out[slug].append({
                        "urn": parse_int(row.get("URN")),
                        "name": (row.get("School name") or "").strip(),
                        "type": coerce_type(row.get("Ofsted phase"), row.get("Type of education")),
                        "ofstedRating": rating_for(row),
                        "postcode": (row.get("Postcode") or "").strip(),
                        "ageRange": f"{lo}-{hi}" if (lo and hi) else "",
                        "pupils": parse_int(row.get("Total number of pupils")),
                    })
                    break

    for slug, schools in out.items():
        schools.sort(key=lambda s: (s["type"], s["name"]))
        path = os.path.join(out_dir, f"schools-{slug}.json")
        with open(path, "w") as f:
            json.dump({
                "source": "DfE OFSTED state-funded schools management information",
                "sourceUrl": "https://www.gov.uk/government/statistical-data-sets/monthly-management-information-ofsteds-school-inspections-outcomes",
                "schools": schools,
            }, f, separators=(",", ":"))
        print(f"  {path}: {len(schools)} schools")

    print(f"Done. Refresh CSV_URL in this script when DfE publishes a new monthly snapshot.")


if __name__ == "__main__":
    sys.exit(main())
