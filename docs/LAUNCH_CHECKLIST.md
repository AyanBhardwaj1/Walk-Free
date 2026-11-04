# Before submitting: what only you can do

Everything below needs your accounts or keys. The code is done and deployed at https://walk-free.vercel.app.

## 1. Turn on the site's assistant with Meta's Muse Spark (Vercel → Project → Settings → Environment Variables, Production)
Production health currently reports `aiConfigured: false` and `aiUsageDatabase: false`.

| Variable | Value |
|---|---|
| `WALK_FREE_AI_API_KEY` | Your Meta Model API key (from https://ai.developer.meta.com/) |
| `WALK_FREE_AI_BASE_URL` | `https://api.meta.ai/v1` |
| `WALK_FREE_AI_MODEL` | Leave empty: it defaults to `muse-spark-1.3` |
| `WALK_FREE_DATABASE_URL` | Your Neon Postgres connection string. Without it the shared assistant refuses to run, because daily and monthly caps need shared counters. |

Then redeploy (Vercel → Deployments → Redeploy) and check that `https://walk-free.vercel.app/api/health` shows `"aiConfigured": true`, `"aiUsageDatabase": true` and `"guestAi": true`.

**Guests can now ask Muse Spark without an account** (judges included): 12 questions a day per visitor and 400 a day for all guests together. Change them with `WALK_FREE_GUEST_AI_PER_VISITOR` and `WALK_FREE_GUEST_AI_DAILY`, or set `WALK_FREE_GUEST_AI=off` to turn it off.

**Set a spend limit** on your Meta developer account as a backstop, since anyone can ask a few questions.

## 2. Prove Muse Spark works end to end (5 minutes)
1. Signed out, in a private window, open https://walk-free.vercel.app/demo?area=ut-austin&tab=ask. The Ask tab should show the chat (not the sign-up card). Ask one question, then sign in and repeat below.
2. Ask:
   - "Plan the coolest walk from UT Tower to Gregory Gym at 3 PM." This should call `plan_route` and draw the route.
   - "When should I leave?" This should call `best_time_to_leave`.
   - "¿Qué calle es la más caliente a las 3?" The answer should be in Spanish.
3. If any call fails with a model error:
   - Open AI settings.
   - Choose "Meta Model API" and paste the key.
   - Press **Test and save**. The provider's own reason is shown.
4. Note the Meta Model API key prefix. If it starts with `LLM|`, Walk-Free will auto-select the legacy Llama option, so switch the provider by hand and tell me so I can fix the detection.

## 2b. Prove AI city generation (2 minutes, after step 1)
1. Signed in, open https://walk-free.vercel.app/app?generate= and describe a city, for example "a rain-soaked gothic harbour city from a 90s cartoon". Choose **Detailed** (2 credits).
2. The welcome message should say "planned by AI". If it says "designed from your words offline", the AI call failed; the red notice above the map names the provider's reason.
3. In the Ask tab, try: "Generate a sunny art-deco city of heroes and drop me in it." It should call `generate_city`, which allows one city per question.

Without the site key, guests and signed-in people without their own key still get the offline designer.

## 2c. Prove Muse Image (2 minutes, after step 1)
1. Signed in, open https://walk-free.vercel.app/demo?area=ut-austin&t=15, go to Design studio and use **Shade trees** on a hot street (or run tour step 6).
2. In the Heat impact card press **See it as a photo**. After a few seconds the dialog shows the 3D model beside Muse Image's photo of the planted street.
3. If it fails, the dialog shows Meta's reason. If Meta names a different model id, set `WALK_FREE_IMAGE_MODEL` in Vercel and redeploy.

## 2d. Prove SAM 3.1's shade check (1 minute, after step 1)
1. Open https://walk-free.vercel.app/demo?area=ut-austin&tab=heat, press **Take or choose a photo** and pick a street photo with trees.
2. Green boxes should appear over the trees. If it fails, the card shows Meta's reason. If Meta names a different model id, set `WALK_FREE_SEGMENT_MODEL` in Vercel and redeploy.

## 3. Record the video
Follow `docs/VIDEO_SCRIPT.md` (2 minutes). It opens on a Spanish question to Muse Spark, so do step 1 first.

## 4. Submit
- Use `docs/HACKATHON.md` as the submission text. It runs problem, Meta AI, what it does, evidence, demo, limits.
- Links:
  - Live: https://walk-free.vercel.app
  - Guest demo: https://walk-free.vercel.app/demo
  - Assistant demo: https://walk-free.vercel.app/demo?area=ut-austin&tab=ask
  - Repository: https://github.com/AyanBhardwaj1/Walk-Free
- Deadline: Nov 4, 9 PM ET.

## 5. Decisions only you can make (optional)
- **Shade Check (photo → Meta vision estimate of shade).** It is held back until it passes its own bar: at least 8 of 10 real street photos labelled correctly with a Meta key. Send 10 photos and a key, and it can be tested and shipped.
- **Open-Meteo air quality** is free for non-commercial use. If Walk-Free becomes commercial, it needs their paid plan or another source.
