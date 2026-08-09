import { auth } from "@/auth"
import { recordEvent } from "@/db/events"
import { itineraryPdfResponse } from "@/pdf/response"
import { getTrip } from "@/trips/store"

export const dynamic = "force-dynamic"

/**
 * The operator's copy of the itinerary, as a PDF.
 *
 * A route handler rather than a server action: this returns a file, and the
 * browser's own download machinery — a plain link, no JavaScript — is better
 * at that than anything the app could do with a blob.
 *
 * The session is re-checked here rather than trusted from the proxy, the same
 * way the trip actions do it. The proxy closes this route, but a handler that
 * only works because a matcher regex is right is one refactor away from being
 * a public dump of somebody's travel plans.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await auth()
  const email = session?.user?.email
  if (!email) return new Response("Not found", { status: 404 })

  const { id } = await params
  const trip = await getTrip(id)
  // A trip still being planned has nothing to print, and says so the same way
  // a trip that does not exist does.
  if (!trip?.itinerary) return new Response("Not found", { status: 404 })

  await recordEvent("trip_exported", email, trip.id)

  return itineraryPdfResponse(trip.itinerary)
}
