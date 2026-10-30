import { useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import type { Point, RouteResult, World } from "../../shared/types";

/**
 * A flat, north-up walking map: lighter on battery than the 3D scene and
 * easy to read in sunlight. Follows the walker when a location is known.
 */
const ZOOMS = [0.6, 1, 1.6, 2.6, 4];
const COLORS = {
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
}: {
  world: World;
  route: RouteResult | null;
  you?: Point;
  accuracy?: number;
  start?: Point;
  end?: Point;
  /** Optional heat colour per edge id, used to colour the route. */
  edgeColors?: Map<string, string> | null;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(2);
  // Without a location, frame the whole route; with one, follow the walker.
  const center = useMemo<Point>(() => {
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
    const scale = ZOOMS[zoom] * dpr;
    const toScreen = (p: Point): [number, number] => [
      (p[0] - center[0]) * scale + c.width / 2,
      (p[1] - center[1]) * scale + c.height / 2,
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
      g.lineWidth = (kind === "road" ? 7 : 3) * Math.max(1, scale * 0.6);
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
        g.strokeStyle = edgeColors?.get(e.id) ?? COLORS.route;
        g.beginPath();
        line(e.points);
        g.stroke();
      }
    }
    const dot = (p: Point | undefined, color: string, radius: number) => {
      if (!p) return;
      const [x, y] = toScreen(p);
      g.fillStyle = color;
      g.strokeStyle = "#ffffff";
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
  }, [world, route, you, accuracy, start, end, edgeColors, center, zoom, size]);
  return (
    <div className="walk-map">
      <canvas
        ref={canvas}
        role="img"
        aria-label="Flat walking map with your route, tree shade and drinking water"
        style={{ width: "100%", height: "100%" }}
      />
      <div className="walk-map-zoom">
        <button
          aria-label="Zoom in"
          disabled={zoom === ZOOMS.length - 1}
          onClick={() => setZoom(zoom + 1)}
        >
          <Plus size={18} />
        </button>
        <button
          aria-label="Zoom out"
          disabled={zoom === 0}
          onClick={() => setZoom(zoom - 1)}
        >
          <Minus size={18} />
        </button>
      </div>
    </div>
  );
}
