# Walk-Free

An architectural atlas for exploring urban shade, planning walks, and designing better places. React, TypeScript, Three.js, Express, and Capacitor. Open data providers, managed email/password accounts, and an optional OpenAI assistant. Hosting and authentication use services with free tiers and usage limits; a free deployment is not unlimited.

## Run

Install Node 24 (or run `nvm use` if you use nvm). From a terminal on your computer:

```sh
git clone https://github.com/AyanBhardwaj1/Walk-Free.git
cd Walk-Free
npm run setup
npm run dev
```

Open **http://localhost:5173** for the public landing page. Email/password signup and login open `/app`. Set `WALK_FREE_AUTH_URL` to your Neon managed-auth base URL before using accounts. This workflow does not require a Codex cloud environment or publishing its settings. If you already cloned the repository, run the commands from `npm run setup` onward in that checkout. Setup installs locked dependencies and creates `.env` only when it is absent; it never overwrites existing configuration.

Vite serves the web app on port 5173; Express serves its API on port 8787. Open the running web app, not `index.html` directly. The starter district is an explicitly fictional design study. Search for a US city to open the city atlas, then select a neighborhood for a detailed editable scene.

For the assistant, set `WALK_FREE_OPENAI_API_KEY` in your computer's `.env`. Credentials are deliberately excluded from Git, so cloning does not transfer the key saved in another workspace. The map and weather providers need no API keys; accounts need a configured managed-auth service. Local requests use your computer's network; source availability and complete journeys still need verification there.

To continue development with Codex on your computer, open this cloned folder in a local Codex session. Repository instructions in `AGENTS.md` preserve the request to commit and push verified milestones regularly.

```sh
npm run build
npm test
npm start
```

`npm start` serves the production build and API on port 8787. Create `.env` from `.env.example` for local configuration. Both `npm run dev` and `npm start` load this ignored file when it exists. Keep its permissions at `0600`; never commit it or put API credentials in `VITE_` variables. Existing exported variables take precedence.

## Implemented

- Pre-built UT Austin, UC Berkeley, University of Michigan, UCLA, Stanford and Arizona State areas (`public/areas/`, 2 km squares) open instantly. Other areas build from OpenStreetMap: the API tries four Overpass mirrors, then the browser queries Overpass directly. Regenerate hero areas with `npm run areas:build` or the **Build hero areas** GitHub workflow.
- Heat on the ground: walking paths coloured from fully shaded to full sun for the chosen moment; tap a path or pick a place to see its feels-like temperature in sun and shade, its shade share, and an hourly chart; hottest/coolest streets and parks; side-by-side comparison. Route cards show feels-like, degrees cooler than the quickest route, and minutes in direct sun. The time-of-day slider uses the area's local time and follows forecast hours.
- Route types: quickest, more shade, scenic, cool stops (through an air-conditioned library or student union on pre-built campuses in daytime; hours not verified), step-free (never uses mapped stairs, slopes over 8% or inaccessible paths) and lit at night (prefers OSM-lit, busier streets).
- Walking view: starting a walk switches to a flat, north-up map that follows you with a large next-turn banner and the next stretch's heat; a map button toggles 2D/3D anytime.
- Plant shade trees: a Design studio tool (and assistant tool) lines a street with trees and shows shade share and feels-like before and after, for the street and the whole area.
- Ask Walk-Free: plain-English or spoken questions. The model calls tools that run in the browser on the loaded area (find places, plan and show routes, rank heat, check a street through the day, move the time, build an area, draft a design change to preview). Replies can be read aloud.

- Responsive ivory/green architectural interface, 3D buildings, procedural trees and landmark assets, sun-directed shadows, city search and bounded OSM ingestion.
- Route cards compare walking time, distance, modeled shade, and indoor coverage for speed, shade, scenery, and indoor preference over a connected pedestrian graph. Pick start/destination points near mapped path junctions, swap endpoints, and follow visible start/finish markers. Repeated paths and detour-budget fallbacks are identified. Hypothetical indoor passages require explicit planning mode and cannot start GPS navigation.
- Date/time and temperature/cloud/wind scenario controls, NWS hourly forecast adapter, timestamped provenance and explicit coverage gaps.
- Studio placement, dimension/rotation/position controls, terrain raise/lower/flatten, designed roads, undo, local project persistence, validated JSON import and export.
- AI design proposal preview/apply workflow. Server-side key, bounded objects and coordinates; no fake AI response when the key is absent. The assistant uses any OpenAI-compatible chat API (OpenAI by default; set `WALK_FREE_AI_BASE_URL` and `WALK_FREE_AI_MODEL` to switch, for example to Meta's Model API).
- Built areas open directly in the walking planner with connected endpoints, searchable streets and paths, and nearby named buildings. The atlas offers 0.8, 1.6, or 2 km area widths; routes remain inside the loaded network. A walking-path overlay and responsive camera help locate endpoints.
- Browser foreground location with route recalculation and spoken current-road guidance. Use my location starts a route from a projected point along a mapped path; GPS guidance follows the current area and route settings, with accuracy, off-network, and arrival handling. Native background GPS and speech adapters, iOS/Android projects and permission declarations.
- Berkeley/Sather Gate to Chase Center trip adapter: official BART GTFS direct trains via Embarcadero or 16th St Mission, real mapped walking legs, forecast visibility comparison where available.

## Important current limits

This is a working development implementation, not a validated public navigation service. Live NWS forecasts, the OpenFreeMap style, and the official BART GTFS archive download have been verified. Detailed city extraction failed in the earlier cloud environment; it has not yet been revalidated on this local setup, so a complete real walking/transit itinerary remains unverified. Local NWS hourly forecasts were successfully checked on October 27, 2026. New local map checks on October 28 returned a primary-provider error and alternate-provider timeouts; successful build-to-route behavior was verified with a synthetic campus fixture, not a fresh live map download. The OpenAI key is configured separately through local `.env` or server environment settings. The interface reports those failures instead of manufacturing city geometry, forecasts, train times, or assistant responses.

BART transfers, live service disruptions, general nationwide transit, verified indoor campus maps, comprehensive accessibility validation, and background-navigation device tests are not complete. The city atlas streams a broad 3D basemap; detailed editable scenes load a bounded neighborhood selected from that atlas. Designed roads do not automatically become verified navigation links. Terrain changes do not alter the walking graph or the shade estimator's flat-ground assumption. Importing assets as custom glTF models is not implemented.

Feels-like temperatures are estimates: shade uses the heat index (or air temperature), and direct sun adds up to 8 °C scaled by sun height, cloud and wind. They are comfort guidance for choosing a walk, not measured street temperatures or health advice. Shade calculations estimate direct solar occlusion, not measured local air temperature, calibrated microclimate simulation, or a guaranteed comfort index. Forecast fog is regional; the product cannot promise street-by-street fog avoidance. Scenery is currently inferred from mapped parks/path types. Forecast defaults for missing humidity/clouds remain scenario assumptions. Date/time solar controls explicitly display UTC input and local display time.

## Data and service configuration

Required outbound hosts:

- `overpass-api.de`: bounded OSM area queries, cached for 24 hours. `WALK_FREE_OVERPASS_URL` can select an alternate instance such as `https://overpass.kumi.systems/api/interpreter`.
- `tiles.openfreemap.org`: streamed city atlas and map assets.
- `api.open-meteo.com`: live weather (primary; open data, CC BY 4.0, no key), refreshed every 10 minutes in the app. The browser contacts it directly if the API cannot.
- `api.weather.gov`: backup hourly forecasts for US locations.
- `www.bart.gov` (and its canonical redirects): official static GTFS schedules.
- `api.openai.com`: optional assistant.

No map subscription or geocoding key is required. The city index is a curated list of major US city coordinates; see `server/cities.ts`. See [research](docs/RESEARCH.md) for source licenses, data gaps, and examined alternatives. Preserve OSM attribution and applicable ODbL obligations in downstream data exports. The procedural study is original fictional geometry.

## Accounts and privacy

The public website has landing, signup, login, password-reset, and privacy pages. Email/password accounts use Neon managed Better Auth through a same-origin Express proxy. The app does not expose Google/social login endpoints. Session cookies are HTTP-only and scoped to the app host; API requests for maps, forecasts, journeys, and AI are checked against the managed session. Authentication errors fail closed. Set `WALK_FREE_AUTH_URL` on the server, not in browser variables. New passwords require 12–128 characters. The provider performs hashing, account persistence, and auth throttling.

Scenes are stored in browser local storage under the account ID; cross-device project sync and self-service account deletion are not implemented. Existing pre-account scenes remain intact and can be downloaded using **Export earlier scene**, then imported into the signed-in workspace. Browser storage is not an encryption boundary; use a trusted device. GPS tracks are not persisted to the server.

The initial Neon configuration permits email/password signup without email verification. The UI includes a verification-code flow if verification is enabled later. Password reset uses the provider's shared email service, which Neon documents for development/testing; delivery has not been end-to-end verified. A production email provider, ownership verification, support contact, and account-deletion flow should be settled before broad public launch. No marketing emails or Google integration were added.

This account integration targets the same-origin website. Native Capacitor authentication requires a separate secure session handoff and device testing; existing GPS adapters do not establish native login readiness.

## Vercel

Import this repository with the Vite preset; install `npm ci`, build `npm run build`, output `dist`. The repository contains `api/index.ts` and rewrite configuration for the Express API. Set `WALK_FREE_OPENAI_API_KEY` (optionally `WALK_FREE_AI_MODEL`) and `WALK_FREE_DATABASE_URL` (a Postgres connection string, such as the Neon project's) as server environment variables. The database stores per-user daily and site-wide monthly assistant call counts (`WALK_FREE_AI_DAILY_LIMIT`, default 80; `WALK_FREE_AI_MONTHLY_LIMIT`, default 4000); without it, the hosted assistant refuses to run. No key should be bundled into the browser. Set `WALK_FREE_AUTH_URL` and `WALK_FREE_APP_URL` (the exact HTTPS production origin) as server variables. Add that exact origin to Neon Auth trusted domains. The current signed-in Vercel workspace is Pro; deployment is pending the user’s free-versus-existing-Pro workspace choice. No Vercel deployment is claimed yet. Native builds need `VITE_API_BASE_URL` set to the deployed HTTPS origin before building.

Caches are bounded local files, using `/tmp` on Vercel; they are not durable or globally shared. Large OSM/GTFS requests may exceed your configured serverless execution limits. On Vercel the assistant runs only when `WALK_FREE_DATABASE_URL` is set, so usage limits are shared by every function instance; local development counts in memory. Also set a monthly spend limit on the AI provider's dashboard as a backstop. Projects are stored on the current device in IndexedDB, separated by account, with no shared storage yet.

## Native mobile

See [native setup and device checks](docs/MOBILE.md). Generated projects are present; platform binaries have not been compiled or tested on devices in this Linux workspace.

See [the validation record](docs/VALIDATION.md) for the distinction between passing local checks, earlier live-source checks, and current network blockers. The historical `scripts/browser-smoke.py` predates authentication and no longer represents the current entry flow. Current account and public-page checks are recorded in the validation log; unit/API checks run with `npm test`.

## Cost boundaries

Vercel Hobby is restricted to personal/noncommercial use and stops features at usage caps; the connected account currently uses Pro. Neon’s connected organization is on Free. No paid plan or add-on was selected. Free-tier quotas and external map availability can limit service; “always free at any scale” is not promised. See [Vercel Hobby](https://vercel.com/docs/plans/hobby), [Neon plans](https://neon.com/pricing), and [Neon auth production guidance](https://neon.com/docs/auth/production-checklist).
