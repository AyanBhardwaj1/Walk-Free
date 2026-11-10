# Next features (post-judging patch)

Built after submission and held back so nothing changed while the project
was being judged. None of it is committed, pushed or deployed. It comes as
one patch against `main` at commit `5476bfe` (the last commit before judging).

## Apply it later

```bash
git checkout main && git pull
git checkout -b feature/next
git apply --index walk-free-next.patch
npm ci && npm test && npm run build
```

If `main` has moved on since `5476bfe`, apply the patch on a branch made
from `5476bfe` and merge `main` into it. Before merging, check the
"Still to validate" section.

What's inside:

1. Follow-me location
2. My walks: on-device learning
3. Step into a photo
4. Building interiors
5. The shady side of the street
6. A heat check on every walk
7. Opening hours for building interiors
8. Phone first view and clearer place names
9. Sun avoided, week by week
10. Accessibility fixes in the existing app
11. Leave-by across the week
12. Share my week
13. A walking streak, and small wording
14. Map looks, and richer 3D with open-source postprocessing
15. Accessibility profiles and multilingual, smoother speech
16. First-run guide
17. A globe of every place on the landing page
18. Planner research and the first P0: coverage at an older walker's pace

After those come the product evaluation and research notes, the tests and
checks run, what's still to validate, and thirteen independent reviews.

## 1. Follow-me location (phone or laptop)

The map follows you across campus, on a phone (GPS) or a laptop (Wi-Fi
location).

- `src/lib/follow.ts` smooths fixes with a small Kalman filter (constant
  velocity). It plays down implausible jumps (faster than 7 m/s), and takes
  the coarse fixes laptops give (up to 150 m), so the dot settles rather
  than jumping about.
- The **Follow me** button sits in the map controls. The camera
  re-centres as you move. The dot shows an accuracy ring and a heading
  arrow, and the status line says when a fix is approximate ("±80 m, from
  Wi-Fi").
- Walk off the loaded map and a banner offers **Build the map around you**.
- Transient GPS errors after the first fix no longer stop tracking
  (`src/lib/navigation.ts`).

## 2. My walks: on-device learning (neural network)

This is opt-in ("Learn from my walks on this device"). Everything stays in
`localStorage`, and it can be exported or deleted from the panel.

- **Walk log** (`src/lib/walk-log.ts`): fixes are logged while you follow
  or walk, then split into walks at stops (35 m for 3 min) or gaps (5 min).
  Accuracy worse than 60 m is dropped.
- **Personal pace** (`src/lib/ml/mlp.ts`, `src/lib/ml/pace-model.ts`): a
  small neural network written from scratch (tanh hidden layer, Adam, L2,
  early stopping on a holdout). It learns your speed from feels-like
  temperature, time of day, weekday or weekend, and minutes into the walk.
  With few walks it blends toward the population pace (1.34 m/s). Route
  summaries add "About X min at your pace".
- **Routines and leave-by** (`src/lib/ml/routines.ts`): your places come
  from clustering where walks start and end. Home is where days start and
  end, and routines are trips you repeat at similar times. **Leave by**
  combines your predicted time for the next trip (weather at that hour,
  your past times on that trip), its spread, and a buffer for your kind of
  walker.
- **Reminders** (`src/lib/leave-reminder.ts`): "Remind me 5 minutes
  before". The phone app schedules a local notification (Capacitor). On the
  web it fires while the tab is open.
- **Add to my calendar** (`src/lib/ml/calendar.ts`): saves the routine as
  a standard .ics event repeating on its days at the leave-by time, with an
  alert 5 minutes before, so the phone's own calendar reminds you even on
  the web with Walk-Free closed.
- **What kind of walker** (`src/lib/ml/persona.ts`): campus student, city
  commuter, night owl or weekend explorer, guessed from your walks or
  picked ("I'm a…"). This sets the default route preference and the buffer.
  A logistic model learns the temperature above which you choose shade.
- **Heat-aware leave-by** (`src/lib/ml/trip-heat.ts`): for the next
  routine trip, the quickest and the More shade route are planned at the
  hour you'll leave. The card (and the reminder) says how hot it will feel
  and what the shade route saves, e.g. "It'll feel like 91°F in the sun.
  The More shade route has 2 min in sun instead of 6."
- **Sun on your walks** (`src/lib/ml/exposure.ts`): each logged walk on
  this map is replayed against its buildings and trees at the hour it was
  walked. "This week: 29 of 87 walking minutes in direct sun (34%), 8
  points more than the week before." It's worked out after the panel draws
  (about 0.2 s for two weeks of walks).
- **Walk logged**: when a real walk finishes, a note gives its distance,
  time, pace against your usual and minutes in sun.
- **Move your walks between devices** without a server: **Export my
  walks** saves a file, and **Import walks** merges one in
  (`importWalks` in `src/lib/walk-log.ts`). Every field is checked, walks
  already here are skipped, samples are never imported (and sample walks
  on this device give way), walks dated in the future are refused, long
  traces are thinned to 2,000 points, files over 5 MB are refused, and the
  newest 400 are kept, with a note if older ones made room. If the browser
  can't save the log (storage full), it says so once.
- **Ask**: the assistant's `my_walks` tool answers "When should I leave for
  class?" and "How much sun am I getting on my walks?", including the next
  walk's heat. Ask suggests the first once a routine is known.
- **Try it with sample walks** fills the log with three weeks of synthetic
  walks along real paths, so the panel can be shown before anyone has
  walked. They're labelled as samples.

## 3. Step into a photo (photo to 3D)

Take a photo along a street or corridor and walk into it in 3D. It all runs
on the device with classic open computer vision, the same steps OpenCV
would use, written in TypeScript so no model is downloaded.

- `src/lib/photo3d/vanishing.ts`: Sobel edges on a smoothed image, a
  gradient-guided Hough transform, and RANSAC over line crossings (refined
  by least squares) to find the vanishing point.
- `src/lib/photo3d/tour.ts`: "Tour into the picture" (Horry et al., 1997).
  The floor, side walls, sky and far wall are built in metres, using eye
  height for scale and the lens from the photo's EXIF when it has one.
  Ground lines through the vanishing point give each side's distance
  (slope = eye ÷ X), and the sky line gives the building heights. The sky is
  cut out, so rooftops stand against it.
- `src/components/PhotoScene.tsx` opens from the image button in the map
  controls. The first 3D frame reproduces the photo exactly (offset lens
  centre). Drag the handles to adjust, slide **Walk in**, and drag to look
  around. It reports the street width, building height, depth and share of
  open sky. **Try a sample street** works offline. The dialog is loaded
  only when opened.
- **Shade along this street** (`src/lib/photo3d/canyon.ts`,
  `src/components/StreetShade.tsx`): from the rebuilt street (width, and
  each side's front height read from the sky line) and the sun's path, a
  timeline of when each sidewalk is in shade through the day, with
  "Right now: walk on the left sidewalk". The street's direction comes from
  the photo's EXIF (GPSImgDirection), the phone's compass (it follows the
  back camera, upright in portrait or landscape), or a tap on N/NE/E…. The
  place and date come from the photo's GPS and date when it was taken near
  the map; otherwise the map's place and today are used. Long summer days
  widen the timeline.

## 4. Building interiors

Bring in a floor plan for any building in the Design studio. The building
then opens as a 3D cutaway, and its corridors join the walking network as
covered, indoor paths.

- Select a building, find **Inside {building}**, and choose **Add a floor
  plan**. It accepts:
  - **A photo or drawing of a plan** (`src/lib/indoor/plan-image.ts`). This
    uses Otsu thresholding, removes text and door swings, closes the
    outside even through entrances, and splits rooms at doorways with a
    distance transform (the neck width is searched per plan, since doors
    differ). Corridors are thinned to centre lines (Zhang–Suen), entrances
    are found in the outer wall, and outlines are traced and simplified.
    You see the traced rooms over your image, can turn or mirror it, choose
    the floor, and place it.
  - **IMDF** (Apple's Indoor Mapping Data Format), as a `.zip` or its
    GeoJSON files, **OpenStreetMap Simple Indoor Tagging**, or **any
    GeoJSON** of rooms and corridors (`src/lib/indoor/import-geojson.ts`).
- Placement (`src/lib/indoor/place.ts`) fits the plan to the building's
  minimum-area rectangle (rotating calipers). It stretches the plan when
  the proportions match and scales it evenly when they don't. Nearly
  touching corridor lines are welded and joined. Entrances connect to the
  nearest outdoor path, using the marked doors when the plan shows them.
  A plan placed by hand keeps all its rooms even where the building's
  outline isn't a plain rectangle; mapped data is clipped to the outline.
- The view (`src/components/scene/Interiors.tsx`) shows floors coloured by
  use, low walls, dashed walking lines and doorways. Lower floors show
  faintly beneath the chosen one, the shell is hidden, and trees inside
  the footprint are hidden. In Explore, a chip shows which building is open
  and has **Show the outside**.
- **Floors and rooms.** Every floor is walkable. Stairs and lifts that
  line up on consecutive floors join them: stairs count as about 12 m of
  walking a floor, a lift as about 30 m, and step-free walks take the
  lift. In a traced plan, tap a room to mark it as stairs or a lift. Named
  rooms become places to walk to ("Room 204, PCL (Level 2)"). Walking to
  one opens its building at that floor, and the route line rises to that
  floor's height. Neither a tap on the map nor a GPS fix ever snaps to an
  upper floor or partway up the stairs. The flat 2D map draws the open
  floor's rooms and corridors too.
- **Safe with real data.** Only the parts a doorway reaches join the
  network; a building no outdoor path reaches is drawn but not walkable,
  rather than becoming an island that breaks routes. Imported lines are
  clipped to the building's outline, so an OSM export's footways stay
  outside, and rooms, doors and entrances outside it (a whole campus's
  IMDF venue) are left out. Entrances join outdoor paths, never a
  neighbouring building's interior. IMDF reads only units, openings and
  levels, and reads levels first. OSM reads `highway=corridor` lines and
  skips walls, fences and other untagged features. Everything is held to
  the save schema's limits. Deleting or reshaping a building takes its
  plan out. A floor that isn't joined to the one beside it is reported
  when it's placed.
- Interiors are saved with the scene (`world.indoor`, validated in
  `shared/schema.ts`) and come out cleanly with **Remove**.

## 5. The shady side of the street

`src/lib/shady-side.ts`: for every step of a planned walk along a street,
both sidewalks are tested for shade at the hour of the walk (about 5 m
either side of the centre line, or half the mapped road width plus the
kerb). When one side is clearly shadier, the walking directions say so,
e.g. "Turn right onto West 42nd Street 147 m · shade on your left (94% vs
53%)", with a line above the directions. Park paths and campus footways
mapped as separate sidewalks need no hint, since the route already picks
one.

## 6. Heat check on every walk

`src/lib/walk-advice.ts` and `src/components/WalkAdvice.tsx`. Under the
walk's heat-stress line, the Route tab turns the numbers into at most
three steps, coloured by level:

- **A shadier swap**, when another route saves at least 2 minutes of sun
  for at most 5 more minutes of walking: "Take More shade: 3 min in the
  sun instead of 6, for 1 more minute of walking."
- **The cool stop** the route already passes, with "check it's open".
- **Water and pace** for walks of 10 minutes or more in strong heat
  stress (UTCI 32 °C and up), naming the mapped drinking fountains on the
  way when there are any ("there are 2 drinking fountains on the way").
- **Warning signs** in very strong heat stress (UTCI 38 °C and up):
  dizziness, nausea and confusion, as the CDC lists them, with "stop in
  shade or air conditioning". This is guidance, not medical advice;
  nothing in the card tells anyone they're safe.

**Said aloud.** With spoken guidance on, a walk's first instruction
also reads out the heat check's first step for the walk itself (water, a
cool stop, warning signs), never a route swap once the route is chosen.
Spoken instructions now end with a full stop, so the shade hint after
them ("Shade in 50 metres.") reads as its own sentence instead of running
on.

**Vibrate at each turn.** On phones that can vibrate (Android browsers
and the app; iPhone browsers can't), a "Vibrate at each turn" option under
Route options gives two short pulses with each new instruction. It's for
noisy streets or walking without sound, and is saved on the device.

**More sensitive to heat.** A checkbox under Route options, saved on the
device: "I'm more sensitive to heat". The CDC's higher-risk groups (older
adults, pregnancy, heart or lung conditions, some medicines) get every
step one level sooner. For example, moderate heat stress on a 12-minute
walk then brings "Carry water". No heat stress still brings nothing.

The level is the higher of the walk's UTCI band and NWS HeatRisk for that
day (`heatRiskOn` in `shared/outlook.ts`, only with forecast weather,
never a what-if scenario). The card names HeatRisk only when HeatRisk is
the higher of the two, since the line above it already names the UTCI
band. With nothing useful to say, it shows nothing.

## 7. Opening hours for building interiors

`src/lib/opening-hours.ts`, `src/lib/indoor/hours.ts`. An imported
interior can carry opening hours, and **routes walk around a building
while it's closed** instead of sending people to a locked door. That's the
main risk of indoor cut-throughs.

- **Syntax.** Hours use OpenStreetMap's `opening_hours` syntax, which
  IMDF's `hours` also uses. The parser reads the common forms:
  - `24/7`
  - day ranges and lists, including ranges that wrap the week (`Fr-Mo`)
  - split hours (`08:00-12:00,13:00-17:00`)
  - hours past midnight (`18:00-02:00`)
  - `off`
  - later rules replacing earlier ones for the days they name
- **What it skips or refuses.** Holidays (`PH`, `SH`) are dropped from a
  rule's days and the rest of the rule applies. Anything else it can't
  read (months, sunrise, comments) is treated as unknown, and unknown
  hours count as open, as before.
- **Where hours come from.**
  - On import, from `opening_hours` on the OSM building, or from `hours`
    on the IMDF venue or building feature.
  - Typed on the building's card: **Opening hours** with a live "Open
    until 10 PM" or "Closed · opens Mon 7 AM" pill.
  - Hours are saved with the scene (schema: up to 500 characters).
- **How routing uses them.** The router leaves out a closed interior's
  indoor paths (`indoor:<building>:`, indoor ones only). The short
  outdoor links to its doors stay, as dead ends, so a walk can still
  reach a door. The exception is a walk that starts or ends inside the
  building, which can still walk out. That includes a start at a GPS fix
  on one of its corridors.
- **Set by the assistant.** "The library's open 7 to 10 on weekdays, 9 to
  5 Saturdays, closed Sundays" works too. A new assistant tool,
  `set_building_hours`, has the model turn the person's words into
  OpenStreetMap syntax (`Mo-Fr 07:00-22:00; Sa 09:00-17:00; Su off`). The
  app checks it with the same parser and refuses rather than guesses if
  it can't read it. It then saves it on the building and replies with
  "Open until 10 PM" at the time shown. It only works for buildings with
  a mapped inside, matched by name or campus alias, and empty hours clear
  them.
- **Cool refuges.** An open building with a mapped inside now counts as
  a refuge on the Heat tab ("1 open building with a mapped inside"),
  reached through its mapped door. "Open" means open by its hours, or in
  the daytime (8 AM to 8 PM, as for campus cool stops) when its hours
  aren't known. The assistant's `cool_refuges` tool lists it too.
- **What people see.**
  - The Route tab says which buildings are closed at the walk's hour.
  - The "Inside …" chip (on the map, or in the panel on phones) shows
    "· Open until 10 PM" or "· Closed · opens Mon 7 AM".
  - The assistant's route tool gets the same list.
- **Data & Sources.** The tab lists building interiors and their hours
  ("2 buildings mapped inside · 1 with hours · 1 closed now"), and the
  heat check's sources: UTCI bands, NWS HeatRisk and the CDC's warning
  signs, marked as guidance, not medical advice.
- **Bundle.** `hours.ts` is kept apart from `place.ts`, so routing doesn't
  pull the lazy-loaded plan tracer into the main bundle.

## 8. Phone first view and clearer place names

- **Walk peek.** On phones, a one-line summary of the chosen walk sits at
  the top of the sheet, above the fold: "More shade · 15 min · 3 min in
  sun vs 6 on the quickest". Before this, the route cards (the product's
  whole point) were a scroll away. Tapping it opens the Route tab and
  scrolls to the cards, smoothly unless reduced motion is on.
- **Generate a city** takes one line on phones (its subtitle is hidden),
  and it's hidden during a walk: mid-walk, the walk comes first.
- **Tool row.** On narrow phones (360 px) the map's tool row covered the
  temperature chip. It now stays clear of it and scrolls sideways.
- **"More tools" on desktop.** The three tools used now and then (record
  the day as a time-lapse, import scene, export scene) moved into a
  **More tools** menu, so the map's row has 9 buttons instead of 11. The
  menu closes with Escape (focus returns to its button), on a click
  elsewhere, or after a choice. Axe is clean. Phones never showed these
  three.
- **Zoom and compass on short phones.** On phones under 800 px tall
  (360 × 740, 375 × 667, 360 × 640), the zoom and compass column rode up
  over the tool row or onto the time-of-day card. There it's now a row
  on the left, under the temperature chip, clear of both. Taller phones
  (390 × 844 and up) are unchanged.
- **Place names.** Path points named after a nearby building now read
  "Near Kinsolving Dormitory" instead of "Path near Kinsolving
  Dormitory". Places saved under the old name still show cleanly.

## 9. Sun avoided, week by week

`src/lib/ml/sun-avoided.ts`. The "Sun on your walks this week" card in
My walks now also says how much sun your walks kept you out of: "About
**12 min** less sun than the quickest ways would have given you (6 walks
compared)". Or, honestly, "about the same" or "more sun".

- **How it's worked out.**
  - Each logged walk this week is compared with the quickest mapped way
    between its ends.
  - Both sides are measured the same way: buildings and trees against the
    sun at that hour. A mapped roof counts for neither side, since the
    walk's own replay can't see it.
  - The quickest way is timed at your own pace: its sunny share, times
    its length over the length you walked, times your minutes. So a
    longer shady detour is credited only with the sun it really saved.
- **What's left out.** Walks whose ends aren't within 60 m of a path,
  round trips, and walks with the sun down. At most the 12 newest walks
  are compared.
- **Speed.** Each trip is routed once, and shade maps are shared per
  week and half hour, as for the weekly sun card. On UT Austin with the
  sample walks, it takes 270 ms in Node (500 ms before this), and about
  the same on Midtown Manhattan's 4,900 buildings (12 walks). It runs
  just after the week's card has drawn, so opening My walks isn't held
  up (2.5 s to reopen in headless Chromium, the same as without it).
- **Why it matters.** This is the "value delivered" number from the
  product evaluation below: a reason to come back each week, and the
  figure to validate with real walks.

## 10. Accessibility fixes in the existing app

A full-page axe sweep of every tab and the Design studio, on desktop and
phone, in all four themes (editorial, night, sunlight, blueprint), found
issues the app
already had. All are fixed, and the sweep is now clean:

- **°F/°C button.** Its accessible name ("Show temperatures in Celsius")
  left out the visible "°F", so voice-control users couldn't say what
  they see. It now reads "°F: show temperatures in Celsius".
- **Climate tab summary.** The small print in the selected-point summary
  was 2.7:1 contrast and its eyebrow 3.3:1. Both are now the panel's
  secondary ink, above 4.5:1.
- **Heading levels.** The Heat tab's place lists (h4) and the Climate
  summary (h3) skipped straight from the panel's h1. They are now h2,
  with the same look.
- **Night theme coloured text.** Deep reds landed mid-tone, about 4:1 on
  night's dark panels (the "in full sun" temperature). Coloured text in
  night mode now has a lightness floor, so accents stay readable. The
  theme's contrast tests still pass.

Sunlight and night flagged the tree planner's button only while it was
disabled during a run; once the run ends it passes.

## 11. Leave-by across the week

The next trip used to be looked for only today and tomorrow, so with
weekday routines the leave-by card vanished after Friday's last trip
until Monday morning. `nextTrip` now looks a week ahead, and every place
that shows the time names the day when it isn't today. That's the card,
the map chip, the "you'll get a notification at …" line and the
assistant's `my_walks` tool: "Leave by 9:27 AM Monday", "… tomorrow" or
"… next Monday". The notification itself keeps the plain time, since it
arrives on the day. A web reminder still needs the page open; the phone
app's native reminder doesn't.

- **Past the forecast.** The forecast reaches 48 hours, so a trip days
  away gets no heat advice rather than today's weather, and its pace
  estimate uses a mild day.
- **Laptops that sleep.** A web reminder is checked against the clock at
  least once a minute rather than with one long timer. Timers pause in
  sleep, and the alert should come when the laptop wakes, not hours
  late.

## 12. Share my week

`src/lib/share-card.ts`. The weekly sun card in My walks has a **Share
my week** button (for real walks only, never the samples). It draws a
square "My week in the shade" image on the device:

- the sun avoided ("4 min less sun than the quickest ways, over 12
  walks"), or the shaded share when nothing was compared
- a shade-to-sun bar, walks, minutes, the walking streak (two days or
  more) and the place
- the app's address

On phones it opens the share sheet with the image and a line of text;
elsewhere it downloads `walk-free-week.png`. This is the growth loop the
evaluation asked for: proof of value people can post. It never claims
"more sun" as a win.

The image is encoded at once rather than with `toBlob`, whose callback
stalled under heavy load in testing. The fonts are waited on for at most
a second.

## 13. A walking streak, and small wording

- **Streak.** `src/lib/ml/streak.ts`. My walks shows "3 days in a row
  with a walk" once a run reaches two days, and adds "walk today to keep
  it going" until today's walk is logged. The assistant's `my_walks`
  tool reports it too. A streak isn't lost until the
  day is over, and sample walks never count. It's a light habit loop on
  top of the weekly card and Share my week.
- **None, not 0.** A walk logged with no minutes in the sun now says
  "none of it in direct sun" instead of "0 of them in direct sun".

## 14. Map looks, and richer 3D with open-source postprocessing

Under **Map look** in the Route tab there are four ways to draw the 3D
map, saved on the device:

- **Standard:** shadows, haze and the day's light, as before.
- **Cinematic:** the most realistic. It uses the open-source pmndrs
  `postprocessing` library (with `@react-three/postprocessing`). N8AO
  ambient occlusion makes streets read as canyons between buildings, a
  soft bloom makes windows and street lamps glow at night, and there's a
  light vignette, SMAA edges, sharper rendering (up to 2× pixel ratio)
  and longer haze. It also turns people and trees on. The effects load
  only when Cinematic is picked.
- **Heat focus:** even light with no shadows or haze, so the heat
  colours read true, and the heat map on.
- **Bare bones:** streets and buildings only, with no trees, people,
  heat or shadows.

Each look sets the layers that suit it, and every layer stays
switchable on the map's tool row. Switching between shadowed and flat
looks redraws the scene.

**Fictional cities.** On the noir fictional city at night, Cinematic
gives the dark gothic skyline with glowing windows. That's as close as
the app gets to a game-like mood. It doesn't copy any game's
environments or art.

**New dependencies:** `postprocessing@6.39.6` and
`@react-three/postprocessing@3.2.2`. Run `npm ci` after applying the
patch.

## 15. Accessibility profiles and multilingual, smoother speech

`src/lib/access-profiles.ts`, `src/lib/speech-i18n.ts`. **Accessibility
and voice** in the Route tab, saved on the device:

- **Set the app up for me.** Each profile turns on what suits it:
  - **Blind:** spoken turn-by-turn, a buzz at each turn where the phone
    can vibrate, and larger text.
  - **Low vision:** larger text and the high-contrast Sunlight style.
  - **Deaf or hard of hearing:** turns shown on screen and felt as a
    buzz, not spoken.
  - **Wheelchair or mobility aid:** Step-free routes that avoid stairs
    and steep slopes.
  - **Sensitive to heat:** the heat check speaks up a level sooner.
- **Speak directions in** English, Spanish, French, Portuguese, Hindi or
  Chinese. Instructions, shade hints and "You have arrived" are
  translated; street names are said as mapped. **Hear a sample** tries
  it.
- **Smoother speech.** The browser's most natural voice for the language
  is chosen ("Natural", "Neural", "Premium" or "Enhanced" first), at a
  slightly slower rate. Long replies are spoken sentence by sentence, so
  they flow and aren't cut off. The assistant's replies already pick
  their language from the text.

## 16. First-run guide

`src/components/FirstRunGuide.tsx`. New visitors get a five-step card
over the map: find your walk, pick the cooler route, walk it, make it
yours (accessibility, voice, map look) and learn your routine. It isn't
a blocking dialog, so the app works behind it. It ends with **Start
exploring** or **Take the 1-minute tour** (the existing guided tour).
It's remembered once seen, and **How it works** in the panel's footer
opens it again.

## 17. A globe of every place on the landing page

`src/components/CoverageSection.tsx`, `src/components/CoverageGlobe.tsx`,
`src/lib/globe-land.ts`. A "Where you can walk" section on the landing
page shows a 3D globe:

- **Markers:** an ivory sphere with dot-matrix land, a faint grid, and a
  pulsing marker for each ready campus and city. Hovering, or focusing
  its entry in the list beside it, names the place and turns the globe
  to it, and clicking opens it.
- **Beyond the ready places:** a note that any real place can be built
  on demand, and chips for the fictional cities.
- **Loading and motion:** the globe loads only when the section nears
  the screen, and is still when reduced motion is set. Without WebGL the
  list stands alone.
- **Checks:** checked at 1440 and 390 px, with axe.

## 18. Planner research and the first P0: coverage at an older walker's pace

A deep-research pass (three subagents, sources cited) produced a
planner PRD: `reports/Urban heat planning PRD.md`, sent with this
patch.

- **Recommended first market:** campus facilities teams.
- **P0 features:**
  1. a cooling-site coverage audit that allows for opening hours and
     slower walkers
  2. planting-site ranking
  3. before/after estimates for walking routes, labelled as modelled
- **Built from it:** the Heat tab's cool-refuge coverage now has **At an
  older walker's pace (3.3 km/h)**, the pace Barcelona's climate-shelter
  plan uses for older people and children. The minutes and "within 5/10
  min" shares follow it. Opening hours already count (open buildings are
  refuges only when open).
- **Next:** the PRD's other P0s, ranking and before/after estimates,
  extend the existing tree planner.

## Product evaluation (6 November, afternoon)

A first-time walkthrough of the demo on desktop (1440 × 900) and phone
(390 × 844), read as a startup would read it.

**Problem and proof of demand.** Walking in heat is a daily cost for
students and commuters in hot cities, and it's getting worse. Demand is
real:

- Geuneullo, a student-built shade-routing app in Korea, topped Apple's
  Korean navigation chart in July 2026.
- ASU's Cool Routes found a cooler option on more than 70% of Tempe campus
  trips.
- Strings for a "Prefer shade" option were found in Google Maps (APK
  teardown, Nov 2025). That's the biggest threat if it ships. I found no
  launch as of this research.

**What's strong.**

- **Activation.** The demo shows value within seconds: route cards with
  "53% less sun · 1° cooler" and minutes in sun.
- **Heat model.** It's deeper than any competitor: UTCI rather than air
  temperature, a canopy layer, and NWS HeatRisk.
- **Retention loops.** The walk log learns a personal pace, then gives
  leave-by reminders, a calendar event and a weekly sun card.
- **A second customer.** Planners get the tree planner, heat briefs and
  planting proposals.

**Gaps found, and what was done.**

| Gap | Change |
| --- | --- |
| Numbers without a "so what": a UTCI band doesn't tell anyone what to do | Heat check (section 6) |
| On phones, the route cards were below the fold | Walk peek, one-line generator entry (section 8) |
| Indoor cut-throughs can send people to locked doors (the research's main risk for this feature) | Opening hours (section 7) |
| "Path near …" endpoint names read like debug text | "Near …" (section 8) |
| 11 map buttons on desktop (8 on phones) with icons only | Evening: the three rare tools moved into a "More tools" menu (9 buttons). On narrow phones the row scrolls clear of the temperature (section 8). |
| No reason to come back between walks, nothing to show friends | Evening: leave-by a week ahead, a walking streak, and a "My week in the shade" image to share (sections 11 to 13). |
| Indoor shortcuts and cool stops depend on hours nobody has typed | Evening: hours from imported files, the building card, or plain words to the assistant; open buildings count as cool refuges (section 7). |

**Positioning.** Lead with what no competitor does:

- air-conditioned indoor cut-throughs, now with opening hours
- heat-health steps tied to the route
- a pace model that stays on the device
- planner what-ifs

Shade maps alone are becoming a commodity.

**Metrics to watch.**

- Activation: the share of first sessions that pick a non-quickest route.
- Retention: week-4 return rate, among people who turn on walk learning.
- Value delivered: minutes in sun avoided per walk. This patch adds it
  to the weekly card (section 9).
- Ground truth: a WBGT walk on campus to back up "degrees cooler" before
  claiming it in marketing.

### Research notes (an AI-research agent, same afternoon)

Ranked ideas, with what happened to each. "Unverified" means the agent
couldn't confirm it from a primary source.

1. **HeatRisk and heat-health guidance.** HeatRisk already existed; the
   heat-health steps are new in this patch (section 6).
2. **Cost based on mean radiant temperature (MRT).** UTCI with a SolarCal
   sun term already ranks routes. Matching ASU's six-direction MRT method
   is the next step for accuracy.
3. **Air-conditioned indoor cut-throughs with `opening_hours`.** Done for
   imported interiors (section 7). Hours for the six campuses' built-in
   cool stops still need checking on the ground, so they keep "check
   hours".
4. **Photo sky-view factor with SAM 3.** A SAM 3.1 street photo check
   already exists. Feeding its sky share into MRT is future work.
5. **In-browser depth (Depth Anything V2 Small, about 19 MB as ONNX).**
   Not built. WebGPU in Capacitor WebViews is unverified, and so is the
   model's licence for each size. The vanishing-point method stays as the
   no-download path.
6. **Heat-aware pace.** Already there: the pace network has heat and
   time-of-day inputs, a population prior, and drops stretches faster
   than 2.6 m/s (bus, bike).
7. **Planner tree what-ifs.** Already there (the tree planner).
8. **Hands-free voice "look ahead".** Not built. There's a safety and
   liability risk if people treat it as obstacle detection.

Not recommended for now:

- 3B-parameter models in the browser (downloads of several GB)
- Apple SHARP (non-commercial licence)
- World Labs Marble (about $1.20 per scene)
- federated learning (far more complexity than benefit at this size)

## Tests and checks run

- `npm test`: 836 tests pass across 88 files (after merging onto main), including new suites:
  - `follow`, `mlp`, `walk-learning`, `leave-reminder`
  - `indoor-plan`, `indoor-place`: routing through a building that
    otherwise has no way across, up stairs to a room, by lift when
    step-free, no islands, clipping
  - `photo3d` (vanishing point within 3% of truth on a known street,
    width within 2 m, EXIF focal length)
  - `canyon` (which sidewalk is shaded for sun from each side, winter
    east–west and summer north–south streets in Austin, EXIF GPS, direction
    and date, compass maths for portrait, landscape and flat)
  - `exposure`, `trip-heat`, `walk-summary`, `shady-side`, `walk-import`, `calendar`
  - `walk-advice` (the heat check: shadier swap, water and fountains,
    warning signs always kept, HeatRisk, heat sensitivity), `share-card`,
    `streak`, `opening-hours` (OSM syntax, holidays,
    past midnight, multi-day stretches) and `sun-avoided` (like-for-like
    sun, detours credited fairly); `indoor-place` and `assistant-tools`
    gained closed-building cases
  - `speech-i18n` (each language's turn, shade hint and arrival; voice
    choice; sentence chunks), `access-profiles`, `globe-land`, and
    `refuges` at an older walker's pace
- `npx tsc --noEmit`, `npx eslint .` and `npm run build` are clean.
  The Cinematic look's effects build into their own `vendor-effects` chunk
  (about 159 kB gzipped) that loads only when Cinematic is chosen.
- In the browser (scratch dev server, headless Chromium) I checked:
  - following with simulated GPS
  - My walks with sample walks on UT Austin and Midtown Manhattan:
    routines, leave-by and persona (Midtown reads as a city commuter, 66%).
    On the Midtown samples the pace network is 14% closer than a fixed pace,
    measured on held-out stretches.
  - two traced floors joined by marked stairs, with a walk to an upstairs
    room from search
  - reminders, using a stubbed Notification API because headless Chromium
    reports notifications as blocked
  - plan upload and placement on UT buildings
  - the photo dialog on desktop and phone sizes, and its street-shade
    timeline
  - a simulated two-minute walk logged with its summary note, the weekly
    sun card and the heat-aware leave-by card
  - importing walks from a file (a broken file, new walks, the same file
    again), and downloading the leave-by calendar event
  - a regression sweep of the existing app on desktop and phone sizes
    (landing, demo, every tab, the 2D view, the Design studio's tree
    planner, the dialogs) with no page or console errors
  - the heat check, walk peek, opening-hours field, closed-building note
    and "Inside" chip; a phone run from search to a simulated GPS walk;
    the heat-sensitivity setting surviving a reload
  - a full-page axe sweep of every tab and the Design studio, desktop and
    phone, in all four themes: no violations after the fixes in section
    10. Earlier: axe accessibility checks on My walks and the
    photo dialog, in the default and night themes: no violations (small print darkened inside the new panels only; the app's
    shared fine-print grey is unchanged and still below 4.5:1 elsewhere)

## Still to validate

- Spoken directions in each language with real phone voices, and the
  "natural" voice choice on iOS, Android, Windows and macOS.
- Cinematic's frame rate on mid-range phones (only tested in a software
  renderer), and whether walkers prefer it or Standard.
- The accessibility profiles with blind, low-vision, deaf and
  wheelchair-using testers, and the larger-text zoom on iOS Safari.
- Whether the first-run guide helps first-time visitors (a short user
  test), and the globe's simplified coastlines.
- Opening hours from real IMDF venues and OSM buildings, and whether
  people trust "walks go around it" at closing time.
- "Sun avoided" against real logged walks, and a WBGT or sensor walk on
  campus before claiming degrees saved.
- Whether the heat check's wording is clear to a first-time walker (a
  short user test).
- The share sheet with the week's image on a real iPhone and Android
  phone. Headless Chromium has no share sheet, so only the download was
  tested.
- "Vibrate at each turn" on a real Android phone. It was tested with a
  stubbed vibration call.
- The assistant's `set_building_hours` with the live model (Muse Spark
  or a person's own key): whether it writes valid hours from everyday
  phrasing. The tool's checks were tested directly.
- A web reminder set days ahead on a laptop that sleeps overnight. It was
  tested with a fake clock.

- Real walks on a phone and a laptop. Follow-me and the walk log were
  tested with simulated positions only.
- The native reminder (Capacitor local notification) on a real iOS and
  Android build.
- A real IMDF archive and real OSM indoor data. The importers were tested
  with built features.
- Real floor-plan scans: hand-drawn, coloured, or with furniture. The
  vectoriser was tested on drawn plans; unusual plans may need a cleaner
  image.
- Real street photos with people, trees and parked cars. These are painted
  flat onto the box, which is a known limit of single-photo reconstruction.
  Street-shade timings from real photos (and a real phone compass) haven't
  been compared with shade on the ground yet.
- Phone sizes were checked in emulation (390 × 844, touch): the
  floor-plan card (trace, preview, place), the open building in Explore
  (shown in the panel on phones, not over the map), the photo dialog and
  My walks. Not yet on real devices.

## Independent review

Thirteen separate reviews of the new code found 90 defects in all. 88 are
fixed and covered by tests or browser checks; two are documented limits
(below).

The first review's 12:

1. Interiors with no doorway outside became islands that broke routes to
   the building.
2. Deleting or reshaping a building left its indoor paths behind.
3. Non-walkable IMDF and OSM features were imported as paths.
4. After following stopped, a coarse Wi-Fi fix could become the route
   start.
5. A reminder could be scheduled twice.
6. The leave-by time could be stale or already past; it now ticks with the
   clock and skips missed trips.
7. The learned shade threshold was compared against the wrong feels-like.
8. Opening another building could start on a floor it doesn't have.
9. Large imports could exceed the save schema or overflow the stack.
10. Finely drawn lines could be welded away.
11. Native following stopped on a momentary GPS loss.
12. The pace network's improvement was compared against an in-sample
    baseline.

The second review's 10:

1. An entrance could join a neighbouring building's interior.
2. A GPS start could snap onto an upper floor or the stairs.
3. Rooms and doors outside the building were imported.
4. OSM `highway=corridor` lines were dropped.
5. Walls, fences and untagged features became paths.
6. A native reminder could be set after being turned off.
7. The leave-by clock stopped while learning was off.
8. A floor just picked could be overridden.
9. Routines arriving at the same time could be skipped.
10. Disconnected floors went unreported, and rooms centred on a corridor
    were dropped.

The third review's 7 (street shade and walk sun):

1. A second photo could keep the first one's direction and date.
2. A photo with GPS far from the map (or a 0, 0 fix) was timed in the
   map's time zone.
3. The Android compass ignored tilt, so it was 90° off in landscape.
4. Columns looking past the far wall inflated the side heights.
5. Minutes just after sunset could count as sun.
6. The timeline hid early and late daylight on long days.
7. A magnetic EXIF direction was taken as true north. It's now noted.

The fourth review's 8 (heat advice, walk notes, shady side, floors):

1. The reminder could carry another trip's heat advice, or none. Advice
   is now tied to the trip and its hour, and the reminder is rebuilt when
   it arrives.
2. The advice used the hour on screen's weather. It now uses the
   forecast for the hour of the walk when there is one.
3. "Placed by hand" was read from the source text, so mixing a plan
   image with an IMDF venue skipped clipping for the venue. It's now a
   flag on each floor.
4. Phones (and the flat map) had no floor switcher in Explore.
5. A trace left open last time was announced as a new walk on loading.
6. A first walk was compared with its own pace.
7. Unnamed roads shared one width for sidewalk testing.
8. The advice didn't follow a changed leave-by time for the same trip.

## Size

The new code adds about 25 kB gzipped to the main bundle (the learning
models, interiors and shade logic). The photo dialog (11 kB) and the
floor-plan tools (8 kB) load only when opened.

The fifth review's 8 (reminders, calendar, import):

1. A reminder could alert a second time inside its 5-minute window when
   the advice or units changed. It now waits for this trip's advice and,
   once due, stays as set.
2. The calendar event's repeat days were arrival days, wrong for a walk
   that leaves before midnight.
3. Imports could grow the log past what the browser saves, losing walks
   silently.
4. The import count included walks the 400 limit then dropped.
5. Walks dated in the future were accepted and could be announced as
   just walked.
6. Calendar lines were folded by characters, not bytes (long non-Latin
   names broke the 75-octet rule).
7. Imported walks mixed with sample walks.
8. Heat advice didn't follow hand-set weather changes.

## Floor plans: a harder test

A second test plan (an L-shaped building, an L-shaped corridor, rooms of
different sizes, desks drawn in rooms, and a double-door entrance) showed
the room splitter cutting long corridors into pieces at door junctions.
It now scores each doorway width only by spaces clearly thicker than the
cut and of some size, and calls a space a corridor only when it is long
and thin. That plan now gives 11 rooms, an L-shaped corridor, 11 doorways
and the entrance. The first plans are unchanged (8 rooms; the test plan's
6). It's a regression test now (`drawnLPlan` in
`tests/fixtures/floor-plan.ts`), and the app shows the same result.

IMDF archives are unpacked within a 200 MB total budget (GeoJSON files
only, levels first), so a crafted archive can't exhaust the tab's memory.

The sixth review's 7 (floor-plan tracer, archives, reminders, import):

1. A plan with no corridor, or a single hall, had its most elongated
   room taken as the corridor. The fallback now needs at least three
   spaces and one that clearly stands out.
2. Known limit, not fixed: a corridor narrower than its doors can't be
   separated from the rooms by the doorway cut, so it's shared out among
   them. Such plans need the corridor drawn wider or traced by hand.
3. A leave-by nudged inside the alert window (by a re-learned pace) could
   alert a second time; once due, the reminder is keyed by its trip.
4. A zip made by a Mac's "Compress" failed on its hidden `__MACOSX` files.
   They are skipped, as is any unreadable file inside an archive.
5. The unpacking budget was spent in archive order, so big detail files
   could crowd out the levels. Entries are now listed first and unpacked
   by use, within one budget for the whole import.
6. An import that wouldn't fit in the browser's storage was kept anyway,
   so every later walk would be lost. It's refused with a message.
7. Walks past the read limit weren't counted as skipped, and very long
   traces lost their end instead of being thinned.

The seventh review's 9 (heat check, opening hours, closed buildings):

1. A walk starting from a GPS fix on a closed building's corridor found
   no route: the fix splits the corridor into a node without the
   building's tag, so the "starts inside" exemption missed it. An end now
   counts as inside when it's tagged or every path touching it is the
   building's. An outdoor node by a door has outdoor paths too, so it
   doesn't open the building.
2. A holiday rule naming regular days (`PH,Su off`) was skipped whole, so
   those days read as open. Holidays are now dropped from the day list
   and the rest of the rule applies.
3. A building open on one weekday only showed "Closed" with no next
   opening. The search now reaches the same weekday next week.
4. "Walking around X" listed every closed building, even one the walk
   ends inside. It now reads "Closed at this hour: … Walks go around
   unless they start or end inside", and the assistant is told the same.
5. Hours running straight on past midnight (`10:00-24:00` then
   `00:00-03:00` the next day) said "Open until 12 AM". They now read as
   one stretch, until 3 AM.
6. A later rule for a day (`Fr 18:00-02:00; Sa off`) didn't cancel the
   night carried into it. It now replaces the whole day, as in OSM.
7. An invalid time could throw while drawing the hours field. It now
   shows nothing.
8. The assistant got a heat check after dark, when shade means nothing
   (the app shows none). It's now skipped then, as in the app.
9. Generated place names read "Near X", and the places that show only
   the bare place stripped "Near " from any label, so a real path named
   "Near East Hall" showed as "East Hall". Generated labels now carry
   their place (`placeName` in `destinations.ts`), so real names are kept.
   Known limit: the saved-walks list stores label text only and still
   strips the prefix there.

The eighth review's 8 (sun avoided, closed buildings, sensitivity):

1. A GPS fix on a closed building's outdoor door link, or a walk ending
   at its door, opened the whole building. Now only a closed building's
   indoor paths are left out. The short outdoor links to its doors stay,
   as dead ends, so a walk can still reach a door. An end counts as
   inside only when every path touching it is the building's indoor
   path.
2. Sun avoided compared unlike things: routing calls a covered path
   shade, but the walk's replay can't see roofs. Both sides now use the
   same building-and-tree test.
3. Sun avoided priced the quickest way at the walk's own length, which
   over-credited longer shady detours. It's now scaled by the quickest
   way's length over the length walked.
4. Turning on heat sensitivity could remove the only tip (the shady side)
   on a short, mild walk.
5. The last map's sun figures stayed after switching maps, and the
   assistant could read them. They're now cleared.
6. Sun avoided held the main thread for up to 20 re-routes. It's now
   cached per trip with shared shade maps, and runs after the card draws.
7. "Open until 12 AM" showed when the next day was open all day. Hours
   are now followed across days ("Open until Wed 12 AM", or "Open 24
   hours" for a whole week). `08:00-08:00` is unknown rather than 24
   hours.
8. Found while testing, not by the review: on 360 px Android screens the
   map's tool row covered the temperature chip (at 390 px it clipped the
   "F"). On phones the row now stays clear of the chip and scrolls
   sideways when it doesn't fit, with focus rings drawn inside the
   buttons.

The ninth review's 2 (last fixes):

1. The night theme's new lightness floor for coloured text also caught
   light text made for dark fills. The demo tour's light green heading,
   on a fill that turns light at night, fell to 1.3:1. The floor now
   applies only to dark coloured text, and a theme test covers both
   cases.
2. On short phones, the zoom and compass row would sit under the walking
   banner mid-walk. It's hidden while the banner shows; pinch and drag
   still work.

The tenth review's 5 (the evening's changes):

1. Trips days away (now that leave-by looks a week ahead) got heat
   advice from today's weather, since the forecast reaches 48 hours. Past
   the forecast there's no heat advice, and the pace estimate assumes a
   mild day.
2. A web reminder set days ahead was one long timer, which pauses while a
   laptop sleeps. It's now checked against the clock at least once a
   minute (a test jumps the clock past it).
3. Started with voice off and turned on mid-walk, the walk's start tip
   would ride on a later instruction. It's now dropped with the first
   instruction either way.
4. A building imported under a different name from its campus cool stop
   was counted twice as a refuge. Refuges within 25 m of each other now
   count once.
5. The week's image waited for fonts before opening the share sheet,
   which Safari can refuse as no longer a response to the tap. It's now
   drawn and encoded before anything is awaited.

The eleventh review's 5 (the assistant's hours tool and the rest):

1. Two edits in one assistant turn (hours for two buildings, or hours
   then trees) each started from the scene as last drawn, so the second
   undid the first. Edits now update the scene the tools read at once,
   and the tools always read the latest scene.
2. Asking for "Green Library Annex" could set the hours of "Green
   Library". An exact name wins, then the longest name the request
   contains. A fragment that fits two buildings gets "ask which" rather
   than a guess.
3. In extreme heat with a shadier route, a cool stop and fountains, the
   CDC warning signs could fall off the three-step limit. They now always
   stay.
4. The pace for a trip later in the forecast used the temperature now,
   and a hand-set what-if still read the live forecast. Pace and advice
   now use the forecast for that hour, and only when the weather is live.
5. Escape closed the More menu (and moved focus) even from elsewhere on
   the page or over an open dialog. It now acts only inside the menu.

The twelfth review's 2 (streak and names):

1. The streak's "today" came from a clock that only ticks when there
   are routines, so with the tab left open past midnight a new day's walk
   wasn't counted. It now reads the time when it's drawn.
2. Building names matched inside other words: hours for "Smart Hall"
   could land on a building called "Art". Matching is now by whole words,
   and accents are ignored ("Petion Hall" finds "Pétion Hall").

The thirteenth review's 7 (tonight's looks, speech, guide and globe):

1. Stopping speech, or starting new speech, only stopped the sentence
   being read: a long reply went on reading its later sentences. Each
   speech now has a number, and older ones stop.
2. If the Cinematic effects failed to load (offline, an old build) or to
   draw (a weak GPU), the whole app showed its crash screen, again after
   every reload. The map now carries on without them and switches back
   to Standard.
3. A saved Bare bones look came back after a reload with trees, heat
   colours and people on (and Cinematic without its people). The layers
   now follow the saved look, including when a new area opens.
4. Unticking the last accessibility need snapped "Accessibility and
   voice" shut while focus was inside it. It now stays open.
5. Closing the first-run guide left keyboard focus nowhere. It now goes
   back to where it was.
6. The heat brief counted cool refuges at the usual pace while the card
   showed the older walker's pace. Both now use the chosen pace.
7. The landing page's WebGL check left a graphics context open. It now
   releases it.
