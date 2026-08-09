import type { Brief } from "@/ai/brief"
import { describeBrief } from "@/ai/brief"
import type { Shortlist } from "@/ai/planner"
import { ActionButton } from "@/components/action-button"
import { Badge } from "@/components/timeline"
import { chooseDestinationAction } from "@/trips/actions"

/**
 * Screens 3 and 4 — the shortlist, then the confirmation before the expensive
 * call.
 *
 * There is a deliberate stop here. Generating an itinerary takes real time and
 * real money at the gateway, so it happens when the traveller presses the
 * button, never as a side effect of answering the last question. The overview
 * exists so that press is informed: this is what I understood, correct me now.
 */

export function DestinationShortlist({
  shortlist,
  tripId,
}: {
  shortlist: Shortlist
  tripId: string
}) {
  return (
    <section>
      <h2>Where to?</h2>
      {shortlist.intro ? <p className="lede">{shortlist.intro}</p> : null}

      <ul className="cards">
        {shortlist.options.map((option) => (
          <li key={option.name} className="card">
            <h3>
              {option.flag ? <span aria-hidden="true">{option.flag} </span> : null}
              {option.name}
            </h3>
            <p className="badges">
              {option.idealDuration ? <Badge>{option.idealDuration}</Badge> : null}
              {option.estimatedBudget ? <Badge>{option.estimatedBudget}</Badge> : null}
            </p>
            {option.bestFor ? (
              <p>
                <strong>Best for:</strong> {option.bestFor}
              </p>
            ) : null}
            {option.why ? <p className="muted">{option.why}</p> : null}
            {option.compromise ? (
              <p className="why">
                <strong>The compromise:</strong> {option.compromise}
              </p>
            ) : null}

            <ActionButton
              action={chooseDestinationAction.bind(null, tripId, option.name)}
              pendingLabel="Choosing…"
            >
              This one
            </ActionButton>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * The brief, rendered from the same prose the model is shown.
 *
 * Deliberately the same source: if the summary and the primer could drift, the
 * traveller would be confirming something other than what gets planned. Lines
 * whose value is still unknown are dropped rather than displayed as gaps —
 * this is a confirmation, not a progress bar.
 */
export function BriefSummary({ brief }: { brief: Brief }) {
  const rows = describeBrief(brief)
    .split("\n")
    .map((line) => {
      const separator = line.indexOf(":")
      return { label: line.slice(0, separator), value: line.slice(separator + 1).trim() }
    })
    .filter((row) => row.value && !row.value.startsWith("not yet known") && row.value !== "none")

  return (
    <dl className="summary">
      {rows.map((row) => (
        <div key={row.label}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}
