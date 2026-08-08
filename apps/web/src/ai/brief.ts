import { z } from "zod"

/**
 * What the app has understood about the trip so far.
 *
 * Every field is nullable or defaults to empty, because the brief is built up
 * a turn at a time and there is no moment when it is required to be complete.
 * That is the whole shape of the product: the user is never shown a form with
 * twenty required fields, so the data model must not contain one either.
 *
 * The model is handed this document and returns a new one each turn. It merges
 * rather than patches — a patch protocol would need the model to distinguish
 * "unchanged" from "no longer true", which it does unreliably, whereas
 * re-stating the whole (small) brief is something it does well.
 */

export const PACES = ["relaxed", "balanced", "packed"] as const
export type Pace = (typeof PACES)[number]

export const budgetSchema = z.object({
  /** null means "not sure" — a legitimate answer, not a missing one. */
  amount: z.number().nullable().default(null),
  currency: z.string().default("EUR"),
  basis: z.enum(["total", "per_person", "daily", "none"]).default("none"),
  note: z.string().default(""),
})

export const travellersSchema = z.object({
  kind: z.string().default(""),
  adults: z.number().int().nonnegative().nullable().default(null),
  children: z.number().int().nonnegative().nullable().default(null),
  childAges: z.array(z.number().int().nonnegative()).default([]),
})

export const datesSchema = z.object({
  kind: z.enum(["exact", "month", "season", "flexible", "unknown"]).default("unknown"),
  start: z.string().nullable().default(null),
  end: z.string().nullable().default(null),
  /** How the user actually said it — "anytime this summer" survives here. */
  description: z.string().default(""),
})

export const briefSchema = z.object({
  destination: z.string().nullable().default(null),
  destinationCandidates: z.array(z.string()).default([]),
  destinationCertainty: z.enum(["exact", "ideas", "open", "unknown"]).default("unknown"),
  dates: datesSchema.default({ kind: "unknown", start: null, end: null, description: "" }),
  durationDays: z.number().int().positive().nullable().default(null),
  travellers: travellersSchema.default({ kind: "", adults: null, children: null, childAges: [] }),
  interests: z.array(z.string()).default([]),
  pace: z.enum(PACES).nullable().default(null),
  budget: budgetSchema.default({ amount: null, currency: "EUR", basis: "none", note: "" }),
  accommodation: z.array(z.string()).default([]),
  transport: z.array(z.string()).default([]),
  food: z.object({
    importance: z.string().default(""),
    dietary: z.array(z.string()).default([]),
  }),
  mustDo: z.array(z.string()).default([]),
  mustAvoid: z.array(z.string()).default([]),
  notes: z.string().default(""),
})

export type Brief = z.infer<typeof briefSchema>

export const emptyBrief: Brief = briefSchema.parse({ food: {} })

/**
 * The fields worth asking about, in the order they are worth asking about.
 *
 * Used for the progress indicator and for nudging the model towards the
 * high-value question next. It is not a script: the model may skip anything it
 * has already inferred, which is section 4 of the plan and the reason the
 * questionnaire feels short.
 */
const ESSENTIALS = [
  { key: "destination", label: "where" },
  { key: "duration", label: "how long" },
  { key: "travellers", label: "who" },
  { key: "interests", label: "what you love" },
  { key: "pace", label: "pace" },
  { key: "budget", label: "budget" },
] as const

export type Essential = (typeof ESSENTIALS)[number]["key"]

/** Which of the essentials the brief still cannot answer. */
export function missingEssentials(brief: Brief): Essential[] {
  const known: Record<Essential, boolean> = {
    destination:
      Boolean(brief.destination) ||
      brief.destinationCandidates.length > 0 ||
      brief.destinationCertainty === "open",
    duration: brief.durationDays !== null,
    travellers: brief.travellers.kind !== "" || brief.travellers.adults !== null,
    interests: brief.interests.length > 0,
    pace: brief.pace !== null,
    budget:
      brief.budget.amount !== null || brief.budget.basis === "none" || brief.budget.note !== "",
  }

  return ESSENTIALS.map((e) => e.key).filter((key) => !known[key])
}

/**
 * Whether there is enough to plan a trip against.
 *
 * Deliberately not "every essential answered". A user who says "surprise me,
 * a week somewhere warm" has left three fields blank and still described a
 * plannable trip; refusing to plan it would be the travel-booking-form
 * behaviour section 31 exists to forbid. Budget and pace both have sane
 * defaults, so their absence never blocks.
 */
export function readyToPlan(brief: Brief): boolean {
  const missing = new Set(missingEssentials(brief))
  return !missing.has("destination") && !missing.has("duration") && !missing.has("travellers")
}

/** 0–1, for the "Understanding your trip · 4/6" indicator. */
export function intakeProgress(brief: Brief): { answered: number; total: number } {
  const total = ESSENTIALS.length
  return { answered: total - missingEssentials(brief).length, total }
}

/** A one-line human summary, used as the trip's title before it has a name. */
export function briefHeadline(brief: Brief): string {
  const where = brief.destination ?? brief.destinationCandidates[0] ?? "Somewhere new"
  const days = brief.durationDays ? `${brief.durationDays} days in ` : ""
  return `${days}${where}`.trim()
}

/**
 * The brief as prose for the model.
 *
 * JSON would also work and is shorter to produce, but a model handed a nested
 * object reliably re-emits fields it was only meant to read. Prose that says
 * "not yet known" makes the gaps legible and is what the next question is
 * chosen from.
 */
export function describeBrief(brief: Brief): string {
  const unknown = "not yet known"
  const list = (values: string[]) => (values.length ? values.join(", ") : unknown)

  const travellers = brief.travellers.adults
    ? `${brief.travellers.kind || "group"} — ${brief.travellers.adults} adult(s)` +
      (brief.travellers.children
        ? `, ${brief.travellers.children} child(ren) aged ${list(brief.travellers.childAges.map(String))}`
        : "")
    : brief.travellers.kind || unknown

  const budget =
    brief.budget.amount !== null
      ? `${brief.budget.amount} ${brief.budget.currency} (${brief.budget.basis})`
      : brief.budget.note || unknown

  return [
    `Destination: ${brief.destination ?? list(brief.destinationCandidates)} (certainty: ${brief.destinationCertainty})`,
    `Dates: ${brief.dates.description || brief.dates.start || unknown} (${brief.dates.kind})`,
    `Duration: ${brief.durationDays ? `${brief.durationDays} days` : unknown}`,
    `Travellers: ${travellers}`,
    `Interests: ${list(brief.interests)}`,
    `Pace: ${brief.pace ?? unknown}`,
    `Budget: ${budget}`,
    `Accommodation: ${list(brief.accommodation)}`,
    `Getting around: ${list(brief.transport)}`,
    `Food: ${brief.food.importance || unknown}; dietary: ${list(brief.food.dietary)}`,
    `Must do: ${list(brief.mustDo)}`,
    `Must avoid: ${list(brief.mustAvoid)}`,
    `Other notes: ${brief.notes || "none"}`,
  ].join("\n")
}
