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
- `npm test`: 167 pass; `npm run lint`, `npm run build` clean. Coverage of the changed modules is 82–100% of lines, including the canopy reader (tested with an in-memory GeoTIFF served over HTTP ranges).
- Not verified here: live provider calls, Neon Auth's own throttling and whether it issues sessions before email verification, and real GPS walking.
