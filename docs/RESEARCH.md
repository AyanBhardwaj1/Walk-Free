# Walk-Free: initial data and feasibility research

Research date: 2026-10-27. This is discovery for the proposed product, not a claim that the application or its data integrations have been implemented. Primary documentation was consulted through the projects' official GitHub repositories. Live map, campus, and weather integrations still need validation.

## Product requirements received

- Search major US cities and campuses and explore their approximate layout in 3D.
- Examine weather, sun position, building/tree shade, and walking comfort at a selected time.
- Edit a 3D sandbox with buildings, trees, landmarks, and environmental controls.
- Use an OpenAI assistant to construct and edit sandbox scenes.
- Compare pedestrian routes for speed, scenery, seasonal comfort, shade, and verified indoor connections.
- Give the interface a deliberate visual identity and support missing data with explicit, traceable fallback layers.

Geographic priority, visual direction, target devices, navigation depth, modeling accuracy, sandbox depth, AI interaction, launch terms, and the first acceptance demo are awaiting product clarification.

## Verified source findings

| Source | What it supplies | Constraints and implications |
| --- | --- | --- |
| [OpenFreeMap](https://github.com/hyperknot/openfreemap) | Public vector basemaps without API keys; documentation states no request/view limits | No geocoding, routing, directions, elevation, or satellite imagery. Preserve OpenStreetMap/OpenMapTiles attribution. Tiles alone do not provide a routing or simulation engine. |
| [Overture Maps](https://github.com/OvertureMaps/data) and [schema](https://docs.overturemaps.org/schema/) | Buildings, building parts, transportation connectors/segments, places, and base land cover in cloud GeoParquet | Clip data to a selected area; do not load a country into a browser. Height is optional. Crossing line geometries are not necessarily connected in the transport graph. Buildings/transportation/base use ODbL; retain source-specific attribution. |
| [Microsoft US Building Footprints](https://github.com/microsoft/USBuildingFootprints) | Machine-generated US building footprints | ODbL. Useful fallback footprints; not authoritative height, indoor access, or proof that geometry is current. |
| [OSM Nominatim policy](https://operations.osmfoundation.org/policies/nominatim/) | Public place-search endpoint | Aggregate maximum 1 request/second; identification, caching, and attribution required. No autocomplete or systematic extraction. Current policy also addresses generic generated integrations. Prefer a licensed bundled city/campus index for initial autocomplete, with a separately selected geocoder for addresses. |
| [Open-Meteo](https://github.com/open-meteo/open-meteo) | Hourly weather forecasts, up to 16 days; temperature, humidity, wind, cloud and radiation inputs | Hosted free API is for noncommercial use. Grid weather is not sidewalk temperature. Data CC BY 4.0; server software AGPLv3. |
| [Open-Meteo terms](https://github.com/open-meteo/open-meteo-website/blob/main/src/routes/en/terms/+page.svelte) | Free hosted service limits and commercial-use definitions | Fewer than 10,000 calls/day, 5,000/hour, 600/minute. Ads, subscriptions, and commercial/promotional use require different terms or another provider. Cache spatially and by forecast period. |
| [Open-Meteo field documentation](https://github.com/open-meteo/open-meteo-website/blob/main/src/routes/en/docs/+page.svelte) | Units and meaning of forecast variables | Air temperature is at 2 m and wind at 10 m. Radiation fields include preceding-hour averages. Apparent temperature already incorporates solar effects; avoid counting these twice. |
| [NWS API project](https://github.com/weather-gov/api) | Official entry point to US weather API documentation | Candidate US forecast provider. Live responses, detailed service terms, and limits remain unverified in this environment. |
| [SunCalc](https://github.com/mourner/suncalc) | Solar position calculations, BSD-2-Clause | Current master documentation (2.1.1) uses altitude degrees and azimuth degrees clockwise from north. Historical 1.x conventions differ. Pin the dependency and verify coordinate conversions. |
| [pythermalcomfort](https://github.com/pythermalcomfort/pythermalcomfort) | MIT-licensed thermal comfort models including UTCI and SolarCal | UTCI is an equivalent heat-stress temperature, not measured air temperature. Requires air temperature, mean radiant temperature, 10 m wind, and humidity, with validity bounds. Outdoor mean radiant temperature needs justified assumptions. |
| [MapLibre GL JS](https://github.com/maplibre/maplibre-gl-js) | Browser map rendering including building extrusions, BSD-3-Clause | Rendering library; data, routing, and analysis remain separate application components. |
| [Three.js](https://github.com/mrdoob/three.js) | General 3D scene rendering using WebGL/WebGPU | Candidate sandbox and shadow renderer; does not supply city datasets or environmental physics. |
| [OpenAI Node SDK](https://github.com/openai/openai-node) | Responses API, streaming and configurable request handling | Keep credentials server-side. Typed scene-edit operations should be validated before changing a project; model output should not execute arbitrary code. |

## Proposed data fallback rules

These are engineering recommendations pending product decisions.

1. **Buildings:** measured footprints/heights, then mapped heights or floor counts, then explicitly estimated extrusion heights. Keep the method on each feature.
2. **Trees:** verified local inventories, mapped individual trees, then canopy/land-cover polygons. A park polygon does not establish individual tree positions, and absent inventory does not establish absent trees.
3. **Weather:** suitable observations or forecast grid, then clearly dated cached results. Historical normals or user-controlled scenarios must have distinct labels and cannot masquerade as live forecasts.
4. **Indoor routes:** verified entrances, corridors, levels, stairs/elevators, public-access rules, and opening hours. Building footprints alone cannot establish walkable indoor connections. Hypothetical connections belong in a distinct scenario mode.
5. **Provenance:** retain source, feature ID, retrieval time, source/survey date when available, geometry/height method, license, and access-verification status. Show missing coverage and assumptions to users.

## Modeling and routing boundaries

- Use a connected pedestrian graph with access, barriers, crossings, stairs, and levels; do not route along arbitrary straight lines or connect bridges to roads underneath.
- Compare distance/time, modeled sun exposure, shade minutes, scenery, and verified indoor coverage. Scenic detours need a user-visible time or distance budget.
- Compute sun/shadows in geographic orientation and meter coordinates, with local time zones and daylight-saving handling.
- Building geometry can support deterministic shadow calculations. Tree shading needs crown shape, seasonal leaf cover, and transmissivity assumptions.
- Do not assign a fixed air-temperature reduction per tree. Shade primarily changes radiant exposure in an initial model; evapotranspiration, wind, and surface heat require additional inputs and calibration.
- Keep forecast air temperature, estimated thermal comfort, and sandbox temperature controls separate.
- Any UTCI calculation needs defensible radiant-temperature estimates and validity checks. Direct shade/sun exposure is a useful earlier metric without claiming calibrated microclimate predictions.
- Validate solar orientation, nighttime behavior, forecast timestamps, graph connectivity/access rules, scene-edit undo, and route recomputation after edits. Test full user journeys in a browser as implementation proceeds.

## Unresolved source access

The current proxy denied requests to `data.austintexas.gov`, `maps.utexas.edu`, `wiki.openstreetmap.org`, `open-meteo.com`, `api.open-meteo.com`, `www.weather.gov`, `api.weather.gov`, and `weather-gov.github.io`. Official source-hosted documentation was accessible through GitHub.

No specific Austin tree inventory, UT indoor map, campus API, or redistribution permission has been verified. No live weather API response has been verified. Selected runtime providers will require appropriate domain access and functional tests; public source documentation does not establish that their live APIs work here.

OpenAI credentials are not currently configured. Configure a server-side secret through secure environment settings when the AI integration is selected; do not include a key in source control or chat.
