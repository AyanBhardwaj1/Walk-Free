import express from "express";
import { resolve } from "node:path";
import { getWorld, getWeather } from "./data";
import { cities, searchCities } from "./cities";
import { coordinates, boundedRadius, cleanName } from "./validators";
import { ServiceError } from "./network";
import { agentRouter } from "./agent";
import { berkeleyJourney } from "./transit";
import { authRouter, authenticate } from "./auth";
export const app = express();
app.use((q, r, next) => {
  if (
    ["capacitor://localhost", "http://localhost", "https://localhost"].includes(
      q.headers.origin || "",
    )
  ) {
    r.setHeader("Access-Control-Allow-Origin", q.headers.origin!);
    r.setHeader("Vary", "Origin");
    r.setHeader("Access-Control-Allow-Headers", "Content-Type");
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
    aiConfigured: Boolean(
      process.env.WALK_FREE_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
    ),
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
    _q: express.Request,
    r: express.Response,
    _n: express.NextFunction,
  ) => {
    r.status(e instanceof ServiceError ? e.status : 500).json({
      error: e instanceof Error ? e.message : "Unexpected service error",
      ...(e instanceof ServiceError
        ? { code: e.code, details: e.details }
        : {}),
    });
  },
);
if (!process.env.VERCEL)
  app.listen(8787, "0.0.0.0", () => console.log("Walk-Free API on port 8787"));
export default app;
