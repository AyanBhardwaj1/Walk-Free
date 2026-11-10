# Walk-Free: final 3-minute demo script

**Meta Global AI Developer Hackathon · Indie developer track**
**Runtime:** 2:52 of spoken and shown content, plus 6 seconds on the end card (under the 3:00 cap).
**Speakers:** AYAN (Ayan Bhardwaj) and SAATVIK (Saatvik Kesarwani). About 400 spoken words at a relaxed 140–150 words a minute.
**Live:** https://walk-free.vercel.app · **Guest demo, no sign-up:** https://walk-free.vercel.app/demo

How to read this:
- **[ON CAMERA]** is filmed of you two.
- **[VO]** is voice-over recorded over screen footage.
- **SCREEN** is what to capture.
- **EDIT** is a cue for the editing workflow: animation, overlay, caption, sound.

---

## SCENE 1: COLD OPEN (0:00–0:07)

**SCREEN:** Time-lapse of UT Austin from 6 AM to 6 PM (map toolbar → "Record the day as a time-lapse video"). The paths shift from cool teal to hot orange as the sun climbs.

**AYAN [VO]:**
> Three in the afternoon, Austin, Texas. The walk to class feels like a hundred and seventeen degrees.

**EDIT:**
- Fade up from black.
- Big animated temperature counter in the lower right, ticking **81°F → 117°F** in sync with the time-lapse clock.
- Add a small "modeled estimate" tag under the counter.
- Warm, low synth pad builds under the line.
- No logo yet.

---

## SCENE 2: INTRODUCTIONS (0:07–0:19)

**[ON CAMERA]:** Both of you, side by side or split screen. Natural light, plain background.

**AYAN:**
> Hi, I'm Ayan.

**SAATVIK:**
> And I'm Saatvik. We built Walk-Free.

**AYAN:**
> Every summer we cross campus in the worst heat of the day, and our maps send us the fastest way. Straight through the sun.

**EDIT:**
- Lower-third name tags slide in: "Ayan Bhardwaj", "Saatvik Kesarwani".
- On "straight through the sun", a hard cut to the **Walk-Free logo sting** (0.5 s, sun-flare wipe).

---

## SCENE 3: THE PROBLEM (0:19–0:30)

**SCREEN:** Landing page hero, then a slow scroll to the FAQ "Why does a few degrees of shade matter?", opened.

**SAATVIK [VO]:**
> Heat is the deadliest weather in America. In 2023 it was on more than twenty-three hundred death certificates, and sent about a hundred and twenty thousand people to the ER.

**EDIT:**
- Kinetic type: **2,300+** then **~120,000**, each landing with a soft low thud.
- Small source line at the bottom: "NWS · CDC Heat & Health Tracker · AP analysis of CDC data".
- Music drops to near silence on the second number.

---

## SCENE 4: THE IDEA (0:30–0:36)

**SCREEN:** Hero headline "The cooler way across campus is already there."

**AYAN [VO]:**
> Walk-Free shows how hot every street will feel at the hour you walk it, and finds you the shade.

**EDIT:**
- Title card animates over the hero: **WALK-FREE · built on Meta AI**.
- The music beat kicks in here.

---

## SCENE 5: MUSE SPARK ACTS ON THE MAP (0:36–0:58)

**SCREEN:**
1. Open `/demo?area=ut-austin&tab=ask&t=15`.
2. Type, or say with the mic: **"¿Cuál es la ruta con más sombra a Gregory Gym ahora mismo?"**
3. The route draws on the 3D map and the answer appears.
4. Open one step under the answer to show the tool call.

**AYAN [VO]:**
> This is Meta's Muse Spark, and it doesn't just chat. I asked, in Spanish, for the shadiest way to the gym. It called our own tools, drew the route on a live 3D model of campus, and answered in my language. Every step it took is right here.

**EDIT:**
- Slow push-in on the chat as the question types.
- Subtitle the Spanish question with an English translation.
- Glowing trace animation along the route as it draws.
- Callout bubble pointing at the opened step: **"Muse Spark · tool call: plan_route"**.
- First appearance of the corner tag **Muse Spark** (keep this tag style for every Meta model).

---

## SCENE 6: DINOv3 FINDS THE MISSING TREES (0:58–1:12)

**SCREEN:** Route tab. Show the line "With Meta's DINOv3 canopy, this walk is …% shaded; without it, …%." Press **Hide its trees**, hold a beat, then **Show its trees**.

**AYAN [VO]:**
> Half of that shade comes from trees nobody ever mapped. OpenStreetMap knows about four thousand trees on our campuses. Meta's DINOv3 canopy map finds sixty-two thousand more.

**EDIT:**
- Before/after wipe synced to the toggle (whoosh SFX).
- Counter overlay: **4,375 → +62,748 tree crowns**.
- Corner tag: **DINOv3 · Meta × WRI Canopy Height Maps**.

---

## SCENE 7: SHADE MOVES WITH THE CLOCK (1:12–1:25)

**SCREEN:** Drag the time slider from 9 AM to 3 PM (streets turn red). Then show the **Quickest** and **More shade** route cards side by side, and the "Heat stress on this walk" line.

**AYAN [VO]:**
> And shade moves. The shade route skips about a fifth of the sun for a few extra steps: about nine hours less in full sun over a semester.

**EDIT:**
- Speed-ramp the slider drag.
- Split screen: Quickest vs More shade, with the numbers ticking.
- Big caption: **≈ 9 hours less in full sun per semester**.
- Small badge on the heat-stress line: **UTCI heat-stress index**.

---

## SCENE 8: CHECK IT WITH A PHOTO, SAM 3.1 (1:25–1:43)

**SCREEN:**
1. Heat tab → open a street from the hottest list → **Check it with a photo (SAM 3.1)**.
2. Choose your prepared street photo.
3. The overlay shows tree canopy, paved ground and sky, with the ground split into sun and shade.

**SAATVIK [VO, or picture-in-picture on camera]:**
> A model is only useful if you can trust it. So you can check any street with a photo. Meta's SAM 3.1 finds the tree canopy, the pavement and the sky, and we split the ground into sun and shade, right next to what our model predicted.

**EDIT:**
- Picture-in-picture of Saatvik in a rounded corner frame while he speaks.
- The mask layers animate in one at a time: canopy (green), pavement, sky.
- Corner tag: **SAM 3.1**.

---

## SCENE 9: WHERE SHOULD THE NEXT TREES GO? (1:43–2:04)

**SCREEN:**
1. Design studio → **Find where trees help the most walkers** → the ranked list appears.
2. **Plant this street** on #1 → the Heat impact card shows shade and feels-like before → after.
3. **See it as a photo**: the 3D view beside Muse Image's photo of the planted street.

**AYAN [VO]:**
> Then we asked a bigger question: where should campus plant its next trees? Walk-Free samples everyday walks, finds the sunny streets most people share, and ranks where a row of trees saves the most sun. One click plants them, and Meta's Muse Image shows the greener street as a photo.

**EDIT:**
- The ranked bars grow in, staggered.
- Freeze-frame on the Heat impact card with a bold stamp: **"[X]°F cooler"** (read the number off the card you recorded).
- Slider-wipe reveal from the 3D model to the Muse Image photo.
- Corner tag: **Muse Image**.

---

## SCENE 10: FROM A WALK TO CITY HALL (2:04–2:16)

**SCREEN:**
1. **Write a proposal**: scroll the letter to the line "See it planted, in 3D".
2. Cut to the Heat tab → tick **Colour paths by walk to the nearest refuge**: the map recolours.

**SAATVIK [VO]:**
> It writes the proposal for the city, with a link that opens campus with those trees already planted. And like Barcelona's climate shelters, it maps how far every path is from a place to cool down.

**EDIT:**
- Highlighter sweep across the link line in the proposal.
- Map recolour green → amber → red.
- Overlay: **"28% of paths within 5 min · 64% within 10 min"** (UT Austin, 3 PM).

---

## SCENE 11: MUSE WONDER THINKS IT THROUGH (2:16–2:30)

**SCREEN:**
1. Ask tab → switch on **Think deeper with Meta's Muse Wonder**.
2. Ask **"Should I walk from Jester to PCL at 9 AM or at 3 PM today, and which way keeps me in the shade?"**
3. Show the answer and the route.

**SAATVIK [VO]:**
> For harder questions, one switch hands the same tools to Muse Wonder, Meta's reasoning model. It weighs the hour and the route together, and tells you when to go.

**EDIT:**
- Glow pulse on the toggle.
- Speed-ramp through the thinking wait (2–4×) with a soft "thinking" shimmer.
- Land at normal speed on the answer.
- Corner tag: **Muse Wonder**.

---

## SCENE 12: CLOSE (2:30–2:52)

**[ON CAMERA]:** Both of you again, same framing as Scene 2.

**AYAN:**
> Muse Spark, Muse Wonder, Muse Image, SAM 3.1 and DINOv3. Five pieces of Meta AI, pointed at one problem.

**SAATVIK:**
> Walk-Free. The cooler way across campus.

**AYAN:**
> Try it right now, no sign-up, at walk-free dot vercel dot app.

**EDIT:**
- On "five pieces of Meta AI", the five model tags fly in one by one and lock into a row.
- Cut to the time-lapse b-roll for the last line.
- End card: Walk-Free logo · **walk-free.vercel.app** · "Open source on GitHub" · both names.
- Music resolves on the logo.

## END CARD HOLD (2:52–2:58)

The end card holds in silence. Export at **2:58 or shorter**.

---

## Production notes

**Before recording**
- Check https://walk-free.vercel.app/api/health shows `"aiConfigured": true`, `"guestAi": true` and `"aiUsageDatabase": true`.
- In the browser you record with, remove any personal AI key: under the chat, if it says "Using your … key", click **Change** and remove it. The footer under each answer should then say **"Answered by Meta's Muse Spark"** (or Muse Wonder).
- Do a full dry run of Scenes 5, 8, 9 and 11 once, so nothing surprises you on camera.
- If any live AI call fails while recording, use the Ask tab's **Watch what it does** demo instead, and caption it on screen as **"scripted demo of the assistant's tools"**. Never label it as Muse Spark.

**Capture settings**
- Screen at 1920×1080 (or 1440×900), browser zoom 100%, bookmarks bar hidden, notifications off.
- Open every demo link with `&t=15` (3 PM). For the strongest heat, tap the weather chip → **July afternoon**.
- Record each scene as its own clip. The 3D map needs a moment after some clicks; cut those waits in the edit.
- **B-roll:** the map's time-lapse button gives Scene 1 and the closing shot in one take. Also grab a slow orbit of campus (right-drag) and a street-level walk (Route tab → **Walk it at street level**) as spare cutaways.
- For Scene 8, use a real photo looking along a sunny sidewalk with a few trees.

**On-camera setup**
- Eye-level camera, window light in front of you, quiet room, phone or lav mic close to your mouths.
- Record each spoken line two or three times; pick the best take in the edit.

**Look and sound (to match the site)**
- Colours: ivory `#f4f1e6`, deep green `#2f4a33`, heat orange `#d7772d`, shade teal `#2f6577`.
- Type: Playfair Display for headlines, DM Sans for captions and tags.
- One music bed, ducked about 12 dB under speech.
- Light UI click SFX on taps, a soft whoosh on the before/after wipes, a low thud on the big numbers.
- **Burned-in captions for every spoken line.** Judges often watch muted.

**Numbers on screen (keep them exactly as written)**

| On screen | Source |
|---|---|
| 81°F → 117°F (Speedway, 6 AM → 3 PM, July, full sun) | `public/landing/speedway.json` |
| 2,300+ death certificates (2023); ~120,000 ER visits for heat illness (2023) | AP analysis of CDC data; CDC Heat & Health Tracker |
| 4,375 mapped trees → +62,748 DINOv3 crowns (six campuses) | `public/landing/campuses.json` |
| ≈ 9 hours less in full sun per semester (UT; 4 walks a weekday, 15 weeks) | landing page campus card |
| 28% of paths within 5 min, 64% within 10 min of a refuge (UT, 3 PM) | Heat tab, "Cool refuges within reach" |

Anything else the app shows on screen (route minutes, shade %, °F cooler, UTCI) changes with the hour and weather. Read it from your recording, never from this script.
