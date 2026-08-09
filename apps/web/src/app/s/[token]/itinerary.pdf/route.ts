import { itineraryPdfResponse } from "@/pdf/response"
import { getTripByShareToken } from "@/trips/store"

export const dynamic = "force-dynamic"

/**
 * The shared itinerary, as a PDF.
 *
 * Public, on the same terms as the page it hangs off: the 128-bit token is the
 * credential, the shape is checked before the query so junk in the URL costs a
 * regex rather than a round trip, and an unfinished trip 404s. Everyone on the
 * trip should be able to take a copy with them, and only the operator has the
 * password.
 *
 * No audit row here, deliberately. `/s/` is the one route an unauthenticated
 * stranger can reach, and a public URL that writes a database row per request
 * is a way to fill a table from outside. The operator's own download is
 * recorded; a share link's downloads are not.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params

  const trip = await getTripByShareToken(token)
  if (!trip?.itinerary) return new Response("Not found", { status: 404 })

  return itineraryPdfResponse(trip.itinerary)
}
