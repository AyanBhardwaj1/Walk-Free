import express from "express";
import { ZodError } from "zod";
import { resolve } from "node:path";
import { getCanopy, getWorld, getWeather } from "./data.js";
import { CANOPY_ATTRIBUTION } from "../shared/canopy.js";
import { findCities } from "./geocode.js";
import { clientKey, perAccount, rateLimiter } from "./rate-limit.js";
import { coordinates, boundedRadius, cleanName } from "./validators.js";
import { ServiceError } from "./network.js";
import { agentRouter } from "./agent.js";
import { aiConfig } from "./ai.js";
import { berkeleyJourney } from "./transit.js";
import { authRouter, authenticate } from "./auth.js";
export const app = express();
app.disable("x-powered-by");
app.use((q, r, next) => {
  if (
    ["capacitor://localhost", "http://localhost", "https://localhost"].includes(
      q.headers.origin || "",
    )
  ) {
    r.setHeader("Access-Control-Allow-Origin", q.headers.origin!);
    r.setHeader("Vary", "Origin");
    r.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, X-Walk-Free-AI-Key, X-Walk-Free-AI-Provider, X-Walk-Free-AI-Model",
    );
    r.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  }
  if (q.method === "OPTIONS") {
    r.sendStatus(204);
    return;
  }
  next();
});
app.use(express.json({ limit: "2mb" }));
app.use("/api/auth", authRouter);
app.get("/api/health", (_q, r) =>
  r.json({
    ok: true,
    // Configuration flags only, never values, so deploys are easy to check.
    aiConfigured: Boolean(aiConfig()),
    aiUsageDatabase: Boolean(
      process.env.WALK_FREE_DATABASE_URL || process.env.DATABASE_URL,
    ),
    accountsConfigured: Boolean(process.env.WALK_FREE_AUTH_URL),
    appUrlConfigured: Boolean(process.env.WALK_FREE_APP_URL),
  }),
);
const geocodeAllowed = rateLimiter(40);
app.get("/api/cities", async (q, r, next) => {
  try {
    const query = String(q.query.q || "").toLowerCase();
    // Past the limit, answer from the bundled index only.
    r.json(await findCities(query, geocodeAllowed(clientKey(q))));
  } catch (e) {
    next(e);
  }
});
// Public and cacheable: open data about the area, no account details.
const canopyAllowed = rateLimiter(20);
app.get("/api/canopy", async (q, r, next) => {
  try {
    const { lat, lon } = coordinates(q.query.lat, q.query.lon);
    const radius = boundedRadius(q.query.radius);
    if (!canopyAllowed(clientKey(q))) {
      r.setHeader("Cache-Control", "no-store");
      r.status(429).json({
        error: "Too many canopy requests. Wait a minute and try again.",
        code: "RATE_LIMITED",
      });
      return;
    }
    const area = await getCanopy(lat, lon, radius);
    if (!area) {
      r.setHeader("Cache-Control", "no-store");
      r.status(503).json({
        error: "The tree canopy map can't be reached right now.",
        code: "CANOPY_UNAVAILABLE",
      });
      return;
    }
    r.setHeader(
      "Cache-Control",
      "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400",
    );
    r.json({ ...area, attribution: CANOPY_ATTRIBUTION });
  } catch (e) {
    next(e);
  }
});
app.use("/api", authenticate);
// Each build can run several Overpass queries; keep one account from
// holding every map slot or getting the server blocked upstream.
app.get("/api/world", perAccount(12, "map"), async (q, r, next) => {
  try {
    const { lat, lon } = coordinates(q.query.lat, q.query.lon);
    r.json(
      await getWorld(
        lat,
        lon,
        cleanName(q.query.name),
        boundedRadius(q.query.radius),
      ),
    );
  } catch (e) {
    next(e);
  }
});
app.get("/api/weather", perAccount(40, "weather"), async (q, r, next) => {
  try {
    const { lat, lon } = coordinates(q.query.lat, q.query.lon);
    r.json(await getWeather(lat, lon));
  } catch (e) {
    next(e);
  }
});
app.get("/api/journey/berkeley", async (q, r, next) => {
  try {
    r.json(
      await berkeleyJourney(
        String(q.query.departure || new Date().toISOString()),
      ),
    );
  } catch (e) {
    next(e);
  }
});
app.use("/api/agent", agentRouter);
app.use("/api", (_q, r) =>
  r.status(404).json({ error: "Unknown API endpoint" }),
);
app.use(express.static(resolve("dist")));
app.get("/{*path}", (_q, r) => r.sendFile(resolve("dist/index.html")));
app.use(
  (
    e: unknown,
    q: express.Request,
    r: express.Response,
    _n: express.NextFunction,
  ) => {
    // People see a sentence; details stay in the server log.
    if (e instanceof ServiceError) {
      // Details name upstream hosts; they help operators, not visitors.
      if (e.details) console.warn(`${e.code}: ${e.details}`);
      r.status(e.status).json({ error: e.message, code: e.code });
      return;
    }
    if (e instanceof ZodError) {
      r.status(400).json({
        error: "Some of the request didn't look right. Please try again.",
        code: "INVALID_REQUEST",
      });
      return;
    }
    const status =
      typeof (e as { status?: unknown })?.status === "number"
        ? (e as { status: number }).status
        : 500;
    if (status >= 400 && status < 500) {
      r.status(status).json({
        error: "The request couldn't be read. Please try again.",
        code: "BAD_REQUEST",
      });
      return;
    }
    console.error(`[api] ${q.method} ${q.path}`, e);
    r.status(500).json({
      error: "Something went wrong on our side. Please try again.",
      code: "INTERNAL",
    });
  },
);
if (!process.env.VERCEL)
  app.listen(8787, "0.0.0.0", () => console.log("Walk-Free API on port 8787"));
export default app;
