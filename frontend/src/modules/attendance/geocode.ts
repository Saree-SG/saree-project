export type GeocodeResult = {
  lat: number
  lng: number
  label: string
}

/**
 * Forward geocoding via OpenStreetMap Nominatim (free, no API key).
 * Usage policy: keep request volume low and identify the app.
 */
export async function geocodeAddress(query: string): Promise<GeocodeResult[]> {
  const q = query.trim()
  if (!q) return []
  const url = new URL("https://nominatim.openstreetmap.org/search")
  url.searchParams.set("format", "jsonv2")
  url.searchParams.set("q", q)
  url.searchParams.set("limit", "5")
  url.searchParams.set("accept-language", "vi")
  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  })
  if (!res.ok) throw new Error("Không tìm được địa chỉ")
  const data = (await res.json()) as Array<{
    lat: string
    lon: string
    display_name: string
  }>
  return data.map((d) => ({
    lat: Number(d.lat),
    lng: Number(d.lon),
    label: d.display_name,
  }))
}

/**
 * Parse a coordinate string pasted from Google Maps, e.g.
 * "10.762622, 106.660172" or "10.762622,106.660172".
 * Returns null when the string is not a valid lat,lng pair.
 */
export function parsePastedCoords(
  text: string,
): { lat: number; lng: number } | null {
  const m = text
    .trim()
    .match(/^(-?\d{1,3}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/)
  if (!m) return null
  const lat = Number(m[1])
  const lng = Number(m[2])
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat, lng }
}
