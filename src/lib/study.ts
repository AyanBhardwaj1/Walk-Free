import type {
  GraphEdge,
  GraphNode,
  Landscape,
  Point,
  SceneObject,
  SceneRoad,
  World,
} from "../../shared/types";

/** A deliberately fictional, editable urban study; never a substitute for mapped city data. */
export function createStudyWorld(): World {
  const objects: SceneObject[] = [];
  const roads: SceneRoad[] = [];
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const streetCoordinates = [-360, -180, 180, 360];
  const junctionNames: Record<string, [string, string]> = {
    "1-2": ["market-gate", "Market gate"],
    "2-1": ["observatory", "Observatory corner"],
    "1-1": ["museum-walk", "Museum walk"],
    "2-2": ["lake-gate", "Lake gate"],
    "0-1": ["west-station", "West station"],
    "3-2": ["east-station", "East station"],
    "1-3": ["south-square", "South square"],
    "2-0": ["north-square", "North square"],
  };
  const junctionId = (x: number, z: number) =>
    junctionNames[`${x}-${z}`]?.[0] ?? `junction-${x}-${z}`;
  const addNode = (id: string, point: Point, name: string) => {
    nodes.push({ id, point, name });
    return id;
  };
  const addEdge = (
    from: string,
    to: string,
    name: string,
    options: Partial<
      Pick<GraphEdge, "indoor" | "covered" | "scenic" | "stairs">
    > = {},
    kind: SceneRoad["kind"] = "footway",
    width = 5,
  ) => {
    const a = nodes.find((node) => node.id === from)!;
    const b = nodes.find((node) => node.id === to)!;
    const id = `path-${edges.length}`;
    const points: Point[] = [[...a.point], [...b.point]];
    edges.push({
      id,
      from,
      to,
      points,
      name,
      distance: Math.hypot(b.point[0] - a.point[0], b.point[1] - a.point[1]),
      covered: false,
      scenic: 0.15,
      indoor: "no",
      stairs: false,
      accessible: true,
      bidirectional: true,
      ...options,
    });
    if (options.indoor !== "hypothetical") {
      roads.push({ id, name, points, kind, width, source: "study" });
    }
  };
  const addObject = (object: Omit<SceneObject, "source" | "heightMethod">) => {
    objects.push({ ...object, source: "study", heightMethod: "designed" });
  };
  const addTree = (position: Point, variant: number, name = "Canopy tree") => {
    addObject({
      id: `tree-${objects.length}`,
      kind: "tree",
      name,
      position,
      width: 20 + (variant % 4) * 3,
      depth: 20 + (variant % 4) * 3,
      height: 16 + (variant % 5) * 1.5,
      rotation: (variant * 37) % 360,
      color: ["#5c7151", "#6e8056", "#81926a", "#536c4d"][variant % 4],
    });
  };

  // A continuous street network encloses a large central garden.
  for (let x = 0; x < streetCoordinates.length; x++) {
    for (let z = 0; z < streetCoordinates.length; z++) {
      const label =
        junctionNames[`${x}-${z}`]?.[1] ??
        `${["West", "Garden", "Lake", "East"][x]} / ${["North", "Museum", "Market", "South"][z]}`;
      addNode(
        junctionId(x, z),
        [streetCoordinates[x], streetCoordinates[z]],
        label,
      );
    }
  }
  for (let x = 0; x < streetCoordinates.length; x++) {
    for (let z = 0; z < streetCoordinates.length; z++) {
      if (x < streetCoordinates.length - 1) {
        addEdge(
          junctionId(x, z),
          junctionId(x + 1, z),
          ["North Avenue", "Museum Walk", "Market Street", "South Avenue"][z],
          { scenic: z === 1 || z === 2 ? 0.55 : 0.1 },
          "road",
          17,
        );
      }
      if (z < streetCoordinates.length - 1) {
        addEdge(
          junctionId(x, z),
          junctionId(x, z + 1),
          ["West Street", "Garden Avenue", "Lake Avenue", "East Street"][x],
          { scenic: x === 1 || x === 2 ? 0.55 : 0.1 },
          "road",
          17,
        );
      }
    }
  }

  // The direct walk is open to the sky; a longer northern promenade has a tree canopy.
  addEdge(
    "market-gate",
    "observatory",
    "Garden diagonal",
    { scenic: 0.6 },
    "footway",
    6,
  );
  addNode("grove-south", [-120, 120], "South grove");
  addNode("grove-north", [-120, -120], "North grove");
  addNode("garden-pavilion", [120, -120], "Garden pavilion");
  addEdge("market-gate", "grove-south", "Grove entrance", { scenic: 0.9 });
  addEdge("grove-south", "grove-north", "Canopy promenade", { scenic: 1 });
  addEdge("grove-north", "garden-pavilion", "Linden walk", { scenic: 1 });
  addEdge("garden-pavilion", "observatory", "Pavilion walk", { scenic: 0.9 });
  addNode("pond-deck", [140, 110], "Pond deck");
  addEdge("lake-gate", "pond-deck", "Waterside path", { scenic: 1 });
  addEdge("pond-deck", "garden-pavilion", "East garden path", { scenic: 0.85 });

  // Indoor geometry is explicitly a hypothetical planning connection, never verified access.
  addObject({
    id: "gallery",
    kind: "building",
    name: "Gallery arcade · hypothetical passage",
    position: [-270, 0],
    width: 100,
    depth: 280,
    height: 25,
    rotation: 0,
    color: "#d7c9b5",
  });
  addNode("gallery-south", [-270, 140], "Gallery south door · hypothetical");
  addNode("gallery-north", [-270, -140], "Gallery north door · hypothetical");
  addEdge("market-gate", "gallery-south", "Gallery forecourt", { scenic: 0.3 });
  addEdge("gallery-south", "gallery-north", "Gallery interior · hypothetical", {
    indoor: "hypothetical",
    covered: true,
    scenic: 0.25,
  });
  addEdge("gallery-north", "museum-walk", "Museum forecourt", { scenic: 0.3 });

  const buildingPalette = [
    "#e3dacb",
    "#d6c8b5",
    "#c6c0b4",
    "#e9e1d4",
    "#b8baae",
  ];
  let buildingIndex = 0;
  // Compact corner blocks, with real clearances from paths and adjacent buildings.
  for (const bx of [-270, 270]) {
    for (const bz of [-270, 270]) {
      for (const dx of [-34, 34]) {
        for (const dz of [-34, 34]) {
          const index = buildingIndex++;
          const tall = bx === 270 && bz === -270 && dx === 34 && dz === -34;
          addObject({
            id: `block-${index}`,
            kind: tall ? "skyscraper" : "building",
            name: tall ? "Observatory tower" : `Garden block ${index + 1}`,
            position: [bx + dx, bz + dz],
            width: 48,
            depth: 46,
            height: tall ? 106 : 18 + (index % 5) * 8,
            rotation: 0,
            color: buildingPalette[index % buildingPalette.length],
          });
        }
      }
    }
  }
  // Longer northern/southern blocks make the city feel continuous around the park.
  for (const bz of [-270, 270]) {
    for (const bx of [-130, -65, 0, 65, 130]) {
      const index = buildingIndex++;
      addObject({
        id: `block-${index}`,
        kind: index % 7 === 0 ? "skyscraper" : "building",
        name:
          bz < 0
            ? `Museum quarter ${index - 15}`
            : `Market quarter ${index - 20}`,
        position: [bx, bz],
        width: 46,
        depth: 108,
        height: 22 + (index % 6) * 9,
        rotation: 0,
        color: buildingPalette[index % buildingPalette.length],
      });
    }
  }
  // Eastern civic buildings flank a slender clock tower.
  for (const bz of [-110, 0, 110]) {
    addObject({
      id: `civic-${bz}`,
      kind: bz === 0 ? "tower" : "landmark",
      name:
        bz === 0
          ? "Garden clock tower"
          : bz < 0
            ? "Civic library"
            : "Waterside hall",
      position: [270, bz],
      width: bz === 0 ? 34 : 92,
      depth: bz === 0 ? 34 : 74,
      height: bz === 0 ? 76 : 30,
      rotation: 0,
      color: bz === 0 ? "#bdab8f" : "#ded4c3",
    });
  }
  addObject({
    id: "garden-monument",
    kind: "landmark",
    name: "Garden obelisk",
    position: [32, -8],
    width: 14,
    depth: 14,
    height: 24,
    rotation: 0,
    color: "#cbbba2",
  });

  for (let i = 0; i <= 8; i++) {
    addTree([-130, 116 - i * 29], i, "Promenade canopy");
    addTree([-110, 116 - i * 29], i + 2, "Promenade canopy");
    addTree([-112 + i * 28, -132], i + 1, "Linden canopy");
    addTree([-112 + i * 28, -108], i + 3, "Linden canopy");
  }
  for (let i = 0; i < 8; i++) {
    addTree([-140 + i * 40, 150], i + 4, "Market border tree");
    addTree([150, -130 + i * 38], i + 5, "Lake border tree");
  }
  for (let i = 0; i < 10; i++) {
    addTree([-340 + i * 75, -341], i + 1, "North avenue tree");
    addTree([-340 + i * 75, 341], i + 3, "South avenue tree");
  }
  const landscapes: Landscape[] = [
    {
      id: "central-garden",
      kind: "park",
      name: "Garden commons",
      points: [
        [-166, -166],
        [166, -166],
        [166, 166],
        [-166, 166],
      ],
    },
    {
      id: "garden-pond",
      kind: "water",
      name: "Garden pond",
      points: [
        [45, 30],
        [116, 24],
        [131, 60],
        [118, 125],
        [54, 126],
        [29, 88],
      ],
    },
    {
      id: "north-green",
      kind: "park",
      name: "North avenue green",
      points: [
        [-405, -403],
        [405, -403],
        [405, -376],
        [-405, -376],
      ],
    },
    {
      id: "south-green",
      kind: "park",
      name: "South avenue green",
      points: [
        [-405, 376],
        [405, 376],
        [405, 403],
        [-405, 403],
      ],
    },
  ];
  return {
    id: "garden-district-study-v1",
    name: "Garden District · design study",
    origin: { lat: 30.2672, lon: -97.7431 },
    timezone: "America/Chicago",
    extent: 900,
    objects,
    roads,
    landscapes,
    graph: { nodes, edges },
    terrain: { size: 900, resolution: 33, heights: new Array(33 * 33).fill(0) },
    provenance: {
      source: "Walk-Free fictional design study",
      attribution:
        "Original procedural design for Walk-Free. No real-world map or access claim.",
      retrievedAt: "2026-10-27T00:00:00.000Z",
      live: false,
      notes: [
        "This editable district is fictional. Search for a city to load real mapped geometry.",
        "Austin coordinates are used only to demonstrate solar position, not to locate these buildings.",
        "All heights, trees, streets, and access connections are designed scenario inputs.",
        "The gallery interior is hypothetical and is excluded from navigation unless planning mode explicitly allows it.",
      ],
    },
  };
}
