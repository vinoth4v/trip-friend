import { z } from "zod"

/**
 * The itinerary document.
 *
 * This is the app's central artefact and the only thing the user really came
 * for, so the schema is generous about what it accepts and strict about what
 * it guarantees. Optional-with-default rather than required, everywhere it can
 * be: a model that omits `walking` on day seven of a fourteen-day trip should
 * cost that day a badge, not cost the user the whole itinerary.
 */

export const placeSchema = z.object({
  name: z.string().default(""),
  /**
   * Coordinates are optional because the map must degrade, not disappear. A
   * model that knows Senso-ji is in Asakusa but cannot recall its latitude
   * should still produce a usable day.
   */
  lat: z.number().min(-90).max(90).nullable().default(null),
  lng: z.number().min(-180).max(180).nullable().default(null),
})

export type Place = z.infer<typeof placeSchema>

export const ITEM_KINDS = ["activity", "meal", "transport", "rest", "lodging"] as const
export type ItemKind = (typeof ITEM_KINDS)[number]

export const alternativeSchema = z.object({
  title: z.string(),
  why: z.string().default(""),
  cost: z.number().nonnegative().nullable().default(null),
})

export const itemSchema = z.object({
  /** 24-hour "09:00". Kept as a string: no timezone maths is wanted here. */
  time: z.string().default(""),
  kind: z.enum(ITEM_KINDS).default("activity"),
  title: z.string(),
  emoji: z.string().default(""),
  description: z.string().default(""),
  durationMinutes: z.number().int().nonnegative().nullable().default(null),
  cost: z.number().nonnegative().nullable().default(null),
  place: placeSchema.default({ name: "", lat: null, lng: null }),
  travelMinutes: z.number().int().nonnegative().nullable().default(null),
  travelMode: z.string().default(""),
  booking: z.string().default(""),
  /** Section 23: why this, and not the obvious tourist default. */
  why: z.string().default(""),
  alternatives: z.array(alternativeSchema).default([]),
})

export type ItineraryItem = z.infer<typeof itemSchema>

export const daySchema = z.object({
  day: z.number().int().positive(),
  date: z.string().nullable().default(null),
  title: z.string(),
  base: z.string().default(""),
  summary: z.string().default(""),
  pace: z.enum(["relaxed", "balanced", "packed"]).default("balanced"),
  walking: z.enum(["low", "moderate", "high"]).default("moderate"),
  estimatedCost: z.number().nonnegative().nullable().default(null),
  items: z.array(itemSchema).default([]),
})

export type ItineraryDay = z.infer<typeof daySchema>

export const budgetLineSchema = z.object({
  category: z.string(),
  amount: z.number().nonnegative(),
})

export const budgetSchema = z.object({
  currency: z.string().default("EUR"),
  lines: z.array(budgetLineSchema).default([]),
  /** Section 25 asks for a range; a single number pretends to a precision no
   * estimate has. Both ends are optional so the model may omit them. */
  low: z.number().nonnegative().nullable().default(null),
  high: z.number().nonnegative().nullable().default(null),
})

export type Budget = z.infer<typeof budgetSchema>

export const lodgingSchema = z.object({
  name: z.string(),
  area: z.string().default(""),
  nights: z.number().int().nonnegative().nullable().default(null),
  why: z.string().default(""),
  place: placeSchema.default({ name: "", lat: null, lng: null }),
})

export const matchSchema = z.object({
  /** Section 33's "Trip Match: 92%". */
  score: z.number().min(0).max(100).default(0),
  /** Where it compromised. An unexplained 92% is a decoration. */
  compromises: z.array(z.string()).default([]),
})

export const itinerarySchema = z.object({
  title: z.string(),
  destination: z.string(),
  headline: z.string().default(""),
  style: z.string().default(""),
  travellersSummary: z.string().default(""),
  period: z.string().default(""),
  days: z.array(daySchema).min(1),
  budget: budgetSchema,
  match: matchSchema.default({ score: 0, compromises: [] }),
  lodging: z.array(lodgingSchema).default([]),
  packingList: z.array(z.object({ item: z.string(), why: z.string().default("") })).default([]),
  preTripChecklist: z
    .array(
      z.object({
        task: z.string(),
        urgency: z.enum(["now", "soon", "before_departure"]).default("soon"),
        why: z.string().default(""),
      }),
    )
    .default([]),
})

export type Itinerary = z.infer<typeof itinerarySchema>

/**
 * What a revision turn returns.
 *
 * Whole days, not whole itineraries. Section 18 asks the AI to regenerate only
 * the affected parts, and there is a hard practical reason to obey: a
 * fourteen-day itinerary is far larger than a comfortable reply, so asking for
 * it back in full both costs seconds and risks a truncated document that fails
 * to parse — losing the trip the user was trying to adjust. A day is the
 * smallest unit that stays internally consistent once times shift, so it is
 * the unit of replacement.
 */
export const revisionSchema = z.object({
  reply: z.string(),
  replaceDays: z.array(daySchema).default([]),
  removeDays: z.array(z.number().int().positive()).default([]),
  budget: budgetSchema.nullable().default(null),
  match: matchSchema.nullable().default(null),
  title: z.string().nullable().default(null),
})

export type Revision = z.infer<typeof revisionSchema>

/**
 * Apply a revision to an itinerary, returning a new one.
 *
 * Pure, and separate from the model call, because this is where a bad patch
 * does real damage — a day silently dropped, or two days both numbered 4 — and
 * that is worth testing without a network.
 *
 * Days are renumbered after removals so the itinerary never shows a gap, and
 * the day numbers the user sees always match the length of their holiday.
 */
export function applyRevision(itinerary: Itinerary, revision: Revision): Itinerary {
  const removed = new Set(revision.removeDays)
  const replacements = new Map(revision.replaceDays.map((day) => [day.day, day]))

  const kept = itinerary.days
    .filter((day) => !removed.has(day.day))
    .map((day) => replacements.get(day.day) ?? day)

  // A replacement for a day that does not exist yet is an addition — "can we
  // add one more day in Osaka?" arrives in exactly this shape.
  const added = revision.replaceDays.filter(
    (day) => !itinerary.days.some((existing) => existing.day === day.day),
  )

  const days = [...kept, ...added]
    .sort((a, b) => a.day - b.day)
    .map((day, index) => ({ ...day, day: index + 1 }))

  return {
    ...itinerary,
    title: revision.title ?? itinerary.title,
    days: days.length > 0 ? days : itinerary.days,
    budget: revision.budget ?? itinerary.budget,
    match: revision.match ?? itinerary.match,
  }
}

/** The budget's own total. Summed, never taken from the model: a stated total
 * that disagrees with its own lines is the one arithmetic error models make
 * reliably, and it is the number the user checks first. */
export function budgetTotal(budget: Budget): number {
  return budget.lines.reduce((sum, line) => sum + line.amount, 0)
}

/** Day cost, preferring the model's own figure and falling back to its items —
 * the fallback matters because a revised day often loses its summary cost. */
export function dayCost(day: ItineraryDay): number {
  if (day.estimatedCost !== null) return day.estimatedCost
  return day.items.reduce((sum, item) => sum + (item.cost ?? 0), 0)
}

/** Total walking-around time, used to answer "which day is the most tiring?". */
export function dayEffortMinutes(day: ItineraryDay): number {
  return day.items.reduce(
    (sum, item) => sum + (item.durationMinutes ?? 0) + (item.travelMinutes ?? 0),
    0,
  )
}

/** Every mappable point of a day, in order, as the map's route. */
export function dayPlaces(day: ItineraryDay): (Place & { lat: number; lng: number })[] {
  return day.items
    .map((item) => item.place)
    .filter((place): place is Place & { lat: number; lng: number } =>
      Boolean(place && place.lat !== null && place.lng !== null),
    )
}
