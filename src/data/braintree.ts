export const constituencyProfile = {
  name: "Braintree",
  mp: "James Cleverly",
  party: "Conservative",
  region: "East of England",
  county: "Essex",
  localAuthorities: ["Braintree District Council", "Essex County Council"],
  population: 80100,
  electorate: 77781,
  area: "Rural/Town mix",
  postcodes: ["CM7", "CM77", "CO9", "CM8", "CO5", "CO6"],
};

export const electionResults2024 = {
  constituency: "Braintree",
  year: 2024,
  turnout: 63.0,
  majority: 7.5,
  results: [
    { party: "Conservative", candidate: "James Cleverly", votes: 17414, percentage: 35.5, color: "#0087DC" },
    { party: "Labour", candidate: "Labour Candidate", votes: 13744, percentage: 28.0, color: "#DC241f" },
    { party: "Reform UK", candidate: "Reform Candidate", votes: 11346, percentage: 23.1, color: "#12B6CF" },
    { party: "Liberal Democrats", candidate: "Lib Dem Candidate", votes: 2879, percentage: 5.9, color: "#FAA61A" },
    { party: "Green", candidate: "Green Candidate", votes: 2878, percentage: 5.9, color: "#6AB023" },
    { party: "Other", candidate: "Other Candidates", votes: 767, percentage: 1.6, color: "#999999" },
  ],
};

// Real ward names from ONS Wards December 2024 for Braintree District (E07000067)
export const wardData = [
  { name: "Bocking Blackwater", population: 4200, conVote: 42, refVote: 25, labVote: 15, ldVote: 8, grnVote: 7, deprivation: "Low" },
  { name: "Bocking North", population: 4300, conVote: 40, refVote: 24, labVote: 16, ldVote: 9, grnVote: 8, deprivation: "Low-Medium" },
  { name: "Bocking South", population: 4100, conVote: 39, refVote: 25, labVote: 17, ldVote: 8, grnVote: 8, deprivation: "Low-Medium" },
  { name: "Braintree Central & Beckers Green", population: 5100, conVote: 35, refVote: 28, labVote: 20, ldVote: 7, grnVote: 8, deprivation: "Medium" },
  { name: "Braintree South", population: 4800, conVote: 37, refVote: 27, labVote: 18, ldVote: 8, grnVote: 7, deprivation: "Medium" },
  { name: "Braintree West", population: 4600, conVote: 38, refVote: 26, labVote: 18, ldVote: 8, grnVote: 7, deprivation: "Medium" },
  { name: "Bumpstead", population: 2900, conVote: 47, refVote: 21, labVote: 11, ldVote: 9, grnVote: 9, deprivation: "Low" },
  { name: "Coggeshall", population: 4500, conVote: 45, refVote: 20, labVote: 12, ldVote: 10, grnVote: 10, deprivation: "Low" },
  { name: "Great Notley & Black Notley", population: 5200, conVote: 41, refVote: 24, labVote: 15, ldVote: 9, grnVote: 8, deprivation: "Low" },
  { name: "Hedingham", population: 3800, conVote: 48, refVote: 22, labVote: 10, ldVote: 9, grnVote: 9, deprivation: "Low" },
  { name: "Kelvedon & Feering", population: 4100, conVote: 43, refVote: 22, labVote: 14, ldVote: 10, grnVote: 8, deprivation: "Low" },
  { name: "Rayne", population: 3100, conVote: 44, refVote: 23, labVote: 13, ldVote: 9, grnVote: 8, deprivation: "Low" },
  { name: "Stour Valley North", population: 3000, conVote: 46, refVote: 21, labVote: 12, ldVote: 9, grnVote: 9, deprivation: "Low" },
  { name: "Stour Valley South", population: 2800, conVote: 45, refVote: 22, labVote: 12, ldVote: 9, grnVote: 9, deprivation: "Low" },
  { name: "The Colnes", population: 3700, conVote: 44, refVote: 22, labVote: 13, ldVote: 9, grnVote: 9, deprivation: "Low" },
  { name: "Three Fields", population: 3400, conVote: 43, refVote: 22, labVote: 14, ldVote: 10, grnVote: 8, deprivation: "Low" },
  { name: "Witham South", population: 5200, conVote: 38, refVote: 25, labVote: 18, ldVote: 9, grnVote: 7, deprivation: "Medium" },
  { name: "Witham West", population: 4900, conVote: 37, refVote: 26, labVote: 19, ldVote: 8, grnVote: 7, deprivation: "Medium" },
  { name: "Witham Central", population: 5400, conVote: 36, refVote: 26, labVote: 20, ldVote: 8, grnVote: 7, deprivation: "Medium" },
  { name: "Witham North", population: 5600, conVote: 36, refVote: 26, labVote: 20, ldVote: 8, grnVote: 7, deprivation: "Medium" },
  { name: "Yeldham", population: 2600, conVote: 49, refVote: 20, labVote: 10, ldVote: 9, grnVote: 10, deprivation: "Low" },
  { name: "Gosfield & Greenstead Green", population: 3200, conVote: 50, refVote: 20, labVote: 10, ldVote: 8, grnVote: 10, deprivation: "Low" },
  { name: "Halstead St Andrew's", population: 3900, conVote: 34, refVote: 30, labVote: 19, ldVote: 7, grnVote: 7, deprivation: "Medium-High" },
  { name: "Halstead Trinity", population: 4100, conVote: 33, refVote: 31, labVote: 20, ldVote: 7, grnVote: 6, deprivation: "Medium-High" },
  { name: "Hatfield Peverel & Terling", population: 4000, conVote: 42, refVote: 23, labVote: 15, ldVote: 9, grnVote: 8, deprivation: "Low" },
  { name: "Silver End & Cressing", population: 3500, conVote: 35, refVote: 29, labVote: 19, ldVote: 7, grnVote: 7, deprivation: "Medium-High" },
  // Uttlesford District wards within Braintree constituency
  { name: "Felsted & Stebbing", population: 3800, conVote: 48, refVote: 19, labVote: 11, ldVote: 10, grnVote: 9, deprivation: "Low" },
  { name: "The Sampfords", population: 2200, conVote: 50, refVote: 18, labVote: 10, ldVote: 10, grnVote: 10, deprivation: "Low" },
];

export interface DemographicSet {
  age: { group: string; percentage: number }[];
  ethnicity: { group: string; percentage: number }[];
  housing: { type: string; percentage: number }[];
  education: { level: string; percentage: number }[];
}

export const demographics: DemographicSet = {
  age: [
    { group: "0-17", percentage: 21.2 },
    { group: "18-29", percentage: 13.8 },
    { group: "30-44", percentage: 18.5 },
    { group: "45-59", percentage: 21.3 },
    { group: "60-74", percentage: 16.8 },
    { group: "75+", percentage: 8.4 },
  ],
  ethnicity: [
    { group: "White British", percentage: 91.2 },
    { group: "White Other", percentage: 4.1 },
    { group: "Asian", percentage: 1.8 },
    { group: "Black", percentage: 1.1 },
    { group: "Mixed", percentage: 1.3 },
    { group: "Other", percentage: 0.5 },
  ],
  housing: [
    { type: "Owner Occupied", percentage: 72.3 },
    { type: "Social Rented", percentage: 12.1 },
    { type: "Private Rented", percentage: 13.8 },
    { type: "Other", percentage: 1.8 },
  ],
  education: [
    { level: "No Qualifications", percentage: 18.2 },
    { level: "Level 1-2", percentage: 28.5 },
    { level: "Level 3", percentage: 12.8 },
    { level: "Level 4+", percentage: 32.1 },
    { level: "Other", percentage: 8.4 },
  ],
};

// Ward-level demographics (Census 2021 estimates for key wards)
export const wardDemographics: Record<string, DemographicSet> = {
  "Braintree Central & Beckers Green": {
    age: [{ group: "0-17", percentage: 19.5 }, { group: "18-29", percentage: 16.2 }, { group: "30-44", percentage: 20.1 }, { group: "45-59", percentage: 19.8 }, { group: "60-74", percentage: 15.2 }, { group: "75+", percentage: 9.2 }],
    ethnicity: [{ group: "White British", percentage: 87.5 }, { group: "White Other", percentage: 5.8 }, { group: "Asian", percentage: 2.9 }, { group: "Black", percentage: 1.5 }, { group: "Mixed", percentage: 1.7 }, { group: "Other", percentage: 0.6 }],
    housing: [{ type: "Owner Occupied", percentage: 62.1 }, { type: "Social Rented", percentage: 18.4 }, { type: "Private Rented", percentage: 17.2 }, { type: "Other", percentage: 2.3 }],
    education: [{ level: "No Qualifications", percentage: 22.1 }, { level: "Level 1-2", percentage: 30.2 }, { level: "Level 3", percentage: 13.5 }, { level: "Level 4+", percentage: 26.8 }, { level: "Other", percentage: 7.4 }],
  },
  "Halstead St Andrew's": {
    age: [{ group: "0-17", percentage: 22.8 }, { group: "18-29", percentage: 14.1 }, { group: "30-44", percentage: 17.6 }, { group: "45-59", percentage: 20.1 }, { group: "60-74", percentage: 16.5 }, { group: "75+", percentage: 8.9 }],
    ethnicity: [{ group: "White British", percentage: 93.1 }, { group: "White Other", percentage: 3.2 }, { group: "Asian", percentage: 1.2 }, { group: "Black", percentage: 0.8 }, { group: "Mixed", percentage: 1.2 }, { group: "Other", percentage: 0.5 }],
    housing: [{ type: "Owner Occupied", percentage: 65.8 }, { type: "Social Rented", percentage: 16.2 }, { type: "Private Rented", percentage: 15.5 }, { type: "Other", percentage: 2.5 }],
    education: [{ level: "No Qualifications", percentage: 23.5 }, { level: "Level 1-2", percentage: 31.8 }, { level: "Level 3", percentage: 12.2 }, { level: "Level 4+", percentage: 24.5 }, { level: "Other", percentage: 8.0 }],
  },
  "Coggeshall": {
    age: [{ group: "0-17", percentage: 20.1 }, { group: "18-29", percentage: 10.5 }, { group: "30-44", percentage: 16.2 }, { group: "45-59", percentage: 22.8 }, { group: "60-74", percentage: 19.4 }, { group: "75+", percentage: 11.0 }],
    ethnicity: [{ group: "White British", percentage: 94.2 }, { group: "White Other", percentage: 3.1 }, { group: "Asian", percentage: 0.9 }, { group: "Black", percentage: 0.5 }, { group: "Mixed", percentage: 0.9 }, { group: "Other", percentage: 0.4 }],
    housing: [{ type: "Owner Occupied", percentage: 78.5 }, { type: "Social Rented", percentage: 8.2 }, { type: "Private Rented", percentage: 11.5 }, { type: "Other", percentage: 1.8 }],
    education: [{ level: "No Qualifications", percentage: 14.8 }, { level: "Level 1-2", percentage: 25.1 }, { level: "Level 3", percentage: 12.5 }, { level: "Level 4+", percentage: 39.8 }, { level: "Other", percentage: 7.8 }],
  },
  "Hedingham": {
    age: [{ group: "0-17", percentage: 19.2 }, { group: "18-29", percentage: 9.8 }, { group: "30-44", percentage: 15.5 }, { group: "45-59", percentage: 23.1 }, { group: "60-74", percentage: 20.8 }, { group: "75+", percentage: 11.6 }],
    ethnicity: [{ group: "White British", percentage: 95.8 }, { group: "White Other", percentage: 2.2 }, { group: "Asian", percentage: 0.6 }, { group: "Black", percentage: 0.3 }, { group: "Mixed", percentage: 0.8 }, { group: "Other", percentage: 0.3 }],
    housing: [{ type: "Owner Occupied", percentage: 81.2 }, { type: "Social Rented", percentage: 6.5 }, { type: "Private Rented", percentage: 10.1 }, { type: "Other", percentage: 2.2 }],
    education: [{ level: "No Qualifications", percentage: 13.2 }, { level: "Level 1-2", percentage: 24.5 }, { level: "Level 3", percentage: 11.8 }, { level: "Level 4+", percentage: 42.1 }, { level: "Other", percentage: 8.4 }],
  },
  "Silver End & Cressing": {
    age: [{ group: "0-17", percentage: 23.5 }, { group: "18-29", percentage: 15.8 }, { group: "30-44", percentage: 19.2 }, { group: "45-59", percentage: 19.5 }, { group: "60-74", percentage: 14.2 }, { group: "75+", percentage: 7.8 }],
    ethnicity: [{ group: "White British", percentage: 89.8 }, { group: "White Other", percentage: 5.2 }, { group: "Asian", percentage: 2.1 }, { group: "Black", percentage: 1.2 }, { group: "Mixed", percentage: 1.3 }, { group: "Other", percentage: 0.4 }],
    housing: [{ type: "Owner Occupied", percentage: 60.5 }, { type: "Social Rented", percentage: 21.8 }, { type: "Private Rented", percentage: 15.2 }, { type: "Other", percentage: 2.5 }],
    education: [{ level: "No Qualifications", percentage: 25.8 }, { level: "Level 1-2", percentage: 32.5 }, { level: "Level 3", percentage: 13.1 }, { level: "Level 4+", percentage: 21.2 }, { level: "Other", percentage: 7.4 }],
  },
  "Witham Central": {
    age: [{ group: "0-17", percentage: 22.1 }, { group: "18-29", percentage: 15.5 }, { group: "30-44", percentage: 19.8 }, { group: "45-59", percentage: 20.2 }, { group: "60-74", percentage: 14.8 }, { group: "75+", percentage: 7.6 }],
    ethnicity: [{ group: "White British", percentage: 88.2 }, { group: "White Other", percentage: 5.5 }, { group: "Asian", percentage: 2.5 }, { group: "Black", percentage: 1.5 }, { group: "Mixed", percentage: 1.7 }, { group: "Other", percentage: 0.6 }],
    housing: [{ type: "Owner Occupied", percentage: 66.8 }, { type: "Social Rented", percentage: 15.5 }, { type: "Private Rented", percentage: 15.2 }, { type: "Other", percentage: 2.5 }],
    education: [{ level: "No Qualifications", percentage: 20.5 }, { level: "Level 1-2", percentage: 29.8 }, { level: "Level 3", percentage: 13.2 }, { level: "Level 4+", percentage: 28.5 }, { level: "Other", percentage: 8.0 }],
  },
  "Gosfield & Greenstead Green": {
    age: [{ group: "0-17", percentage: 18.8 }, { group: "18-29", percentage: 9.2 }, { group: "30-44", percentage: 14.8 }, { group: "45-59", percentage: 24.1 }, { group: "60-74", percentage: 21.5 }, { group: "75+", percentage: 11.6 }],
    ethnicity: [{ group: "White British", percentage: 96.1 }, { group: "White Other", percentage: 2.0 }, { group: "Asian", percentage: 0.5 }, { group: "Black", percentage: 0.3 }, { group: "Mixed", percentage: 0.7 }, { group: "Other", percentage: 0.4 }],
    housing: [{ type: "Owner Occupied", percentage: 83.5 }, { type: "Social Rented", percentage: 5.2 }, { type: "Private Rented", percentage: 9.1 }, { type: "Other", percentage: 2.2 }],
    education: [{ level: "No Qualifications", percentage: 12.1 }, { level: "Level 1-2", percentage: 22.8 }, { level: "Level 3", percentage: 11.5 }, { level: "Level 4+", percentage: 45.2 }, { level: "Other", percentage: 8.4 }],
  },
};

// Electoral Calculus MRP predictions (scraped data)
export const ecPrediction = {
  prediction: "Reform gain from CON",
  predicted: {
    CON: 32.2,
    LAB: 14.2,
    Reform: 39.0,
    LIB: 5.1,
    Green: 7.9,
    OTH: 0.8,
  },
  winningChances: {
    Reform: 66,
    CON: 30,
    LAB: 4,
    LIB: 0,
    Green: 0,
  },
  lastUpdated: "2026-03-22",
};

// Ward-level EC data: electorate + 2024 winner + predicted winner
export const wardElectoralCalc: Record<string, { electorate: number; winner2024: string; predictedWinner: string }> = {
  "Bocking Blackwater": { electorate: 7324, winner2024: "CON", predictedWinner: "Reform" },
  "Bocking North": { electorate: 4181, winner2024: "LAB", predictedWinner: "Reform" },
  "Bocking South": { electorate: 4650, winner2024: "LAB", predictedWinner: "Reform" },
  "Braintree Central & Beckers Green": { electorate: 6602, winner2024: "LAB", predictedWinner: "Reform" },
  "Braintree South": { electorate: 4677, winner2024: "LAB", predictedWinner: "Reform" },
  "Braintree West": { electorate: 4682, winner2024: "CON", predictedWinner: "Reform" },
  "Bumpstead": { electorate: 2314, winner2024: "CON", predictedWinner: "CON" },
  "Gosfield & Greenstead Green": { electorate: 2236, winner2024: "CON", predictedWinner: "CON" },
  "Great Notley & Black Notley": { electorate: 7671, winner2024: "CON", predictedWinner: "CON" },
  "Halstead St Andrew's": { electorate: 4849, winner2024: "Reform", predictedWinner: "Reform" },
  "Halstead Trinity": { electorate: 5060, winner2024: "LAB", predictedWinner: "Reform" },
  "Hedingham": { electorate: 4430, winner2024: "Reform", predictedWinner: "Reform" },
  "Rayne": { electorate: 2192, winner2024: "Reform", predictedWinner: "Reform" },
  "Stour Valley North": { electorate: 2337, winner2024: "CON", predictedWinner: "CON" },
  "Stour Valley South": { electorate: 2498, winner2024: "CON", predictedWinner: "CON" },
  "Three Fields": { electorate: 4521, winner2024: "CON", predictedWinner: "Reform" },
  "Yeldham": { electorate: 2231, winner2024: "CON", predictedWinner: "Reform" },
  // Uttlesford district wards within Braintree constituency
  "Felsted & Stebbing": { electorate: 4200, winner2024: "CON", predictedWinner: "CON" },
  "The Sampfords": { electorate: 2100, winner2024: "CON", predictedWinner: "CON" },
  // Witham constituency wards (in Braintree District but different constituency)
  "Coggeshall": { electorate: 4679, winner2024: "CON", predictedWinner: "CON" },
  "Hatfield Peverel & Terling": { electorate: 5027, winner2024: "CON", predictedWinner: "CON" },
  "Kelvedon & Feering": { electorate: 4694, winner2024: "CON", predictedWinner: "CON" },
  "Silver End & Cressing": { electorate: 5459, winner2024: "CON", predictedWinner: "Reform" },
  "The Colnes": { electorate: 4804, winner2024: "CON", predictedWinner: "CON" },
  "Witham Central": { electorate: 5064, winner2024: "LAB", predictedWinner: "CON" },
  "Witham North": { electorate: 5597, winner2024: "LAB", predictedWinner: "Reform" },
  "Witham South": { electorate: 4646, winner2024: "LAB", predictedWinner: "CON" },
  "Witham West": { electorate: 4928, winner2024: "LAB", predictedWinner: "CON" },
};

export const newsFeeds = [
  { name: "Braintree & Witham Times", url: "https://www.braintreeandwithamtimes.co.uk/news/rss/" },
  { name: "Essex Live", url: "https://www.essexlive.news/rss.xml" },
  { name: "East Anglian Daily Times", url: "https://www.eadt.co.uk/rss" },
  { name: "BBC Essex", url: "https://feeds.bbci.co.uk/news/england/essex/rss.xml" },
  { name: "Braintree District Council", url: "https://www.braintree.gov.uk/rss" },
  { name: "Essex County Council", url: "https://www.essex.gov.uk/rss.xml" },
  { name: "Google News - Braintree", url: "https://news.google.com/rss/search?q=Braintree+Essex&hl=en-GB&gl=GB&ceid=GB:en" },
  { name: "Google News - Cleverly", url: "https://news.google.com/rss/search?q=James+Cleverly&hl=en-GB&gl=GB&ceid=GB:en" },
];

export const constituencyGeo = {
  center: [0.5558, 51.8782] as [number, number],
  zoom: 11,
  bounds: [
    [0.35, 51.75],
    [0.80, 52.00],
  ] as [[number, number], [number, number]],
};
