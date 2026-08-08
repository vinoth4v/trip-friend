import type { Itinerary } from "@/ai/itinerary"
import { dayPlaces } from "@/ai/itinerary"
import { projectPoints, routeLengthKm } from "@/lib/geo"

/**
 * The map (section 22), drawn as an SVG from the coordinates the model gave.
 *
 * No tiles, no key, no client script — see the note in `src/lib/geo.ts` for
 * why. What this shows is the *shape* of a day: which stops cluster, which one
 * is the outlier, how far the route runs. That is the question a planning map
 * has to answer ("is this day a lot of criss-crossing?"), and it answers it
 * without a network request.
 *
 * When the model gave no coordinates the map says so rather than rendering an
 * empty box, because a blank map reads as a bug.
 */

const BOX = { width: 640, height: 420, padding: 32 }

export function TripMap({ itinerary, day }: { itinerary: Itinerary; day?: number }) {
  const days = day ? itinerary.days.filter((d) => d.day === day) : itinerary.days

  const stops = days.flatMap((d) => dayPlaces(d).map((place) => ({ ...place, day: d.day })))

  const lodging = itinerary.lodging
    .filter((entry) => entry.place.lat !== null && entry.place.lng !== null)
    .map((entry) => ({
      name: entry.name,
      lat: entry.place.lat as number,
      lng: entry.place.lng as number,
    }))

  if (stops.length === 0) {
    return (
      <p className="muted">
        No coordinates were given for these stops, so there is nothing to plot. Ask the trip
        assistant for the addresses and it will fill them in.
      </p>
    )
  }

  // Everything is projected together so the stops and the hotels share one
  // frame — projecting them separately would put a hotel in the middle of a
  // map it is nowhere near.
  const projected = projectPoints([...stops, ...lodging], BOX)

  /**
   * A stop, where it lands on the canvas, and the number drawn in its pin,
   * resolved once. The numbering has to be shared: the pin and the key
   * underneath disagreeing about which stop is number four would be worse than
   * having no map.
   */
  const pins = stops.flatMap((stop, index) => {
    const point = projected[index]
    return point ? [{ stop, point, number: index + 1 }] : []
  })

  const lodgingPins = lodging.flatMap((entry, index) => {
    const point = projected[stops.length + index]
    return point ? [{ entry, point }] : []
  })

  // One polyline per day, so a multi-day view shows several routes rather than
  // one line that teleports between cities at midnight.
  const routes = days
    .map((d) => ({
      day: d.day,
      points: pins.filter((pin) => pin.stop.day === d.day).map((pin) => pin.point),
    }))
    .filter((route) => route.points.length > 1)

  return (
    <div className="map">
      <svg
        viewBox={`0 0 ${BOX.width} ${BOX.height}`}
        role="img"
        aria-label={`Route map with ${stops.length} stops`}
        className="map-svg"
      >
        <title>{day ? `Day ${day} route` : `${itinerary.destination} route`}</title>

        {routes.map((route) => (
          <polyline
            key={route.day}
            className="map-route"
            points={route.points.map((point) => `${point.x},${point.y}`).join(" ")}
          />
        ))}

        {lodgingPins.map(({ entry, point }) => (
          <rect
            key={`lodging-${entry.name}`}
            className="map-lodging"
            x={point.x - 7}
            y={point.y - 7}
            width={14}
            height={14}
            rx={3}
          />
        ))}

        {pins.map(({ stop, point, number }) => (
          // Keyed by the pin number rather than the name: a route may pass
          // through the same place twice in a day.
          <g key={`${stop.day}-${number}`}>
            <circle className="map-pin" cx={point.x} cy={point.y} r={11} />
            <text className="map-pin-label" x={point.x} y={point.y + 4} textAnchor="middle">
              {number}
            </text>
          </g>
        ))}
      </svg>

      <p className="muted small">
        Straight-line route, roughly {Math.round(routeLengthKm(stops))} km end to end. Distances are
        as the crow flies — no street routing here.
      </p>

      <ol className="map-key">
        {pins.map(({ stop, number }) => (
          <li key={`key-${stop.day}-${number}`}>
            <span className="map-key-number">{number}</span> {stop.name}
            {day ? null : <span className="muted"> — day {stop.day}</span>}
          </li>
        ))}
        {lodging.map((entry) => (
          <li key={`key-lodging-${entry.name}`}>
            <span aria-hidden="true">▪︎</span> {entry.name}{" "}
            <span className="muted">— where you stay</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
