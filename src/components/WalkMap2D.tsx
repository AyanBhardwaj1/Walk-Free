import { useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Minus, Plus } from "lucide-react";
import type { Point, RouteResult, World } from "../../shared/types";
import { baseEdgeId } from "../lib/walk-location";
import { sc, setSceneTheme } from "../lib/scene-theme";
import type { ThemeName } from "../lib/theme";

/**
 * A flat, north-up walking map: lighter on battery than the 3D scene and
 * easy to read in sunlight. Follows the walker when a location is known.
 */
/** Pixels per metre: the furthest out and closest in the map goes. */
const MIN_SCALE = 0.15,
  MAX_SCALE = 5;
const clampScale = (v: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, v));
/** How much one button press or one wheel notch zooms. */
const STEP = 1.6;
/** Room kept above the route for the directions banner, px. */
const bannerRoom = (width: number) => (width <= 650 ? 190 : 130);
const PALETTE = {
  ground: "#f3f1e8",
  building: "#dcd6c6",
  road: "#ffffff",
  path: "#e4dccb",
  routeCasing: "#fffdf4",
  route: "#1d3557",
  start: "#3f5938",
  end: "#b46539",
  you: "#3479bf",
  canopy: "rgba(112, 140, 96, 0.32)",
  water: "#2f7fb5",
};

export default function WalkMap2D({
  world,
  route,
  you,
  accuracy,
  start,
  end,
  edgeColors,
  insets,
  theme = "editorial",
}: {
  world: World;
  route: RouteResult | null;
  you?: Point;
  accuracy?: number;
  start?: Point;
  end?: Point;
  /** Optional heat colour per edge id, used to colour the route. */
  edgeColors?: Map<string, string> | null;
  /** Panels over the map; the route centres in the space beside them. */
  insets?: { left: number; bottom: number; top: number };
  /** Interface style; the map's colours follow it. */
  theme?: ThemeName;
}) {
  setSceneTheme(theme);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  // Pixels per metre, and how far the reader has dragged the map (metres).
  const [zoom, setZoom] = useState(1.6);
  const [pan, setPan] = useState<Point>([0, 0]);
  // Bumped by "Back to the walk" to fit the route again.
  const [refit, setRefit] = useState(0);
  // Without a location, frame the whole route; with one, follow the walker.
  const anchor = useMemo<Point>(() => {
    if (you) return you;
    const pts = route?.points ?? [];
    if (!pts.length) return [0, 0];
    const xs = pts.map((p) => p[0]),
      zs = pts.map((p) => p[1]);
    return [
      (Math.min(...xs) + Math.max(...xs)) / 2,
      (Math.min(...zs) + Math.max(...zs)) / 2,
    ];
  }, [you, route]);
  const center = useMemo<Point>(
    () => [anchor[0] + pan[0], anchor[1] + pan[1]],
    [anchor, pan],
  );
  // Fit a new route into the space left by the panels, until a location
  // takes over; the zoom buttons still work after that.
  const fitted = useRef("");
  useEffect(() => {
    const pts = route?.points ?? [];
    if (you || pts.length < 2 || !size.width) return;
    // The walk itself, not the result object: a new hour recomputes the
    // route (new id) and must not undo the reader's zoom.
    const walk = route!.edges.map((e) => e.id).join(",");
    const key = `${walk}|${size.width}x${size.height}|${insets?.top}/${insets?.bottom}/${insets?.left}|${refit}`;
    if (fitted.current === key) return;
    fitted.current = key;
    const xs = pts.map((p) => p[0]),
      zs = pts.map((p) => p[1]);
    const spanX = Math.max(...xs) - Math.min(...xs) || 1,
      spanZ = Math.max(...zs) - Math.min(...zs) || 1;
    const roomX = size.width - (insets?.left ?? 0) - 80,
      roomZ =
        size.height -
        Math.max(insets?.top ?? 0, bannerRoom(size.width)) -
        (insets?.bottom ?? 0) -
        100;
    const fit = Math.min(roomX / spanX, roomZ / spanZ);
    setZoom(clampScale(Math.min(fit, 1.6)));
    setPan([0, 0]);
  }, [route, you, size, insets, refit]);
  useEffect(() => {
    const el = canvas.current?.parentElement;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const c = canvas.current;
    if (!c || !size.width) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = size.width * dpr;
    c.height = size.height * dpr;
    const g = c.getContext("2d");
    if (!g) return;
    const COLORS = Object.fromEntries(
      Object.entries(PALETTE).map(([k, v]) => [
        k,
        v.startsWith("#") ? sc(v) : v,
      ]),
    ) as typeof PALETTE;
    const scale = zoom * dpr;
    const shiftX = ((insets?.left ?? 0) / 2) * dpr;
    const shiftY =
      ((Math.max(insets?.top ?? 0, you ? 0 : bannerRoom(size.width)) -
        (insets?.bottom ?? 0)) /
        2) *
      dpr;
    const toScreen = (p: Point): [number, number] => [
      (p[0] - center[0]) * scale + c.width / 2 + shiftX,
      (p[1] - center[1]) * scale + c.height / 2 + shiftY,
    ];
    const line = (pts: Point[]) => {
      pts.forEach((p, i) => {
        const [x, y] = toScreen(p);
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      });
    };
    g.fillStyle = COLORS.ground;
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = COLORS.building;
    for (const o of world.objects) {
      if (o.kind === "tree") continue;
      const a = (o.rotation * Math.PI) / 180,
        cos = Math.cos(a),
        sin = Math.sin(a);
      const shape: Point[] = o.footprint ?? [
        [-o.width / 2, -o.depth / 2],
        [o.width / 2, -o.depth / 2],
        [o.width / 2, o.depth / 2],
        [-o.width / 2, o.depth / 2],
      ];
      g.beginPath();
      line(
        shape.map(([x, z]) => [
          // Same turn as the 3D scene's rotation of -rotation about Y.
          o.position[0] + x * cos - z * sin,
          o.position[1] + x * sin + z * cos,
        ]),
      );
      g.closePath();
      g.fill();
    }
    // Tree crowns, mapped and inferred, so shade reads at a glance.
    g.fillStyle = COLORS.canopy;
    g.beginPath();
    for (const o of world.objects) {
      if (o.kind !== "tree") continue;
      const [x, y] = toScreen(o.position);
      const r = Math.max(1.5 * dpr, (o.width / 2) * scale);
      g.moveTo(x + r, y);
      g.arc(x, y, r, 0, Math.PI * 2);
    }
    g.fill();
    g.lineCap = "round";
    g.lineJoin = "round";
    for (const kind of ["path", "road"] as const) {
      g.strokeStyle = COLORS[kind];
      // Thinner when zoomed out, so streets don't merge into blobs.
      g.lineWidth =
        (kind === "road" ? 7 : 3) * Math.max(0.4 * dpr, scale * 0.6);
      g.beginPath();
      for (const r of world.roads)
        if ((r.kind === "road") === (kind === "road")) line(r.points);
      g.stroke();
    }
    if (route) {
      g.strokeStyle = COLORS.routeCasing;
      g.lineWidth = 14 * dpr;
      g.beginPath();
      line(route.points);
      g.stroke();
      // Colour each stretch by heat when available, so hot blocks stand out.
      g.lineWidth = 8 * dpr;
      for (const e of route.edges) {
        g.strokeStyle = edgeColors?.get(baseEdgeId(e.id)) ?? COLORS.route;
        g.beginPath();
        line(e.points);
        g.stroke();
      }
    }
    const dot = (p: Point | undefined, color: string, radius: number) => {
      if (!p) return;
      const [x, y] = toScreen(p);
      g.fillStyle = color;
      g.strokeStyle = sc("#ffffff");
      g.lineWidth = 3 * dpr;
      g.beginPath();
      g.arc(x, y, radius * dpr, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    };
    for (const a of world.amenities ?? [])
      if (a.kind === "water") dot(a.position, COLORS.water, 4);
    dot(start, COLORS.start, 7);
    dot(end, COLORS.end, 9);
    if (you && accuracy) {
      const [x, y] = toScreen(you);
      g.fillStyle = "rgba(52, 121, 191, 0.15)";
      g.beginPath();
      g.arc(x, y, Math.max(10 * dpr, accuracy * scale), 0, Math.PI * 2);
      g.fill();
    }
    dot(you, COLORS.you, 9);
  }, [
    world,
    route,
    you,
    accuracy,
    start,
    end,
    edgeColors,
    center,
    zoom,
    size,
    insets,
    theme,
  ]);
  // Where the map's centre sits on screen (CSS pixels), as drawn above.
  const view = useRef({ zoom, center, cx: 0, cy: 0 });
  view.current = {
    zoom,
    center,
    cx: size.width / 2 + (insets?.left ?? 0) / 2,
    cy:
      size.height / 2 +
      (Math.max(insets?.top ?? 0, you ? 0 : bannerRoom(size.width)) -
        (insets?.bottom ?? 0)) /
        2,
  };
  /** Zoom by a factor, keeping the ground under (x, y) where it is. */
  const zoomAt = (factor: number, x?: number, y?: number) => {
    const v = view.current;
    const next = clampScale(v.zoom * factor);
    if (next === v.zoom) return;
    if (x !== undefined && y !== undefined) {
      // The ground point under the pointer, before and after.
      const gx = (x - v.cx) / v.zoom + v.center[0],
        gz = (y - v.cy) / v.zoom + v.center[1];
      const nx = gx - (x - v.cx) / next,
        nz = gz - (y - v.cy) / next;
      const dx = nx - v.center[0],
        dz = nz - v.center[1];
      setPan((p) => [p[0] + dx, p[1] + dz]);
      // Two fingers move in the same frame: the second must see this one.
      v.center = [nx, nz];
    }
    v.zoom = next;
    setZoom(next);
  };
  // Drag to move, two fingers to pinch; the wheel zooms toward the pointer.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef(0);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      zoomAt(
        Math.exp(-e.deltaY * 0.0015),
        e.clientX - r.left,
        e.clientY - r.top,
      );
    };
    c.addEventListener("wheel", onWheel, { passive: false });
    return () => c.removeEventListener("wheel", onWheel);
    // zoomAt reads the latest view through a ref.
  }, []);
  const local = (e: React.PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const spread = () => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  return (
    <div className="walk-map">
      <canvas
        ref={canvas}
        role="img"
        aria-label="Flat walking map with your route, tree shade and drinking water. Drag to move, scroll or pinch to zoom."
        style={{ width: "100%", height: "100%", touchAction: "none" }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          pointers.current.set(e.pointerId, local(e));
          pinch.current = spread();
        }}
        onPointerMove={(e) => {
          const before = pointers.current.get(e.pointerId);
          if (!before) return;
          const now = local(e);
          pointers.current.set(e.pointerId, now);
          if (pointers.current.size >= 2) {
            const d = spread();
            if (pinch.current && d) {
              const [a, b] = [...pointers.current.values()];
              zoomAt(d / pinch.current, (a.x + b.x) / 2, (a.y + b.y) / 2);
            }
            pinch.current = d;
            return;
          }
          const z = view.current.zoom;
          setPan((p) => [
            p[0] - (now.x - before.x) / z,
            p[1] - (now.y - before.y) / z,
          ]);
        }}
        onPointerUp={(e) => {
          pointers.current.delete(e.pointerId);
          pinch.current = spread();
        }}
        onPointerCancel={(e) => {
          pointers.current.delete(e.pointerId);
          pinch.current = spread();
        }}
      />
      <div className="walk-map-zoom">
        <button
          aria-label="Zoom in"
          disabled={zoom >= MAX_SCALE}
          onClick={() => zoomAt(STEP)}
        >
          <Plus size={18} />
        </button>
        <button
          aria-label="Zoom out"
          disabled={zoom <= MIN_SCALE}
          onClick={() => zoomAt(1 / STEP)}
        >
          <Minus size={18} />
        </button>
        {(pan[0] !== 0 || pan[1] !== 0) && (
          <button
            aria-label={you ? "Follow my location again" : "Back to the walk"}
            title={you ? "Follow my location again" : "Back to the walk"}
            onClick={() => {
              setPan([0, 0]);
              if (!you) setRefit((n) => n + 1);
            }}
          >
            <Crosshair size={17} />
          </button>
        )}
      </div>
    </div>
  );
}
