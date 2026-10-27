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
