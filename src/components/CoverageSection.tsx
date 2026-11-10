import {
  Component,
  Suspense,
  lazy,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { ArrowUpRight, MapPin, Sparkles } from "lucide-react";
import { PREBUILT_AREAS } from "../../shared/areas";
import { FICTION_CITIES } from "../lib/fiction-catalog";
import type { GlobeFocus, GlobePlace } from "./CoverageGlobe";

// three.js only downloads when the section is about to scroll into view.
const CoverageGlobe = lazy(() => import("./CoverageGlobe"));

const PLACES: GlobePlace[] = PREBUILT_AREAS.map((a) => ({
  slug: a.slug,
  name: a.name,
  lat: a.lat,
  lon: a.lon,
  href: `/demo?area=${a.slug}`,
}));

const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven"];
const READY = WORDS[PLACES.length] ?? String(PLACES.length);

/** Whether this browser can draw WebGL at all (some locked-down ones can't). */
function hasWebGL() {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    // Give the test context back: browsers keep only a few alive at once.
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return Boolean(gl);
  } catch {
    return false;
  }
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    const change = () => setReduced(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  return Boolean(reduced);
}

/**
 * Watches the section: `near` turns on once it comes within a screen of the
 * viewport (and stays on), `visible` follows it in and out so the globe only
 * draws while someone can see it.
 */
function useNearViewport(ref: RefObject<HTMLElement | null>) {
  const [near, setNear] = useState(false);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) {
      setNear(true);
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setNear(true);
        setVisible(entry.isIntersecting);
      },
      { rootMargin: "300px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return { near, visible };
}

/** Falls back to the quiet placeholder if the globe fails to load or draw. */
class GlobeBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("[walk-free] landing globe unavailable", error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * "Where you can walk": a globe of every place that opens instantly, with
 * the same places as an ordinary list of links, plus the two ways to go
 * anywhere else (build a real place, or invent one).
 */
export default function CoverageSection({ base }: { base: string }) {
  const section = useRef<HTMLElement>(null);
  const { near, visible } = useNearViewport(section);
  const reducedMotion = usePrefersReducedMotion();
  const [webgl] = useState(hasWebGL);
  const [focus, setFocus] = useState<GlobeFocus | null>(null);

  const placeholder = <div className="coverage-globe-placeholder" />;
  const fromList = (slug: string) => setFocus({ slug, from: "list" });
  const fromGlobe = (slug: string | null) =>
    setFocus(slug ? { slug, from: "globe" } : null);

  return (
    <section
      className={`coverage-section${webgl ? "" : " no-globe"}`}
      id="where"
      ref={section}
    >
      <div className="section-intro reveal">
        <span className="landing-eyebrow">WHERE YOU CAN WALK</span>
        <h2>
          {READY} places ready now,
          <br />
          <em>anywhere else on demand.</em>
        </h2>
        <p className="fine-note">
          Each opens instantly with its full map of buildings, trees and paths.
          {webgl && " Drag the globe to turn it."}
        </p>
      </div>
      <div className="coverage-body">
        {webgl && (
          <div className="coverage-globe" aria-hidden="true">
            {near ? (
              <GlobeBoundary fallback={placeholder}>
                <Suspense fallback={placeholder}>
                  <CoverageGlobe
                    places={PLACES}
                    focus={focus}
                    onFocus={fromGlobe}
                    reducedMotion={reducedMotion}
                    running={visible}
                  />
                </Suspense>
              </GlobeBoundary>
            ) : (
              placeholder
            )}
          </div>
        )}
        <div className="coverage-list">
          <h3>Ready to open</h3>
          <ul onMouseLeave={() => setFocus(null)}>
            {PREBUILT_AREAS.map((a) => (
              <li key={a.slug}>
                <a
                  href={`/demo?area=${a.slug}`}
                  className={focus?.slug === a.slug ? "is-active" : undefined}
                  onMouseEnter={() => fromList(a.slug)}
                  onFocus={() => fromList(a.slug)}
                  onBlur={() => setFocus(null)}
                >
                  <MapPin size={15} aria-hidden />
                  <span className="coverage-name">{a.name}</span>
                  <span className="coverage-kind">
                    {a.kind === "city" ? "City" : "Campus"}
                  </span>
                  <ArrowUpRight size={15} aria-hidden />
                </a>
              </li>
            ))}
          </ul>
          <h3>Any real place</h3>
          <p>
            Search for any other city, neighbourhood or campus in the demo and
            Walk-Free builds an area up to 3 km across from OpenStreetMap on
            demand.
          </p>
          <h3>Or an invented one</h3>
          <p>
            Describe a fictional city and walk it in about a minute, or open one
            of ours:
          </p>
          <ul className="coverage-chips">
            {FICTION_CITIES.map((c) => (
              <li key={c.slug}>
                <a href={`${base}?fiction=${c.slug}`}>{c.name}</a>
              </li>
            ))}
            <li>
              <a className="coverage-generate" href={`${base}?generate=`}>
                <Sparkles size={13} aria-hidden /> Describe your own
              </a>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
