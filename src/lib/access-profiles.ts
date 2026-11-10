/**
 * Ways people use Walk-Free, so the app can set itself up for them in one
 * tap. Each need switches on the settings that suit it; turning a need
 * off leaves those settings as they are (they may suit someone anyway).
 */
export type AccessNeed =
  "blind" | "low-vision" | "deaf" | "mobility" | "heat-sensitive";

export const ACCESS_PROFILES: {
  id: AccessNeed;
  label: string;
  /** What turning it on does, said plainly. */
  does: string;
}[] = [
  {
    id: "blind",
    label: "Blind",
    does: "Spoken turn-by-turn guidance, a buzz at each turn where the phone can, and larger text.",
  },
  {
    id: "low-vision",
    label: "Low vision",
    does: "Larger text and the high-contrast Sunlight style.",
  },
  {
    id: "deaf",
    label: "Deaf or hard of hearing",
    does: "Turns shown on screen and felt as a buzz, instead of spoken.",
  },
  {
    id: "mobility",
    label: "Wheelchair or mobility aid",
    does: "Step-free routes that avoid mapped stairs and steep slopes.",
  },
  {
    id: "heat-sensitive",
    label: "Sensitive to heat",
    does: "The heat check speaks up a level sooner.",
  },
];

/** The settings a need asks for (only those it changes). */
export interface AccessSettings {
  voice?: boolean;
  buzz?: boolean;
  avoidStairs?: boolean;
  preference?: "stepfree";
  theme?: "sunlight";
  heatSensitive?: boolean;
}

export function applyAccessNeed(
  need: AccessNeed,
  canVibrate: boolean,
): AccessSettings {
  switch (need) {
    case "blind":
      return { voice: true, ...(canVibrate ? { buzz: true } : {}) };
    case "low-vision":
      return { theme: "sunlight" };
    case "deaf":
      return { voice: false, ...(canVibrate ? { buzz: true } : {}) };
    case "mobility":
      return { avoidStairs: true, preference: "stepfree" };
    case "heat-sensitive":
      return { heatSensitive: true };
  }
}
