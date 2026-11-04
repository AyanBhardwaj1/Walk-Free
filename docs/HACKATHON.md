# Walk-Free: Meta Global AI Developer Hackathon submission

**Track:** Indie · **Live:** https://walk-free.vercel.app · **Guest demo, no sign-up:** https://walk-free.vercel.app/demo?area=ut-austin&tab=ask

## In one line
Walk-Free shows how hot every street on campus will feel at the hour you walk it and finds the shadiest way there. Meta's Muse Spark plans the walk on the live map in your language, DINOv3's canopy map finds the trees nobody mapped, and Muse Image shows what a greener street would look like.

## 1. The problem
Heat is the leading weather-related killer in the United States ([NWS](https://www.weather.gov/oax/heatsafety)). In summer 2023 more than 2,300 US death certificates named heat, the most in 45 years of records ([AP analysis of CDC data](https://www.wlrn.org/health/2024-06-03/analysis-heat-deaths-us-2023)), and emergency rooms saw about 120,000 visits for heat illness that year ([CDC Heat & Health Tracker](https://ephtracking.cdc.gov/Applications/HeatTracker/)).

Students walk between classes in the hottest hours, and maps optimise for minutes, not shade. On UT Austin's Speedway at 3 PM in July, Walk-Free's model puts full sun about 11 °F hotter than the shade (`public/landing/speedway.json`).

## 2. How it uses Meta AI
| Meta technology | What it does in Walk-Free |
|---|---|
| **Muse Spark** (Meta Model API, `api.meta.ai/v1`, `muse-spark-1.3`) | The assistant acts on the map instead of chatting. It has thirteen tools: `find_places`, `plan_route`, `best_time_to_leave`, `compare_walks`, `set_time`, `heat_ranking`, `place_heat`, `plan_tree_planting`, `plant_shade_trees`, `cool_refuges`, `build_area`, `generate_city` and `propose_design`. It runs them in the browser against the live 3D map, then answers in one to three sentences that can be read aloud, in the language you wrote in. Each step it took opens under the answer to show the call and its result. Guests on `/demo` can ask it a few questions a day without an account. |
| **DINOv3** (Meta and WRI's 1 m Canopy Height Maps v2) | Read server-side straight from the public Cloud-Optimized GeoTIFFs. Across the six pre-built campuses, OpenStreetMap has 4,375 trees and the canopy map adds 62,748 crowns (UC Berkeley alone: 216 mapped plus about 10,900 inferred; `public/landing/campuses.json`). The Route tab shows how much of a walk's shade comes from these crowns, with a toggle to hide them; on the default UT walk it is about half. |
| **Muse Image** (`/v1/images/edits`, `muse-image-1.0`) | After planting trees, "See it as a photo" sends the 3D view of the street to Muse Image and shows it beside a photo-like rendering with the new trees, ready for a proposal. |
| **SAM 3.1** (`/v1/responses`, `sam-3.1`) | **Shade check:** snap a sunny street and SAM 3.1 finds the trees and awnings in the photo (boxes drawn over it). A street with no shade links straight to the tree planner below. |
| **Muse Spark city planning** | `/api/agent/city` asks the model for a structured city plan (districts, landmarks, street names, climate, sky), and a procedural builder turns it into a walkable world in under 200 ms. |
| **Open-weights models** | Bring-your-own-key presets for Muse Spark Open on Fireworks and Together, and Llama 4 Maverick on DeepInfra, Baseten and OpenRouter. Keys stay in the browser. |

## 3. What it does
- **Heat you can see.** Every path is coloured by modeled feels-like temperature for the chosen hour. The model uses live weather and sunlight (Open-Meteo, with NWS as backup) and shade ray-traced against OpenStreetMap buildings and tree crowns.
- **Six ways to choose a route:** quickest, more shade, scenic, cool stops through air-conditioned buildings, step-free, and lit at night (chosen by itself after dark). A sun-aversion setting decides how hard the shade route avoids the sun.
- **Best time to go,** the hottest streets ranked, live AQI, NWS heat alerts and the 7-day HeatRisk outlook.
- **Where should the next trees go?** Walk-Free samples typical walks across the area, finds the sunny streets most of them share, tests a row of trees on each, and ranks them by sun minutes saved per 100 walks, following research showing a tree on an unshaded, busy street cools walkers up to twice as much as one on a shaded street ([Lachapelle et al. 2023](https://par.nsf.gov/biblio/10514447-maximizing-pedestrian-radiative-cooling-benefit-per-street-tree)). Muse Spark can do it too (`plan_tree_planting`).
- **Cool refuges within reach.** Like Barcelona's climate-shelter network (a shelter within a 10-minute walk of everyone), the Heat tab measures the walk from every path to the nearest air-conditioned stop, shade shelter or shaded park, colours the map by it, and names the streets where a new refuge would help most (`cool_refuges` tool). At UT Austin at 3 PM, 28% of paths are within 5 minutes of one and 64% within 10.
- **Heat stress as UTCI.** Each walk shows its Universal Thermal Climate Index band (the standard outdoor heat-stress index, which counts sun, wind and humidity), computed with [jsthermalcomfort](https://federicotartarini.github.io/jsthermalcomfort/) and an ASHRAE 55 solar-gain model for the sun.
- **From a walk to civic action.** Plant a row of trees on a hot street, see shade and feels-like before and after, see it as a photo (Muse Image), and write a one-page proposal for the campus or city council.
- **Walk it at street level** among simulated walkers, or live a simulated day of six walks, each planned in shade at its own hour.
- **Generate any city and walk it,** or explore seven fictional cities, each with its own weather. In sun-scorched Dune Reach at 3 PM the quickest route has 0% shade while the shade route through the old quarter has 68%.
- **Works for everyone:** replies in your language and read aloud, °F or °C, keyboard shortcuts, WCAG AA contrast, four interface styles including high-contrast Sunlight, and an installable app that opens offline.

## 4. Evidence
- **Shade routing helps on every campus.** On a July afternoon across the six campuses, the shade route avoids 13–25% of the sun for 4–7% more walking. At UT Austin that is about 9 hours less in full sun over a semester, at four walks a weekday for 15 weeks.
- **Hours follow the day.** The landing page's Speedway preview runs from 81 °F at 6 AM to 117 °F in full sun at 3 PM, from the same daily temperature cycle the app uses.
- **The canopy map matters.** OpenStreetMap alone misses most trees: 62,748 of the 67,123 tree crowns on the six campuses come from Meta's DINOv3 map.
- **Tested.** 630 automated tests (routing, heat model, assistant tools and guest caps, canopy reads, landing data), a production probe workflow for every live data source, and browser checks on desktop and phone.

## 5. How to demo (3 minutes)
1. **Ask Muse Spark.** Open https://walk-free.vercel.app/demo?area=ut-austin&tab=ask&t=15 and ask *"¿Cuál es la ruta con más sombra a Gregory Gym ahora mismo?"*. Open a step under the answer to see the tool call. If the site key isn't set, press **Watch what it does** for a scripted run of the same tools.
2. **See the canopy.** In the Route tab, read the canopy line under the walk and press **Hide its trees**.
3. **Compare routes.** Compare Quickest with More shade and push the sun-aversion slider. Open **Best time to go**.
4. **Plan the trees.** In the Design studio, press **Find where trees help the most walkers**, plant the top street, press **See it as a photo**, then **Write a proposal**.
5. **Refuges and photos.** In the Heat tab, tick **Colour paths by walk to the nearest refuge**, then **Take or choose a photo** for SAM 3.1's shade check.
6. **Hands-free:** https://walk-free.vercel.app/demo?area=ut-austin&tour=auto plays a one-minute tour that reads each step aloud.

A 2-minute recording script is in [docs/VIDEO_SCRIPT.md](VIDEO_SCRIPT.md).

## Built with
React 19, Vite, three.js / React Three Fiber, MapLibre, Express 5 on Vercel, Neon Postgres (usage caps) and Neon Auth.
Data: OpenStreetMap, Meta/WRI canopy (CC BY 4.0), Open-Meteo (CC BY 4.0), the National Weather Service (alerts, HeatRisk, forecasts) and GTFS.

## Honest limits
- Temperatures are modeled estimates, not measurements.
- HeatRisk is an experimental NWS product.
- Cool-stop opening hours are not verified.
- Native GPS walking is untested on devices.
- SAM 3.1's photo check follows Meta's published request format but hasn't yet been run against the live API from this build; the launch checklist covers it.
