import type { City } from "../shared/types.js";

/**
 * An independently curated, bundled gazetteer of approximate city and campus
 * centers. Coordinates are geographic facts, manually compiled for this app;
 * this is not a scraped geocoding service or a third-party licensed database.
 * Only when it has few matches does findCities ask Open-Meteo's geocoder.
 * Centers are starting viewpoints, not street addresses, campus entrances,
 * surveyed boundaries, or guarantees of pedestrian access. Time zones are IANA
 * identifiers for the named location; nearestCity is not a time-zone polygon
 * lookup. Search runs locally and sends no requests to public geocoders.
 */
export const cityDataProvenance =
  "Walk-Free curated US city and university index. Approximate center coordinates for map discovery; not geocoded addresses or surveyed campus boundaries. Time zones use IANA identifiers. Places outside the index come from Open-Meteo geocoding (GeoNames, CC BY 4.0).";

const zones = {
  E: "America/New_York",
  C: "America/Chicago",
  M: "America/Denver",
  P: "America/Los_Angeles",
  AZ: "America/Phoenix",
  AK: "America/Anchorage",
  HI: "Pacific/Honolulu",
  ID: "America/Boise",
  MI: "America/Detroit",
  IN: "America/Indiana/Indianapolis",
  KY: "America/Kentucky/Louisville",
} as const;
type Zone = keyof typeof zones;
type PlaceRow = [
  name: string,
  state: string,
  lat: number,
  lon: number,
  zone: Zone,
  aliases?: string,
];

// Major cities are first so an empty search is useful without population claims.
const rows: PlaceRow[] = [
  ["New York", "NY", 40.7128, -74.006, "E", "NYC New York City Manhattan"],
  ["Los Angeles", "CA", 34.0522, -118.2437, "P", "LA"],
  ["Chicago", "IL", 41.8781, -87.6298, "C"],
  ["Houston", "TX", 29.7604, -95.3698, "C"],
  ["Phoenix", "AZ", 33.4484, -112.074, "AZ"],
  ["Philadelphia", "PA", 39.9526, -75.1652, "E", "Philly"],
  ["San Antonio", "TX", 29.4241, -98.4936, "C"],
  ["San Diego", "CA", 32.7157, -117.1611, "P"],
  ["Dallas", "TX", 32.7767, -96.797, "C"],
  ["San Jose", "CA", 37.3382, -121.8863, "P"],
  ["Austin", "TX", 30.2672, -97.7431, "C"],
  ["Jacksonville", "FL", 30.3322, -81.6557, "E"],
  ["Fort Worth", "TX", 32.7555, -97.3308, "C", "Ft Worth"],
  ["Columbus", "OH", 39.9612, -82.9988, "E"],
  ["Indianapolis", "IN", 39.7684, -86.1581, "IN", "Indy"],
  ["Charlotte", "NC", 35.2271, -80.8431, "E"],
  ["San Francisco", "CA", 37.7749, -122.4194, "P", "SF"],
  ["Seattle", "WA", 47.6062, -122.3321, "P"],
  ["Denver", "CO", 39.7392, -104.9903, "M"],
  [
    "Washington",
    "DC",
    38.9072,
    -77.0369,
    "E",
    "Washington DC District of Columbia",
  ],
  ["Boston", "MA", 42.3601, -71.0589, "E"],
  ["El Paso", "TX", 31.7619, -106.485, "M"],
  ["Nashville", "TN", 36.1627, -86.7816, "C"],
  ["Oklahoma City", "OK", 35.4676, -97.5164, "C", "OKC"],
  ["Portland", "OR", 45.5152, -122.6784, "P"],
  ["Las Vegas", "NV", 36.1699, -115.1398, "P", "Vegas"],
  ["Detroit", "MI", 42.3314, -83.0458, "MI"],
  ["Memphis", "TN", 35.1495, -90.049, "C"],
  ["Louisville", "KY", 38.2527, -85.7585, "KY"],
  ["Baltimore", "MD", 39.2904, -76.6122, "E"],
  ["Milwaukee", "WI", 43.0389, -87.9065, "C"],
  ["Albuquerque", "NM", 35.0844, -106.6504, "M"],
  ["Tucson", "AZ", 32.2226, -110.9747, "AZ"],
  ["Fresno", "CA", 36.7378, -119.7871, "P"],
  ["Sacramento", "CA", 38.5816, -121.4944, "P"],
  ["Mesa", "AZ", 33.4152, -111.8315, "AZ"],
  ["Kansas City", "MO", 39.0997, -94.5786, "C", "KCMO"],
  ["Atlanta", "GA", 33.749, -84.388, "E", "ATL"],
  ["Omaha", "NE", 41.2565, -95.9345, "C"],
  ["Colorado Springs", "CO", 38.8339, -104.8214, "M"],
  ["Raleigh", "NC", 35.7796, -78.6382, "E"],
  ["Long Beach", "CA", 33.7701, -118.1937, "P"],
  ["Virginia Beach", "VA", 36.8529, -75.978, "E"],
  ["Miami", "FL", 25.7617, -80.1918, "E"],
  ["Oakland", "CA", 37.8044, -122.2711, "P"],
  ["Minneapolis", "MN", 44.9778, -93.265, "C"],
  ["Tulsa", "OK", 36.154, -95.9928, "C"],
  ["Bakersfield", "CA", 35.3733, -119.0187, "P"],
  ["Wichita", "KS", 37.6872, -97.3301, "C"],
  ["Arlington", "TX", 32.7357, -97.1081, "C"],
  ["Aurora", "CO", 39.7294, -104.8319, "M"],
  ["Tampa", "FL", 27.9506, -82.4572, "E"],
  ["New Orleans", "LA", 29.9511, -90.0715, "C", "NOLA"],
  ["Cleveland", "OH", 41.4993, -81.6944, "E"],
  ["Honolulu", "HI", 21.3099, -157.8581, "HI"],
  ["Anaheim", "CA", 33.8366, -117.9143, "P"],
  ["Henderson", "NV", 36.0395, -114.9817, "P"],
  ["Orlando", "FL", 28.5383, -81.3792, "E"],
  ["Lexington", "KY", 38.0406, -84.5037, "E"],
  ["Stockton", "CA", 37.9577, -121.2908, "P"],
  ["Riverside", "CA", 33.9806, -117.3755, "P"],
  ["Corpus Christi", "TX", 27.8006, -97.3964, "C"],
  ["Irvine", "CA", 33.6846, -117.8265, "P"],
  ["Cincinnati", "OH", 39.1031, -84.512, "E"],
  ["Santa Ana", "CA", 33.7455, -117.8677, "P"],
  ["Newark", "NJ", 40.7357, -74.1724, "E"],
  ["Saint Paul", "MN", 44.9537, -93.09, "C", "St Paul"],
  ["Pittsburgh", "PA", 40.4406, -79.9959, "E"],
  ["Greensboro", "NC", 36.0726, -79.792, "E"],
  ["Lincoln", "NE", 40.8136, -96.7026, "C"],
  ["Durham", "NC", 35.994, -78.8986, "E"],
  ["Plano", "TX", 33.0198, -96.6989, "C"],
  ["Anchorage", "AK", 61.2181, -149.9003, "AK"],
  ["Jersey City", "NJ", 40.7178, -74.0431, "E"],
  ["Chandler", "AZ", 33.3062, -111.8413, "AZ"],
  ["Saint Louis", "MO", 38.627, -90.1994, "C", "St Louis STL"],
  ["Buffalo", "NY", 42.8864, -78.8784, "E"],
  ["Chula Vista", "CA", 32.6401, -117.0842, "P"],
  ["North Las Vegas", "NV", 36.1989, -115.1175, "P"],
  ["Gilbert", "AZ", 33.3528, -111.789, "AZ"],
  ["Madison", "WI", 43.0731, -89.4012, "C"],
  ["Reno", "NV", 39.5296, -119.8138, "P"],
  ["Fort Wayne", "IN", 41.0793, -85.1394, "IN", "Ft Wayne"],
  ["Toledo", "OH", 41.6528, -83.5379, "E"],
  ["Lubbock", "TX", 33.5779, -101.8552, "C"],
  ["Saint Petersburg", "FL", 27.7676, -82.6403, "E", "St Petersburg St Pete"],
  ["Laredo", "TX", 27.5306, -99.4803, "C"],
  ["Irving", "TX", 32.814, -96.9489, "C"],
  ["Chesapeake", "VA", 36.7682, -76.2875, "E"],
  ["Glendale", "AZ", 33.5387, -112.186, "AZ"],
  ["Winston-Salem", "NC", 36.0999, -80.2442, "E"],
  ["Scottsdale", "AZ", 33.4942, -111.9261, "AZ"],
  ["Garland", "TX", 32.9126, -96.6389, "C"],
  ["Boise", "ID", 43.615, -116.2023, "ID"],
  ["Norfolk", "VA", 36.8508, -76.2859, "E"],
  ["Spokane", "WA", 47.6588, -117.426, "P"],
  ["Richmond", "VA", 37.5407, -77.436, "E"],
  ["Fremont", "CA", 37.5485, -121.9886, "P"],
  ["Huntsville", "AL", 34.7304, -86.5861, "C"],
  ["Frisco", "TX", 33.1507, -96.8236, "C"],
  ["Cape Coral", "FL", 26.5629, -81.9495, "E"],
  ["Santa Clarita", "CA", 34.3917, -118.5426, "P"],
  ["Baton Rouge", "LA", 30.4515, -91.1871, "C"],
  ["Tacoma", "WA", 47.2529, -122.4443, "P"],
  ["San Bernardino", "CA", 34.1083, -117.2898, "P"],
  ["Modesto", "CA", 37.6391, -120.9969, "P"],
  ["McKinney", "TX", 33.1972, -96.6398, "C"],
  ["Fontana", "CA", 34.0922, -117.435, "P"],
  ["Des Moines", "IA", 41.5868, -93.625, "C"],
  ["Fayetteville", "NC", 35.0527, -78.8784, "E"],
  ["Salt Lake City", "UT", 40.7608, -111.891, "M", "SLC"],
  ["Worcester", "MA", 42.2626, -71.8023, "E"],
  ["Rochester", "NY", 43.1566, -77.6088, "E"],
  ["Yonkers", "NY", 40.9312, -73.8987, "E"],
  ["Little Rock", "AR", 34.7465, -92.2896, "C"],
  ["Birmingham", "AL", 33.5186, -86.8104, "C"],
  ["Augusta", "GA", 33.4735, -82.0105, "E"],
  ["Sioux Falls", "SD", 43.5446, -96.7311, "C"],
  ["Amarillo", "TX", 35.222, -101.8313, "C"],
  ["Grand Rapids", "MI", 42.9634, -85.6681, "MI"],
  ["Montgomery", "AL", 32.3668, -86.3, "C"],
  ["Huntington Beach", "CA", 33.6595, -117.9988, "P"],
  ["Akron", "OH", 41.0814, -81.519, "E"],
  ["Tallahassee", "FL", 30.4383, -84.2807, "E"],
  ["Tempe", "AZ", 33.4255, -111.94, "AZ"],
  ["Knoxville", "TN", 35.9606, -83.9207, "E"],
  ["Mobile", "AL", 30.6954, -88.0399, "C"],
  ["Providence", "RI", 41.824, -71.4128, "E"],
  ["Fort Lauderdale", "FL", 26.1224, -80.1373, "E", "Ft Lauderdale"],
  ["Chattanooga", "TN", 35.0456, -85.3097, "E"],
  ["Vancouver", "WA", 45.6387, -122.6615, "P"],
  ["Brownsville", "TX", 25.9017, -97.4975, "C"],
  ["Santa Rosa", "CA", 38.4404, -122.7141, "P"],
  ["Eugene", "OR", 44.0521, -123.0868, "P"],
  ["Salem", "OR", 44.9429, -123.0351, "P"],
  ["Peoria", "AZ", 33.5806, -112.2374, "AZ"],
  ["Oceanside", "CA", 33.1959, -117.3795, "P"],
  ["Ontario", "CA", 34.0633, -117.6509, "P"],
  ["Rancho Cucamonga", "CA", 34.1064, -117.5931, "P"],
  ["Newport News", "VA", 37.0871, -76.473, "E"],
  ["Elk Grove", "CA", 38.4088, -121.3716, "P"],
  ["Garden Grove", "CA", 33.7743, -117.937, "P"],
  ["Pembroke Pines", "FL", 26.0078, -80.2963, "E"],
  ["Fort Collins", "CO", 40.5853, -105.0844, "M"],
  ["Springfield", "MO", 37.209, -93.2923, "C"],
  ["Charleston", "SC", 32.7765, -79.9311, "E"],
  ["Savannah", "GA", 32.0809, -81.0912, "E"],
  ["Columbia", "SC", 34.0007, -81.0348, "E"],
  ["Charleston", "WV", 38.3498, -81.6326, "E"],
  ["Jackson", "MS", 32.2988, -90.1848, "C"],
  ["Fargo", "ND", 46.8772, -96.7898, "C"],
  ["Bismarck", "ND", 46.8083, -100.7837, "C"],
  ["Billings", "MT", 45.7833, -108.5007, "M"],
  ["Missoula", "MT", 46.8721, -113.994, "M"],
  ["Helena", "MT", 46.5891, -112.0391, "M"],
  ["Cheyenne", "WY", 41.14, -104.8202, "M"],
  ["Casper", "WY", 42.8501, -106.3252, "M"],
  ["Burlington", "VT", 44.4759, -73.2121, "E"],
  ["Montpelier", "VT", 44.2601, -72.5754, "E"],
  ["Manchester", "NH", 42.9956, -71.4548, "E"],
  ["Concord", "NH", 43.2081, -71.5376, "E"],
  ["Portland", "ME", 43.6591, -70.2568, "E"],
  ["Augusta", "ME", 44.3106, -69.7795, "E"],
  ["Wilmington", "DE", 39.7391, -75.5398, "E"],
  ["Dover", "DE", 39.1582, -75.5244, "E"],
  ["Hartford", "CT", 41.7658, -72.6734, "E"],
  ["New Haven", "CT", 41.3083, -72.9279, "E"],
  ["Bridgeport", "CT", 41.1792, -73.1894, "E"],
  ["Santa Fe", "NM", 35.687, -105.9378, "M"],
  ["Annapolis", "MD", 38.9784, -76.4922, "E"],
  ["Trenton", "NJ", 40.2171, -74.7429, "E"],
  ["Harrisburg", "PA", 40.2732, -76.8867, "E"],
  ["Albany", "NY", 42.6526, -73.7562, "E"],
  ["Lansing", "MI", 42.7325, -84.5555, "MI"],
  ["Topeka", "KS", 39.0473, -95.6752, "C"],
  ["Jefferson City", "MO", 38.5767, -92.1735, "C"],
  ["Springfield", "IL", 39.7817, -89.6501, "C"],
  ["Frankfort", "KY", 38.2009, -84.8733, "E"],
  ["Pierre", "SD", 44.3683, -100.351, "C"],
  ["Rapid City", "SD", 44.0805, -103.231, "M"],
  ["Carson City", "NV", 39.1638, -119.7674, "P"],
  ["Olympia", "WA", 47.0379, -122.9007, "P"],
  ["Juneau", "AK", 58.3019, -134.4197, "AK"],
  ["Fairbanks", "AK", 64.8378, -147.7164, "AK"],
  ["Ann Arbor", "MI", 42.2808, -83.743, "MI"],
  ["Boulder", "CO", 40.015, -105.2705, "M"],
  ["Berkeley", "CA", 37.8716, -122.2727, "P"],
  ["Cambridge", "MA", 42.3736, -71.1097, "E"],
  ["College Station", "TX", 30.628, -96.3344, "C"],
  ["Chapel Hill", "NC", 35.9132, -79.0558, "E"],
  ["Gainesville", "FL", 29.6516, -82.3248, "E"],
  ["Tallahassee", "FL", 30.4383, -84.2807, "E"],
  ["State College", "PA", 40.7934, -77.86, "E"],
  ["Champaign", "IL", 40.1164, -88.2434, "C"],
  ["Iowa City", "IA", 41.6611, -91.5302, "C"],
  ["Bloomington", "IN", 39.1653, -86.5264, "IN"],
  ["Athens", "GA", 33.9519, -83.3576, "E"],
  ["Provo", "UT", 40.2338, -111.6585, "M"],
  [
    "UT Austin",
    "TX",
    30.285,
    -97.7341,
    "C",
    "University of Texas at Austin UT Austin campus longhorns",
  ],
  [
    "Texas A&M University",
    "TX",
    30.6187,
    -96.3365,
    "C",
    "TAMU Texas A and M College Station campus",
  ],
  [
    "UCLA",
    "CA",
    34.0689,
    -118.4452,
    "P",
    "University of California Los Angeles campus",
  ],
  [
    "UC Berkeley",
    "CA",
    37.8719,
    -122.2585,
    "P",
    "University of California Berkeley Cal campus",
  ],
  [
    "Stanford University",
    "CA",
    37.4275,
    -122.1697,
    "P",
    "Stanford campus Palo Alto",
  ],
  [
    "University of Washington",
    "WA",
    47.6553,
    -122.3035,
    "P",
    "UW Seattle campus",
  ],
  [
    "Arizona State University",
    "AZ",
    33.4242,
    -111.9281,
    "AZ",
    "ASU Tempe campus",
  ],
  ["University of Arizona", "AZ", 32.2319, -110.9501, "AZ", "UA Tucson campus"],
  [
    "University of Colorado Boulder",
    "CO",
    40.0076,
    -105.2659,
    "M",
    "CU Boulder campus",
  ],
  [
    "University of Michigan",
    "MI",
    42.278,
    -83.7382,
    "MI",
    "UMich Ann Arbor campus",
  ],
  [
    "Michigan State University",
    "MI",
    42.7018,
    -84.4822,
    "MI",
    "MSU East Lansing campus",
  ],
  [
    "Ohio State University",
    "OH",
    40.0067,
    -83.0305,
    "E",
    "OSU Columbus campus",
  ],
  [
    "University of Wisconsin Madison",
    "WI",
    43.0766,
    -89.4125,
    "C",
    "UW Madison campus",
  ],
  [
    "University of Minnesota",
    "MN",
    44.973,
    -93.2277,
    "C",
    "UMN Minneapolis Twin Cities campus",
  ],
  [
    "University of Illinois Urbana-Champaign",
    "IL",
    40.102,
    -88.2272,
    "C",
    "UIUC Illinois Urbana Champaign campus",
  ],
  [
    "Purdue University",
    "IN",
    40.4237,
    -86.9212,
    "IN",
    "Purdue West Lafayette campus",
  ],
  [
    "Indiana University Bloomington",
    "IN",
    39.1682,
    -86.523,
    "IN",
    "IU Bloomington campus",
  ],
  [
    "Penn State University",
    "PA",
    40.7982,
    -77.8599,
    "E",
    "PSU Pennsylvania State University Park campus",
  ],
  [
    "University of Pennsylvania",
    "PA",
    39.9522,
    -75.1932,
    "E",
    "UPenn Penn Philadelphia campus",
  ],
  [
    "Harvard University",
    "MA",
    42.3744,
    -71.1169,
    "E",
    "Harvard Cambridge campus",
  ],
  [
    "MIT",
    "MA",
    42.3601,
    -71.0942,
    "E",
    "Massachusetts Institute of Technology Cambridge campus",
  ],
  [
    "Columbia University",
    "NY",
    40.8075,
    -73.9626,
    "E",
    "Columbia NYC New York campus",
  ],
  [
    "New York University",
    "NY",
    40.7295,
    -73.9965,
    "E",
    "NYU Manhattan NYC New York campus",
  ],
  ["Duke University", "NC", 36.0014, -78.9382, "E", "Duke Durham campus"],
  [
    "UNC Chapel Hill",
    "NC",
    35.9049,
    -79.0469,
    "E",
    "University of North Carolina Chapel Hill campus",
  ],
  [
    "NC State University",
    "NC",
    35.7847,
    -78.6821,
    "E",
    "North Carolina State NCSU Raleigh campus",
  ],
  [
    "Georgia Tech",
    "GA",
    33.7756,
    -84.3963,
    "E",
    "Georgia Institute of Technology Atlanta GT campus",
  ],
  ["University of Georgia", "GA", 33.948, -83.3773, "E", "UGA Athens campus"],
  [
    "University of Florida",
    "FL",
    29.6436,
    -82.3549,
    "E",
    "UF Gainesville campus",
  ],
  [
    "University of Central Florida",
    "FL",
    28.6024,
    -81.2001,
    "E",
    "UCF Orlando campus",
  ],
  [
    "Florida State University",
    "FL",
    30.4419,
    -84.2985,
    "E",
    "FSU Tallahassee campus",
  ],
  [
    "University of Southern California",
    "CA",
    34.0224,
    -118.2851,
    "P",
    "USC Los Angeles campus",
  ],
  [
    "UC San Diego",
    "CA",
    32.8801,
    -117.234,
    "P",
    "UCSD University of California San Diego La Jolla campus",
  ],
  ["Rice University", "TX", 29.7174, -95.4018, "C", "Rice Houston campus"],
  ["University of Houston", "TX", 29.7199, -95.3422, "C", "UH Houston campus"],
  [
    "UT Dallas",
    "TX",
    32.9857,
    -96.7502,
    "C",
    "UTD University of Texas Dallas Richardson campus",
  ],
  [
    "UT San Antonio",
    "TX",
    29.5844,
    -98.617,
    "C",
    "UTSA University of Texas San Antonio campus",
  ],
  [
    "Texas Tech University",
    "TX",
    33.5843,
    -101.8783,
    "C",
    "TTU Lubbock campus",
  ],
  [
    "University of Utah",
    "UT",
    40.7649,
    -111.8421,
    "M",
    "U of U Salt Lake City campus",
  ],
  ["University of Oregon", "OR", 44.0448, -123.0726, "P", "UO Eugene campus"],
];

const states: Record<string, string> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  DC: "District of Columbia",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
};

export function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// Deduplication is intentional: one named place has exactly one stable ID.
const uniqueRows = [
  ...new Map(
    rows.map((row) => [`${normalize(row[0])}-${row[1]}`, row]),
  ).values(),
];
export const cities: City[] = uniqueRows.map(
  ([name, state, lat, lon, zone]) => ({
    id: `${normalize(name).replace(/ /g, "-")}-${state.toLowerCase()}`,
    name,
    state,
    lat,
    lon,
    timezone: zones[zone],
  }),
);

const index = cities.map((city, i) => ({
  city,
  name: normalize(city.name),
  aliases: normalize(uniqueRows[i]?.[5] ?? ""),
  searchable: normalize(
    `${city.name} ${city.state} ${states[city.state]} ${uniqueRows[i]?.[5] ?? ""}`,
  ),
}));

/** Local, deterministic, token-aware discovery search; always bounded to 25. */
export function searchCities(query: string): City[] {
  const q = normalize(query.slice(0, 200));
  if (!q) return cities.slice(0, 25);
  const tokens = q.split(" ");
  return index
    .filter((entry) =>
      tokens.every((token) => entry.searchable.includes(token)),
    )
    .map((entry) => ({
      ...entry,
      rank:
        entry.name === q
          ? 0
          : entry.name.startsWith(q)
            ? 1
            : entry.aliases === q
              ? 2
              : entry.name.includes(q)
                ? 3
                : 4,
    }))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 25)
    .map((entry) => entry.city);
}

/** Nearest indexed center by great-circle distance; not a reverse geocoder. */
export function nearestCity(lat: number, lon: number): City {
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  ) {
    throw new RangeError(
      "Latitude and longitude must be finite geographic coordinates.",
    );
  }
  const rad = Math.PI / 180;
  let nearest = cities[0];
  let minimum = Infinity;
  for (const city of cities) {
    const a =
      Math.sin(((city.lat - lat) * rad) / 2) ** 2 +
      Math.cos(lat * rad) *
        Math.cos(city.lat * rad) *
        Math.sin(((city.lon - lon) * rad) / 2) ** 2;
    if (a < minimum) {
      minimum = a;
      nearest = city;
    }
  }
  return nearest;
}

