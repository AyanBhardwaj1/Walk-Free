# Walk-Free product decisions

This is a discussion guide, not a claim that the open decisions have been answered.

## Confirmed direction

- Build a city or campus and use the navigation features in that built area.
- A public landing page before login.
- Regular email/password accounts; no Google login in the app.
- Host on Vercel, with a strong preference for no recurring costs beyond GPT usage.
- Continue regular verified GitHub checkpoints.

## Vision and first users

1. Who is the first person you want to delight: a student going between classes, someone exploring a city, a commuter, a visitor, a person seeking accessible routes, or a planner designing public space?
2. Describe one ideal session: where they are, what they enter, what choices they see, how they follow the route, and what they should feel when they arrive.
3. Is Walk-Free primarily a navigation product with a design studio, or a design/simulation product that also supports walking?
4. Which three outcomes would make version one complete enough to share? Which features should explicitly wait?

## Geography and route quality

1. Should we perfect one named campus, one named city, or launch broadly with uneven coverage? Which exact location should be the acceptance-test area?
2. Rank route speed, shade, scenic paths, verified step-free access, indoor routes, and transit.
3. For indoor routes, can you provide authorized floor plans, entrances, opening hours, and accessibility information? OpenStreetMap alone cannot establish all of these.
4. When data is missing, should the route be unavailable, or available with the specific gap clearly explained? Should users report closures or incorrect access?
5. Is offline navigation necessary for launch? Should users download a built area, or should every session require connectivity?

## Accounts and persistence

1. Can visitors try a fictional demo before signup, or should the workspace require login?
2. What must follow an account between devices: built maps, saved routes, favorite places, walking/accessibility preferences, design projects, or history?
3. Should location history ever be saved? The current implementation does not persist a GPS trace to the server.
4. Do we need private sharing links, public projects, teams, campus administrators, or just individual accounts?
5. Is email verification required before using the app? A production sender, a support contact, and account deletion need decisions before broad launch.

## Experience and brand

1. Keep the current calm ivory/green architectural style, or move toward a more utilitarian navigation app? Share two or three references and what you like about them.
2. Keep the name Walk-Free? What should a first-time visitor understand within five seconds?
3. Is the 3D city view essential during a walk, or should walking switch to a simpler 2D map with large directions?
4. Which comes first: desktop web, mobile web/PWA, iPhone, or Android? Background location and screen-lock guidance need physical-device testing.

## Stack and costs

Current stack: React, TypeScript, Vite, Three.js / React Three Fiber, MapLibre, Express, and Capacitor. The new account backend is Neon managed Better Auth in a dedicated project on the connected Free organization. Keeping this stack avoids a framework migration unless a requirement warrants one.

1. Any required technologies, or may implementation choices follow the product needs?
2. Is this personal/noncommercial, or a commercial public product? Vercel Hobby is for personal/noncommercial use.
3. The connected Vercel workspace is Pro. Should deployment use a separate free Hobby workspace or the existing Pro workspace? No subscription change or Pro deployment has been made.
4. At free-tier limits, should requests stop until quotas reset? A zero-cost cap cannot also promise unlimited scale and uninterrupted service.
5. Who supplies the GPT key: the owner centrally, or each user? What per-user and total spending limits should apply? Hosted GPT is currently disabled until shared limits are implemented.
6. Is using the free vercel.app address acceptable? A custom domain may have a separate registration cost.

## Suggested completion sequence to discuss

1. Confirm the first audience, launch area, hosting workspace, and account model.
2. Deploy and validate real signup/login/reset on the HTTPS origin; settle verification and email delivery.
3. Make a fresh live map build succeed reliably for the selected test area, then validate connected routes and gaps there.
4. Complete the selected account storage, route preferences, and mobile experience.
5. Validate outdoor navigation and failure modes on actual devices; add hosted GPT only with agreed limits.
6. Complete account deletion, support, accessibility checks, and explicit launch acceptance criteria.
