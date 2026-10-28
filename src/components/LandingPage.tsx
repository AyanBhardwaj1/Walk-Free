import {
  ArrowDown,
  ArrowUpRight,
  Footprints,
  Leaf,
  MapPin,
  Route,
  Sun,
  Trees,
} from "lucide-react";

export function Brand() {
  return (
    <a className="brand" href="/">
      <span className="brand-icon">
        w<span>f</span>
      </span>
      walk-free
    </a>
  );
}

function MapIllustration() {
  return (
    <div
      className="landing-map"
      aria-label="Illustration of a shaded walking route through a neighborhood"
    >
      <div className="map-topline">
        <span>
          <span className="status-dot" /> A DIFFERENT WAY THROUGH
        </span>
        <span>01 / THE NEIGHBORHOOD</span>
      </div>
      <svg
        viewBox="0 0 620 520"
        role="img"
        aria-label="An illustrative green walking route passes trees and buildings from a library to a garden"
      >
        <defs>
          <pattern
            id="map-grid"
            width="32"
            height="32"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M32 0H0V32"
              fill="none"
              stroke="#cdd2bf"
              strokeWidth=".6"
            />
          </pattern>
        </defs>
        <rect width="620" height="520" fill="url(#map-grid)" />
        <g transform="matrix(.85 .5 -.65 .55 450 110)">
          <rect
            x="-180"
            y="15"
            width="345"
            height="420"
            rx="10"
            fill="#dce3cc"
          />
          <path
            d="M-190 128H180M-190 280H180M-70 0V450M85 0V450"
            stroke="#f8f6ec"
            strokeWidth="30"
          />
          <path
            d="M-190 128H180M-190 280H180M-70 0V450M85 0V450"
            stroke="#bfc7af"
            strokeWidth="1"
            strokeDasharray="4 5"
          />
          {[
            [-155, 30, 60, 65],
            [-40, 24, 92, 75],
            [112, 35, 38, 65],
            [-155, 166, 60, 79],
            [-38, 169, 90, 75],
            [112, 170, 38, 70],
            [-150, 315, 55, 80],
            [112, 320, 38, 80],
          ].map(([x, y, w, h], i) => (
            <g key={i}>
              <rect
                x={x + 13}
                y={y + 12}
                width={w}
                height={h}
                fill="#b3bba3"
                opacity=".5"
              />
              <path d={`M${x} ${y + h}v-24l${w} 0v24Z`} fill="#b0b79e" />
              <rect
                x={x}
                y={y - 24}
                width={w}
                height={h}
                fill={i % 3 === 0 ? "#ebe7d8" : "#f6f2e5"}
                stroke="#a8b397"
              />
              <path
                d={`M${x + w} ${y - 24}v${h}l13 12v-${h}Z`}
                fill="#c9cdb8"
              />
            </g>
          ))}
          <rect
            x="-45"
            y="308"
            width="100"
            height="100"
            rx="28"
            fill="#b8cba3"
          />
          <path
            d="M-130 128H-70V280H85V355H12"
            fill="none"
            stroke="#fffdf5"
            strokeWidth="13"
            strokeLinejoin="round"
          />
          <path
            d="M-130 128H-70V280H85V355H12"
            fill="none"
            stroke="#446b46"
            strokeWidth="6"
            strokeLinejoin="round"
          />
          {[
            [-89, 165],
            [-89, 205],
            [-89, 243],
            [-35, 262],
            [5, 262],
            [47, 262],
            [106, 298],
            [106, 346],
            [-20, 330],
            [15, 385],
            [-8, 387],
            [37, 324],
          ].map(([x, y], i) => (
            <g key={i}>
              <ellipse
                cx={x + 6}
                cy={y + 6}
                rx="15"
                ry="10"
                fill="#758e60"
                opacity=".2"
              />
              <circle
                cx={x}
                cy={y - 6}
                r="12"
                fill={i % 2 ? "#75955f" : "#8daa73"}
              />
              <circle
                cx={x - 3}
                cy={y - 10}
                r="7"
                fill="#9db886"
                opacity=".65"
              />
            </g>
          ))}
          <circle
            cx="-130"
            cy="128"
            r="9"
            fill="#f8f5e9"
            stroke="#446b46"
            strokeWidth="4"
          />
          <circle
            cx="12"
            cy="355"
            r="10"
            fill="#446b46"
            stroke="#f8f5e9"
            strokeWidth="4"
          />
        </g>
        <g fill="#304831" fontFamily="DM Sans, sans-serif" fontSize="12">
          <rect
            x="125"
            y="110"
            width="115"
            height="33"
            rx="16"
            fill="#fffdf5"
          />
          <text x="141" y="131">
            A · The library
          </text>
          <rect
            x="245"
            y="333"
            width="133"
            height="33"
            rx="16"
            fill="#fffdf5"
          />
          <text x="261" y="354">
            B · The gardens
          </text>
        </g>
      </svg>
      <div className="map-caption">
        <span>
          <Trees size={16} /> Follow a little more green.
        </span>
        <span>ILLUSTRATIVE ROUTE</span>
      </div>
    </div>
  );
}

export default function LandingPage({
  signedIn = false,
}: {
  signedIn?: boolean;
}) {
  return (
    <div className="public-site">
      <header className="public-header">
        <Brand />
        <nav aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#possibilities">Explore the possibilities</a>
        </nav>
        <div className="public-header-actions">
          <a className="quiet-link" href={signedIn ? "/app" : "/login"}>
            {signedIn ? "My workspace" : "Log in"}
          </a>
          <a
            className="landing-button small"
            href={signedIn ? "/app" : "/signup"}
          >
            Start exploring <ArrowUpRight size={16} />
          </a>
        </div>
      </header>
      <main className="landing-main">
        <section className="landing-hero">
          <div className="hero-copy">
            <div className="landing-eyebrow">
              <span /> CITIES, AT HUMAN PACE
            </div>
            <h1>
              The better way
              <br />
              isn't always
              <br />
              <em>the fastest.</em>
            </h1>
            <p>
              A shady street. A greener path. A new perspective on your campus.
              Walk-Free helps you explore the places between where you are and
              where you’re going.
            </p>
            <div className="hero-actions">
              <a
                className="landing-button"
                href={signedIn ? "/app" : "/signup"}
              >
                Find your way <ArrowUpRight size={19} />
              </a>
              <a className="text-link" href="#how-it-works">
                Take a closer look <ArrowDown size={16} />
              </a>
            </div>
            <div className="hero-footnote">
              <Footprints size={17} />
              <span>
                Made for walks worth taking.
                <br />
                <small>An evolving, open-data walking planner.</small>
              </span>
            </div>
          </div>
          <MapIllustration />
        </section>
        <div className="landing-principles">
          <span>One place. More ways to experience it.</span>
          <span>
            <Route size={18} /> Connected paths
          </span>
          <span>
            <Sun size={18} /> Modeled shade
          </span>
          <span>
            <Leaf size={18} /> Greener choices
          </span>
        </div>
        <section className="landing-how" id="how-it-works">
          <div className="section-intro">
            <span className="landing-eyebrow">
              FROM THE MAP TO YOUR NEXT STEP
            </span>
            <h2>
              Your surroundings,
              <br />
              <em>with more possibility.</em>
            </h2>
            <p>Start with a place you know. See it in a different light.</p>
          </div>
          <ol className="landing-steps">
            <li>
              <span>01</span>
              <div>
                <h3>Make a place your own.</h3>
                <p>
                  Search a supported city or campus, choose an area, and build a
                  detailed scene from mapped streets and buildings.
                </p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <h3>Choose what matters today.</h3>
                <p>
                  Compare walking routes for speed, estimated shade, and
                  scenery. Adjust your departure time and avoid mapped stairs.
                </p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <h3>Take the next step.</h3>
                <p>
                  Follow connected paths with location updates and spoken
                  guidance. Routes stay within the area you’ve built.
                </p>
              </div>
            </li>
          </ol>
        </section>
        <section className="landing-studio" id="possibilities">
          <div className="studio-symbol" aria-hidden="true">
            <Trees size={74} strokeWidth={1} />
            <div className="studio-grid" />
            <span>SPACE FOR A BETTER IDEA.</span>
          </div>
          <div>
            <span className="landing-eyebrow">
              A WALKING PLANNER. A PLACE TO IMAGINE.
            </span>
            <h2>
              What if this street
              <br />
              had <em>more trees?</em>
            </h2>
            <p>
              In the design studio, place trees, reshape buildings, and explore
              how shadows change throughout the day. Try ideas in a fictional
              study or an area you’ve built.
            </p>
            <a className="text-link" href={signedIn ? "/app" : "/signup"}>
              Explore and design <ArrowUpRight size={18} />
            </a>
            <small>
              Designs are experiments. They don’t change real-world access or
              create verified walking routes.
            </small>
          </div>
        </section>
        <section className="landing-details">
          <div>
            <MapPin size={23} />
            <h3>Grounded in open maps.</h3>
            <p>
              Built with OpenStreetMap data. Coverage varies by place; missing
              entrances and indoor corridors are never assumed.
            </p>
          </div>
          <div>
            <Sun size={23} />
            <h3>A little context goes a long way.</h3>
            <p>
              Shade is modeled from geometry and the sun. It’s a planning aid,
              not a measurement of temperature or a guarantee of comfort.
            </p>
          </div>
          <div>
            <Footprints size={23} />
            <h3>Growing one step at a time.</h3>
            <p>
              Walk-Free is in development. Live map availability and outdoor
              guidance are still being tested; always check your surroundings.
            </p>
          </div>
        </section>
        <section className="landing-end">
          <span className="landing-eyebrow">YOUR NEXT WALK STARTS HERE</span>
          <h2>
            Get to know
            <br />
            <em>the way between.</em>
          </h2>
          <a className="landing-button" href={signedIn ? "/app" : "/signup"}>
            Start exploring <ArrowUpRight size={18} />
          </a>
        </section>
      </main>
      <footer className="public-footer">
        <Brand />
        <p>Explore thoughtfully. Walk freely.</p>
        <a href="/privacy">Privacy & data</a>
        <span>© {new Date().getFullYear()} Walk-Free</span>
      </footer>
    </div>
  );
}
