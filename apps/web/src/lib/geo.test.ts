import { describe, expect, it } from "vitest"
import { distanceKm, projectPoints, routeLengthKm } from "./geo.ts"

const BOX = { width: 100, height: 100, padding: 10 }

describe("projectPoints", () => {
  it("returns nothing for no points", () => {
    expect(projectPoints([], BOX)).toEqual([])
  })

  it("centres a single point instead of dividing by a zero span", () => {
    const [point] = projectPoints([{ lat: 35.7, lng: 139.8 }], BOX)
    expect(point?.x).toBeCloseTo(50)
    expect(point?.y).toBeCloseTo(50)
  })

  it("puts north at the top, which a naive SVG projection gets backwards", () => {
    const [north, south] = projectPoints(
      [
        { lat: 36, lng: 139 },
        { lat: 35, lng: 139 },
      ],
      BOX,
    )
    expect(north?.y).toBeLessThan(south?.y ?? 0)
  })

  it("puts east to the right", () => {
    const [west, east] = projectPoints(
      [
        { lat: 35, lng: 139 },
        { lat: 35, lng: 140 },
      ],
      BOX,
    )
    expect(west?.x).toBeLessThan(east?.x ?? 0)
  })

  it("keeps every point inside the padded box", () => {
    const points = projectPoints(
      [
        { lat: 35.7, lng: 139.8 },
        { lat: 34.7, lng: 135.5 },
        { lat: 43.1, lng: 141.3 },
      ],
      BOX,
    )

    for (const point of points) {
      expect(point.x).toBeGreaterThanOrEqual(BOX.padding - 0.001)
      expect(point.x).toBeLessThanOrEqual(BOX.width - BOX.padding + 0.001)
      expect(point.y).toBeGreaterThanOrEqual(BOX.padding - 0.001)
      expect(point.y).toBeLessThanOrEqual(BOX.height - BOX.padding + 0.001)
    }
  })

  it("preserves aspect ratio, so two stops down the road do not look like two cities", () => {
    // A wide, shallow spread: the horizontal span is much larger, so the
    // vertical extent of the drawing must stay small rather than filling.
    const points = projectPoints(
      [
        { lat: 35.0, lng: 139.0 },
        { lat: 35.05, lng: 141.0 },
      ],
      BOX,
    )

    const dx = Math.abs((points[0]?.x ?? 0) - (points[1]?.x ?? 0))
    const dy = Math.abs((points[0]?.y ?? 0) - (points[1]?.y ?? 0))
    expect(dx).toBeGreaterThan(dy * 10)
  })

  it("survives identical points without producing NaN", () => {
    const points = projectPoints(
      [
        { lat: 35.7, lng: 139.8 },
        { lat: 35.7, lng: 139.8 },
      ],
      BOX,
    )
    for (const point of points) {
      expect(Number.isFinite(point.x)).toBe(true)
      expect(Number.isFinite(point.y)).toBe(true)
    }
  })

  it("clamps near the pole rather than running to infinity", () => {
    const points = projectPoints(
      [
        { lat: 89.9, lng: 0 },
        { lat: 0, lng: 0 },
      ],
      BOX,
    )
    for (const point of points) expect(Number.isFinite(point.y)).toBe(true)
  })
})

describe("distanceKm", () => {
  it("measures Tokyo to Kyoto at roughly the right distance", () => {
    const km = distanceKm({ lat: 35.68, lng: 139.77 }, { lat: 35.01, lng: 135.77 })
    expect(km).toBeGreaterThan(350)
    expect(km).toBeLessThan(390)
  })

  it("is zero for a point and itself", () => {
    expect(distanceKm({ lat: 1, lng: 2 }, { lat: 1, lng: 2 })).toBe(0)
  })
})

describe("routeLengthKm", () => {
  it("is zero for a single stop", () => {
    expect(routeLengthKm([{ lat: 35.68, lng: 139.77 }])).toBe(0)
  })

  it("adds the legs up", () => {
    const a = { lat: 35.68, lng: 139.77 }
    const b = { lat: 35.01, lng: 135.77 }
    expect(routeLengthKm([a, b, a])).toBeCloseTo(distanceKm(a, b) * 2, 5)
  })
})
