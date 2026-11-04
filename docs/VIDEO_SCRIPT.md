# Walk-Free: 3-minute demo video script

**Event:** Meta Global AI Developer Hackathon, indie developer track. **Hard cap: 3:00.** Aim for 2:50 so nothing is cut.
**Presenters:** Ayan Bhardwaj (A) and Saatvik Kesarwani (S).
**Live link:** https://walk-free.vercel.app · **Guest demo (no sign-up):** https://walk-free.vercel.app/demo

How to read this:
- **SCREEN** is what to capture.
- **SAY** is the voice-over or on-camera line.
- **EDIT** is the cue for the editing workflow: animations, overlays, captions, sound.

Lines are timed for an easy talking pace, about 150 words a minute.

## Before recording

- Set the site's Meta key in Vercel first (docs/LAUNCH_CHECKLIST.md, step 1). Then Muse Spark, Muse Wonder, Muse Image and SAM 3.1 answer live in the guest demo.
  - If the key isn't live yet, the Ask tab offers **Watch what it does**, a scripted run of the same tools. If you show that, caption it "scripted demo of the assistant's tools", never "Muse Spark".
- Record the screen at 1440×900 or 1920×1080, Editorial style, with the browser zoomed to 100% and bookmarks hidden.
- Open every demo link at **3 PM** (`&t=15`). The strongest heat contrast is a July afternoon: in the weather chip, tap **July afternoon**.
- Have a real street photo ready (looking along a sunny sidewalk, ideally one with a few trees) for the SAM 3.1 shot.
- Record each beat as its own clip. The software map can take a few seconds to settle after a click, so trim the waits in the edit.
- Use the map's **Record the day as a time-lapse video** button (toolbar) to capture b-roll of shadows sweeping across campus. That one file covers the cold open and the outro.

## The script

| Time | SCREEN | SAY | EDIT |
|---|---|---|---|
| **0:00–0:08** Cold open | Time-lapse b-roll: UT Austin from morning to evening, streets going from blue to red as the sun climbs. | (VO, A) "At three in the afternoon in Austin, the street outside the library feels like a hundred and seventeen degrees." | Start on black, fade in the time-lapse. Large animated counter in the corner ticking 81°F → 117°F in sync with the clock caption. Low, warm synth swell. No logo yet. |
| **0:08–0:22** Intros, on camera | Both on camera, side by side or split screen. | **A:** "I'm Ayan, a student at UT Austin." **S:** "And I'm Saatvik. Every summer we walk between classes in the worst heat of the day, and our maps only ever send us the fastest way, straight through the sun." | Lower-thirds with name and role (Ayan Bhardwaj; Saatvik Kesarwani). Light film grain. Cut to the Walk-Free logo sting on "the sun" (0.5 s). |
| **0:22–0:34** The problem | Landing page hero, slow scroll down to the FAQ "Why does a few degrees of shade matter?" | **A (VO):** "Heat is the deadliest weather in the US. In 2023 it was on more than twenty-three hundred death certificates, and sent about a hundred and twenty thousand people to the ER." | Kinetic type for "2,300+" and "~120,000", each popping in with a soft thud. Small source credits at the bottom (NWS, CDC, AP). |
| **0:34–0:40** The pitch | Landing hero headline "The cooler way across campus is already there." | **A:** "So we built Walk-Free: it shows how hot every street will feel at the hour you walk it, and finds the shade." | Title card animates in over the hero: **Walk-Free · built on Meta AI**. |
| **0:40–1:02** Muse Spark acts on the map | `/demo?area=ut-austin&tab=ask&t=15`. Type (or say with the mic) **"¿Cuál es la ruta con más sombra a Gregory Gym ahora mismo?"** The route draws on the 3D map. Then open one step under the answer to show the tool call. | **A:** "This is Meta's Muse Spark, and it doesn't just chat. I asked in Spanish for the shadiest way to the gym. It called Walk-Free's own tools, drew the route on a live 3D model of campus, and answered in my language. Every step it took is right here." | Zoom-and-pan (Ken Burns) onto the chat as the question types. Callout bubble "Muse Spark · tool call: plan_route" pointing at the opened step. Highlight the drawn route with a glowing trace animation. Subtitles: Spanish line plus an English translation. |
| **1:02–1:16** DINOv3 finds the missing trees | Route tab: the canopy line "With Meta's DINOv3 canopy, this walk is …% shaded; without it, …%." Press **Hide its trees**, then **Show its trees**. | **A:** "Half of that shade comes from trees nobody ever mapped. OpenStreetMap has about four thousand trees on our six campuses. Meta's DINOv3 canopy map adds over sixty thousand." | Before/after wipe synced to the toggle. Counter overlay "4,375 → +62,748 tree crowns". Tag in the corner: "Meta × WRI Canopy Height Maps v2 (DINOv3)". |
| **1:16–1:30** Routes that change with the hour | Drag the time slider 9 AM → 3 PM (streets turn red). Then compare **Quickest** with **More shade**; point at the heat-stress line under the route. | **A:** "Shade moves through the day, so the best walk moves too. The shade route skips about a fifth of the sun for a few extra steps. Over a semester that's about nine hours less in full sun." | Split screen of Quickest vs More shade with numbers ticking. Big caption "≈ 9 hours less in full sun / semester". Small badge on the UTCI line: "UTCI heat-stress index". |
| **1:30–1:48** Saatvik: check it with a photo (SAM 3.1) | Heat tab → hottest list → open a street → **Check it with a photo (SAM 3.1)** → choose the prepared street photo. The overlay shows canopy, paved ground and sky, with sun vs shade on the ground. | **S:** "A model is only as good as the ground truth. So you can check any street with a photo. Meta's SAM 3.1 marks the tree canopy, the pavement and the sky, and we split the ground into sun and shade, right next to what the model predicted." | Picture-in-picture of Saatvik in the corner while he talks. The mask overlay animates in layer by layer: canopy (green), pavement, sky. Callout "SAM 3.1 · Meta Model API". |
| **1:48–2:10** From a walk to civic action | Design studio → **Where should the next trees go?** → **Find where trees help the most walkers** → ranked list → **Plant this street** on #1 (Heat impact card: shade before → after, a few °F cooler) → **See it as a photo**. | **A:** "Then it goes further. Walk-Free walks the whole campus, finds the sunny streets most people use, and ranks where new trees would help the most walkers. One click plants them, and Meta's Muse Image turns the 3D view into a photo of the greener street." | Animated bar chart for the ranked list (bars grow in). Freeze-frame on the before/after numbers with a bold "X°F cooler" stamp (read X off the Heat impact card you recorded). Side-by-side reveal of the 3D model and the Muse Image photo with a slider wipe. Callout "Muse Image · images/edits". |
| **2:10–2:22** Proposal and refuges | **Write a proposal**: show the letter and its link line "See it planted, in 3D". Then Heat tab → tick **Colour paths by walk to the nearest refuge**. | **A:** "It writes the proposal for the city council, with a link that opens campus with those trees already planted. And it maps how far every path is from a cool refuge, like Barcelona's climate shelters." | Highlight the link line in the proposal with a marker-sweep animation. Map recolours green → amber → red; overlay "28% within 5 min · 64% within 10 min (UT Austin, 3 PM)". |
| **2:22–2:36** Saatvik: Muse Wonder | Ask tab → switch on **Think deeper with Meta's Muse Wonder** → ask "Should I walk from Jester to PCL at 9 AM or at 3 PM today, and which way keeps me in the shade?" | **S:** "For harder questions, one switch hands the same tools to Muse Wonder, Meta's reasoning model. Here it weighs the hour and the route together, and tells me when to go and which way." | Show the toggle with a glow pulse. Speed-ramp through the thinking wait (2–4×) with a "thinking…" shimmer overlay, then land at normal speed on the answer and the route on the map. |
| **2:36–2:50** Close, on camera | Both on camera; cut to the landing "Built with Meta AI" section, then the time-lapse again. | **S:** "Muse Spark, Muse Wonder, Muse Image, SAM 3.1 and DINOv3, all pointed at one thing." **A:** "A cooler way across campus. Try it now, no sign-up: walk-free.vercel.app." | Logo wall of the five Meta technologies animating in one by one. End card: Walk-Free logo, URL, "Open source on GitHub", both names. Music resolves. |
| **2:50–3:00** Buffer | End card holds. | (silence) | Hold the end card; leave the buffer so the upload stays under 3:00. |

## On-screen numbers (all from the app or its cited sources; keep them exactly)

| Claim | Source |
|---|---|
| Speedway, UT Austin, July: 81°F at 6 AM to 117°F in full sun at 3 PM | `public/landing/speedway.json` |
| 4,375 trees in OpenStreetMap; +62,748 crowns from the DINOv3 canopy map (six campuses) | `public/landing/campuses.json` |
| The shade route avoids 13–25% of the sun for 4–7% more walking; about 9 hours less in full sun per semester at UT (four walks a weekday, 15 weeks) | `public/landing/campuses.json`, landing page |
| Refuges at UT, 3 PM: 28% of paths within 5 min, 64% within 10 min | Heat tab, "Cool refuges within reach" |
| Heat on 2,300+ US death certificates in 2023; about 120,000 ER visits for heat illness that year; heat is the leading weather-related killer | AP analysis of CDC data; CDC Heat & Health Tracker; NWS (linked in the landing FAQ) |

Numbers shown in the app itself (planner rankings, before/after, UTCI) change with the hour and weather. Read them off the screen you recorded rather than from this table.

## Edit notes for the workflow

- **Style:** warm editorial look that matches the site: ivory `#f4f1e6`, deep green `#2f4a33`, heat orange `#d7772d`, shade teal `#2f6577`. Serif headlines (Playfair Display), sans body (DM Sans).
- **Captions:** burned-in subtitles for every line (judges often watch muted). Translate the Spanish question.
- **Meta credits:** each Meta technology gets a small consistent tag the first time it appears: "Muse Spark", "DINOv3", "SAM 3.1", "Muse Image", "Muse Wonder".
- **Pacing:** never hold on a loading spinner. Speed-ramp or cut waits. Keep each beat moving.
- **Audio:** one music bed, ducked under speech. Subtle UI clicks on taps. A single "whoosh" on the before/after wipes.
- **Honesty:** if a model call was replaced with the scripted demo, label it on screen. Temperatures are modeled estimates, so add a small "modeled estimate" tag the first time a temperature appears.
