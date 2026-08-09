import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { ItineraryView, isTab } from "@/components/itinerary-view"
import { getTripByShareToken } from "@/trips/store"

export const dynamic = "force-dynamic"

/**
 * The shared itinerary — the one route in this app that is not behind the gate.
 *
 * A trip is only worth planning if you can send it to the people you are
 * going with, and they do not have the operator's password. So the token is
 * the credential: 128 bits of randomness in the URL, checked against exactly
 * one row.
 *
 * Read-only, and not merely by convention — there is no action on this page to
 * call, and the whole surface is one `getTripByShareToken`. A trip still being
 * planned 404s rather than exposing a half-finished brief.
 *
 * The exemption for `/s/` lives in `src/proxy.ts`; without it every share link
 * would 307 to the login page.
 */
export const metadata: Metadata = {
  // A shared link should not turn up in search results. This is not access
  // control — the token is that — but an itinerary is somebody's holiday.
  robots: { index: false, follow: false },
}

export default async function SharedTripPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { token } = await params
  const { tab } = await searchParams

  const trip = await getTripByShareToken(token)
  if (!trip?.itinerary) notFound()

  return (
    <main className="wide">
      <p className="muted small">Shared from Trip Friend · read-only</p>

      <ItineraryView
        itinerary={trip.itinerary}
        tab={isTab(tab) ? tab : "itinerary"}
        basePath={`/s/${token}`}
        readOnly
      />
    </main>
  )
}
