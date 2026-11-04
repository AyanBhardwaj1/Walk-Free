# Submission form: paste-ready answers

Deadline: **Nov 4, 8:00 PM CT** (cerebralvalley.ai submit form).

**Track option:** *Build for Your World.* Walk-Free solves an everyday, real-world problem (heat on the walk to class) and turns it into civic action.

**Most Viral Track (optional):** the link to your X post, if you make one. Good candidates are the day time-lapse (map toolbar, "Record the day as a time-lapse video") and the 0:40–1:02 Muse Spark clip from the video.

**Public GitHub Repository:** https://github.com/AyanBhardwaj1/Walk-Free

**3-Minute Demo Video:** your YouTube link. Set it to Unlisted or Public, not Private.

## Project Description

Walk-Free shows how hot every street on campus will feel at the hour you walk it, and finds the shadiest way there. Heat is the deadliest weather in the US, yet maps send students the fastest way, straight through the sun.

- **Heat you can see:** Walk-Free ray-traces sunlight against real buildings and tree crowns, colours every path by modeled feels-like temperature and heat stress (UTCI), and offers six routes: shadiest, quickest, step-free, lit at night, through air-conditioned buildings, and scenic.
- **When to go:** it tells you the coolest time to leave.
- **On UT Austin's campus:** the shade route skips about a fifth of the sun for a few extra steps, about 9 hours less in full sun over a semester.
- **From a walk to civic action:**
  - Walk-Free samples typical walks and ranks where new trees would help the most walkers.
  - It plants them in 3D and shows the street before and after.
  - It writes a proposal for the city council, with a link that opens campus with the trees already planted.
  - It maps how far every path is from a cool refuge, like Barcelona's climate shelters.
- **Ready now:** six campuses and Midtown Manhattan open instantly, and any US city builds from OpenStreetMap. Try it with no sign-up at https://walk-free.vercel.app/demo.

## Describe your use of Meta products to build the submitted project

- **Muse Spark (Meta Model API):** the assistant acts on the map instead of chatting.
  - It calls 13 of Walk-Free's own tools: plan routes, find the coolest hour, rank hot streets, plan and plant trees, map cool refuges, build cities.
  - It runs them on the live 3D map and answers in the user's language.
  - Each tool call is shown under the answer.
  - Guests can ask it questions without an account.
- **Muse Wonder:** one "Think deeper" switch sends the same conversation and tools to Meta's reasoning model for harder questions.
- **SAM 3.1:** "Check it with a photo." SAM 3.1 segments tree canopy, pavement and sky in a street photo (decoded with Meta's @meta-sam/parser). The ground is then split into sun and shade, so anyone can check the model's shade on the ground.
- **Muse Image:** after planting trees, it turns the 3D view into a photo-like picture of the greener street for proposals.
- **DINOv3:** Meta and WRI's 1 m Canopy Height Maps v2 fill in the trees nobody mapped. OpenStreetMap has 4,375 trees on our six campuses; DINOv3 adds 62,748 crowns. The Route tab shows how much of each walk's shade comes from them.
- **Open weights:** bring-your-own-key presets for Muse Spark Open (Fireworks, Together) and Llama 4.
- **City planning:** Muse Spark also plans generated cities that Walk-Free builds and lets you walk.
