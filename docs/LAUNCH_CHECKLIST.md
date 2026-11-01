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

Then redeploy (Vercel → Deployments → Redeploy) and check that `https://walk-free.vercel.app/api/health` shows `"aiConfigured": true` and `"aiUsageDatabase": true`.

## 2. Prove Muse Spark works end to end (5 minutes)
1. Sign in, open https://walk-free.vercel.app/demo?area=ut-austin, then go to the Ask tab.
2. Ask:
   - "Plan the coolest walk from UT Tower to Gregory Gym at 3 PM." This should call `plan_route` and draw the route.
   - "When should I leave?" This should call `best_time_to_leave`.
   - "¿Qué calle es la más caliente a las 3?" The answer should be in Spanish.
3. If any call fails with a model error:
   - Open AI settings.
   - Choose "Meta Model API" and paste the key.
   - Press **Test and save**. The provider's own reason is shown.
4. Note the Meta Model API key prefix. If it starts with `LLM|`, Walk-Free will auto-select the legacy Llama option, so switch the provider by hand and tell me so I can fix the detection.

## 3. Record the video
Follow `docs/VIDEO_SCRIPT.md` (2 minutes). Set the Climate tab's date and time to a July afternoon for the strongest heat contrast.

## 4. Submit
- Use `docs/HACKATHON.md` as the submission text. It covers the problem, what it does, how it uses Meta AI, impact, a 3-minute demo and honest limits.
- Links:
  - Live: https://walk-free.vercel.app
  - Guest demo: https://walk-free.vercel.app/demo
  - Assistant demo: https://walk-free.vercel.app/demo?area=ut-austin&tab=ask
  - Repository: https://github.com/AyanBhardwaj1/Walk-Free
- Deadline: Nov 4, 9 PM ET.

## 5. Decisions only you can make (optional)
- **Let guests use their own AI key without an account.** Today the assistant needs sign-in, even with a personal key. Allowing it would make judging easier, but the server would then relay anonymous requests to AI providers, which could hide abuse of stolen keys. It would need a per-IP limit. Say the word and I'll build it with that limit.
- **Shade Check (photo → Meta vision estimate of shade).** It is held back until it passes its own bar: at least 8 of 10 real street photos labelled correctly with a Meta key. Send 10 photos and a key, and it can be tested and shipped.
- **Open-Meteo air quality** is free for non-commercial use. If Walk-Free becomes commercial, it needs their paid plan or another source.
