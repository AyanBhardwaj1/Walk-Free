# Walk-Free

Heat-aware walking for campuses and cities: see how hot every street feels at the hour you walk it, take the shadiest way there, and let Meta's Muse Spark plan the walk.

**Live:** https://walk-free.vercel.app · **Guest demo:** https://walk-free.vercel.app/demo · **Hackathon writeup:** [docs/HACKATHON.md](docs/HACKATHON.md)

React, TypeScript, Three.js, Express, and Capacitor. Open data providers, managed email/password accounts, and an optional assistant on Meta's Model API (or another OpenAI-compatible provider). Hosting and authentication use services with free tiers and usage limits; a free deployment is not unlimited.

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

For the assistant, set `WALK_FREE_AI_API_KEY` in your computer's `.env` (an OpenAI key, or a Meta Model API key with `WALK_FREE_AI_BASE_URL=https://api.meta.ai/v1`, which defaults the model to `muse-spark-1.3`; `WALK_FREE_OPENAI_API_KEY` still works). Credentials are deliberately excluded from Git, so cloning does not transfer the key saved in another workspace. The map and weather providers need no API keys; accounts need a configured managed-auth service. Local requests use your computer's network; source availability and complete journeys still need verification there.

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
- Search: one search bar finds buildings, streets and cities; From/To fields search as you type. Matching understands campus codes and nicknames (GDC, PCL, SAC, RRH, UGLi, YRL…), OSM ref/short/alt names and synonyms (hall/dormitory, library/lib). Places off the map, and walks without a mapped connection, hand off to Google Maps.
- Layout: full-screen map with a collapsible floating panel on desktop and a draggable bottom sheet on phones; custom dropdowns throughout.
- Guest demo at `/demo` (and `/demo?area=ut-austin`): campuses, heat and routes without an account; the assistant needs sign-in or the person's own AI key.
- Bring your own AI key: the Ask tab's AI settings accept a Meta Model API (`muse-spark-1.3`, the default), OpenAI, DeepInfra, Fireworks, Baseten, OpenRouter, Together or legacy Meta Llama API key (Fireworks, Baseten, Together and DeepInfra are preset to Meta's open Muse models), stored only in that browser and used per request without the shared caps. **Test and save** makes one small call first and shows the provider's own reason if the key or model is rejected; the provider is picked from the key's prefix, and the form opens by itself when the shared assistant is unset or out of quota.
- Layered data with fallbacks (see Data & Sources in the app):
  - Streets, paths, buildings, mapped trees, drinking water and shelters from OpenStreetMap.
  - Tree canopy from Meta and WRI's 1 m Canopy Height Maps v2 (built with Meta's DINOv3) fills in shade where OSM maps few trees (at Berkeley: 214 mapped trees plus about 10,900 inferred crowns). The server reads only the needed byte ranges of the public Cloud-Optimized GeoTIFFs; `/api/canopy` is public and CDN-cached, and areas still load without it.
  - Weather from Open-Meteo, then NWS, then the browser; live sunlight (W/m²) replaces the cloud-cover estimate of solar heat, and the UV index is shown.
  - City search uses the bundled US index, then Open-Meteo geocoding (GeoNames) for anywhere else, with the place's own time zone.
- Route cards count mapped drinking fountains within 20 m of the walk.
- Air quality and official alerts: the weather card shows the area's US AQI (Open-Meteo, CAMS model), and the Route tab shows a notice when the National Weather Service has an Extreme Heat Warning/Watch, Heat Advisory or Air Quality Alert in effect, or the air is unhealthy. Both come from `/api/outlook` (each cached 10 minutes, failures not cached) or straight from the providers for guests, at a location rounded to about 1 km, and the assistant receives them as context.
- Sun aversion: a Route-tab slider (1–6, default 3) sets how many metres of shade a metre of sun is worth avoiding for the shade route (CoolWalks' α); the default reproduces the earlier fixed weighting exactly, and the assistant's routes use the same setting.
- The assistant replies in the language you write in.
- NWS HeatRisk: today's 0–4 level in the weather card and the week in Data & Sources; Major or Extreme adds a notice.
- Plant-here proposal: after planting trees in Design studio, **Write a proposal** turns the before/after numbers into a one-page letter to copy, download or share.
- Compare walks (Data & Sources): how much of the sun the shade route avoids across a fixed sample of walks at the hour shown, the minutes saved and the extra distance. The landing page's campus cards show the same for a July afternoon.
- Walking view: "In shade for 120 m" or "Shade in 80 m" and the minutes left in the sun; spoken guidance mentions shade close ahead.
- Write a heat brief (Data & Sources): a one-page text for planners with the hottest and coolest walks at the hour shown, mapped trees vs canopy crowns, and the Compare walks result when it has been run.
- Download street heat (Data & Sources): every street and park's modeled shade and feels-like at the hour shown, as CSV for planners.
- Assistant tools include `best_time_to_leave` ("when should I leave?") and `compare_walks` ("how shade-friendly is this campus?"). Signed-out visitors can **Watch what it does**: a labelled, scripted run of the real tools on the open campus, with replies written from their numbers.
- Air quality forecast: a notice when the next 12 hours bring unhealthy air.
- °F / °C: the header button switches the temperatures in the map workspace (weather card, route cards, best time, heat panel, heat index, walking banner, proposals, the assistant and its demo; the landing page and the CSV stay in °F); the first choice follows the browser's region and is kept on the device.
- Installable app: a web manifest and a service worker that opens the app and visited campuses offline (the API is never cached).
- Interface styles: Editorial (default), Night, Sunlight (high contrast for outdoor glare) and Blueprint, from the palette button in the header or the S key. Every stylesheet colour is a role token (`--c-<bg|fg|line|shadow>-<hex>`, generated by `node scripts/tokenize-colors.mjs`); each style transforms them in `src/lib/theme.ts`, and the 3D scene and 2D map follow along.
- Best time to go: for the chosen walk, how each hour you could set off today would feel, with the coolest hour called out; tap an hour to move the time there. Play the day sweeps the sun from 6 AM to 8 PM.
- Share walk links open the guest demo on the same campus, endpoints, route type and hour; Save walk keeps up to twelve favourites in the browser. Keyboard: / search, P play the day, S style, V 3D/flat, ? help.
- Quality gates: `npm run lint` (TypeScript, React hooks, accessibility), `npm test`, `npm run test:coverage`. The API rate-limits account, map, weather, canopy and geocoding requests and sends a Content-Security-Policy.
- Home dashboard (`/home`): where signed-in people land. It shows a greeting, a live heat preview, every ready campus with its hottest street and shade-route gain, saved walks and the main tools.
- Fictional cities: Noir Harbor, Skyline Prime, Velocity Bay, Aurora Realm and Neon District (`src/lib/fiction-cities.ts`).
  - They are procedurally generated from fixed seeds and fully walkable: routing, heat, search and the assistant work as on a real campus.
  - Each has its own sky, fog, weather layer (rain, sun haze, speed streaks, aurora or mist), ground tint and night window glow.
  - Open them from search, the dashboard, the landing page, the panel's city switcher or `/app?fiction=<slug>`.
  - They are labelled as fictional everywhere, and their heat numbers are illustrations.
- Midtown Manhattan (`/app?area=midtown-manhattan`, a 1.3 km square built from a 3×3 grid of Overpass tiles; 3,283 buildings) is listed as a city district alongside the campuses.
- 3D scene:
  - Soft shadows, distance fog and land that runs out to a fogged horizon.
  - A warmer sun as it lowers, moonlight after sunset, and lit windows from dusk.
  - The weather chip shows a sun, moon, cloud or rain to match the conditions.
  - The camera button saves a picture of the 3D view (with a fictional city's sky) captioned with the place and time.
- Generate a city: describe any city and Walk-Free builds a walkable 3D city from it.
  - The AI (Meta Muse Spark or your own key) plans districts, landmarks (16 signature shapes), street names, climate and sky via `POST /api/agent/city`. Credits scale with realism: Sketch 1, Detailed 2, Dense 4.
  - `buildCityFromSpec` (`src/lib/city-from-spec.ts`) builds it deterministically, with an offline designer (`spec-from-prompt.ts`) when no AI is available.
  - You can open it from the panel, from search, from the assistant's `generate_city` tool, or with `/app?generate=…`. Cities you've made are kept in the browser (`/app?generated=…`).
- Walk it at street level: the camera walks the chosen route at a walker's eye height, under the trees and between the buildings. Any drag stops it.
- People on the streets: walkers wander the network, thin out at night and prefer shade in the heat. They are on by default in fictional and generated cities; the people button on the map toggles them.
- A 1-minute guided tour (`?tour=1`, or the button on prebuilt areas) explains each feature and does it. Guests opening `/demo` start on UT Austin; after dark there, the demo opens at 3 PM and says so.
- Landmarks are named on the 3D map from each prebuilt area's `labels` list in `shared/areas.ts`. A test checks every name exists in the shipped data.
- Step-free routes never use steps. When the chosen points only connect by steps, the route starts or ends at the nearest step-free point within 80 m, and the card and the assistant say how far away it is.
- After dark, route cards drop shade and sun minutes and show the lit share instead.
- Landmark heights: OpenStreetMap outlines with mapped 3D parts sit under their parts. Cited published heights (`shared/landmark-heights.ts`, e.g. the UT Tower's 307 ft) override partial OSM heights.
- A day in the life (Route tab): six everyday walks planned in shade at their own hours, with a playable timeline. Prebuilt areas can name real stops (`day` in `shared/areas.ts`).
- Weather controls:
  - Presets: Heatwave, Hot & humid, Summer, Mild, Cool, July afternoon, Live.
  - Sliders, a local-date picker, and air, shade and sun feels-like.
  - Available in the Climate tab and from the weather chip on the map.
- Quick walk anywhere (city atlas):
  - Places from Photon, then Nominatim.
  - Routes from OSRM foot, then Valhalla, then a labelled straight-line estimate.
  - Shows the source, links to Google Maps, and can build the walk in 3D.
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

Feels-like temperatures are estimates: shade uses the heat index (or air temperature), and direct sun adds up to 8 °C scaled by measured sunlight in live weather (sun height and cloud in scenarios) and by wind. Inferred canopy crowns are 9 m cells where at least 45% of the 1 m canopy map is 3 m or taller; they are not surveyed trees. They are comfort guidance for choosing a walk, not measured street temperatures or health advice. Shade calculations estimate direct solar occlusion, not measured local air temperature, calibrated microclimate simulation, or a guaranteed comfort index. Forecast fog is regional; the product cannot promise street-by-street fog avoidance. Scenery is currently inferred from mapped parks/path types. Forecast defaults for missing humidity/clouds remain scenario assumptions. Date/time solar controls explicitly display UTC input and local display time.

## Data and service configuration

Required outbound hosts:

- `overpass-api.de`: bounded OSM area queries, cached for 24 hours. `WALK_FREE_OVERPASS_URL` can select an alternate instance such as `https://overpass.kumi.systems/api/interpreter`.
- `tiles.openfreemap.org`: streamed city atlas and map assets.
- `api.open-meteo.com`: live weather (primary; open data, CC BY 4.0, no key), refreshed every 10 minutes in the app. The browser contacts it directly if the API cannot.
- `api.weather.gov`: backup hourly forecasts for US locations, and active heat and air-quality alerts.
- `air-quality-api.open-meteo.com`: area air quality (US AQI, PM2.5, ozone).
- `dataforgood-fb-data.s3.amazonaws.com`: Meta/WRI canopy height tiles (server only; the bucket sends no CORS headers). `WALK_FREE_CANOPY_URL` can point at a mirror.
- `geocoding-api.open-meteo.com`: city search fallback.
- `www.bart.gov` (and its canonical redirects): official static GTFS schedules.
- `api.openai.com` or `api.meta.ai` (Meta Model API): optional assistant.

No map subscription or geocoding key is required. The city index is a curated list of major US city coordinates (`server/cities.ts`), with Open-Meteo geocoding as a fallback (`server/geocode.ts`). Run `npm run areas:canopy` to add canopy to the shipped areas without downloading OSM again. See [research](docs/RESEARCH.md) for source licenses, data gaps, and examined alternatives. Preserve OSM attribution and applicable ODbL obligations in downstream data exports. The procedural study is original fictional geometry.

## Accounts and privacy

The public website has landing, signup, login, password-reset, and privacy pages. Email/password accounts use Neon managed Better Auth through a same-origin Express proxy. The app does not expose Google/social login endpoints. Session cookies are HTTP-only and scoped to the app host; API requests for maps, forecasts, journeys, and AI are checked against the managed session. Authentication errors fail closed. Set `WALK_FREE_AUTH_URL` on the server, not in browser variables. New passwords require 12–128 characters. The provider performs hashing, account persistence, and auth throttling.

Scenes are stored in browser local storage under the account ID; cross-device project sync and self-service account deletion are not implemented. Existing pre-account scenes remain intact and can be downloaded using **Export earlier scene**, then imported into the signed-in workspace. Browser storage is not an encryption boundary; use a trusted device. GPS tracks are not persisted to the server.

The initial Neon configuration permits email/password signup without email verification. The UI includes a verification-code flow if verification is enabled later. Password reset uses the provider's shared email service, which Neon documents for development/testing; delivery has not been end-to-end verified. A production email provider, ownership verification, support contact, and account-deletion flow should be settled before broad public launch. No marketing emails or Google integration were added.

This account integration targets the same-origin website. Native Capacitor authentication requires a separate secure session handoff and device testing; existing GPS adapters do not establish native login readiness.

## Vercel

Import this repository with the Vite preset; install `npm ci`, build `npm run build`, output `dist`. The repository contains `api/index.ts` and rewrite configuration for the Express API. Set `WALK_FREE_AI_API_KEY` with `WALK_FREE_AI_BASE_URL=https://api.meta.ai/v1` for Meta's Muse Spark (or `WALK_FREE_OPENAI_API_KEY` for OpenAI; optionally `WALK_FREE_AI_MODEL`) and `WALK_FREE_DATABASE_URL` (a Postgres connection string, such as the Neon project's) as server environment variables. The database stores per-user daily and site-wide monthly assistant call counts (`WALK_FREE_AI_DAILY_LIMIT`, default 80; `WALK_FREE_AI_MONTHLY_LIMIT`, default 4000); without it, the hosted assistant refuses to run. No key should be bundled into the browser. Set `WALK_FREE_AUTH_URL` and `WALK_FREE_APP_URL` (the exact HTTPS production origin) as server variables. Add that exact origin to Neon Auth trusted domains. The current signed-in Vercel workspace is Pro; deployment is pending the user’s free-versus-existing-Pro workspace choice. No Vercel deployment is claimed yet. Native builds need `VITE_API_BASE_URL` set to the deployed HTTPS origin before building.

Caches are bounded local files, using `/tmp` on Vercel; they are not durable or globally shared. Large OSM/GTFS requests may exceed your configured serverless execution limits. On Vercel the assistant runs only when `WALK_FREE_DATABASE_URL` is set, so usage limits are shared by every function instance; local development counts in memory. Also set a monthly spend limit on the AI provider's dashboard as a backstop. Projects are stored on the current device in IndexedDB, separated by account, with no shared storage yet.

## Native mobile

See [native setup and device checks](docs/MOBILE.md). Generated projects are present; platform binaries have not been compiled or tested on devices in this Linux workspace.

See [the validation record](docs/VALIDATION.md) for the distinction between passing local checks, earlier live-source checks, and current network blockers. The historical `scripts/browser-smoke.py` predates authentication and no longer represents the current entry flow. Current account and public-page checks are recorded in the validation log; unit/API checks run with `npm test`.

## Cost boundaries

Vercel Hobby is restricted to personal/noncommercial use and stops features at usage caps; the connected account currently uses Pro. Neon’s connected organization is on Free. No paid plan or add-on was selected. Free-tier quotas and external map availability can limit service; “always free at any scale” is not promised. See [Vercel Hobby](https://vercel.com/docs/plans/hobby), [Neon plans](https://neon.com/pricing), and [Neon auth production guidance](https://neon.com/docs/auth/production-checklist).
