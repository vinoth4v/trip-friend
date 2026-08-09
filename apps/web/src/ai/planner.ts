import { z } from "zod"
import { type Brief, briefSchema, describeBrief, intakeProgress, readyToPlan } from "@/ai/brief"
import { type Itinerary, itinerarySchema, type Revision, revisionSchema } from "@/ai/itinerary"
import { parseModelJson } from "@/ai/json"
import { INTAKE_SYSTEM, ITINERARY_SYSTEM, REVISION_SYSTEM, SHORTLIST_SYSTEM } from "@/ai/prompts"
import { ask, type Message } from "@/kompass"

/**
 * Every model call the app makes.
 *
 * Server-side only, and enforced by construction rather than by the
 * `server-only` package — which would be a new dependency, and AGENTS.md is
 * clear that those are a human decision. Nothing here is reachable from a
 * client component: every caller is a server action in `src/trips/actions.ts`,
 * and the gateway token would have to cross that boundary for a leak to
 * happen.
 *
 * Lanes are chosen per call and not per app. Intake is a short exchange a user
 * is watching a spinner through, so it takes the fast lane; generating a
 * fourteen-day itinerary is the one request in the product genuinely worth
 * waiting for, so it takes the hard one.
 */

export const questionSchema = z.object({
  id: z.string().default("question"),
  prompt: z.string(),
  kind: z.enum(["choice", "multi", "text"]).default("text"),
  options: z
    .array(
      z.object({
        label: z.string(),
        value: z.string().default(""),
        emoji: z.string().default(""),
        hint: z.string().default(""),
      }),
    )
    .default([]),
})

export type Question = z.infer<typeof questionSchema>

const intakeTurnSchema = z.object({
  reply: z.string(),
  brief: briefSchema,
  question: questionSchema.nullable().default(null),
  ready: z.boolean().default(false),
})

export type IntakeTurn = z.infer<typeof intakeTurnSchema> & {
  progress: { answered: number; total: number }
}

/**
 * One turn of the questionnaire.
 *
 * The whole transcript goes back every time. It is short — a handful of
 * sentences — and re-sending it is what lets the model honour "actually, make
 * that two weeks" said five turns after the duration was settled.
 */
export async function intakeTurn(
  brief: Brief,
  transcript: readonly Message[],
  signal?: AbortSignal,
): Promise<IntakeTurn> {
  const primer: Message = {
    role: "user",
    content: [
      "Here is what you understand so far:",
      describeBrief(brief),
      "",
      "The brief JSON schema you must restate in full, with these keys:",
      BRIEF_SHAPE,
      "",
      transcript.length === 0
        ? "The traveller has not said anything yet. Open the conversation."
        : "Continue the conversation.",
    ].join("\n"),
  }

  const answer = await ask([primer, ...transcript], {
    lane: "kompass-fast",
    system: INTAKE_SYSTEM,
    maxTokens: 2000,
    signal,
  })

  const turn = parseModelJson(answer.text, intakeTurnSchema, "Reading your answers")

  // The model's own "ready" is advisory. It is enthusiastic, and a trip with
  // no destination and no duration is not plannable however ready it feels.
  const ready = turn.ready && readyToPlan(turn.brief)

  return {
    ...turn,
    ready,
    question: ready ? null : turn.question,
    progress: intakeProgress(turn.brief),
  }
}

const shortlistSchema = z.object({
  intro: z.string().default(""),
  options: z
    .array(
      z.object({
        name: z.string(),
        flag: z.string().default(""),
        bestFor: z.string().default(""),
        idealDuration: z.string().default(""),
        estimatedBudget: z.string().default(""),
        why: z.string().default(""),
        compromise: z.string().default(""),
      }),
    )
    .min(1),
})

export type Shortlist = z.infer<typeof shortlistSchema>

export async function recommendDestinations(
  brief: Brief,
  signal?: AbortSignal,
): Promise<Shortlist> {
  const answer = await ask([{ role: "user", content: describeBrief(brief) }], {
    lane: "kompass-agentic",
    system: SHORTLIST_SYSTEM,
    maxTokens: 3000,
    signal,
  })

  return parseModelJson(answer.text, shortlistSchema, "Choosing destinations")
}

/**
 * The big one.
 *
 * `kompass-hard` and a large token ceiling, because this is the request the
 * plan calls the product. A fourteen-day itinerary with alternatives and a
 * packing list is a long document, and the failure mode of too small a ceiling
 * is a truncated JSON that cannot be parsed at all — the user waits a minute
 * and gets an error, which is the worst outcome available.
 */
export async function generateItinerary(brief: Brief, signal?: AbortSignal): Promise<Itinerary> {
  const answer = await ask(
    [
      {
        role: "user",
        content: [
          describeBrief(brief),
          "",
          "Produce the itinerary as JSON in exactly this shape:",
          ITINERARY_SHAPE,
        ].join("\n"),
      },
    ],
    { lane: "kompass-hard", system: ITINERARY_SYSTEM, maxTokens: 16000, signal },
  )

  return parseModelJson(answer.text, itinerarySchema, "Building your itinerary")
}

/**
 * A conversational change.
 *
 * The itinerary is sent as a compact digest rather than in full: the model
 * needs to know what each day contains to decide which to touch, but re-reading
 * every alternative and every packing item on every "make Tuesday cheaper"
 * costs latency for nothing. Days it chooses to rewrite it rewrites whole, from
 * the digest plus the request, which is enough.
 */
export async function reviseItinerary(
  itinerary: Itinerary,
  brief: Brief,
  transcript: readonly Message[],
  signal?: AbortSignal,
): Promise<Revision> {
  const primer: Message = {
    role: "user",
    content: [
      "The traveller's original preferences:",
      describeBrief(brief),
      "",
      "Their current itinerary:",
      digest(itinerary),
      "",
      "A replacement day must be a complete day object in this shape:",
      DAY_SHAPE,
    ].join("\n"),
  }

  const answer = await ask([primer, ...transcript], {
    lane: "kompass-agentic",
    system: REVISION_SYSTEM,
    maxTokens: 8000,
    signal,
  })

  return parseModelJson(answer.text, revisionSchema, "Revising your itinerary")
}

/** The itinerary compressed to what a revision decision needs. */
function digest(itinerary: Itinerary): string {
  const days = itinerary.days
    .map((day) => {
      const items = day.items
        .map((item) => `    ${item.time || "--:--"} ${item.title}${cost(item.cost)}`)
        .join("\n")
      return `  Day ${day.day} — ${day.title} (base: ${day.base || "n/a"}, pace: ${day.pace})\n${items}`
    })
    .join("\n")

  const budget = itinerary.budget.lines
    .map((line) => `  ${line.category}: ${line.amount}`)
    .join("\n")

  return [
    `${itinerary.title} — ${itinerary.destination}, ${itinerary.days.length} days`,
    days,
    `Budget (${itinerary.budget.currency}):`,
    budget,
    `Match: ${itinerary.match.score}%`,
  ].join("\n")
}

function cost(value: number | null): string {
  return value === null ? "" : ` [${value}]`
}

/**
 * Shapes shown to the model.
 *
 * Hand-written rather than generated from the zod schemas. A generated JSON
 * Schema is accurate and unreadable, and models follow a short annotated
 * example far more reliably than they follow a hundred lines of
 * "additionalProperties": false. The zod schemas remain the enforcement; these
 * are only the instruction.
 */
const BRIEF_SHAPE = `{
  "destination": "Japan" | null,
  "destinationCandidates": ["Portugal", "Italy"],
  "destinationCertainty": "exact" | "ideas" | "open" | "unknown",
  "dates": { "kind": "exact"|"month"|"season"|"flexible"|"unknown", "start": "2026-04-02"|null, "end": null, "description": "anytime this summer" },
  "durationDays": 10 | null,
  "travellers": { "kind": "family", "adults": 2, "children": 1, "childAges": [10] },
  "interests": ["culture", "food"],
  "pace": "relaxed" | "balanced" | "packed" | null,
  "budget": { "amount": 5000 | null, "currency": "EUR", "basis": "total"|"per_person"|"daily"|"none", "note": "" },
  "accommodation": ["4-star", "central"],
  "transport": ["trains", "walking"],
  "food": { "importance": "loves local food", "dietary": ["vegetarian"] },
  "mustDo": ["Mount Fuji"],
  "mustAvoid": ["early mornings"],
  "notes": ""
}`

const DAY_SHAPE = `{
  "day": 3,
  "date": "2026-04-04" | null,
  "title": "Traditional Tokyo",
  "base": "Tokyo",
  "summary": "one sentence",
  "pace": "relaxed"|"balanced"|"packed",
  "walking": "low"|"moderate"|"high",
  "estimatedCost": 180,
  "items": [{
    "time": "10:00",
    "kind": "activity"|"meal"|"transport"|"rest"|"lodging",
    "title": "Senso-ji Temple",
    "emoji": "⛩️",
    "description": "one or two sentences",
    "durationMinutes": 90,
    "cost": 0,
    "place": { "name": "Senso-ji, Asakusa", "lat": 35.7148, "lng": 139.7967 },
    "travelMinutes": 20,
    "travelMode": "metro",
    "booking": "" or "book two weeks ahead",
    "why": "the specific reason for this choice",
    "alternatives": [{ "title": "Ueno Park", "why": "...", "cost": 0 }]
  }]
}`

const ITINERARY_SHAPE = `{
  "title": "10-Day Japan Family Adventure",
  "destination": "Japan",
  "headline": "one sentence describing the trip's character",
  "style": "Culture + food + relaxed",
  "travellersSummary": "2 adults + 1 child",
  "period": "Early April 2026",
  "days": [ ${DAY_SHAPE} ],
  "budget": {
    "currency": "EUR",
    "lines": [{ "category": "Accommodation", "amount": 2000 }, { "category": "Food", "amount": 1200 }],
    "low": 4800, "high": 6400
  },
  "match": { "score": 92, "compromises": ["your preferred hotel area adds 15 minutes a day"] },
  "lodging": [{ "name": "…", "area": "Asakusa", "nights": 4, "why": "…", "place": { "name": "…", "lat": 35.71, "lng": 139.79 } }],
  "packingList": [{ "item": "2-pin type A adapter", "why": "Japan's sockets" }],
  "preTripChecklist": [{ "task": "Reserve Ghibli Museum tickets", "urgency": "now"|"soon"|"before_departure", "why": "they sell out a month ahead" }]
}`
