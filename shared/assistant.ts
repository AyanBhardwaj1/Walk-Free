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
            enum: ["quickest", "shade", "scenic", "indoors"],
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
        "Build a US city, neighborhood or campus (for example 'UT Austin' or 'UC Berkeley') so it can be explored and walked.",
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
