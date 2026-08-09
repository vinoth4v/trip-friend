import Link from "next/link"
import { notFound } from "next/navigation"
import { dayCost } from "@/ai/itinerary"
import { DayBadges, money, Timeline } from "@/components/timeline"
import { TripMap } from "@/components/trip-map"
import { getTrip } from "@/trips/store"

export const dynamic = "force-dynamic"

/**
 * Screen 6 — one day, in full.
 *
 * The list view deliberately renders days compactly; this is where the
 * descriptions, the reasons and the alternatives live, alongside the map of
 * just that day. Splitting it out keeps the itinerary skimmable, which is what
 * a fourteen-day trip needs it to be.
 */
export default async function DayPage({
  params,
}: {
  params: Promise<{ id: string; day: string }>
}) {
  const { id, day: dayParam } = await params

  const trip = await getTrip(id)
  if (!trip?.itinerary) notFound()

  const dayNumber = Number.parseInt(dayParam, 10)
  const day = trip.itinerary.days.find((entry) => entry.day === dayNumber)
  if (!day) notFound()

  const currency = trip.itinerary.budget.currency
  const previous = trip.itinerary.days.find((entry) => entry.day === dayNumber - 1)
  const next = trip.itinerary.days.find((entry) => entry.day === dayNumber + 1)

  return (
    <main className="wide">
      <nav className="site-header">
        <Link href={`/trips/${trip.id}`}>← {trip.itinerary.title}</Link>
      </nav>

      <h1>
        Day {day.day} — {day.title}
      </h1>
      {day.date ? <p className="muted small">{day.date}</p> : null}
      {day.summary ? <p className="lede">{day.summary}</p> : null}

      <DayBadges day={day} currency={currency} />

      <Timeline day={day} currency={currency} />

      <p>
        <strong>Day total:</strong> {money(dayCost(day), currency)}
      </p>

      <h2>Where this day goes</h2>
      <TripMap itinerary={trip.itinerary} day={day.day} />

      <nav className="day-nav">
        {previous ? (
          <Link href={`/trips/${trip.id}/day/${previous.day}`}>← Day {previous.day}</Link>
        ) : (
          <span />
        )}
        {next ? <Link href={`/trips/${trip.id}/day/${next.day}`}>Day {next.day} →</Link> : null}
      </nav>
    </main>
  )
}
