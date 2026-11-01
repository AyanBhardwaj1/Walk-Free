# Walk-Free: Meta Global AI Developer Hackathon submission

**Track:** Indie · **Live:** https://walk-free.vercel.app · **Guest demo:** https://walk-free.vercel.app/demo

## One line
Walk-Free shows how hot every street on campus will feel at the hour you walk it. It finds the shadiest way there, and Meta's Muse Spark plans the walk for you in your own language.

## The problem
Extreme heat is the deadliest weather in the US. Students and city walkers have no way to see which streets are shaded and when. Maps optimise for minutes, not for shade: on UT Austin's Speedway at 3 PM in July, Walk-Free's model puts the sunny side about 11 °F hotter than the shade (`public/landing/speedway.json`).

## What it does
- **Heat you can see.** Every path is coloured by modeled feels-like temperature for the chosen hour. The model uses live weather and sunlight (Open-Meteo, NWS fallback) and real shade, ray-traced against OpenStreetMap buildings and tree crowns.
- **Six route types.** Quickest, more shade, scenic, cool stops (through air-conditioned buildings), step-free and lit at night. A **sun-aversion** setting decides how hard the shade route avoids the sun.
- **Best time to go.** Shows how each hour of the day would feel for your walk, with the coolest one called out. **Play the day** animates the sun.
- **Safety signals that change the advice.**
  - Live US AQI.
  - National Weather Service heat and air-quality alerts.
  - The NWS **HeatRisk** 7-day outlook.
- **Plant trees, watch the heat drop.** A design tool lines a street with trees and shows shade and feels-like before and after. **Write a proposal** turns the result into a one-page letter for a campus planner or city council, and **Download street heat** exports every street's numbers as CSV.
- **Compare walks:** how much of the sun the shade route avoids on this campus. On a July afternoon across the six campuses, it's 13–25% of the sun for 4–7% more walking.
- **A 2D walking view** that follows you, with the next turn, the next block's heat, and how far it is to the next shade (spoken too).
- **Heat brief:** a one-page summary of an area's hottest and coolest walks, its trees and how much shade routing helps, for planners.
- **Works for everyone:** replies in your language (and read aloud in a matching voice), °F or °C, keyboard shortcuts, WCAG AA contrast, and installable as an app that opens offline.
- **Four interface styles,** including a high-contrast Sunlight mode for outdoor glare.
- **Share links** that reopen the exact walk, saved walks, and keyboard shortcuts.

## How it uses Meta AI
| Meta technology | Where it is used |
|---|---|
| **Muse Spark (Meta Model API, `api.meta.ai/v1`)** | The assistant's intended model: the first and default option for people's own keys, and the default model when the site's key is a Meta Model API key. The assistant uses tool calling: `find_places`, `plan_route`, `best_time_to_leave`, `compare_walks`, `set_time`, `heat_ranking`, `place_heat`, `plant_shade_trees`, `build_area` and `propose_design`. The model acts on the live map, then answers in 1–3 sentences that can be read aloud. Set `WALK_FREE_AI_BASE_URL=https://api.meta.ai/v1`; the model defaults to `muse-spark-1.3`. |
| **DINOv3 (Meta + WRI High Resolution Canopy Height Maps v2)** | 1 m canopy height, read server-side straight from the public Cloud-Optimized GeoTIFFs. It adds the trees nobody mapped: across the six pre-built campuses, 4,375 trees are mapped in OpenStreetMap and the canopy map adds 62,748 more crowns (at UC Berkeley alone, 216 mapped plus about 10,900 inferred; counts in `public/landing/campuses.json`). |
| **Open Muse models** | Bring-your-own-key presets for Muse Spark Open (Fireworks, Baseten, Together) and Muse Glimmer 30B (DeepInfra). The legacy Llama API is still supported. |
| **Multilingual** | The assistant replies in the language the person writes in. |

## Why it matters
Heat illness is preventable when people know where and when the heat is. Walk-Free turns open data into a decision: leave at 7:30 instead of 3, and take Speedway, not 24th Street. It also gives campus planners a tool to show where a row of trees would help most.

## How to demo (3 minutes)
1. Open https://walk-free.vercel.app/demo?area=ut-austin. Drag the time slider to 3 PM and watch the streets turn red.
2. Compare **Quickest** with **More shade**. Push the **sun aversion** slider and watch the shade route change.
3. Open **Best time to go** and tap the coolest hour.
4. In Design studio, plant a row of trees on a hot street and read the before/after feels-like.
5. Open https://walk-free.vercel.app/demo?area=ut-austin&tab=ask and press **Watch what it does** to see the assistant's tools act on the map (no sign-up). Then sign in (or add a Meta Model API key in AI settings) and ask: *"Plan me the coolest walk from UT Tower to Gregory Gym at 2 PM"*, or the same in Spanish.
6. Open **Data & Sources** to see every layer: OSM, Meta/WRI canopy, Open-Meteo weather and AQI, NWS alerts and HeatRisk.

## Video
A 2-minute recording script is in [docs/VIDEO_SCRIPT.md](VIDEO_SCRIPT.md).

## Built with
React 19, Vite, three.js / React Three Fiber, MapLibre, Express 5 on Vercel, Neon Postgres (usage caps), and Neon Auth.
Data: OpenStreetMap, Meta/WRI canopy (CC BY 4.0), Open-Meteo (CC BY 4.0), the National Weather Service (alerts, HeatRisk, forecasts) and GTFS.

## Honest limits
- Temperatures are modeled estimates, not measurements.
- HeatRisk is an experimental NWS product.
- Cool-stop opening hours are not verified.
- Native GPS walking is untested on devices.
