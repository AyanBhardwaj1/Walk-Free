# Walk-Free

An architectural atlas for exploring urban shade, planning walks, and designing better places. React, TypeScript, Three.js, Express, and Capacitor. Free data providers; OpenAI is the only paid integration.

## Run

Node 24 is used in development. From this repository:

```sh
npm ci
npm run dev
```

Vite serves the web app on port 5173; Express serves its API on port 8787. Open the running web app, not `index.html` directly. The starter district is an explicitly fictional design study. Search for a US city to request a real bounded OpenStreetMap neighborhood.

```sh
npm run build
npm test
npm start
```

`npm start` serves the production build and API on port 8787. Create `.env` from `.env.example` for local configuration. Both `npm run dev` and `npm start` load this ignored file when it exists. Keep its permissions at `0600`; never commit it or put API credentials in `VITE_` variables. Existing exported variables take precedence.

## Implemented

- Responsive ivory/green architectural interface, 3D buildings, procedural trees and landmark assets, sun-directed shadows, city search and bounded OSM ingestion.
- Route comparisons for speed, modeled shade, scenery, and indoor preference over a connected pedestrian graph. Hypothetical indoor passages require explicit planning mode and cannot start GPS navigation.
- Date/time and temperature/cloud/wind scenario controls, NWS hourly forecast adapter, timestamped provenance and explicit coverage gaps.
- Studio placement, dimension/rotation/position controls, terrain raise/lower/flatten, designed roads, undo, local project persistence, validated JSON import and export.
- OpenAI proposal preview/apply workflow. Server-side key, bounded objects and coordinates; no fake AI response when the key is absent.
- Browser foreground location with route recalculation and spoken current-road guidance. Native background GPS and speech adapters, iOS/Android projects and permission declarations.
- Berkeley/Sather Gate to Chase Center trip adapter: official BART GTFS direct trains via Embarcadero or 16th St Mission, real mapped walking legs, forecast visibility comparison where available.

## Important current limits

This is a working development implementation, not a validated public navigation service. Live NWS forecasts, the OpenFreeMap style, and the official BART GTFS archive download have been verified. Detailed city extraction currently fails at the primary Overpass provider; its alternate is blocked by the environment network policy, so a complete real walking/transit itinerary has not yet been validated. The OpenAI key is configured separately through local `.env` or server environment settings. The interface reports those failures instead of manufacturing city geometry, forecasts, train times, or assistant responses.

BART transfers, live service disruptions, general nationwide transit, verified indoor campus maps, comprehensive accessibility validation, and background-navigation device tests are not complete. The city atlas streams a broad 3D basemap; detailed editable scenes load a bounded neighborhood selected from that atlas. Designed roads do not automatically become verified navigation links. Terrain changes do not alter the walking graph or the shade estimator's flat-ground assumption. Importing assets as custom glTF models is not implemented.

Shade calculations estimate direct solar occlusion, not measured local air temperature, calibrated microclimate simulation, or a guaranteed comfort index. Forecast fog is regional; the product cannot promise street-by-street fog avoidance. Scenery is currently inferred from mapped parks/path types. Forecast defaults for missing humidity/clouds remain scenario assumptions. Date/time solar controls explicitly display UTC input and local display time.

## Data and service configuration

Required outbound hosts:

- `overpass-api.de`: bounded OSM area queries, cached for 24 hours. `WALK_FREE_OVERPASS_URL` can select an alternate instance such as `https://overpass.kumi.systems/api/interpreter`; enable that host in network settings before using it.
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
