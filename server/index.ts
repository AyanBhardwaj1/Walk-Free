import express from "express";
import { ZodError } from "zod";
import { resolve } from "node:path";
import { getWorld, getWeather } from "./data.js";
import { cities, searchCities } from "./cities.js";
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
app.get("/api/cities", (q, r) => {
  const term = String(q.query.q || "").toLowerCase();
  r.json(searchCities(term));
});
app.use("/api", authenticate);
app.get("/api/world", async (q, r, next) => {
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
app.get("/api/weather", async (q, r, next) => {
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
      r.status(e.status).json({
        error: e.message,
        code: e.code,
        details: e.details,
      });
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
