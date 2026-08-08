import type { Itinerary } from "@/ai/itinerary"
import { Badge } from "@/components/timeline"

/**
 * The "Bookings" tab: everything that has to happen before departure.
 *
 * Three lists that are really one job — what to reserve, what to pack, what to
 * sort out (sections 24, 26 and 27). The checklist is ordered by urgency
 * rather than by the order the model happened to emit, because the only useful
 * thing a pre-trip checklist does is tell you what is already late.
 */

const URGENCY_ORDER = { now: 0, soon: 1, before_departure: 2 } as const

const URGENCY_LABEL = {
  now: "Do now",
  soon: "Soon",
  before_departure: "Before you leave",
} as const

export function Bookings({ itinerary }: { itinerary: Itinerary }) {
  const bookable = itinerary.days.flatMap((day) =>
    day.items
      .filter((item) => item.booking.trim() !== "")
      .map((item) => ({ day: day.day, title: item.title, booking: item.booking })),
  )

  const checklist = [...itinerary.preTripChecklist].sort(
    (a, b) => URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency],
  )

  return (
    <section>
      <h2>Needs booking</h2>
      {bookable.length === 0 ? (
        <p className="muted">Nothing on this trip needs reserving ahead.</p>
      ) : (
        <ul className="checklist">
          {bookable.map((entry) => (
            <li key={`${entry.day}-${entry.title}`}>
              <span aria-hidden="true">☐</span> <strong>{entry.title}</strong>{" "}
              <Badge>day {entry.day}</Badge>
              <span className="muted"> — {entry.booking}</span>
            </li>
          ))}
        </ul>
      )}

      <h2>Before you leave</h2>
      {checklist.length === 0 ? (
        <p className="muted">No pre-trip checklist was produced.</p>
      ) : (
        <ul className="checklist">
          {checklist.map((entry) => (
            <li key={entry.task}>
              <span aria-hidden="true">☐</span> <strong>{entry.task}</strong>{" "}
              <Badge tone={entry.urgency === "now" ? "warn" : undefined}>
                {URGENCY_LABEL[entry.urgency]}
              </Badge>
              {entry.why ? <span className="muted"> — {entry.why}</span> : null}
            </li>
          ))}
        </ul>
      )}

      <h2>Packing</h2>
      {itinerary.packingList.length === 0 ? (
        <p className="muted">No packing list was produced.</p>
      ) : (
        <ul className="checklist">
          {itinerary.packingList.map((entry) => (
            <li key={entry.item}>
              <span aria-hidden="true">☐</span> {entry.item}
              {entry.why ? <span className="muted"> — {entry.why}</span> : null}
            </li>
          ))}
        </ul>
      )}

      {itinerary.lodging.length > 0 ? (
        <>
          <h2>Where you stay</h2>
          <ul className="checklist">
            {itinerary.lodging.map((entry) => (
              <li key={entry.name}>
                <strong>{entry.name}</strong>
                {entry.area ? <span className="muted"> — {entry.area}</span> : null}
                {entry.nights ? <Badge>{entry.nights} nights</Badge> : null}
                {entry.why ? <p className="why">{entry.why}</p> : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  )
}
