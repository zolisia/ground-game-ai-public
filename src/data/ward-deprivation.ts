// Ward-level deprivation classification, derived from MHCLG Indices of
// Multiple Deprivation (IMD) 2019 LSOA scores, aggregated to current (WD24)
// ward boundaries by population-weighted average. Classes are kept
// qualitative ("Low" → "High") so the map layer can use the same `match`
// expression as Braintree's static data.
//
// Aggregation method (per ward):
//   1. List all LSOA21 codes that ONS assigns to the ward (from
//      LSOA21_WD24_LAD24_EW_LU). For LSOAs that split between 2011 and 2021,
//      inherit the parent LSOA11's IMD score (mapping via LSOA11_LSOA21_LAD22).
//   2. Look up each LSOA11 in MHCLG's "File 7" (LSOA-level IMD scores +
//      mid-2015 population denominators).
//   3. Compute the population-weighted mean IMD score across the ward's LSOAs.
//
// Class thresholds (applied to the population-weighted ward IMD score):
//   Low          score < 15
//   Low-Medium   15 ≤ score < 22
//   Medium       22 ≤ score < 28
//   Medium-High  28 ≤ score < 35
//   High         35 ≤ score
//
// Coverage: as more constituencies are added, append a new entry keyed by
// constituency slug. Braintree continues to read its `deprivation` strings
// from the legacy static `wardData` in `src/data/braintree.ts` for now —
// adding it here would be a no-op refactor.

export type DeprivationClass =
  | "Low"
  | "Low-Medium"
  | "Medium"
  | "Medium-High"
  | "High";

export interface WardDeprivation {
  code: string;
  name: string;
  imdScore: number;
  class: DeprivationClass;
}

export const WARD_DEPRIVATION: Record<string, WardDeprivation[]> = {
  walthamstow: [
    { code: "E05013884", name: "Chapel End",                    imdScore: 20.71, class: "Low-Medium" },
    { code: "E05013889", name: "Hale End & Highams Park South", imdScore: 19.10, class: "Low-Medium" },
    { code: "E05013891", name: "High Street",                   imdScore: 27.28, class: "Medium" },
    { code: "E05013892", name: "Higham Hill",                   imdScore: 32.10, class: "Medium-High" },
    { code: "E05013893", name: "Hoe Street",                    imdScore: 28.34, class: "Medium-High" },
    { code: "E05013894", name: "Larkswood",                     imdScore: 23.70, class: "Medium" },
    { code: "E05013895", name: "Lea Bridge",                    imdScore: 30.00, class: "Medium-High" },
    { code: "E05013896", name: "Leyton",                        imdScore: 28.36, class: "Medium-High" },
    { code: "E05013898", name: "Markhouse",                     imdScore: 30.65, class: "Medium-High" },
    { code: "E05013899", name: "St James",                      imdScore: 22.86, class: "Medium" },
    { code: "E05013900", name: "Upper Walthamstow",             imdScore: 24.90, class: "Medium" },
    { code: "E05013902", name: "William Morris",                imdScore: 24.23, class: "Medium" },
    { code: "E05013903", name: "Wood Street",                   imdScore: 28.20, class: "Medium-High" },
  ],
};
