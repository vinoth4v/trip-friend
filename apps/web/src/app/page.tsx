import Link from "next/link"
import { signOutAction } from "@/app/actions"
import { auth } from "@/auth"
import { startTripAction } from "@/trips/actions"
import { listTrips } from "@/trips/store"

// Reads the session cookie, so there is nothing to prerender.
export const dynamic = "force-dynamic"

/**
 * Screen 1 — the hero and the only call to action that matters.
 *
 * Saved trips sit underneath rather than on a page of their own: one operator
 * with a handful of trips does not need a trips index, and a "Plan my trip"
 * button that is the first thing on the page is the whole of section 30.
 */
export default async function HomePage() {
  const session = await auth()

  // A database that cannot be reached must not take the hero and its one
  // button down with it — but it must not look like "you have no trips"
  // either, which is why the failure is said out loud below.
  const trips = await listTrips().catch((error: unknown) => {
    console.error("could not list trips", error)
    return null
  })

  return (
    <main className="wide">
      <header className="site-header">
        <strong>Trip Friend</strong>
        <form action={signOutAction}>
          <button type="submit" className="ghost">
            Sign out
          </button>
        </form>
      </header>

      <section className="hero">
        <h1>Your next adventure starts with a few questions.</h1>
        <p className="lede">
          Tell me how you want your vacation to feel, and I&rsquo;ll figure out the trip — where to
          go, what to do each day, what it costs, and what to book before you leave.
        </p>
        <form action={startTripAction}>
          <button type="submit" className="cta">
            Plan my trip
          </button>
        </form>
        <p className="muted small">Signed in as {session?.user?.email ?? "unknown"}.</p>
      </section>

      <section>
        <h2>Your trips</h2>
        {trips === null ? (
          <p role="alert">Your saved trips could not be loaded just now.</p>
        ) : trips.length === 0 ? (
          <p className="muted">Nothing planned yet. The button above is the whole onboarding.</p>
        ) : (
          <ul className="trip-list">
            {trips.map((trip) => (
              <li key={trip.id}>
                <Link href={`/trips/${trip.id}`}>{trip.title}</Link>
                <span className="muted small">
                  {trip.phase === "planned"
                    ? `${trip.itinerary?.days.length ?? 0} days · ${trip.itinerary?.destination ?? ""}`
                    : "still being planned"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
