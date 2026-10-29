/**
 * Common campus nicknames and building codes that OpenStreetMap names may
 * not include. Keys are exact OSM building names. OSM's own ref,
 * short_name and alt_name tags are added to these automatically.
 */
export const BUILDING_ALIASES: Record<string, string[]> = {
  // UT Austin
  "Bill and Melinda Gates Computer Science Complex": [
    "GDC",
    "Gates Dell Complex",
    "Gates Dell",
  ],
  "Perry-Castañeda Library": ["PCL"],
  "William C. Powers, Jr. Student Activity Center": [
    "SAC",
    "Student Activity Center",
  ],
  "Union Building": ["Texas Union", "UNB"],
  "Robert B. Rowling Hall": ["RRH", "Rowling Hall"],
  "Gregory Gymnasium": ["GRE", "Gregory Gym", "Greg Gym"],
  "Main Building": ["UT Tower", "The Tower", "MAI"],
  "Peter T. Flawn Academic Center": ["FAC", "Flawn"],
  "Jester Center": ["JES", "Jester"],
  "Andrews Dormitory": ["Andrews Hall", "AND"],
  "Carothers Dormitory": ["Carothers Hall", "CRD"],
  "Littlefield Dormitory": ["Littlefield Hall"],
  "Kinsolving Dormitory": ["Kinsolving Hall", "KIN"],
  // UC Berkeley
  "The Campanile (Sather Tower)": ["Campanile", "Sather Tower"],
  "Martin Luther King Jr. Student Union": ["MLK Student Union", "MLK"],
  "Moffitt Undergraduate Library": ["Moffitt"],
  // University of Michigan
  "Harlan Hatcher Graduate Library": ["Hatcher", "Grad Library"],
  "Hatcher Graduate Library": ["Hatcher", "Grad Library"],
  "Shapiro Undergraduate Library": ["UGLi", "Ugli", "Shapiro"],
  // UCLA
  "Charles E. Young Research Library": ["YRL", "Young Research Library"],
  "Edwin W. Pauley Pavilion": ["Pauley", "Pauley Pavilion"],
  // Stanford
  "Tresidder Memorial Union": ["Tresidder"],
  // Arizona State
  "Memorial Union": ["MU"],
};

/** Words people use interchangeably when naming campus places. */
const SYNONYMS = [
  ["hall", "dormitory", "dorm", "residence"],
  ["library", "lib"],
  ["center", "centre", "ctr"],
  ["building", "bldg"],
  ["gymnasium", "gym"],
  ["street", "st"],
  ["avenue", "ave"],
  ["drive", "dr"],
  ["boulevard", "blvd"],
  ["university", "univ"],
  ["and", "&"],
];
const lookup = new Map(
  SYNONYMS.flatMap((group) => group.map((w) => [w, group])),
);

/** A query word and the words it can stand for. */
export function searchVariants(word: string): string[] {
  return lookup.get(word) ?? [word];
}
