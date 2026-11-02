/**
 * Published heights for landmarks whose OpenStreetMap height is missing or
 * only covers part of the structure, by OSM id. Each needs a citation.
 */
export const PUBLISHED_HEIGHTS: Readonly<Record<string, number>> = {
  // UT Tower, Austin: 307 ft to the roof (completed 1937). OSM's 23 m is
  // the height of one building part, not the tower.
  // https://en.wikipedia.org/wiki/Main_Building_(University_of_Texas_at_Austin)
  "way/516187631": 93.6,
};

export function publishedHeight(sourceId: string): number | undefined {
  return Object.hasOwn(PUBLISHED_HEIGHTS, sourceId)
    ? PUBLISHED_HEIGHTS[sourceId]
    : undefined;
}
