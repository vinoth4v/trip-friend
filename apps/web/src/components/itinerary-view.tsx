import Link from "next/link"
import type { Itinerary } from "@/ai/itinerary"
import { budgetTotal, dayEffortMinutes } from "@/ai/itinerary"
import { Bookings } from "@/components/bookings"
import { BudgetTable } from "@/components/budget-table"
import { Badge, DayBadges, minutes, money, Timeline } from "@/components/timeline"
import { TripMap } from "@/components/trip-map"

/**
 * Screen 5 — the itinerary, with its tabs.
 *
 * Tabs are links with a `?tab=` query rather than client state. The itinerary
 * is entirely server-rendered, so a tab costs one navigation and no
 * JavaScript, and — the reason that matters here — a tab is then a URL that
 * can be shared and reloaded. A trip you cannot link someone to the budget of
 * is a worse trip.
 */

export const TABS = ["itinerary", "map", "budget", "bookings"] as const
export type Tab = (typeof TABS)[number]

export function isTab(value: string | undefined): value is Tab {
  return TABS.includes((value ?? "") as Tab)
}

const TAB_LABEL: Record<Tab, string> = {
  itinerary: "Itinerary",
  map: "Map",
  budget: "Budget",
  bookings: "Bookings",
}

export function ItineraryView({
  itinerary,
  tab,
  basePath,
  readOnly = false,
}: {
  itinerary: Itinerary
  tab: Tab
  basePath: string
  readOnly?: boolean
}) {
  return (
    <>
      <TripHeader itinerary={itinerary} />

      <nav className="tabs" aria-label="Itinerary views">
        {TABS.map((name) => (
          <Link
            key={name}
            href={name === "itinerary" ? basePath : `${basePath}?tab=${name}`}
            className={name === tab ? "tab tab-current" : "tab"}
            aria-current={name === tab ? "page" : undefined}
          >
            {TAB_LABEL[name]}
          </Link>
        ))}
      </nav>

      {tab === "itinerary" ? (
        <Days itinerary={itinerary} basePath={basePath} readOnly={readOnly} />
      ) : null}
      {tab === "map" ? <TripMap itinerary={itinerary} /> : null}
      {tab === "budget" ? <BudgetTable itinerary={itinerary} /> : null}
      {tab === "bookings" ? <Bookings itinerary={itinerary} /> : null}
    </>
  )
}

export function TripHeader({ itinerary }: { itinerary: Itinerary }) {
  const currency = itinerary.budget.currency
  const tiring = mostTiringDay(itinerary)

  return (
    <header className="trip-header">
      <h1>{itinerary.title}</h1>
      {itinerary.headline ? <p className="lede">{itinerary.headline}</p> : null}

      <p className="badges">
        <Badge>📍 {itinerary.destination}</Badge>
        <Badge>🗓️ {itinerary.days.length} days</Badge>
        {itinerary.period ? <Badge>{itinerary.period}</Badge> : null}
        {itinerary.travellersSummary ? <Badge>👥 {itinerary.travellersSummary}</Badge> : null}
        {itinerary.style ? <Badge>✨ {itinerary.style}</Badge> : null}
        <Badge>💰 {money(budgetTotal(itinerary.budget), currency)}</Badge>
      </p>

      {itinerary.match.score > 0 ? (
        <details className="match">
          <summary>
            Trip match: <strong>{itinerary.match.score}%</strong>
          </summary>
          {itinerary.match.compromises.length === 0 ? (
            <p className="muted">No compromises were recorded, which is worth a second look.</p>
          ) : (
            <ul>
              {itinerary.match.compromises.map((compromise) => (
                <li key={compromise}>{compromise}</li>
              ))}
            </ul>
          )}
          {tiring ? (
            <p className="muted">
              Day {tiring.day} is the busiest — {minutes(dayEffortMinutes(tiring))} of activity and
              travel.
            </p>
          ) : null}
        </details>
      ) : null}
    </header>
  )
}

function Days({
  itinerary,
  basePath,
  readOnly,
}: {
  itinerary: Itinerary
  basePath: string
  readOnly: boolean
}) {
  const currency = itinerary.budget.currency

  return (
    <section>
      {itinerary.days.map((day) => (
        <article key={day.day} className="day">
          <h2>
            Day {day.day} — {day.title}
            {day.base ? <span className="muted"> · {day.base}</span> : null}
          </h2>
          {day.date ? <p className="muted small">{day.date}</p> : null}
          {day.summary ? <p>{day.summary}</p> : null}

          <DayBadges day={day} currency={currency} />
          <Timeline day={day} currency={currency} compact />

          {readOnly ? null : (
            <p>
              <Link href={`${basePath}/day/${day.day}`}>Open day {day.day} in detail →</Link>
            </p>
          )}
        </article>
      ))}
    </section>
  )
}

/** Section 28's "which day is the most tiring?", answered without a model call. */
export function mostTiringDay(itinerary: Itinerary) {
  return itinerary.days.reduce<(typeof itinerary.days)[number] | null>((worst, day) => {
    if (!worst) return day
    return dayEffortMinutes(day) > dayEffortMinutes(worst) ? day : worst
  }, null)
}
