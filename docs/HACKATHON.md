# Walk-Free: Meta Global AI Developer Hackathon submission

**Track:** Indie · **Live:** https://walk-free.vercel.app · **Guest demo:** https://walk-free.vercel.app/demo

## One line
Walk-Free shows how hot every street on campus will feel at the hour you walk it. It finds the shadiest way there, and Meta's Muse Spark plans the walk for you in your own language.

## The problem
Extreme heat is the deadliest weather in the US. Students and city walkers have no way to see which streets are shaded and when. Maps optimise for minutes, not for the 15 °F difference between a tree-lined path and an open plaza at 3 PM.

## What it does
- **Heat you can see.** Every path is coloured by modeled feels-like temperature for the chosen hour. The model uses live weather and sunlight (Open-Meteo, NWS fallback) and real shade, ray-traced against OpenStreetMap buildings and tree crowns.
- **Six route types.** Quickest, more shade, scenic, cool stops (through air-conditioned buildings), step-free and lit at night. A **sun-aversion** setting decides how hard the shade route avoids the sun.
- **Best time to go.** Shows how each hour of the day would feel for your walk, with the coolest one called out. **Play the day** animates the sun.
- **Safety signals that change the advice.**
  - Live US AQI.
  - National Weather Service heat and air-quality alerts.
  - The NWS **HeatRisk** 7-day outlook.
- **Plant trees, watch the heat drop.** A design tool lines a street with trees and shows shade and feels-like before and after.
- **A 2D walking view** that follows you, with the next turn and the next block's heat.
- **Four interface styles,** including a high-contrast Sunlight mode for outdoor glare.
- **Share links** that reopen the exact walk, saved walks, and keyboard shortcuts.

## How it uses Meta AI
| Meta technology | Where it is used |
|---|---|
| **Muse Spark (Meta Model API, `api.meta.ai/v1`)** | Default model for the assistant. The assistant uses tool calling: `find_places`, `plan_route`, `set_time`, `heat_ranking`, `place_heat`, `plant_shade_trees`, `build_area` and `propose_design`. The model acts on the live map, then answers in 1–3 sentences that can be read aloud. Set `WALK_FREE_AI_BASE_URL=https://api.meta.ai/v1`; the model defaults to `muse-spark-1.3`. |
| **DINOv3 (Meta + WRI High Resolution Canopy Height Maps v2)** | 1 m canopy height, read server-side straight from the public Cloud-Optimized GeoTIFFs. It adds the trees nobody mapped: at UC Berkeley, 214 mapped trees plus about 10,900 crowns inferred from the canopy map. |
| **Open Muse models** | Bring-your-own-key presets for Muse Spark Open (Fireworks, Baseten, Together) and Muse Glimmer 30B (DeepInfra). The legacy Llama API is still supported. |
| **Multilingual** | The assistant replies in the language the person writes in. |

## Why it matters
Heat illness is preventable when people know where and when the heat is. Walk-Free turns open data into a decision: leave at 7:30 instead of 3, and take Speedway, not 24th Street. It also gives campus planners a tool to show where a row of trees would help most.

## How to demo (3 minutes)
1. Open https://walk-free.vercel.app/demo?area=ut-austin. Drag the time slider to 3 PM and watch the streets turn red.
2. Compare **Quickest** with **More shade**. Push the **sun aversion** slider and watch the shade route change.
3. Open **Best time to go** and tap the coolest hour.
4. In Design studio, plant a row of trees on a hot street and read the before/after feels-like.
5. Sign in (or add a Meta Model API key in AI settings) and ask: *"Plan me the coolest walk from UT Tower to Gregory Gym at 2 PM"*, or the same in Spanish.
6. Open **Data & Sources** to see every layer: OSM, Meta/WRI canopy, Open-Meteo weather and AQI, NWS alerts and HeatRisk.

## Built with
React 19, Vite, three.js / React Three Fiber, MapLibre, Express 5 on Vercel, Neon Postgres (usage caps), and Neon Auth.
Data: OpenStreetMap, Meta/WRI canopy (CC BY 4.0), Open-Meteo (CC BY 4.0), the National Weather Service (alerts, HeatRisk, forecasts) and GTFS.

## Honest limits
- Temperatures are modeled estimates, not measurements.
- HeatRisk is an experimental NWS product.
- Cool-stop opening hours are not verified.
- Native GPS walking is untested on devices.
