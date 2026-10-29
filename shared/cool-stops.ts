/**
 * Air-conditioned public buildings on each pre-built campus where a walker
 * can cool down. Names match OpenStreetMap building names. Opening hours
 * and public access are NOT verified: routes only use them in daytime and
 * always tell people to check hours before relying on them.
 */
export interface CoolStop {
  /** Exact OpenStreetMap building name. */
  building: string;
  kind: "library" | "student union" | "public building";
}

export const COOL_STOPS: Record<string, CoolStop[]> = {
  "ut-austin": [
    { building: "Perry-Castañeda Library", kind: "library" },
    { building: "Union Building", kind: "student union" },
    {
      building: "William C. Powers, Jr. Student Activity Center",
      kind: "student union",
    },
    { building: "Peter T. Flawn Academic Center", kind: "library" },
    { building: "Gregory Gymnasium", kind: "public building" },
  ],
  "uc-berkeley": [
    { building: "Moffitt Undergraduate Library", kind: "library" },
    { building: "Martin Luther King Jr. Student Union", kind: "student union" },
  ],
  umich: [
    { building: "Michigan Union", kind: "student union" },
    { building: "Michigan League", kind: "student union" },
    { building: "Hatcher Graduate Library", kind: "library" },
    { building: "Shapiro Undergraduate Library", kind: "library" },
  ],
  ucla: [
    { building: "Ackerman Union", kind: "student union" },
    { building: "Powell Library", kind: "library" },
    { building: "Charles E. Young Research Library", kind: "library" },
    { building: "Kerckhoff Hall", kind: "student union" },
  ],
  stanford: [
    { building: "Tresidder Memorial Union", kind: "student union" },
    { building: "Lathrop Library", kind: "library" },
    { building: "Old Union", kind: "student union" },
  ],
  asu: [
    { building: "Memorial Union", kind: "student union" },
    { building: "Hayden Library", kind: "library" },
    { building: "Noble Science and Engineering Library", kind: "library" },
    { building: "Student Pavilion", kind: "student union" },
  ],
};

/** Daytime window in which unverified buildings are suggested at all. */
export const COOL_STOP_HOURS: [number, number] = [8, 20];
