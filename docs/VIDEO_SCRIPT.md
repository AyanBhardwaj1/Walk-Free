# Walk-Free: 2-minute demo video script

Record at 1440×900 in Chrome, Editorial style. Every link opens without an account. The first 30 seconds carry the pitch: Meta's Muse Spark acting on the map, in Spanish.

Before recording, set the site key (see docs/LAUNCH_CHECKLIST.md) so the guest demo's Ask tab answers live. If the key isn't set, the Ask tab runs a scripted demo of the same tools instead; say so on screen and don't present it as the model.

| Time | Screen | Say |
|---|---|---|
| 0:00–0:08 | https://walk-free.vercel.app/demo?area=ut-austin&t=15, Ask tab already open | "Heat is the deadliest weather in the US, and maps still send students down the sunniest street." |
| 0:08–0:30 | Type, or say with the mic: "¿Cuál es la ruta con más sombra a Gregory Gym ahora mismo?" Muse Spark draws the route; open one step under the answer to show the tool call | "This is Meta's Muse Spark. It doesn't just chat: it calls Walk-Free's own tools, plans the shade route on the live map and answers in your language. Every step it took is right here." |
| 0:30–0:45 | Route tab: the canopy line under the route, press Hide its trees, then Show its trees | "Half that shade comes from trees nobody ever mapped. Meta and WRI's DINOv3 canopy map adds about 63,000 tree crowns across our six campuses; without it, this walk looks twice as sunny." |
| 0:45–1:00 | Drag the time slider from 9 AM to 3 PM; Route tab: Quickest vs More shade | "Shade moves through the day, so the best walk does too. The shade route avoids about a fifth of the sun for a few percent more walking: about nine hours less in full sun over a semester." |
| 1:00–1:12 | Best time to go: tap the coolest hour; Heat tab: the hottest streets | "It tells you when to leave, and which streets bake at 3 PM." |
| 1:12–1:35 | Ask: "Plant trees along the hottest street." Then See it as a photo | "Then from a walk to civic action: Muse Spark plants a row of trees, the model shows the street cooling, and Meta's Muse Image turns the 3D view into a photo of the greener street." |
| 1:35–1:48 | Design studio: Find where trees help the most walkers, then Write a proposal | "Walk-Free finds the streets where trees would help the most walkers, and one click turns it into a proposal, with a link that opens the campus with the trees already planted." |
| 1:48–2:00 | Landing page, Built with Meta AI section | "Muse Spark, Muse Image, DINOv3 and open data, pointed at the heat. Walk-Free: a cooler way across campus." |

Optional, if there is time:
- Press Take the 1-minute tour, then Play all: it runs every step on its own and reads it aloud, ending by building a fictional city.
- https://walk-free.vercel.app/demo?fiction=noir-harbor: seven fictional cities, each in its own weather.

Tips:
- July afternoons give the strongest contrast; the demo opens at 3 PM with `&t=15`.
- Muse Image needs the site key; if the photo doesn't come, cut that shot rather than show the error.
- The camera button on the map saves a captioned still of any view, handy for the thumbnail.
