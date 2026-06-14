"""
Downloads the ONS NSPL May 2026 via paginated ArcGIS query (stdlib only).
Output: scripts/data/postcode-constituency-lookup.csv
"""

import csv, json, os, sys, time, urllib.request, urllib.parse
import concurrent.futures

BASE_URL = (
    "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/"
    "National_Statistics_Postcode_Lookup_%28May_2026%29_for_the_United_Kingdom/"
    "FeatureServer/0/query"
)

PAGE_SIZE    = 1000
MAX_WORKERS  = 20
TOTAL        = 1_809_062
OUTPUT       = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "postcode-constituency-lookup.csv")


def fetch_page(offset: int) -> list:
    params = urllib.parse.urlencode({
        "where": "doterm=0",
        "outFields": "pcds,pcon24cd",
        "f": "json",
        "resultRecordCount": PAGE_SIZE,
        "resultOffset": offset,
    })
    url = BASE_URL + "?" + params
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=45) as resp:
                data = json.loads(resp.read())
            if "error" in data:
                raise ValueError(str(data["error"]))
            return [
                (f["attributes"]["pcds"], f["attributes"]["pcon24cd"])
                for f in data.get("features", [])
                if f["attributes"].get("pcon24cd")
            ]
        except Exception as e:
            wait = 2 ** attempt
            print(f"  off={offset} fail ({e}), retry {attempt+1} in {wait}s", flush=True)
            time.sleep(wait)
    return []


def main():
    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    pages    = (TOTAL + PAGE_SIZE - 1) // PAGE_SIZE
    offsets  = [i * PAGE_SIZE for i in range(pages)]
    done = written = 0
    start = time.time()
    print(f"Downloading {TOTAL:,} postcodes in {pages} pages ({MAX_WORKERS} workers)")

    with open(OUTPUT, "w", newline="") as fout:
        w = csv.writer(fout)
        w.writerow(["pcds", "pcon24cd"])
        with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
            futs = {pool.submit(fetch_page, off): off for off in offsets}
            for fut in concurrent.futures.as_completed(futs):
                rows = fut.result()
                w.writerows(rows)
                written += len(rows)
                done += 1
                if done % 200 == 0 or done == pages:
                    el  = time.time() - start
                    eta = el / done * (pages - done) if done else 0
                    print(f"  {done}/{pages} ({done/pages*100:.1f}%) {written:,} rows {el:.0f}s +{eta:.0f}s", flush=True)

    print(f"\nDone. {written:,} rows → {OUTPUT} ({time.time()-start:.1f}s)")


if __name__ == "__main__":
    main()
