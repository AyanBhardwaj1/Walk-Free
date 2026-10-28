# Walk-Free

An architectural atlas for exploring urban shade, planning walks, and designing better places. React, TypeScript, Three.js, Express, and Capacitor. Free data providers; OpenAI is the only paid integration.

## Run

Install Node 24 (or run `nvm use` if you use nvm). From a terminal on your computer:

```sh
git clone https://github.com/AyanBhardwaj1/Walk-Free.git
cd Walk-Free
npm run setup
npm run dev
```

Open **http://localhost:5173**. This workflow does not require a Codex cloud environment or publishing its settings. If you already cloned the repository, run the commands from `npm run setup` onward in that checkout. Setup installs locked dependencies and creates `.env` only when it is absent; it never overwrites existing configuration.

Vite serves the web app on port 5173; Express serves its API on port 8787. Open the running web app, not `index.html` directly. The starter district is an explicitly fictional design study. Search for a US city to open the city atlas, then select a neighborhood for a detailed editable scene.

For the assistant, set `WALK_FREE_OPENAI_API_KEY` in your computer's `.env`. Credentials are deliberately excluded from Git, so cloning does not transfer the key saved in another workspace. The other features need no API keys. Local requests use your computer's network; source availability and complete journeys still need verification there.

To continue development with Codex on your computer, open this cloned folder in a local Codex session. Repository instructions in `AGENTS.md` preserve the request to commit and push verified milestones regularly.

```sh
npm run build
npm test
npm start
```

`npm start` serves the production build and API on port 8787. Create `.env` from `.env.example` for local configuration. Both `npm run dev` and `npm start` load this ignored file when it exists. Keep its permissions at `0600`; never commit it or put API credentials in `VITE_` variables. Existing exported variables take precedence.

## Implemented

- Responsive ivory/green architectural interface, 3D buildings, procedural trees and landmark assets, sun-directed shadows, city search and bounded OSM ingestion.
- Route cards compare walking time, distance, modeled shade, and indoor coverage for speed, shade, scenery, and indoor preference over a connected pedestrian graph. Pick start/destination points near mapped path junctions, swap endpoints, and follow visible start/finish markers. Repeated paths and detour-budget fallbacks are identified. Hypothetical indoor passages require explicit planning mode and cannot start GPS navigation.
- Date/time and temperature/cloud/wind scenario controls, NWS hourly forecast adapter, timestamped provenance and explicit coverage gaps.
- Studio placement, dimension/rotation/position controls, terrain raise/lower/flatten, designed roads, undo, local project persistence, validated JSON import and export.
- OpenAI proposal preview/apply workflow. Server-side key, bounded objects and coordinates; no fake AI response when the key is absent.
- Built areas open directly in the walking planner with connected endpoints, searchable streets and paths, and nearby named buildings. The atlas offers 0.8, 1.6, or 2 km area widths; routes remain inside the loaded network. A walking-path overlay and responsive camera help locate endpoints.
- Browser foreground location with route recalculation and spoken current-road guidance. Use my location starts a route from a projected point along a mapped path; GPS guidance follows the current area and route settings, with accuracy, off-network, and arrival handling. Native background GPS and speech adapters, iOS/Android projects and permission declarations.
- Berkeley/Sather Gate to Chase Center trip adapter: official BART GTFS direct trains via Embarcadero or 16th St Mission, real mapped walking legs, forecast visibility comparison where available.

## Important current limits

This is a working development implementation, not a validated public navigation service. Live NWS forecasts, the OpenFreeMap style, and the official BART GTFS archive download have been verified. Detailed city extraction failed in the earlier cloud environment; it has not yet been revalidated on this local setup, so a complete real walking/transit itinerary remains unverified. Local NWS hourly forecasts were successfully checked on October 27, 2026. New local map checks on October 28 returned a primary-provider error and alternate-provider timeouts; successful build-to-route behavior was verified with a synthetic campus fixture, not a fresh live map download. The OpenAI key is configured separately through local `.env` or server environment settings. The interface reports those failures instead of manufacturing city geometry, forecasts, train times, or assistant responses.

BART transfers, live service disruptions, general nationwide transit, verified indoor campus maps, comprehensive accessibility validation, and background-navigation device tests are not complete. The city atlas streams a broad 3D basemap; detailed editable scenes load a bounded neighborhood selected from that atlas. Designed roads do not automatically become verified navigation links. Terrain changes do not alter the walking graph or the shade estimator's flat-ground assumption. Importing assets as custom glTF models is not implemented.

Shade calculations estimate direct solar occlusion, not measured local air temperature, calibrated microclimate simulation, or a guaranteed comfort index. Forecast fog is regional; the product cannot promise street-by-street fog avoidance. Scenery is currently inferred from mapped parks/path types. Forecast defaults for missing humidity/clouds remain scenario assumptions. Date/time solar controls explicitly display UTC input and local display time.

## Data and service configuration

Required outbound hosts:

- `overpass-api.de`: bounded OSM area queries, cached for 24 hours. `WALK_FREE_OVERPASS_URL` can select an alternate instance such as `https://overpass.kumi.systems/api/interpreter`.
- `tiles.openfreemap.org`: streamed city atlas and map assets.
- `api.weather.gov`: hourly forecasts and grid visibility where supplied.
- `www.bart.gov` (and its canonical redirects): official static GTFS schedules.
- `api.openai.com`: optional assistant.

No map subscription or geocoding key is required. The city index is a curated list of major US city coordinates; see `server/cities.ts`. See [research](docs/RESEARCH.md) for source licenses, data gaps, and examined alternatives. Preserve OSM attribution and applicable ODbL obligations in downstream data exports. The procedural study is original fictional geometry.

## Vercel

Import this repository with the Vite preset; install `npm ci`, build `npm run build`, output `dist`. The repository contains `api/index.ts` and rewrite configuration for the Express API. Set `WALK_FREE_OPENAI_API_KEY` and optionally `WALK_FREE_OPENAI_MODEL` as server environment variables. No key should be bundled into the browser. The app has not been deployed or tested on Vercel yet. Native builds need `VITE_API_BASE_URL` set to the deployed HTTPS origin before building.

Caches are bounded local files, using `/tmp` on Vercel; they are not durable or globally shared. Large OSM/GTFS requests may exceed your configured serverless execution limits. Before making a public deployment with the AI key enabled, add user authentication and shared rate/budget enforcement; the current assistant endpoint is intended for private development use. Projects are stored on the current device, not in shared accounts.

## Native mobile

See [native setup and device checks](docs/MOBILE.md). Generated projects are present; platform binaries have not been compiled or tested on devices in this Linux workspace.

See [the validation record](docs/VALIDATION.md) for the distinction between passing local checks, earlier live-source checks, and current network blockers. With the dev server running, `python scripts/browser-smoke.py` runs the browser smoke checks in this environment (Chromium and Python Playwright required).
