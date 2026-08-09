import type { Itinerary } from "@/ai/itinerary"
import { budgetTotal, dayCost } from "@/ai/itinerary"
import { money } from "@/lib/format"

/**
 * The budget (section 25), with its uncertainty range.
 *
 * The total is summed from the lines rather than taken from the model — see
 * `budgetTotal`. The range is shown as given; when the model omitted it, a
 * flat ±15% is derived instead, because a single number presented without a
 * range is read as a quote and this is an estimate.
 */
export function BudgetTable({ itinerary }: { itinerary: Itinerary }) {
  const { currency, lines } = itinerary.budget
  const total = budgetTotal(itinerary.budget)
  const low = itinerary.budget.low ?? Math.round(total * 0.85)
  const high = itinerary.budget.high ?? Math.round(total * 1.15)

  return (
    <section>
      <h2>Budget</h2>

      {lines.length === 0 ? (
        <p className="muted">No budget breakdown was produced for this trip.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col" className="numeric">
                Estimated
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.category}>
                <th scope="row">{line.category}</th>
                <td className="numeric">{money(line.amount, currency)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td className="numeric">
                <strong>{money(total, currency)}</strong>
              </td>
            </tr>
          </tfoot>
        </table>
      )}

      <p className="muted">
        Realistically somewhere between {money(low, currency)} and {money(high, currency)},
        excluding flights unless a line above says otherwise.
      </p>

      <h3>Cost per day</h3>
      <ul className="cost-days">
        {itinerary.days.map((day) => (
          <li key={day.day}>
            <span>
              Day {day.day} — {day.title}
            </span>
            <span className="numeric">{money(dayCost(day), currency)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
