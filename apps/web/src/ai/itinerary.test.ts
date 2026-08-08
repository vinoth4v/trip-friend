import { describe, expect, it } from "vitest"
import {
  applyRevision,
  budgetTotal,
  dayCost,
  dayEffortMinutes,
  dayPlaces,
  daySchema,
  type Itinerary,
  itinerarySchema,
  type Revision,
  revisionSchema,
} from "./itinerary.ts"

function day(number: number, patch: Record<string, unknown> = {}) {
  return daySchema.parse({ day: number, title: `Day ${number}`, ...patch })
}

function itinerary(patch: Partial<Itinerary> = {}): Itinerary {
  return itinerarySchema.parse({
    title: "10-Day Japan",
    destination: "Japan",
    days: [day(1), day(2), day(3)],
    budget: { currency: "EUR", lines: [{ category: "Food", amount: 100 }] },
    ...patch,
  })
}

function revision(patch: Partial<Revision> = {}): Revision {
  return revisionSchema.parse({ reply: "done", ...patch })
}

describe("itinerarySchema", () => {
  it("fills in everything the model left out, rather than rejecting the trip", () => {
    const parsed = itinerarySchema.parse({
      title: "Trip",
      destination: "Portugal",
      days: [{ day: 1, title: "Arrive" }],
      budget: {},
    })
    expect(parsed.days[0]?.pace).toBe("balanced")
    expect(parsed.packingList).toEqual([])
    expect(parsed.match.score).toBe(0)
  })

  it("rejects an itinerary with no days at all — that is not a trip", () => {
    expect(() =>
      itinerarySchema.parse({ title: "T", destination: "D", days: [], budget: {} }),
    ).toThrow()
  })

  it("rejects a coordinate outside the planet", () => {
    expect(() =>
      daySchema.parse({
        day: 1,
        title: "x",
        items: [{ title: "y", place: { name: "z", lat: 991, lng: 0 } }],
      }),
    ).toThrow()
  })
})

describe("applyRevision", () => {
  it("replaces only the day it was given", () => {
    const before = itinerary()
    const after = applyRevision(before, revision({ replaceDays: [day(2, { title: "Slower" })] }))

    expect(after.days).toHaveLength(3)
    expect(after.days[1]?.title).toBe("Slower")
    expect(after.days[0]?.title).toBe("Day 1")
  })

  it("removes a day and renumbers, so the trip never shows a gap", () => {
    const after = applyRevision(itinerary(), revision({ removeDays: [2] }))

    expect(after.days.map((d) => d.day)).toEqual([1, 2])
    expect(after.days[1]?.title).toBe("Day 3")
  })

  it("adds a day when told to replace one that does not exist yet", () => {
    const after = applyRevision(
      itinerary(),
      revision({ replaceDays: [day(4, { title: "Osaka" })] }),
    )

    expect(after.days).toHaveLength(4)
    expect(after.days[3]?.title).toBe("Osaka")
  })

  it("keeps the budget when the revision did not touch it", () => {
    const before = itinerary()
    const after = applyRevision(before, revision({ replaceDays: [day(1)] }))
    expect(after.budget).toEqual(before.budget)
  })

  it("takes the new budget and match when the revision supplies them", () => {
    const after = applyRevision(
      itinerary(),
      revision({
        budget: {
          currency: "EUR",
          lines: [{ category: "Food", amount: 50 }],
          low: null,
          high: null,
        },
        match: { score: 81, compromises: ["cheaper hotel is further out"] },
      }),
    )

    expect(budgetTotal(after.budget)).toBe(50)
    expect(after.match.score).toBe(81)
  })

  it("answers a question without changing anything", () => {
    const before = itinerary()
    const after = applyRevision(before, revision({ reply: "Day 2 is the most tiring." }))
    expect(after).toEqual(before)
  })

  it("refuses to empty the itinerary, however enthusiastically it is asked", () => {
    const before = itinerary()
    const after = applyRevision(before, revision({ removeDays: [1, 2, 3] }))
    expect(after.days).toEqual(before.days)
  })
})

describe("budgetTotal", () => {
  it("sums the lines rather than trusting a stated total", () => {
    const budget = itinerary({
      budget: {
        currency: "EUR",
        lines: [
          { category: "Accommodation", amount: 2000 },
          { category: "Food", amount: 1200 },
        ],
        low: null,
        high: null,
      },
    }).budget

    expect(budgetTotal(budget)).toBe(3200)
  })
})

describe("dayCost", () => {
  it("prefers the day's own figure", () => {
    expect(dayCost(day(1, { estimatedCost: 180 }))).toBe(180)
  })

  it("falls back to summing the items when the day has no figure", () => {
    const rebuilt = day(1, {
      estimatedCost: null,
      items: [
        { title: "Temple", cost: 5 },
        { title: "Dinner", cost: 45 },
        { title: "Walk", cost: null },
      ],
    })
    expect(dayCost(rebuilt)).toBe(50)
  })
})

describe("dayEffortMinutes", () => {
  it("counts travel as effort, because it is", () => {
    const busy = day(1, {
      items: [
        { title: "Museum", durationMinutes: 90, travelMinutes: 20 },
        { title: "Lunch", durationMinutes: 60 },
      ],
    })
    expect(dayEffortMinutes(busy)).toBe(170)
  })
})

describe("dayPlaces", () => {
  it("keeps only the stops that can actually be plotted", () => {
    const mixed = day(1, {
      items: [
        { title: "A", place: { name: "A", lat: 35.7, lng: 139.8 } },
        { title: "B", place: { name: "B", lat: null, lng: null } },
        { title: "C", place: { name: "C", lat: 35.6, lng: 139.7 } },
      ],
    })
    expect(dayPlaces(mixed).map((place) => place.name)).toEqual(["A", "C"])
  })
})
