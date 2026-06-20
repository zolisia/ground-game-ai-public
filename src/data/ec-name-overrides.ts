// Electoral Calculus seat name overrides.
//
// EC's naming conventions diverge from ONS/Parliament in several systematic
// ways. This map covers all 83 known mismatches derived from a full comparison
// of constituencies.ts against electdata_2024.txt (the authoritative EC seat
// list at https://www.electoralcalculus.co.uk/electdata_2024.txt).
//
// Used by /api/electoral-calculus/route.ts: the route falls back to
// constituency.name when a slug is absent from this map, so only divergences
// need entries here. Add new entries when a "Seat not found" 400 surfaces.

export const EC_NAME_OVERRIDES: Record<string, string> = {

  // Already in production
  "south-basildon-and-east-thurrock": "Basildon South and East Thurrock",

  // Category 1 — Capitalisation (article "the" lowercased by EC)
  "bridlington-and-the-wolds": "Bridlington and the Wolds",

  // Category 2 — Welsh / Scottish Gaelic: accents stripped + parenthetical added
  "ynys-m-n":                    "Ynys Mon (Anglesey)",
  "montgomeryshire-and-glynd-r": "Montgomeryshire and Glyndwr",
  "caerfyrddin":                 "Caerfyrddin (Carmarthen)",
  "na-h-eileanan-an-iar":        "Na h-Eileanan An Iar (Western Isles)",

  // Category 3 — Hull abbreviation (EC drops "Kingston upon")
  "kingston-upon-hull-east":                  "Hull East",
  "kingston-upon-hull-north-and-cottingham":  "Hull North and Cottingham",
  "kingston-upon-hull-west-and-haltemprice":  "Hull West and Haltemprice",

  // Category 4 — Comma-form inversion for articles / "The"
  "city-of-durham": "Durham, City of",
  "the-wrekin":     "Wrekin, The",

  // Category 5 — Direction inversion: EC puts the place name before the
  // directional word. Pattern: "Direction Place" → "Place Direction".
  // Compound directions (North East, South West etc.) stay together.

  // Central
  "central-ayrshire":                    "Ayrshire Central",
  "central-devon":                       "Devon Central",
  "central-suffolk-and-north-ipswich":   "Suffolk Central and North Ipswich",

  // East
  "east-antrim":                  "Antrim East",
  "east-hampshire":               "Hampshire East",
  "east-londonderry":             "Londonderry East",
  "east-renfrewshire":            "Renfrewshire East",
  "east-surrey":                  "Surrey East",
  "east-thanet":                  "Thanet East",
  "east-wiltshire":               "Wiltshire East",
  "east-worthing-and-shoreham":   "Worthing East and Shoreham",

  // Mid
  "mid-bedfordshire":             "Bedfordshire Mid",
  "mid-buckinghamshire":          "Buckinghamshire Mid",
  "mid-cheshire":                 "Cheshire Mid",
  "mid-derbyshire":               "Derbyshire Mid",
  "mid-dorset-and-north-poole":   "Dorset Mid and North Poole",
  "mid-dunbartonshire":           "Dunbartonshire Mid",
  "mid-leicestershire":           "Leicestershire Mid",
  "mid-norfolk":                  "Norfolk Mid",
  "mid-sussex":                   "Sussex Mid",
  "mid-ulster":                   "Ulster Mid",
  "mid-and-south-pembrokeshire":  "Pembrokeshire Mid and South",

  // North
  "north-antrim":                    "Antrim North",
  "north-ayrshire-and-arran":        "Ayrshire North and Arran",
  "north-bedfordshire":              "Bedfordshire North",
  "north-cornwall":                  "Cornwall North",
  "north-cotswolds":                 "Cotswolds North",
  "north-devon":                     "Devon North",
  "north-dorset":                    "Dorset North",
  "north-down":                      "Down North",
  "north-durham":                    "Durham North",
  "north-herefordshire":             "Herefordshire North",
  "north-norfolk":                   "Norfolk North",
  "north-northumberland":            "Northumberland North",
  "north-shropshire":                "Shropshire North",
  "north-somerset":                  "Somerset North",
  "north-warwickshire-and-bedworth": "Warwickshire North and Bedworth",

  // North East
  "north-east-cambridgeshire":          "Cambridgeshire North East",
  "north-east-derbyshire":              "Derbyshire North East",
  "north-east-fife":                    "Fife North East",
  "north-east-hampshire":               "Hampshire North East",
  "north-east-hertfordshire":           "Hertfordshire North East",
  "north-east-somerset-and-hanham":     "Somerset North East and Hanham",

  // North West
  "north-west-cambridgeshire":  "Cambridgeshire North West",
  "north-west-essex":           "Essex North West",
  "north-west-hampshire":       "Hampshire North West",
  "north-west-leicestershire":  "Leicestershire North West",
  "north-west-norfolk":         "Norfolk North West",

  // South
  "south-antrim":             "Antrim South",
  "south-cambridgeshire":     "Cambridgeshire South",
  "south-cotswolds":          "Cotswolds South",
  "south-derbyshire":         "Derbyshire South",
  "south-devon":              "Devon South",
  "south-dorset":             "Dorset South",
  "south-down":               "Down South",
  "south-leicestershire":     "Leicestershire South",
  "south-norfolk":            "Norfolk South",
  "south-northamptonshire":   "Northamptonshire South",
  "south-shropshire":         "Shropshire South",
  "south-suffolk":            "Suffolk South",

  // South East
  "south-east-cornwall": "Cornwall South East",

  // South West
  "south-west-devon":         "Devon South West",
  "south-west-hertfordshire": "Hertfordshire South West",
  "south-west-norfolk":       "Norfolk South West",
  "south-west-wiltshire":     "Wiltshire South West",

  // West
  "west-aberdeenshire-and-kincardine": "Aberdeenshire West and Kincardine",
  "west-dorset":         "Dorset West",
  "west-dunbartonshire": "Dunbartonshire West",
  "west-lancashire":     "Lancashire West",
  "west-suffolk":        "Suffolk West",
  "west-tyrone":         "Tyrone West",
  "west-worcestershire": "Worcestershire West",
};
