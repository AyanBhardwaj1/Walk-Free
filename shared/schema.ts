import { z } from "zod";
import { LANDMARK_SHAPES } from "./types.js";
const n = z.number().finite();
const point = z.tuple([n.min(-50000).max(50000), n.min(-50000).max(50000)]);
const origin = z.object({ lat: n.min(-85).max(85), lon: n.min(-180).max(180) });
export const worldSchema = z.object({
  id: z.string().max(150),
  name: z.string().max(200),
  origin,
  timezone: z.string().refine((s) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: s });
      return true;
    } catch {
      return false;
    }
  }),
  extent: n.min(100).max(10000),
  objects: z
    .array(
      z.object({
        id: z.string(),
        kind: z.enum(["tree", "building", "skyscraper", "tower", "landmark"]),
        name: z.string().max(200),
        position: point,
        width: n.positive().max(5000),
        depth: n.positive().max(5000),
        height: n.positive().max(1500),
        rotation: n.min(-360).max(360),
        color: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .optional(),
        footprint: z.array(point).min(3).max(5000).optional(),
        aliases: z.array(z.string().max(200)).max(12).optional(),
        shape: z.enum(LANDMARK_SHAPES).optional(),
        source: z.enum(["osm", "canopy", "user", "ai", "study"]),
        sourceId: z.string().optional(),
        heightMethod: z.enum([
          "mapped",
          "levels",
          "estimated",
          "designed",
          "published",
        ]),
      }),
    )
    .max(60000),
  roads: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        points: z.array(point).min(2).max(5000),
        width: n.positive().max(200),
        kind: z.enum(["road", "footway", "cycleway"]),
        source: z.enum(["osm", "user", "ai", "study"]),
      }),
    )
    .max(60000),
  landscapes: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        kind: z.enum(["park", "water"]),
        points: z.array(point).min(3).max(10000),
      }),
    )
    .max(10000),
  amenities: z
    .array(
      z.object({
        id: z.string().max(80),
        kind: z.enum(["water", "shelter"]),
        name: z.string().max(200),
        position: point,
      }),
    )
    .max(20000)
    .optional(),
  indoor: z
    .array(
      z.object({
        buildingId: z.string().max(200),
        buildingName: z.string().max(200),
        source: z.string().max(60),
        hours: z.string().max(500).optional(),
        levels: z
          .array(
            z.object({
              ordinal: z.number().int().min(-10).max(200),
              name: z.string().max(100),
              rooms: z
                .array(
                  z.object({
                    name: z.string().max(200),
                    ring: z.array(point).min(3).max(2000),
                    kind: z.enum([
                      "room",
                      "corridor",
                      "stairs",
                      "elevator",
                      "restroom",
                      "other",
                    ]),
                  }),
                )
                .max(5000),
              paths: z.array(z.array(point).min(2).max(2000)).max(5000),
              doors: z.array(point).max(10000),
              entrances: z.array(point).max(500).optional(),
              placed: z.boolean().optional(),
            }),
          )
          .max(100),
      }),
    )
    .max(500)
    .optional(),
  graph: z.object({
    nodes: z
      .array(z.object({ id: z.string(), point, name: z.string().optional() }))
      .max(100000),
    edges: z
      .array(
        z.object({
          id: z.string(),
          from: z.string(),
          to: z.string(),
          points: z.array(point).min(2).max(5000),
          name: z.string(),
          distance: n.positive(),
          covered: z.boolean(),
          scenic: n.min(0).max(1),
          indoor: z.enum(["no", "verified", "hypothetical"]),
          stairs: z.boolean(),
          accessible: z.boolean(),
          bidirectional: z.boolean(),
          lit: z.boolean().optional(),
          roadClass: z.enum(["major", "street", "service", "path"]).optional(),
        }),
      )
      .max(200000),
  }),
  terrain: z
    .object({
      size: n.positive().max(10000),
      resolution: z.number().int().min(2).max(257),
      heights: z.array(n.min(-500).max(500)).max(66049),
    })
    .refine((t) => t.heights.length === t.resolution ** 2)
    .optional(),
  provenance: z.object({
    source: z.string(),
    attribution: z.string(),
    retrievedAt: z.string(),
    live: z.boolean(),
    notes: z.array(z.string()),
  }),
});
