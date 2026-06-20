"""
Reads scripts/data/postcode-constituency-lookup.csv and patches
src/data/constituency-areas.ts by adding postcodes: [...] to every
entry that currently lacks one.

Each entry in constituency-areas.ts is a single line:
  "E14001121": { lads: [...], wards: [...] },
or already:
  "E14001121": { lads: [...], wards: [...], postcodes: [...] },

We match line-by-line so nested braces are never a problem.

Run: python3 scripts/generate-postcodes.py
"""

import csv
import collections
import os
import re
import sys

ROOT     = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(ROOT, "scripts", "data", "postcode-constituency-lookup.csv")
TS_PATH  = os.path.join(ROOT, "src", "data", "constituency-areas.ts")

# ── 1. Build ONS code → sorted outward codes from CSV ─────────────────────────

print(f"Reading {CSV_PATH} ...")
constituency_districts: dict[str, set[str]] = collections.defaultdict(set)

with open(CSV_PATH, newline="") as f:
    for row in csv.DictReader(f):
        pcds = (row.get("pcds") or "").strip()
        pcon = (row.get("pcon24cd") or "").strip()
        if pcds and pcon and " " in pcds:
            constituency_districts[pcon].add(pcds.split(" ")[0])

print(f"  {len(constituency_districts)} constituencies with postcode data")

# ── 2. Process constituency-areas.ts line by line ─────────────────────────────

# Each data entry line looks like:
#   "E14001121": { lads: [...], wards: [...] },
# We identify it by a leading ONS code and add postcodes before the final },
ENTRY_LINE = re.compile(r'^(\s*"([ENSW]\d{8})": \{)(.*?)(\},?\s*)$')

print(f"Reading {TS_PATH} ...")
with open(TS_PATH) as f:
    lines = f.readlines()

patched = 0
skipped_no_data = 0
left_unchanged = 0
out_lines = []

for line in lines:
    m = ENTRY_LINE.match(line)
    if not m:
        out_lines.append(line)
        continue

    prefix   = m.group(1)   # "  "E14001121": {"
    ons_code = m.group(2)   # "E14001121"
    body     = m.group(3)   # " lads: [...], wards: [...]"
    suffix   = m.group(4)   # "},"

    # Already has postcodes — leave exactly as-is
    if "postcodes:" in body:
        left_unchanged += 1
        out_lines.append(line)
        continue

    districts = sorted(constituency_districts.get(ons_code, []))
    if not districts:
        skipped_no_data += 1
        out_lines.append(line)
        continue

    items    = ", ".join(f'"{d}"' for d in districts)
    new_line = f'{prefix}{body}, postcodes: [{items}]{suffix}\n'
    out_lines.append(new_line)
    patched += 1

print(f"  Patched:              {patched}")
print(f"  Left unchanged:       {left_unchanged} (already had postcodes)")
print(f"  Skipped (no data):    {skipped_no_data}")

if patched == 0:
    print("Nothing to patch — exiting without writing.")
    sys.exit(0)

# ── 3. Write back ──────────────────────────────────────────────────────────────

with open(TS_PATH, "w") as f:
    f.writelines(out_lines)

print(f"\nWrote {TS_PATH}")

# ── 4. Sanity check ────────────────────────────────────────────────────────────

with open(TS_PATH) as f:
    final = f.read()

total_with = len(re.findall(r'"[ENSW]\d{8}".*?postcodes:', final))
print(f"Sanity: {total_with} entries now have postcodes")

# Spot-check: braintree should have CM7
braintree_line = next((l for l in final.splitlines() if "E14001121" in l), "")
if "CM7" in braintree_line:
    print("Spot-check Braintree CM7: OK")
else:
    print("WARNING: Braintree CM7 not found — check output")
