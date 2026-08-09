/**
 * The two formatters everything shows numbers through.
 *
 * They live away from the components because the PDF needs them too, and a
 * printed itinerary whose durations read differently from the screen it was
 * printed from is the kind of discrepancy nobody notices until they are
 * standing on a platform.
 */

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
