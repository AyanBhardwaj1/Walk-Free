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

## Public website and email/password accounts — 2026-10-28

- Public landing page, signup/login, forgot/reset password, and privacy pages are implemented. The 3D workspace is loaded only after an authenticated session, keeping its large bundle out of the initial public page.
- A dedicated Walk-Free Neon project was provisioned in the connected Free organization. Real email/password signup, reload persistence, invalid-password rejection, returning-user login, and sign-out were exercised in the in-app browser using a disposable `example.invalid` QA identity. No actual inbox was contacted for these checks.
- API checks cover exact origin enforcement, strong signup/reset password validation, stripping unsupported auth fields, expiry validation, HTTP-only same-site cookie scoping, unauthenticated access, blocked OAuth routes, sanitized responses, and fail-closed provider outages. Password-reset redirect pinning and provider failure handling are also covered below as tests are completed.
- At 390 px, the public landing page, login form, and workspace were checked for overflow. Sign-out was made visible on small screens. Browser screenshot review caught and fixed inherited workspace CSS affecting public-page height, icons, and heading line breaks. Full-page screenshot stitching in the app showed repeated sections; DOM inspection confirms five actual content sections with one footer, and individual viewport screenshots were used for layout review.
- Existing local scenes are preserved and exportable; new scenes are keyed by account on this device. This is not cross-device cloud project storage or encrypted local storage.
- Email verification is currently off in the new provider's default email/password configuration. Verification-code UI is present for future enablement. Actual password-reset email receipt and completion, native account handoff, and production Vercel cookie behavior are not verified. Neon's shared email service is documented for development/testing; a production sender remains a launch decision.
- The current Vercel workspace is Pro. Deployment has not been performed because the user requested free-only operation and the choice of a Hobby workspace versus the existing Pro workspace is pending. No subscription was changed. Hosted AI is explicitly disabled until shared budget/rate enforcement is implemented.

Final automated checks for this checkpoint: 50 tests across four files, TypeScript checking, and production bundling. The initial public bundle is approximately 246 kB before compression; the heavier map renderers are loaded separately. The earlier renderer chunk warning no longer appears with this split.


## Reliable building, heat, assistant and performance — 2026-10-28

- `npm test`: 81 tests pass across nine files, including Overpass mirror fallback, browser fallback after a plain-text API crash, login errors not bypassed, hero area matching, the heat model (solar load by sun height and cloud, five ratings, open street hotter than a tree-lined walk, covered edges, local-time conversion across DST, forecast-driven hourly profiles), assistant usage caps (daily, monthly, hosted without a database), chat validation and tool-round limits, and browser tool execution (place matching, routes at a requested hour, invalid arguments, heat ranking).
- `npm run build`: TypeScript and production bundle pass.
- Live OpenStreetMap: the **Build hero areas** workflow on GitHub Actions fetched UC Berkeley (2,859 buildings, 14,416 walking edges) as one query and UT Austin (1,433 buildings, 2,221 mapped trees, 15,391 walking edges) as four merged tiles after a single 2 km query timed out on every mirror. This development environment cannot reach Overpass, NWS, map tiles, or OpenAI directly.
- Browser checks (Chromium, mocked session): UT Austin builds from the shipped file in under 2 s, opens with the UT Tower → Gregory Gymnasium walk, shows four route cards with feels-like and sun minutes, ranks real campus streets, and survives a reload from IndexedDB. The heat tab, comparison and hourly chart were checked at 1440 px and 390 px with no page errors. The assistant loop was exercised with a mocked model: tool calls ran in the browser and the shaded route appeared on the map. No real OpenAI call has been verified from this environment.
- Rendering: the shade tester's spatial grid matched the previous implementation on 120,000 sampled points (0 differences) and ran about 28× faster. On-demand rendering raised orbit frame rate on a 4,500-object synthetic campus from about 4 to about 16 fps under software rendering; real-GPU frame rates are unmeasured.
- Not yet verified: the deployed Vercel site with `WALK_FREE_DATABASE_URL` and the OpenAI key, a real outdoor walk with GPS, and native builds.


## More campuses, live weather, error handling — 2026-10-29

- Weather now comes from Open-Meteo with NWS as a backup; the browser falls back to Open-Meteo directly if the API fails. Live weather refreshes every 10 minutes and uses current conditions for the present hour. Verified in Chromium with mocked responses: an API crash plus a working Open-Meteo shows "Live weather · Mostly clear"; both down shows a plain message and keeps the scenario. Live Open-Meteo has not been reached from this environment.
- Errors: the API returns sentences for malformed JSON and validation failures (logged server-side), and the app maps network, timeout, JSON, validation and location-permission errors to guidance. A sweep of 14 screens at 1440 px and 390 px found no horizontal overflow, no raw error text and no page errors. A render-error boundary replaces blank pages.
- Dependencies: maplibre-gl 6.16 and zod 4.6 resolve the critical and high `npm audit` findings (0 remaining in production dependencies). The city atlas still constructs and builds.
- `npm test`: 92 tests pass; `npm run build` passes.


## Route types, walking view, tree planting — 2026-10-29

- `npm test`: 99 tests pass, adding step-free routes that never fall back to stairs, lit-street preference at night, cool-stop routing, OSM lighting/street-type/slope parsing, tree-row planting that shades and cools a street, and the assistant planting tool.
- Chromium (UT Austin, mocked session and simulated GPS): the flat map shows the heat-coloured route and next-turn banner, starting a walk switches to it, and the toggle returns to 3D. In the studio, planting along a path at 3:30 PM raised its shade from 0% to 33% and lowered feels-like by 2 °F; the ordinary tree tool still places single trees.
- Cool-stop hours and building access are not verified; routes offer them only between 8 AM and 8 PM and say to check hours. Night routes depend on how completely OSM maps `lit`.


## Campus coverage, search, own AI keys, new layout and landing — 2026-10-29

- Coverage (all six campuses regenerated with courtyard buildings and OSM alternate names): every named building is searchable at UT Austin (363), Michigan (368), UCLA (257), Stanford (289) and ASU (234), and 417 of 461 at Berkeley (the rest are restricted Lawrence Berkeley Lab buildings without mapped public paths). About 95–97% are reachable on foot from each campus centre. Checked walks: Andrews Hall → GDC 8 min, Carothers → Rowling Hall 14 min, Kinsolving → PCL 14 min.
- `npm test`: 107 tests pass, adding synonym/code search, courtyard buildings, own-key requests (provider allowlist, no shared caps, rejected-key message) and guest building/weather fallbacks.
- Chromium: the search bar, From/To fields, Google Maps links, floating panel and phone bottom sheet were exercised at 1440 px and 390 px with no overflow or page errors; saving an own key sends it only on assistant requests and survives reload; the landing page renders at both sizes, its Speedway preview shows 0% → 39% shade and about 4 °F cooler after planting at 3 PM, and campus cards open the guest demo.
- Landing statistics use each campus's approximate typical July high and are labelled as model estimates.

## Canopy, sunlight, water, own-key test and framing — 2026-10-30

- Canopy: read live from the public Meta/WRI CHM v2 bucket in this environment. 77% of OSM-mapped trees at UT Austin and 67% at ASU fall on canopy of 3 m or taller, against 36% and 27% when shifted 30 m, so the layer is aligned. Inferred crowns added: UT 9,642, Berkeley 10,922, Michigan 12,934, UCLA 11,389, Stanford 15,149, ASU 2,718. Shade on the default campus walks rose (shadiest option): UT 26% → 64%, Michigan 23% → 58%, Stanford 0% → 32%; heat and route computation stay near 0.1 s. `/api/canopy` for downtown Austin answered in 2.6 s (30 KB).
- `npm test`: 128 tests pass, adding canopy tiling and crown filtering, the canopy merge and its outage note, Open-Meteo sunlight/UV parsing and its use only in live weather, drinking water parsing and fountains along a route, the geocoder fallback, own-key testing and that the shared key's provider reasons never reach the browser.
- Chromium (mocked services): a daily-limit error opens the own-key form, an OpenRouter key switches the provider, a rejected model shows the provider's reason, and a good key saves. The 3D view frames the route beside the desktop panel and above the phone sheet with no overflow or page errors.
- Hero areas rebuilt from OSM by the GitHub workflow (Michigan on a second run): mapped drinking water points are Berkeley 27, Michigan 13, Stanford 10, UT 5, ASU 5, UCLA 2; OSM maps few fountains, so counts are low but real. Campus shade at 3 PM in July rose on the landing figures (UT 9% → 20%).
- Independent review fixes: ocean tiles no longer drop a coastal area's canopy; exact pixel registration removes a blank stripe at tile seams (seam column 0% → 27%, matching neighbours); the crown cap keeps trees across the whole area; `/api/canopy` snaps to a ~100 m grid, queues reads, is rate limited per client (20/min, verified 429 on the 21st request) and never caches failures; canopy loads after the map.
- Performance: removed a per-building three.js conversion that logged a warning for every building (longest main-thread task after loading Berkeley 4.9 s → 1.3 s in software rendering); inferred canopy renders as one low-poly crown per tree (80 triangles instead of 960).
- Not verified here: live Open-Meteo sunlight, UV and geocoding, and real provider calls for key tests (this environment cannot reach them).

## Quality round: audits, security and correctness — 2026-10-30

Three independent read-only audits (hidden failures, core logic on the real campus files, security) found 27 issues; each fixed one has a regression test.

- Security: AI input is capped (string limits, a 60k-character prompt budget, tool results must answer a call); the shared AI key needs a verified email; the account proxy limits requests per client and per email (verified: the 6th reset email for one address in 15 minutes gets 429 without reaching the provider); map builds and weather are limited per account; error details stay in server logs; a Content-Security-Policy (scripts only from the site, no framing) and HSTS are sent. Checked in Chromium with the production build: the landing page, login, 3D demo and city atlas raise no CSP violations. Accepted: the monthly AI cap can overshoot by the number of simultaneous requests; sign-up says when an email already has an account.
- Correctness: heat index follows the full NWS method (40 °C at 39% humidity was reported as 40 °C instead of about 48 °C); shade from rotated buildings falls where they are drawn; search ranks real names and campus codes over repeated street points (UCLA "royce" puts Royce Hall first instead of 37th), ignores accents, splits codes from numbers ("ISTB4"), tolerates one typo and finds named parks; a cool-stop walk keeps its stop and stops detouring once there; the nearest forecast hour applies at half past; the next-stretch banner includes the stretch being walked; planted trees stay off buildings and within the cap.
- Lost work and misleading results: a saved scene that fails validation is repaired or kept aside, never overwritten; editor inputs are clamped; the Heat impact card resets with a new area or undo; late canopy no longer counts as planting; the assistant never saves the walker's GPS point into the scene; a failed assistant round keeps the actions it took; stale weather can't land on a newer area, and a new area says when live weather is unavailable.
- Performance (UT Austin): planting a street 445 ms → 30 ms; hourly heat profile after a weather edit about 600 ms → 16 ms; routes no longer re-plan on temperature or humidity edits.
- Accessibility: ESLint with React hook and jsx-a11y rules is clean; the search bar and dropdowns announce the highlighted option; panel sections are WAI-ARIA tabs with arrow keys. On phones the map now fits under the two-row header, so the time-of-day card no longer hides behind the sheet.
- `npm test`: 170 pass; `npm run lint`, `npm run build` clean. Coverage of the changed modules is 82–100% of lines, including the canopy reader (tested with an in-memory GeoTIFF served over HTTP ranges).
- Independent review of the round (verdict WARNING, all addressed): an unreadable saved scene is now set aside once and saving resumes; sign-in and code checks count only failed attempts per client and email, so no one can lock someone else out (verified: 7 good sign-ins in a row succeed, the 6th wrong password gets 429); search counts names a result isn't about at half weight, so Berkeley "durant", "bancroft" and "college" return only places named for the query; shade never feels cooler than the air in very dry heat. One result per street label is kept on purpose; intersections still list separately.
- Not verified here: live provider calls, Neon Auth's own throttling and whether it issues sessions before email verification, and real GPS walking.

## Interface styles and new walking features — 2026-10-31

- Styles: Editorial (unchanged), Night, Sunlight and Blueprint. `npm test` holds every style to WCAG AA for body text, secondary text, button labels and the selected route card, and Sunlight to AAA; Editorial's colours are checked identical. Chromium screenshots at 1440 px and 390 px in each style showed no overflow or page errors; a first version made Sunlight's selected route card unreadable (a pale grey was both a border and a fill), fixed by giving colour tokens roles.
- Best time to go, Play the day, Save walk, Share walk (link opened in a fresh browser restores the campus, endpoints, route type and hour, then clears itself from the address bar) and the shortcuts (/, P, S, V, ?; none fire while typing) were exercised in Chromium against the dev server.
- `npm test`: 185 pass; lint and build clean.

## Meta Model API, air quality, heat alerts, sun aversion — 2026-10-31

- Endpoint probe (GitHub Actions `probe-data-sources.yml`, run 41187242484): Open-Meteo air quality, radiation and elevation, NWS alerts (Phoenix had an active alert; Austin none) and the NWS HeatRisk service answered 200; the Meta Model API (`api.meta.ai/v1`) and the older Llama API (`api.llama.com/compat/v1`) both answered 401 without a key, so both hosts are live.
- `npm test`: 236 pass (31 files), including a 154-route baseline showing the default sun aversion reproduces the previous shade routes exactly, a regression test for the strong-aversion detour fallback, outlook parsing (recorded Austin air-quality answer; hand-built NWS alert features), per-source caching with failures not cached, ~1 km location rounding, the provider allow-list in both directions, and the assistant schema's new bounded fields. Lint and build clean.
- Chromium (desktop 1440 px, phone 390 px) against the dev server with mocked provider answers: AQI badge, heat-advisory notice linking to forecast.weather.gov, sun-aversion slider saved on the device; no console errors; the notice appears with live weather unavailable.
- Independent review of the change (same-family reviewer, provisional): 7/10, "almost"; its three medium findings (outlook only loaded with weather, UTC times in the assistant's context, AQI over 500 discarded) and most low ones were fixed with tests.
- Not verified here: a successful Muse Spark call (no Meta key in this environment; the shared assistant on Vercel also still needs `WALK_FREE_DATABASE_URL`), whether a model follows the reply-language rule, live NWS alert text, and the Meta Model API key prefix.

## HeatRisk, guest demo, proposals, nudges, installable app — 2026-11-01

- `npm test`: 289 pass (40 files); lint and build clean.
- Chromium against the dev server with mocked provider answers:
  - HeatRisk badge and notice; Compare walks; the walking banner's shade nudge; the plant-trees proposal dialog; the guest **Watch what it does** demo on UC Berkeley and UT Austin, desktop and phone, with replies from real tool results; the street-heat CSV download (ASU, 67 places).
  - The new screens in the Night and Sunlight styles.
  - No page errors.
- axe (WCAG 2 A/AA): no violations on the landing page, the Route tab with a notice, Data & Sources after Compare walks, or the Ask demo, after fixing the header-tab and footer contrast and making chat logs focusable.
- Production build: the service worker takes control, and the landing page reloads offline.
- Two independent reviews (same-family, provisional) scored 7/10, "almost"; their medium findings were fixed with tests:
  - HeatRisk "today" taken by local date, and past days dropped.
  - Heat advice before sensitive-group air.
  - Copy that overstated the default model and key handling.
  - Proposal reasons based on the sun's position.
  - Walking-nudge distances include stretches without a reading.
- Not verified here:
  - Live HeatRisk values above 0 (all were 0 in late October). The parser maps each value to the catalog item at the same position, which the ArcGIS Identify (Image Service) reference documents ("pixel values … in the same order as the catalog items").
  - A real Muse Spark call.
  - Offline behaviour on iOS.
- Later the same night:
  - Spoken replies pick a voice in the reply's language. Tests cover 8 languages, and English and unclear text keep the default voice.
  - The guest demo gained a best-time step. Checked in Chromium on desktop and phone.
  - The landing page shows 4,375 OpenStreetMap trees against 62,748 DINOv3 canopy crowns across the six campuses (from `public/landing/campuses.json`).
  - `npm test`: 295 pass.
  - The production check on main confirmed health, the demo page, manifest, service worker, preview image, `/api/outlook` returning 401 for guests, and every new feature marker in the live bundle.

## Performance, AI resilience, UI audit — 2026-11-01 (1:30–2:10 AM CST)

- **Performance.** three.js/react-three (922 kB) and React (223 kB) are now cached vendor chunks, and the app chunk is 312 kB (was 1.2 MB).
  - Checked in a production build: the landing page loads only the entry and React chunks.
  - The production probe now fails if the landing page preloads the 3D chunk. The 08:05 UTC run reports "landing does not preload vendor-3d".
- **AI.** A transient model failure gets one retry within a shared 50 s deadline (skipped if under 5 s remains or the failure took over 15 s).
  - A contract test keeps the 10 tools offered to the model identical to the ones the browser runs.
- **Silent-failure review (9 findings, all fixed):**
  - Native speech falls back to English when the device has no voice for the reply's language.
  - The service worker refreshes cache entries on use and shows the cached app after 3 s on weak signal.
  - ArcGIS errors returned with HTTP 200 are retried rather than cached as "no data".
  - Proposals mark scenario weather.
- **UI.** Audited against Vercel's Web Interface Guidelines, then the taste-skill inspector on the landing page.
  - axe: 0 WCAG A/AA violations on the Heat tab (Editorial at 1440 px, Night at 390 px).
  - Landing page: no low-contrast text left, and paragraphs are capped at 68 characters.
  - Brand-style rules (gradients, ivory palette, italic accents) are kept by design.
- **Totals.** `npm test` 352 pass; lint and build clean. Coverage of tonight's new modules is 92.5%; `units.ts` was raised from 57%.
- **Reviews.** Same-family independent reviewers (provisional): perf/retry 7/10 and the silent-failure pass, with findings fixed. The earlier security review of the night's work scored 8/10, "ready".

## Home dashboard, fictional cities, 3D lighting, motion — 2026-11-02

- **Home dashboard** at `/home`; signing in lands there. Checked in the browser with a mocked session at 1440 and 390 px: no page errors and no horizontal overflow.
- **Fictional cities.** The generator has its own test file (40 tests):
  - Determinism, generation under 400 ms, one connected walking graph, and no building touching a walking edge.
  - Routing, `placeHeat` and destination search all work in every city.
  - Measured locally: 325–594 buildings and 191–654 graph nodes per city, generated in 37–129 ms.
  - All five render with their ambient layer and no page errors (software WebGL, 1440 px).
  - The city search matcher and the sky-contrast helper are unit-tested.
- **3D:**
  - Soft shadows, fog, warm low sun, moonlight and emissive windows, plus a horizon ground.
  - Rendered UT Austin at 3 PM, 6:30 PM and 9 PM, and all five fictional cities, with no errors.
- **Motion:**
  - Landing hero choreography, count-ups, and drawn feature-tour scenes that play on scroll.
  - Product UI entrances and presses.
  - Reduced motion shows final states. The animate verifier reported no `scale(0)`, no `transition: all` and no reduced-motion loops.
- **Fixes:**
  - Count-up numbers rendered at the band's small label size.
  - The hero heat map spilled into the number band.
  - The map heading was unreadable over dark fictional skies.
- **Midtown Manhattan.** Added as a prebuilt city area. The first Overpass build timed out, so it was retried with a smaller 1.3 km square. Until its file exists, opening it falls back to a live build.
- **Totals.** `npm test` 396 pass; lint and build clean. PR #27 is merged, and the production probe passed on the merge commit.


## Adaptive skies, Midtown Manhattan, arrival, accessibility — 2026-11-02 (afternoon)

- **Adaptive skies.** A fictional city's sky, haze and ground follow the sun via `skyAt()`, which is unit-tested: golden at dusk, night with stars after sunset. Rendered Skyline Prime at 5:45 PM and 9 PM.
- **Midtown Manhattan.**
  - Built in CI by "Build hero areas" from a 3×3 grid of Overpass tiles, with a pause between tiles and retries. The first two attempts with 4 tiles timed out.
  - 4.0 MB: 3,283 buildings, 1,576 trees and 5,105 walking nodes.
  - The first walk runs from Times Square to the Chrysler Building, 1.15 km. Grand Central and the Empire State Building sit near the square's edge on unconnected path fragments.
  - The production probe now checks that all 7 prebuilt areas are served as `application/json`; all passed (run 41517077856).
- **New features:**
  - Arrival camera sweep and title card.
  - Save a captioned picture of the 3D view.
  - Shade bars on route cards and heat rankings.
  - "Back to <place>" on the home page.
  - Hero tilt on the landing page.
  - Page view transitions.
  - Typical building heights by OSM type.
- **Accessibility.** axe reports 0 WCAG A/AA violations on the landing, home, login and fictional-city app pages after the contrast fixes.
- **Reviews.** Two same-family independent review passes (provisional); all 8 real findings are fixed:
  - Fictional buildings were drawn twice.
  - A reloaded fictional city lost its weather.
  - The heading misread over the atlas or 2D map, and was unreadable in the Night and Blueprint styles.
  - `/home` redirected to login on a failed session check.
  - The resume link turned into "Shared walk".
  - The camera button was missing in Design studio.
  - "Aurora" matched the fictional city instead of the real one.
- **Totals.** `npm test` 408 pass; lint and build clean. PRs #27–#33 are merged, and the production probe passed after each deploy.

## Generate a city, landmarks, day in the life, weather, quick walks — 2026-11-02 (evening)

- **Generate a city.**
  - Server: `/api/agent/city` tests cover a validated plan, 4 credits charged for dense, the trademark rule in the prompt, an unreadable reply giving `INVALID_CITY`, and an empty prompt rejected before any model call.
  - Builder: 135 tests across prompts and realism levels:
    - Schema-valid worlds with one connected graph.
    - No building on a walking edge.
    - Deterministic output, with landmarks present.
    - Timings: dense under 200 ms for a 10-district, 24-landmark plan.
  - Browser:
    - Guest offline generation: "Mournefall", 793 buildings.
    - Signed-in AI path with a mocked plan: "Ravenmoor", 930 buildings. The first walk runs from "Central Precinct Steps" to "Ravenmoor Chemical Works Walk".
- **Landmarks.**
  - 16 shapes, each at most about 30 meshes, with shared geometry and materials.
  - Signature landmarks are tested per city, and a test enforces that no trademarked names appear.
  - Noir Harbor and Skyline Prime were rendered and checked.
- **Day in the life.** UT Austin, July 15 at 3 PM, scenario weather: 33 min of walking, 9.7 min in the sun on shade routes against 12.9 on the quickest.
- **UT Austin feature run** (browser, zero errors): July preset, routes, best time, heat rankings and detail, compare walks (20% of the sun avoidable), CSV, brief, assistant demo, planting (one street 115°F → 104°F), proposal, 2D view.
- **New UT default walk:** Kinsolving Dormitory → Perry-Castañeda Library, chosen from a scored search of landmark pairs. Shade rises 23% → 45% for 3% more walking.
- **Quick walk.** Unit tests cover each fallback layer. In the browser, the atlas route was found and drawn, with no false error when the map style was still loading.
- **Totals.** `npm test` 587 pass; lint and build clean. PR #34 is merged, and the production probe passed on 829cf4f.

## Street walk, crowd, phone tour, UT Tower — 2026-11-02 (night)

- **Review fixes (PR #39).**
  - Street walk: keeps a snapshot of the route, resets on area change and in 2D, and keeps haze at street distances.
  - Camera: the arrival flight and the street walk hand the camera over cleanly.
  - Crowd: throttled to about 20 fps, paused when the tab is hidden, human-sized at eye level, and off by default on phones.
  - Tour actions wait for the map to load.
  - Browser: street walk on Noir Harbor and UT Austin, and all 8 UT tour steps, with no page errors.
- **Phone tour (PR #40).**
  - The sheet drops to a peek for map steps, so the map stays visible.
  - During a street walk the tour card sits low and the time card hides.
  - Browser: the 8-step tour at 390 px, with no overflow and no errors.
- **UT Tower height.**
  - OpenStreetMap gives 23 m (one building part). It now uses the published 307 ft (93.6 m), cited in `shared/landmark-heights.ts`.
  - The prebuilt UT area changes only that object's height and height method. Tests cover the override, other buildings keeping their mapped height, and prototype keys.
- **Outlines with 3D parts.**
  - The Empire State Building's outline was extruded whole to 443 m over its mapped setbacks.
  - Outlines that contain `building:part` ways are now capped at their lowest part, and are never raised.
  - Midtown was rebuilt in the "Build hero areas" workflow: 77 outlines were lowered (after review, only parts with a mapped height count, and cited heights are never lowered) and the Empire State outline is now its 75 m base. The walk endpoints are unchanged, and the browser render showed no errors.
  - Tests cover lowering, never raising and outlines without parts.
- **After dark.** Route cards drop shade and sun minutes once the sun is down, and show the lit share where lighting is well mapped. UT has lighting mapped on about 28% of the night route.
- **Not changed.** Moody Center and Bass Concert Hall keep estimated 10 m heights. No citable published figure was found for either, so none was invented.
- **Totals.** `npm test` 597 pass; lint and build clean. The production probe passed on PR #39 (f3a7502) and PR #40 (aa99a0b).

## Independent UT demo QA and fixes — 2026-11-03 (early morning)

- **QA pass.** A separate agent drove the UT demo at 1440 px and 390 px (touch): every tab, the tour, the street walk, search, the climate presets, the Ask demo and the studio.
  - No page errors.
  - It reported 10 issues and 10 nits, ranked by how they would look in a live demo. All the issues are addressed below.
- **Phone first view.** The weather chip no longer sits under the tool row, the tour button waits while a message is shown, and the arrival title sits above the time card. Checked in the browser.
- **Daylight demo.** A guest demo opened after dark starts at 3 PM and says so; the browser check (run in the Austin evening) opened at 3:00 PM.
- **Step-free.**
  - The default start only connects by steps. Step-free now starts or ends at the nearest step-free point within 80 m, and says how far away it is.
  - On UT it starts 67 m away, ends 63 m away and takes 12 min.
  - Tests cover the nearby start and refusing a point 200 m away.
- **Tour.**
  - The heat step raises the phone sheet, and the day step plans and plays the whole day; it was checked playing through to the 6:15 PM walk home.
  - Planting uses 3 PM, and the desktop card sits at the top, clear of markers and messages.
  - All 8 steps ran on desktop with no errors.
- **Ask demo.** It moves the clock to 3 PM before its 3 PM questions (tested) and keeps the newest reply in view.
- **Heat colours.** Colours reach red only when the sun feels very hot; a 66°F sun stays blue to green (tested).
- **Smaller fixes.**
  - A confirmation now appears before an empty landscape replaces the map.
  - The search message no longer asks for a start that is already set.
  - The selected point is described in metres from the centre, plurals are fixed, and guests see "Free" instead of credits.
- **Totals.** `npm test` 600 pass; lint and build clean.
- **Code review of this batch.** An independent reviewer reported four bugs, all fixed:
  - Step-free search returned nothing for points under about 160 m apart. Seeds and walked arrivals are now separate states (tested).
  - The tour's day didn't play when the Route tab mounted together with the plan. It now plays (checked in the browser from 8:30 AM to 6:15 PM), and planting then happens at 3 PM (78 trees on Duval Street).
  - Outlines were capped by parts with guessed heights or over cited heights. Both are now excluded (tested).
  - The assistant's route options now report the step-free gap.
  - `npm test` 601 pass.

