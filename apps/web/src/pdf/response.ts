import type { Itinerary } from "@/ai/itinerary"
import { itineraryFilename, itineraryPdf } from "@/pdf/itinerary"

/**
 * One itinerary, as an HTTP response.
 *
 * Shared by the operator's route and the public share route so the two cannot
 * drift into serving different documents — the share link's whole promise is
 * that it shows what the owner sees.
 *
 * `attachment` rather than `inline`: the request comes from a link labelled
 * "Download PDF", and a browser that opens its own viewer instead has quietly
 * done something other than what the label said.
 */
export function itineraryPdfResponse(itinerary: Itinerary): Response {
  const bytes = itineraryPdf(itinerary)
  const filename = itineraryFilename(itinerary)

  return new Response(bytes, {
    headers: {
      "content-type": "application/pdf",
      "content-length": String(bytes.byteLength),
      "content-disposition": `attachment; filename="${filename}"`,
      // The document is generated from a row that changes whenever the trip
      // assistant is asked for anything, so a cached copy is a stale holiday.
      "cache-control": "no-store",
    },
  })
}
