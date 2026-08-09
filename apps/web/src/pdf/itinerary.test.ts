import { describe, expect, it } from "vitest"
import { daySchema, type Itinerary, itinerarySchema } from "@/ai/itinerary"
import { itineraryFilename, itineraryPdf } from "./itinerary.ts"

/**
 * These tests read the bytes.
 *
 * There is no PDF viewer here to ask "does this look right", so what is
 * checked is the part a viewer refuses on: the header, the trailer, an object
 * count that matches the cross-reference table, and offsets that actually
 * point at their objects. A PDF with a wrong xref opens in some readers and
 * not others, which is the worst possible failure — it works on the machine
 * that made it.
 */

function itinerary(patch: Partial<Itinerary> = {}): Itinerary {
  return itinerarySchema.parse({
    title: "10 Days in Japan",
    destination: "Japan",
    headline: "Temples, ramen, and one very early train.",
    days: [
      {
        day: 1,
        title: "Arrive in Tokyo",
        summary: "Land, drop bags, walk Yanaka before the jet lag lands.",
        items: [
          {
            time: "09:00",
            title: "Land at Haneda",
            kind: "transport",
            cost: 0,
            booking: "Reserve the Skyliner seat",
            why: "Cheaper than a taxi and faster than the bus.",
            alternatives: [{ title: "Airport taxi", cost: 90, why: "If you land exhausted." }],
          },
        ],
      },
      { day: 2, title: "Kyoto" },
    ],
    budget: { currency: "EUR", lines: [{ category: "Food", amount: 400 }], low: 1800, high: 2400 },
    packingList: [{ item: "Rain shell", why: "June is the rainy season." }],
    preTripChecklist: [{ task: "Order yen", urgency: "soon" }],
    ...patch,
  })
}

function read(bytes: Uint8Array): string {
  return new TextDecoder("latin1").decode(bytes)
}

describe("itineraryPdf", () => {
  it("produces something a reader will recognise as a PDF", () => {
    const file = read(itineraryPdf(itinerary()))

    expect(file.startsWith("%PDF-1.4")).toBe(true)
    expect(file.trimEnd().endsWith("%%EOF")).toBe(true)
    expect(file).toContain("/Type /Catalog")
  })

  it("writes a cross-reference table that agrees with the objects it indexes", () => {
    const file = read(itineraryPdf(itinerary()))

    const size = Number(file.match(/\/Size (\d+)/)?.[1])
    const entries = file.match(/^\d{10} 00000 n $/gm) ?? []
    // One free entry plus one per object.
    expect(entries.length).toBe(size - 1)

    for (const [index, entry] of entries.entries()) {
      const offset = Number(entry.slice(0, 10))
      expect(file.slice(offset, offset + 20)).toContain(`${index + 1} 0 obj`)
    }

    const startxref = Number(file.match(/startxref\n(\d+)/)?.[1])
    expect(file.slice(startxref, startxref + 4)).toBe("xref")
  })

  it("declares each content stream's real length", () => {
    // A /Length that disagrees with the stream is the classic way to produce a
    // file that opens in one viewer and is blank in another.
    const file = read(itineraryPdf(itinerary()))

    for (const match of file.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
      const declared = Number(match[1])
      const start = match.index + match[0].length
      expect(file.slice(start + declared, start + declared + 9)).toBe("endstream")
    }
  })

  it("counts its pages, and says so on every one of them", () => {
    const file = read(itineraryPdf(itinerary()))
    const count = Number(file.match(/\/Count (\d+)/)?.[1])

    expect(count).toBeGreaterThan(0)
    expect(file.match(/\/Type \/Page\b/g)?.length).toBe(count)
    expect(file).toContain(`page 1 of ${count}`)
    expect(file).toContain(`page ${count} of ${count}`)
  })

  it("grows to more pages as the trip gets longer, rather than losing the end", () => {
    const short = read(itineraryPdf(itinerary()))
    const long = read(
      itineraryPdf(
        itinerary({
          days: Array.from({ length: 21 }, (_, index) =>
            daySchema.parse({
              day: index + 1,
              title: `Day ${index + 1}`,
              summary: "A long day with a summary long enough to take up a line or two of prose.",
              items: [
                { time: "09:00", title: "Breakfast", description: "Somewhere with a queue." },
                { time: "13:00", title: "Museum", description: "The one everyone means." },
              ],
            }),
          ),
        }),
      ),
    )

    const pages = (file: string) => Number(file.match(/\/Count (\d+)/)?.[1])
    expect(pages(long)).toBeGreaterThan(pages(short))
    expect(long).toContain("Day 21")
  })

  it("carries the parts of the screen that a print would otherwise lose", () => {
    const file = read(itineraryPdf(itinerary()))

    expect(file).toContain("10 Days in Japan")
    expect(file).toContain("Land at Haneda")
    // Collapsed on screen; there is nothing to click on paper.
    expect(file).toContain("Airport taxi")
    expect(file).toContain("Book ahead: Reserve the Skyliner seat")
    expect(file).toContain("Packing list")
    expect(file).toContain("Before you go")
  })

  it("survives an itinerary with nothing in it but the one required day", () => {
    // Every optional field defaulted away — which is exactly what a degraded
    // row read back through the schema looks like.
    const bare = itinerarySchema.parse({
      title: "Trip",
      destination: "Somewhere",
      days: [{ day: 1, title: "Day one" }],
      budget: {},
    })

    const file = read(itineraryPdf(bare))
    expect(file.startsWith("%PDF-1.4")).toBe(true)
    expect(file).toContain("/Count 1")
  })

  it("escapes a title that would otherwise end the string early", () => {
    const file = read(itineraryPdf(itinerary({ title: "Japan (with kids) \\ 2026" })))

    expect(file).toContain("Japan \\(with kids\\) \\\\ 2026")
    // And the document still parses as one — the escape is the whole point.
    expect(file.trimEnd().endsWith("%%EOF")).toBe(true)
  })
})

describe("itineraryFilename", () => {
  it("names the file after the trip", () => {
    expect(itineraryFilename(itinerary())).toBe("10-days-in-japan.pdf")
  })

  it("keeps it ASCII, because a filename in a header is not a place to be brave", () => {
    expect(itineraryFilename(itinerary({ title: "Málaga & Sevilla" }))).toBe("malaga-sevilla.pdf")
  })

  it("still returns something for a title with no letters in it", () => {
    expect(itineraryFilename(itinerary({ title: "🍜" }))).toBe("itinerary.pdf")
  })
})
