/**
 * Google Maps links for places and walks Walk-Free can't route itself.
 * These are ordinary public URLs (no API key) and open in a new tab.
 */
export function googleMapsSearch(query: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
export function googleMapsWalk(
  origin: { lat: number; lon: number } | string,
  destination: { lat: number; lon: number } | string,
) {
  const place = (p: { lat: number; lon: number } | string) =>
    typeof p === "string" ? p : `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;
  const params = new URLSearchParams({
    api: "1",
    origin: place(origin),
    destination: place(destination),
    travelmode: "walking",
  });
  return `https://www.google.com/maps/dir/?${params}`;
}
