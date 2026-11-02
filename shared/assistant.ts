/**
 * Tools the walking assistant can call. The model chooses them on the server;
 * the browser runs them against the area that is already loaded, so the map
 * never has to be uploaded.
 */
export const ASSISTANT_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "find_places",
      description:
        "Search the loaded area for buildings, streets, paths and parks by name. Use before plan_route when a name is ambiguous.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "plan_route",
      description:
        "Plan a walk in the loaded area and show it on the map. Returns every route option with minutes, shade, minutes in direct sun and feels-like temperature.",
      parameters: {
        type: "object",
        properties: {
          from: {
            type: "string",
            description: "Start place name, or 'my location'.",
          },
          to: { type: "string", description: "Destination place name." },
          preference: {
            type: "string",
            enum: [
              "quickest",
              "shade",
              "scenic",
              "indoors",
              "stepfree",
              "night",
            ],
            description:
              "indoors routes through an air-conditioned building (cool stop); stepfree avoids stairs and steep slopes; night prefers lit streets.",
          },
          leave_at_hour: {
            type: "number",
            description: "Local departure hour 0-23.75, e.g. 15 for 3 PM.",
          },
          avoid_stairs: { type: "boolean" },
        },
        required: ["from", "to"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "heat_ranking",
      description:
        "Rank named streets and parks in the loaded area from hottest to coolest at a local hour (default: the time shown).",
      parameters: {
        type: "object",
        properties: {
          hour: { type: "number" },
          limit: { type: "integer", minimum: 1, maximum: 10 },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "place_heat",
      description:
        "Feels-like temperature, shade and the hottest and coolest hours of the day for one named street or park. Also highlights it on the map.",
      parameters: {
        type: "object",
        properties: { place: { type: "string" }, hour: { type: "number" } },
        required: ["place"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "best_time_to_leave",
      description:
        "Find the coolest hour to set off on a walk, by the real current time: today's hours from the current hour to 8 PM, or tomorrow's (6 AM to 8 PM) once 8 PM has passed. Returns the date, the best hour, how much cooler it is than now (when now is within today's walking hours), and the feels-like for every hour. Shows the route on the map without moving the clock.",
      parameters: {
        type: "object",
        properties: {
          from: {
            type: "string",
            description: "Start place name, or 'my location'.",
          },
          to: { type: "string", description: "Destination place name." },
          preference: {
            type: "string",
            enum: [
              "quickest",
              "shade",
              "scenic",
              "indoors",
              "stepfree",
              "night",
            ],
          },
        },
        required: ["from", "to"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "compare_walks",
      description:
        "How much shade routing helps in the loaded area at an hour: over a fixed sample of walks, the share of the sun the shade route avoids, minutes saved and extra distance. Use for 'how shade-friendly is this campus?'.",
      parameters: {
        type: "object",
        properties: {
          hour: {
            type: "number",
            description: "Local hour 0-23.75; the time shown if omitted.",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_time",
      description: "Move the time-of-day slider to a local hour (0-23.75).",
      parameters: {
        type: "object",
        properties: { hour: { type: "number" } },
        required: ["hour"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "build_area",
      description:
        "Build a US city, neighborhood or campus (for example 'UT Austin' or 'UC Berkeley') so it can be explored and walked. It also opens Walk-Free's fictional cities by exact name: Noir Harbor (rainy gothic towers at night), Skyline Prime (sunny art-deco boulevards), Velocity Bay (fast, breezy bay grid), Aurora Realm (golden citadel under the aurora) and Neon District (neon-lit night-life downtown).",
      parameters: {
        type: "object",
        properties: { place: { type: "string" } },
        required: ["place"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "generate_city",
      description:
        "Generate a whole new walkable 3D city from a description (any real, fictional or imagined city, mood or climate) and drop the person in its middle. Pass their description in their own words. Realism: sketch (quick, small), detailed (default), dense (large, intricate; uses more credits; only when the person asks for it). Call at most once per request. Use when they ask to create, generate or imagine a city.",
      parameters: {
        type: "object",
        properties: {
          description: { type: "string" },
          realism: { type: "string", enum: ["sketch", "detailed", "dense"] },
        },
        required: ["description"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "plant_shade_trees",
      description:
        "Plant a row of shade trees along both sides of a named street or path and return its shade and feels-like before and after, at the time shown. Prefer this over propose_design for adding street trees.",
      parameters: {
        type: "object",
        properties: { street: { type: "string" } },
        required: ["street"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "propose_design",
      description:
        "Draft a design change to the 3D scene, such as planting trees along a street or adding a building. The person previews it and decides whether to apply it.",
      parameters: {
        type: "object",
        properties: { request: { type: "string" } },
        required: ["request"],
      },
    },
  },
];
export type AssistantToolName =
  (typeof ASSISTANT_TOOLS)[number]["function"]["name"];
export const MAX_TOOL_ROUNDS = 4;
