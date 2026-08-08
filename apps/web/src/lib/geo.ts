/**
 * Projecting a day's stops onto an SVG.
 *
 * There is no map library and no tile provider here, and that is a choice
 * rather than an omission. Every tile source worth using needs an API key, a
 * billing relationship and a client-side script — three things this app would
 * have to acquire to draw what is, for a walking day in one neighbourhood, a
 * dozen dots and the lines between them. A projected SVG needs none of them,
 * renders on the server, and cannot leak a key. What it cannot show is
 * streets; the known-gaps section of ARCHITECTURE.md says so plainly.
 *
 * Web Mercator for the vertical axis rather than plain equirectangular,
 * because at Reykjavík's latitude the naive version stretches a day's stops
 * into a vertical smear.
 */

export type Point = { lat: number; lng: number }
export type Projected = { x: number; y: number }

export type Box = { width: number; height: number; padding: number }

/** Mercator's y, in the same units as longitude degrees, clamped clear of the
 * poles where the projection runs to infinity. */
function mercatorY(lat: number): number {
  const clamped = Math.max(-85, Math.min(85, lat))
  const radians = (clamped * Math.PI) / 180
  return (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + radians / 2))
}

/**
 * Fit points into a box, preserving aspect ratio.
 *
 * Aspect ratio is preserved deliberately: stretching to fill would make two
 * stops a hundred metres apart look as far apart as two cities, which is the
 * one thing a map of a day is for.
 */
export function projectPoints(points: readonly Point[], box: Box): Projected[] {
  if (points.length === 0) return []

  const xs = points.map((p) => p.lng)
  const ys = points.map((p) => mercatorY(p.lat))

  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  const usableWidth = box.width - box.padding * 2
  const usableHeight = box.height - box.padding * 2

  const spanX = maxX - minX
  const spanY = maxY - minY

  // A single point, or several at the same spot, has no span to scale by;
  // centring is the only sensible answer and avoids a divide by zero.
  const scale =
    spanX === 0 && spanY === 0
      ? 1
      : Math.min(
          spanX === 0 ? Number.POSITIVE_INFINITY : usableWidth / spanX,
          spanY === 0 ? Number.POSITIVE_INFINITY : usableHeight / spanY,
        )

  const drawnWidth = spanX * scale
  const drawnHeight = spanY * scale
  const offsetX = box.padding + (usableWidth - drawnWidth) / 2
  const offsetY = box.padding + (usableHeight - drawnHeight) / 2

  return points.map((point) => ({
    x: offsetX + (point.lng - minX) * scale,
    // SVG y grows downwards; north must not end up at the bottom.
    y: offsetY + (maxY - mercatorY(point.lat)) * scale,
  }))
}

/** Great-circle distance in kilometres — used to sanity-check a day, not to
 * navigate: it is the straight line, and nobody walks the straight line. */
export function distanceKm(a: Point, b: Point): number {
  const earthRadiusKm = 6371
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180

  const dLat = toRadians(b.lat - a.lat)
  const dLng = toRadians(b.lng - a.lng)
  const lat1 = toRadians(a.lat)
  const lat2 = toRadians(b.lat)

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** How far a day's route runs, end to end. */
export function routeLengthKm(points: readonly Point[]): number {
  let total = 0
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const current = points[index]
    if (previous && current) total += distanceKm(previous, current)
  }
  return total
}
