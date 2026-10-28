# Validation record

2026-10-27, final local build checks.

- `npm run build`: passed (TypeScript and production bundling). The 3D renderer bundle produces a size warning; the city atlas is loaded separately on demand.
- `npm test`: 17 tests passed. Coverage includes connected routing, disconnected graphs, hypothetical passage filtering, sun position/nighttime, mapped height parsing, weather units/intervals, GTFS CSV and service exceptions, city/campus search, scene import validation, bounded assistant geometry, heat-index applicability, planning passages, and nonmutating AI edit previews.
- Chromium desktop/mobile checks: canvas rendered without page errors; tree placement and undo worked; no horizontal overflow at 390 px. The repeatable script is `scripts/browser-smoke.py` and requires Python Playwright, Chromium, and the running development server.
- Earlier live checks: NWS Berkeley hourly forecasts returned real values; the official BART GTFS ZIP downloaded and passed archive integrity checks; the San Francisco atlas rendered 6,488 features with no page or tile errors in the checked viewport. These successes do not establish current availability or complete itinerary correctness.
- Current runtime policy: enforced, with no custom domains active. Fresh NWS, Overpass, and BART calls fail to reach their hosts. Required domain additions have been saved in the environment draft but are not active. Before this policy state, the primary Overpass provider also returned errors/timeouts, and its alternate returned a proxy 403. Detailed neighborhood ingestion and the complete Berkeley-to-Chase itinerary have not passed live validation.
- OpenAI: missing-key handling returns HTTP 503 with a configuration message. No successful model call has been made because the server key is absent. Proposal validation/application tests are independent of a real model call.
- `npx cap sync`: passed for Android and iOS, including GPS, speech, and notification plugins. Native compilation, signing, device GPS accuracy, locked-screen operation, and background lifecycle tests remain unrun.
- Vercel deployment: configuration and entry point are present; no deployment has been performed or validated.

Source/runtime failures are visible to users. The editable Garden District is explicitly fictional. Temperature/comfort estimates and hypothetical access are labeled, and hypothetical routes cannot start real GPS navigation.

## Subsequent local credential setup

The supplied credential was saved to the Git-ignored local `.env` with owner-only permissions. Both development and production startup commands now load that file. The restarted API reports `aiConfigured: true`. A small real generation request still failed because the runtime could not reach `api.openai.com`; no successful model response has been verified. The cloud secret-store binding and Vercel configuration are separate from this local setup.


## Local macOS continuation — 2026-10-27 (03:15 UTC on October 28)

Restored GitHub main into the local checkout and installed the locked dependencies using Node 24 via `npx --package=node@24`. Local development is running on port 5173 with its API on port 8787. The local setup created an ignored, owner-only `.env` from the example; this checkout currently reports `aiConfigured: false`. The credential in the earlier cloud workspace was not transferred by Git.

- `npm test`: 28 tests passed. Added comparison coverage for preferred alternatives, detour fallbacks, one-way/stair restrictions, identical/missing endpoints, cheaper-path updates, hypothetical passage gating, bounded endpoint snapping, merged walking directions, curved-path shade sampling, rotated footprints, and tree/night shading.
- `npm run build`: TypeScript and production build passed. The existing large 3D bundle warning remains.
- In-app browser: verified route-card selection and updated summary, map snapping to an existing endpoint, same-endpoint empty state, endpoint swap, Escape cancellation, and detour-budget feedback. Start/finish labels render in the 3D scene. At 390 × 844, route cards fit without horizontal overflow and picking scrolls back to the map. Native device behavior remains untested.
- Local NWS request for Berkeley returned 156 hourly forecast records. This verifies local weather access, not Overpass ingestion, transit itinerary correctness, OpenAI generation, or background GPS.

Routing now uses a priority queue and shares graph/shade preparation across preferences. Shade sampling follows each edge polyline, and straight segments on the same road merge into one direction. Map picking snaps within 40 m to an existing path node; it does not create walking links or imply a route exists between disconnected components. Manual endpoint changes are disabled during active GPS tracking.


## Built-area walking navigation — 2026-10-28

- `npm test`: 42 tests pass, including OSM-format campus ingestion into all route preferences; connected default endpoints despite disconnected components; campus building/street searches beyond the initial list limit; private-access exclusion; GPS projection along straight and bent paths; preservation of one-way/stair/hypothetical restrictions; stale/inaccurate fixes; connected arrival checks; and cancellation of pending/old GPS sessions.
- `npm run build`: TypeScript and production bundle pass. The existing renderer bundle size warning remains.
- Browser flow at a separate local test origin: searched a synthetic QA campus, opened the atlas, built it, and verified that the resulting planner uses campus endpoints and all four route choices. Reloading preserves the built world and restores connected endpoints. Search, preference changes, hypothetical-mode GPS gating, and rebuilding with the larger area selector were checked. At 390 × 844 there is no horizontal overflow, and map picking scrolls to the scene. The fixture is explicitly synthetic and was not installed in the user's regular app origin.
- Native GPS hardware, background operation, and an actual outdoor walk remain unverified. GPS routing and watcher lifecycle were tested with deterministic fixes and injected watcher callbacks; browser tests did not request the user's physical location.
- Fresh Berkeley map fetch: primary Overpass returned HTTP 502. Alternate host checks timed out, including the currently documented Private.coffee endpoint. No successful live neighborhood download is claimed for this checkpoint. Local weather remains separately verified in the preceding record.

Each built city/campus now initializes from a connected public walking component instead of arbitrary first/last OSM nodes. Search covers all connected path points and indexes nearby named buildings without inventing an entrance or an access link. GPS fixes project onto existing permitted edges, splitting them for remaining-distance routing without mutating the saved map. Guidance recalculates with current preferences and stops on scene changes; cancellation also handles watchers that finish creating after a permission prompt. Arrival requires proximity, acceptable GPS accuracy, and a short remaining connected route. Unknown indoor corridors remain excluded, and hypothetical planning cannot start GPS guidance. Transit outside the Bay Area explicitly reports its current lack of coverage instead of presenting a Berkeley trip as local service.
