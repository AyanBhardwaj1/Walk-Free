# Walk-Free: product critique against the judging criteria

Written Nov 4, 2026, the day projects are due, as the working plan for the last day.

## The rubric

Meta Global AI Developer Hackathon, indie developer track. The weights below are as reported publicly; the official waiver isn't public.

| Criterion | Weight | What judges look for |
|---|---|---|
| Impact | 30% | A real problem, real users, credible numbers |
| Use of Meta AI tooling | 25% | Meta Model API (Muse Spark, Muse Image, SAM 3.1), open-weights models, Muse Code; how central and how creative |
| Demo (including video) | 25% | The first 30 seconds, a working live link, a clear story |
| Technical depth and execution | 20% | Does it work, and how hard was it |

The indie track also weighs creativity, technical ambition and whether it works.

## Scores before this pass

An independent judge pass on the running app and the repo scored Walk-Free as follows.

| Criterion | Score | Why |
|---|---|---|
| Impact | 6/10 | A real problem on real campuses, with a strong civic angle. But no users and no check against measured temperatures. The deltas look small, and the landing page claims 106°F at 6 AM. |
| Use of Meta AI | 4.5/10 | The Muse Spark agent is well built, but no call has succeeded yet (the key is not set). Guests see "without an AI model". DINOv3 is only passive data. Muse Image was unfinished. |
| Demo | 6/10 | A polished landing page and a working guest demo. But there is no video yet, Meta appears at 1:15 in the script, the tour ends on an unbuilt form, and the street view sits inside a tree. |
| Technical depth | 8/10 | Ray-traced shade over OSM buildings and canopy, byte-range reads of the canopy map, six route types, procedural cities, caps, CSP and 620 tests. |

Weighted: about 6.0/10. A solid entry, not yet a winner.

## Lead the pitch with

1. **DINOv3 finds the trees nobody mapped.** OpenStreetMap has 4,375 trees across six campuses; Meta's canopy map adds 62,748 crowns.
2. **Muse Spark acts on the map instead of chatting.** It plans routes, ranks heat, moves the clock and plants trees, in your own language.
3. **From a walk to civic action.** Plant trees, see the heat drop, see it as a photo (Muse Image), and send a proposal.

## Faults and fixes, in order of score impact

| # | Fault | Moves | Fix | Status |
|---|---|---|---|---|
| 1 | Meta AI is invisible to guests and judges | Meta, Demo | Guests on `/demo` can ask the shared Muse Spark, with a small per-IP daily cap | Planned |
| 2 | Muse Spark compatibility is untested (tools, `json_object`, two system messages) | Meta | Merge the system messages; if the model rejects `response_format`, retry without it | Planned |
| 3 | The video script buries Meta until 1:15 | Demo, Meta | Open on a Spanish question to Muse Spark that draws the route, then the DINOv3 canopy, then planting with a Muse Image render | Planned |
| 4 | The model's work is hidden | Meta, Depth | Show each tool call (function, arguments, result) under the answer | Planned |
| 5 | Landing page: 106°F at 6 AM | Impact | Regenerate the landing data with the daily temperature cycle | Planned |
| 6 | The hero stat is a map-edge artifact (a "park" that is a street past the area's edge) | Impact | Leave places at the map edge out of rankings; regenerate | Planned |
| 7 | The "Built with Meta AI" section is 9th of 11 and its intro talks about weather alerts | Meta | Move it under the hero, add it to the nav, put Muse Spark and DINOv3 in the hero | Planned |
| 8 | No moment in the app that shows DINOv3 | Meta | A "Meta canopy" toggle that shows how the route's shade changes without it | Planned |
| 9 | Muse Image unfinished | Meta | Done: "See it as a photo" after planting (`/images/edits`, `muse-image-1.0`) | Done (needs the key) |
| 10 | SAM 3.1 unused | Meta | Not built: there's no documented SAM 3.1 endpoint on the Model API to test against. Not claimed. | Not done |
| 11 | No evidence of impact | Impact | Cite heat-illness sources; owner gathers photos and quotes | Partly the owner's |
| 12 | The deltas look small | Impact | Express the gain as time in the sun saved over a semester | Planned |
| 13 | The submission reads as a feature list | All | Restructure: problem, Meta AI, evidence, links | Planned |
| 14 | Numbers contradict (5 vs 7 cities, 214 vs 216 trees, `build_area` can't open two cities) | Demo | Make them consistent | Planned |
| 15 | README undercuts the pitch ("OpenAI by default", stale limits, "no deployment claimed") | Demo | Rewrite those lines | Planned |
| 16 | The tour dead-ends: Ask only opens a tab, the last step leaves an unbuilt form, narration is cut off | Demo | Run the demo, build the city, wait for speech to end | Planned |
| 17 | The street-level camera sits inside a tree crown | Demo | Hide tree crowns next to the walker | Planned |
| 18 | At night "More shade" is chosen and the legend talks about sun | Demo | After dark, choose Lit at night and show a night legend | Planned |
| 19 | On phones, toasts and titles cover the map | Demo | Fewer and shorter messages, out of the map's way | Planned |
| 20 | The landing visuals are CSS mockups, not the product | Demo | Real screenshots of the app | Planned |
| 21 | Unverified open-model preset IDs | Meta | Remove the presets that can't be verified | Planned |
| 22 | Map labels overlap the Finish marker on desktop | Demo | Larger gap around markers | Planned |

## What only the owner can do

- **Turn on the site key.** In Vercel set `WALK_FREE_AI_API_KEY`, `WALK_FREE_AI_BASE_URL=https://api.meta.ai/v1` and `WALK_FREE_DATABASE_URL`, then redeploy and check `/api/health`.
- **Run the real checks** (docs/LAUNCH_CHECKLIST.md):
  - Muse Spark: English, Spanish, `generate_city`.
  - Muse Image: "See it as a photo".
- **Set a spend limit** with Meta, since guests can ask a few questions each.
- **Record the video** (docs/VIDEO_SCRIPT.md) and make a thumbnail.
- **Gather evidence:** optionally, a few ground-truth photos or thermometer readings at UT and a few student quotes.
- **Submit:** make the repo public, test the live link signed out, and submit before 9 PM ET.
