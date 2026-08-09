import type { ItineraryDay, ItineraryItem } from "@/ai/itinerary"
import { dayCost, dayEffortMinutes } from "@/ai/itinerary"

/**
 * A day as a vertical timeline (section 21).
 *
 * Server-rendered: none of it is interactive, and the alternatives use
 * <details> rather than state so a day full of them costs no JavaScript.
 */

const KIND_EMOJI: Record<ItineraryItem["kind"], string> = {
  activity: "📍",
  meal: "🍽️",
  transport: "🚆",
  rest: "☕",
  lodging: "🛏️",
}

export function Timeline({
  day,
  currency,
  compact = false,
}: {
  day: ItineraryDay
  currency: string
  compact?: boolean
}) {
  // Keyed by position, and numbered up front rather than in the render: a day
  // can legitimately hold two items with the same title at the same time
  // ("Free time" twice over), so position is the only thing that identifies
  // one. The list is server-rendered and never reordered in place.
  const items = day.items.map((item, index) => ({ item, key: `${day.day}-${index}` }))

  return (
    <ol className="timeline">
      {items.map(({ item, key }) => (
        <li key={key} className="timeline-item">
          <span className="timeline-time">{item.time || "—"}</span>

          <div className="timeline-body">
            <p className="timeline-title">
              <span aria-hidden="true">{item.emoji || KIND_EMOJI[item.kind]} </span>
              {item.title}
            </p>

            {item.description && !compact ? <p className="muted">{item.description}</p> : null}

            <p className="badges">
              {item.durationMinutes ? <Badge>{minutes(item.durationMinutes)}</Badge> : null}
              {item.cost !== null ? (
                <Badge>{item.cost === 0 ? "Free" : money(item.cost, currency)}</Badge>
              ) : null}
              {item.place.name ? <Badge>📌 {item.place.name}</Badge> : null}
              {item.travelMinutes ? (
                <Badge>
                  {item.travelMode ? `${item.travelMode} ` : ""}
                  {minutes(item.travelMinutes)}
                </Badge>
              ) : null}
              {item.booking ? <Badge tone="warn">🎟️ {item.booking}</Badge> : null}
            </p>

            {item.why && !compact ? (
              <p className="why">
                <strong>Why this:</strong> {item.why}
              </p>
            ) : null}

            {item.alternatives.length > 0 && !compact ? (
              <details className="alternatives">
                <summary>{item.alternatives.length} alternative(s)</summary>
                <ul>
                  {item.alternatives.map((alternative) => (
                    <li key={alternative.title}>
                      <strong>{alternative.title}</strong>
                      {alternative.cost !== null ? ` — ${money(alternative.cost, currency)}` : ""}
                      {alternative.why ? <span className="muted"> — {alternative.why}</span> : null}
                    </li>
                  ))}
                </ul>
                <p className="muted small">
                  Ask the trip assistant to swap one in — it will re-time the rest of the day.
                </p>
              </details>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  )
}

export function DayBadges({ day, currency }: { day: ItineraryDay; currency: string }) {
  const effort = dayEffortMinutes(day)
  return (
    <p className="badges">
      <Badge>💰 {money(dayCost(day), currency)}</Badge>
      <Badge>⚡ {day.pace}</Badge>
      <Badge>🚶 {day.walking} walking</Badge>
      {effort > 0 ? <Badge>🕒 {minutes(effort)} occupied</Badge> : null}
    </p>
  )
}

export function Badge({ children, tone }: { children: React.ReactNode; tone?: "warn" }) {
  return <span className={tone === "warn" ? "badge badge-warn" : "badge"}>{children}</span>
}

export function minutes(total: number): string {
  if (total < 60) return `${total} min`
  const hours = Math.floor(total / 60)
  const rest = total % 60
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
}

/** Currency codes rather than symbols: the model returns "EUR", and a lookup
 * table of symbols would be wrong for exactly the currencies nobody tests. */
export function money(amount: number, currency: string): string {
  return `${currency} ${Math.round(amount).toLocaleString("en-GB")}`
}
