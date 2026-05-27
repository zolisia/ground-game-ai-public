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
  clacton: [
    { code: "E05011934", name: "Bluehouse",                       imdScore: 53.04, class: "High" },
    { code: "E05011936", name: "Burrsville",                      imdScore: 28.90, class: "Medium-High" },
    { code: "E05011937", name: "Cann Hall",                       imdScore: 29.85, class: "Medium-High" },
    { code: "E05011938", name: "Coppins",                         imdScore: 46.55, class: "High" },
    { code: "E05011943", name: "Eastcliff",                       imdScore: 24.57, class: "Medium" },
    { code: "E05011944", name: "Frinton",                         imdScore: 16.64, class: "Low-Medium" },
    { code: "E05011946", name: "Homelands",                       imdScore: 27.59, class: "Medium" },
    { code: "E05011947", name: "Kirby Cross",                     imdScore: 18.34, class: "Low-Medium" },
    { code: "E05011948", name: "Kirby-le-Soken & Hamford",        imdScore: 17.79, class: "Low-Medium" },
    { code: "E05011950", name: "Little Clacton",                  imdScore: 22.83, class: "Medium" },
    { code: "E05011951", name: "Pier",                            imdScore: 56.45, class: "High" },
    { code: "E05011952", name: "St Bartholomew's",                imdScore: 21.46, class: "Low-Medium" },
    { code: "E05011953", name: "St James",                        imdScore: 51.31, class: "High" },
    { code: "E05011954", name: "St John's",                       imdScore: 40.78, class: "High" },
    { code: "E05011955", name: "St Osyth",                        imdScore: 43.05, class: "High" },
    { code: "E05011956", name: "St Paul's",                       imdScore: 27.86, class: "Medium" },
    { code: "E05011958", name: "The Bentleys & Frating",          imdScore: 13.89, class: "Low" },
    { code: "E05011959", name: "The Oakleys & Wix",               imdScore: 21.56, class: "Low-Medium" },
    { code: "E05011960", name: "Thorpe, Beaumont & Great Holland", imdScore: 22.85, class: "Medium" },
    { code: "E05011961", name: "Walton",                          imdScore: 37.52, class: "High" },
    { code: "E05011962", name: "Weeley & Tendring",               imdScore: 30.44, class: "Medium-High" },
    { code: "E05011963", name: "West Clacton & Jaywick Sands",    imdScore: 64.47, class: "High" },
  ],
  "sheffield-central": [
    { code: "E05010860", name: "Broomhill and Sharrow Vale",      imdScore: 14.25, class: "Low" },
    { code: "E05010862", name: "City",                            imdScore: 22.12, class: "Medium" },
    { code: "E05010875", name: "Nether Edge and Sharrow",         imdScore: 23.75, class: "Medium" },
    { code: "E05010882", name: "Walkley",                         imdScore: 23.56, class: "Medium" },
  ],
  "leeds-central-and-headingley": [
    { code: "E05011397", name: "Headingley & Hyde Park",          imdScore: 19.96, class: "Low-Medium" },
    { code: "E05011402", name: "Kirkstall",                       imdScore: 31.79, class: "Medium-High" },
    { code: "E05011403", name: "Little London & Woodhouse",       imdScore: 28.40, class: "Medium-High" },
    { code: "E05011413", name: "Weetwood",                        imdScore: 17.91, class: "Low-Medium" },
  ],
  "south-basildon-and-east-thurrock": [
    { code: "E05002231", name: "Chadwell St Mary",                imdScore: 27.49, class: "Medium" },
    { code: "E05002233", name: "Corringham and Fobbing",          imdScore: 12.28, class: "Low" },
    { code: "E05002234", name: "East Tilbury",                    imdScore: 20.10, class: "Low-Medium" },
    { code: "E05002240", name: "Orsett",                          imdScore: 11.40, class: "Low" },
    { code: "E05002242", name: "Stanford East and Corringham Town", imdScore: 21.74, class: "Low-Medium" },
    { code: "E05002243", name: "Stanford-le-Hope West",           imdScore: 17.25, class: "Low-Medium" },
    { code: "E05002245", name: "The Homesteads",                  imdScore:  9.20, class: "Low" },
    { code: "E05015643", name: "Langdon Hills",                   imdScore: 13.02, class: "Low" },
    { code: "E05015645", name: "Nethermayne",                     imdScore: 31.12, class: "Medium-High" },
    { code: "E05015646", name: "Pitsea North West",               imdScore: 40.53, class: "High" },
    { code: "E05015647", name: "Pitsea South East",               imdScore: 36.95, class: "High" },
  ],
  "great-yarmouth": [
    { code: "E05005784", name: "Bradwell North",                  imdScore: 12.11, class: "Low" },
    { code: "E05005785", name: "Bradwell South and Hopton",       imdScore: 13.34, class: "Low" },
    { code: "E05005786", name: "Caister North",                   imdScore: 18.62, class: "Low-Medium" },
    { code: "E05005787", name: "Caister South",                   imdScore: 23.56, class: "Medium" },
    { code: "E05005788", name: "Central and Northgate",           imdScore: 55.58, class: "High" },
    { code: "E05005789", name: "Claydon",                         imdScore: 45.37, class: "High" },
    { code: "E05005790", name: "East Flegg",                      imdScore: 25.28, class: "Medium" },
    { code: "E05005791", name: "Fleggburgh",                      imdScore: 19.89, class: "Low-Medium" },
    { code: "E05005792", name: "Gorleston",                       imdScore: 18.87, class: "Low-Medium" },
    { code: "E05005793", name: "Lothingland",                     imdScore: 21.64, class: "Low-Medium" },
    { code: "E05005794", name: "Magdalen",                        imdScore: 36.33, class: "High" },
    { code: "E05005795", name: "Nelson",                          imdScore: 67.27, class: "High" },
    { code: "E05005796", name: "Ormesby",                         imdScore: 18.54, class: "Low-Medium" },
    { code: "E05005797", name: "St Andrews",                      imdScore: 30.60, class: "Medium-High" },
    { code: "E05005798", name: "Southtown and Cobholm",           imdScore: 44.07, class: "High" },
    { code: "E05005799", name: "West Flegg",                      imdScore: 20.36, class: "Low-Medium" },
    { code: "E05005800", name: "Yarmouth North",                  imdScore: 36.26, class: "High" },
  ],
  "streatham-and-croydon-north": [
    { code: "E05011467", name: "Crystal Palace & Upper Norwood",  imdScore: 21.04, class: "Low-Medium" },
    { code: "E05011472", name: "Norbury & Pollards Hill",         imdScore: 20.93, class: "Low-Medium" },
    { code: "E05011473", name: "Norbury Park",                    imdScore: 20.32, class: "Low-Medium" },
    { code: "E05011486", name: "Thornton Heath",                  imdScore: 29.02, class: "Medium-High" },
    { code: "E05014101", name: "Clapham Park",                    imdScore: 24.58, class: "Medium" },
    { code: "E05014109", name: "St Martin's",                     imdScore: 26.47, class: "Medium" },
    { code: "E05014112", name: "Streatham Common & Vale",         imdScore: 21.53, class: "Low-Medium" },
    { code: "E05014113", name: "Streatham Hill East",             imdScore: 24.88, class: "Medium" },
    { code: "E05014114", name: "Streatham Hill West & Thornton",  imdScore: 15.25, class: "Low-Medium" },
    { code: "E05014115", name: "Streatham St Leonard's",          imdScore: 23.68, class: "Medium" },
    { code: "E05014116", name: "Streatham Wells",                 imdScore: 19.05, class: "Low-Medium" },
  ],
  "lewisham-east": [
    { code: "E05013714", name: "Bellingham",                      imdScore: 40.90, class: "High" },
    { code: "E05013717", name: "Catford South",                   imdScore: 23.83, class: "Medium" },
    { code: "E05013720", name: "Downham",                         imdScore: 34.69, class: "Medium-High" },
    { code: "E05013723", name: "Grove Park",                      imdScore: 25.27, class: "Medium" },
    { code: "E05013724", name: "Hither Green",                    imdScore: 28.27, class: "Medium-High" },
    { code: "E05013726", name: "Lee Green",                       imdScore: 19.14, class: "Low-Medium" },
    { code: "E05013730", name: "Rushey Green",                    imdScore: 32.96, class: "Medium-High" },
  ],
};
