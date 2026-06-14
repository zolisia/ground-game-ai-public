"""
Batch-generates ward deprivation entries for all English constituencies
missing from WARD_DEPRIVATION in src/data/ward-deprivation.ts.

Methodology (same as existing 8 entries):
  1. LSOA21→WD24 lookup maps each ward to its constituent LSOAs.
  2. IMD 2019 File 7 provides an IMD score and mid-2015 population per LSOA11.
     LSOA21 codes are identical to LSOA11 codes for ~97% of areas; unmatched
     LSOA21s (splits since 2021) are skipped — they are a small minority and
     do not materially affect the population-weighted mean.
  3. Population-weighted mean IMD score per ward → deprivation class.

Class thresholds (unchanged from existing entries):
  Low          score  < 15
  Low-Medium   15 ≤ score < 22
  Medium       22 ≤ score < 28
  Medium-High  28 ≤ score < 35
  High         35 ≤ score

Run:
  python3 scripts/generate-ward-deprivation.py
"""

import csv
import re
import collections
import sys

ROOT      = "/Users/zojaprzywrzej/ground-game-ai-public"
IMD_PATH  = f"{ROOT}/scripts/data/imd2019-file7.csv"
LKP_PATH  = f"{ROOT}/scripts/data/lsoa21-ward24-lookup.csv"
AREAS_TS  = f"{ROOT}/src/data/constituency-areas.ts"
CONSTS_TS = f"{ROOT}/src/data/constituencies.ts"
DEP_TS    = f"{ROOT}/src/data/ward-deprivation.ts"
OUT_TMP   = "/tmp/new-ward-deprivation-entries.txt"

# ── 1. IMD 2019 File 7: lsoa11_code → (imd_score, population) ─────────────

print("Loading IMD 2019 File 7 …")
imd: dict[str, tuple[float, int]] = {}
with open(IMD_PATH, newline="", encoding="utf-8-sig") as f:
    for row in csv.DictReader(f):
        code   = row["LSOA code (2011)"].strip()
        score  = row["Index of Multiple Deprivation (IMD) Score"].strip()
        pop    = row["Total population: mid 2015 (excluding prisoners)"].strip()
        if code and score and pop:
            try:
                imd[code] = (float(score), int(float(pop)))
            except ValueError:
                pass
print(f"  {len(imd):,} LSOAs loaded")

# ── 2. LSOA21→WD24 lookup: ward_code → [lsoa21_codes] ────────────────────

print("Loading LSOA21→WD24 lookup …")
ward_to_lsoas: dict[str, list[str]] = collections.defaultdict(list)
ward_to_name: dict[str, str] = {}          # WD24CD → WD24NM (for display; not in this CSV)
with open(LKP_PATH, newline="") as f:
    for row in csv.DictReader(f):
        lsoa = row["LSOA21CD"].strip()
        ward = row["WD24CD"].strip()
        if lsoa and ward:
            ward_to_lsoas[ward].append(lsoa)
print(f"  {len(ward_to_lsoas):,} wards with LSOA mappings")

# ── 3. constituencies.ts: slug → ons_code (English E14 only) ──────────────

print("Loading constituencies.ts …")
with open(CONSTS_TS) as f:
    consts_text = f.read()

slug_to_ons: dict[str, str] = {}
for m in re.finditer(
    r'slug:\s*"([^"]+)".*?onsCode:\s*"(E14[^"]+)"',
    consts_text, re.DOTALL
):
    slug_to_ons[m.group(1)] = m.group(2)
print(f"  {len(slug_to_ons)} English constituencies")

# ── 4. constituency-areas.ts: ons_code → [{code, name}] ──────────────────

print("Loading constituency-areas.ts …")
with open(AREAS_TS) as f:
    areas_text = f.read()

ons_to_wards: dict[str, list[tuple[str, str]]] = {}
LINE_START = re.compile(r'^\s*"(E14\d{6})"\s*:')
WARD_OBJ   = re.compile(r'\{\s*code:\s*"([^"]+)",\s*name:\s*"([^"]+)"')

for line in areas_text.splitlines():
    m = LINE_START.match(line)
    if not m:
        continue
    ons_code = m.group(1)
    # Find wards: [...] section — scan from 'wards:' up to its closing ']'
    wards_start = line.find("wards:")
    if wards_start == -1:
        continue
    bracket_start = line.find("[", wards_start)
    if bracket_start == -1:
        continue
    # Find matching closing bracket (handle nested [] from ward names — none exist here)
    depth = 0
    bracket_end = bracket_start
    for i, ch in enumerate(line[bracket_start:], bracket_start):
        if ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
            if depth == 0:
                bracket_end = i
                break
    wards_block = line[bracket_start : bracket_end + 1]
    ward_pairs = WARD_OBJ.findall(wards_block)
    if ward_pairs:
        ons_to_wards[ons_code] = ward_pairs   # list of (code, name)

print(f"  {len(ons_to_wards)} constituencies with ward data")

# ── 5. Existing slugs already in WARD_DEPRIVATION ─────────────────────────

with open(DEP_TS) as f:
    dep_text = f.read()
existing_slugs: set[str] = set()
for m in re.finditer(r'^\s+"?([a-z][a-z0-9-]+)"?\s*:\s*\[', dep_text, re.MULTILINE):
    existing_slugs.add(m.group(1))
# Braintree uses wardData from braintree.ts and is not in WARD_DEPRIVATION
existing_slugs.add("braintree")
print(f"  {len(existing_slugs)} slugs already covered")

# ── 6. Deprivation class ──────────────────────────────────────────────────

def dep_class(score: float) -> str:
    if score < 15:  return "Low"
    if score < 22:  return "Low-Medium"
    if score < 28:  return "Medium"
    if score < 35:  return "Medium-High"
    return "High"

# ── 7. Generate ───────────────────────────────────────────────────────────

print("\nGenerating …")
results: dict[str, list[tuple[str, str, float, str]]] = {}  # slug → [(code, name, score, class)]
no_ward_data: list[str] = []
no_lsoa_match: list[str] = []

for slug, ons_code in sorted(slug_to_ons.items()):
    if slug in existing_slugs:
        continue

    ward_pairs = ons_to_wards.get(ons_code, [])
    if not ward_pairs:
        no_ward_data.append(slug)
        continue

    ward_entries = []
    for ward_code, ward_name in ward_pairs:
        lsoas = ward_to_lsoas.get(ward_code, [])
        if not lsoas:
            continue

        total_pop = 0
        weighted_sum = 0.0
        for lsoa in lsoas:
            if lsoa in imd:
                score, pop = imd[lsoa]
                weighted_sum += score * pop
                total_pop += pop

        if total_pop == 0:
            continue

        mean_score = weighted_sum / total_pop
        ward_entries.append((ward_code, ward_name, round(mean_score, 2), dep_class(mean_score)))

    if ward_entries:
        results[slug] = ward_entries
    else:
        no_lsoa_match.append(slug)

print(f"  Generated:        {len(results)} constituencies")
print(f"  No ward data:     {len(no_ward_data)}")
print(f"  No LSOA matches:  {len(no_lsoa_match)}")
if no_ward_data:
    print(f"  Missing wards:    {no_ward_data[:5]}")
if no_lsoa_match:
    print(f"  No LSOA match:    {no_lsoa_match[:5]}")

# ── 8. Write TypeScript snippet ───────────────────────────────────────────

lines = []
for slug, entries in sorted(results.items()):
    lines.append(f'  "{slug}": [')
    for code, name, score, cls in entries:
        name_esc = name.replace("'", "\\'")
        lines.append(
            f'    {{ code: "{code}", name: "{name_esc}", imdScore: {score}, class: "{cls}" }},'
        )
    lines.append("  ],")

with open(OUT_TMP, "w") as f:
    f.write("\n".join(lines))

total_wards = sum(len(v) for v in results.values())
print(f"\nWrote {len(lines)} lines ({len(results)} constituencies, {total_wards} wards) → {OUT_TMP}")

# Sample
sample_slug = sorted(results.keys())[0]
print(f"\nSample — {sample_slug}:")
for code, name, score, cls in results[sample_slug]:
    print(f"  {code}  {name:<40s}  {score:6.2f}  {cls}")
