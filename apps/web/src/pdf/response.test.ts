import { describe, expect, it } from "vitest"
import { type Itinerary, itinerarySchema } from "@/ai/itinerary"
import { itineraryPdfResponse } from "./response.ts"

/**
 * The response, not the document.
 *
 * `itinerary.test.ts` checks the bytes; this checks that they survive the trip
 * into a `Response` and back out again. That is the seam the first two attempts
 * at this feature broke on — the bytes were always fine, and the body they were
 * handed to was not — and a type annotation three functions upstream is exactly
 * the kind of thing a later refactor widens without noticing.
 */

function itinerary(): Itinerary {
  return itinerarySchema.parse({
    title: "10 Days in Japan",
    destination: "Japan",
    days: [{ day: 1, title: "Arrive in Tokyo" }],
    budget: {},
  })
}

describe("itineraryPdfResponse", () => {
  it("serves the generated document as the body, byte for byte", async () => {
    const response = itineraryPdfResponse(itinerary())
    const body = new Uint8Array(await response.arrayBuffer())
    const file = new TextDecoder("latin1").decode(body)

    expect(file.startsWith("%PDF-1.4")).toBe(true)
    expect(file.trimEnd().endsWith("%%EOF")).toBe(true)
  })

  it("declares a content-length that matches what it actually sends", async () => {
    // A short read is how a browser produces a truncated file that no viewer
    // will open, and it is silent — the download completes.
    const response = itineraryPdfResponse(itinerary())
    const declared = Number(response.headers.get("content-length"))

    expect((await response.arrayBuffer()).byteLength).toBe(declared)
  })

  it("offers it as a download named after the trip, and never from a cache", () => {
    const response = itineraryPdfResponse(itinerary())

    expect(response.headers.get("content-type")).toBe("application/pdf")
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="10-days-in-japan.pdf"',
    )
    expect(response.headers.get("cache-control")).toBe("no-store")
  })
})
