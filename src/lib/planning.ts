import type { World, Point, GraphNode } from "../../shared/types";
export function addPlanningPassage(world: World, a: Point, b: Point): World {
  const nodes = [...world.graph.nodes];
  function endpoint(p: Point): GraphNode {
    const existing = nodes.find(
      (n) => Math.hypot(n.point[0] - p[0], n.point[1] - p[1]) <= 20,
    );
    if (existing) return existing;
    const node = {
      id: crypto.randomUUID(),
      point: p,
      name: `Planned entrance ${nodes.length + 1}`,
    };
    nodes.push(node);
    return node;
  }
  const from = endpoint(a),
    to = endpoint(b);
  const distance = Math.hypot(
    to.point[0] - from.point[0],
    to.point[1] - from.point[1],
  );
  if (from.id === to.id || distance < 2)
    throw Error(
      "Choose two distinct passage endpoints at least 20 meters apart.",
    );
  const id = crypto.randomUUID();
  const points: Point[] = [from.point, to.point];
  return {
    ...world,
    roads: [
      ...world.roads,
      {
        id,
        name: "Hypothetical passage",
        points,
        width: 3,
        kind: "footway",
        source: "user",
      },
    ],
    graph: {
      nodes,
      edges: [
        ...world.graph.edges,
        {
          id,
          from: from.id,
          to: to.id,
          points,
          distance,
          name: "Hypothetical indoor passage",
          covered: true,
          scenic: 0.2,
          indoor: "hypothetical",
          stairs: false,
          accessible: false,
          bidirectional: true,
        },
      ],
    },
  };
}
