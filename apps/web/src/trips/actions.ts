"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { briefHeadline } from "@/ai/brief"
import { applyRevision } from "@/ai/itinerary"
import { generateItinerary, intakeTurn, recommendDestinations, reviseItinerary } from "@/ai/planner"
import { auth } from "@/auth"
import { recordEvent } from "@/db/events"
import {
  appendMessage,
  createTrip,
  deleteTrip,
  getTrip,
  listMessages,
  saveTrip,
  type Trip,
  toModelMessages,
} from "@/trips/store"

/**
 * Everything the browser can ask the server to do.
 *
 * Each action re-checks the session rather than trusting the proxy. The proxy
 * closes the routes, but a server action is its own POST endpoint reachable by
 * its id — belt and braces is the right amount of care for something that
 * spends money at a model gateway on every call.
 */

async function requireOperator(): Promise<string> {
  const session = await auth()
  const email = session?.user?.email
  if (!email) redirect("/login")
  return email
}

async function requireTrip(id: string): Promise<Trip> {
  const trip = await getTrip(id)
  if (!trip) redirect("/")
  return trip
}

/**
 * Model failures are returned, never thrown past the action boundary.
 *
 * A thrown error in a server action becomes Next's error page, which loses the
 * conversation the user was in the middle of. A returned message keeps them on
 * the page with their transcript intact and a retry button.
 */
export type ActionResult = { ok: true } | { ok: false; error: string }

function failed(error: unknown): ActionResult {
  const message = error instanceof Error ? error.message : "Something went wrong."
  console.error("trip action failed", error)
  return { ok: false, error: message }
}

/**
 * Start a trip, and let the planner speak first.
 *
 * The opening question is asked here rather than on the trip page, for two
 * reasons. A model call on a GET would fire again on every reload, and an
 * empty chat box under the words "tell me about your dream vacation" puts the
 * burden of starting on the traveller — which is the opposite of what §3
 * describes. It is a fast-lane call the traveller asked for by pressing the
 * button.
 *
 * If it fails, the trip still exists and still works; they just have to open
 * the conversation themselves.
 */
export async function startTripAction(): Promise<void> {
  const operator = await requireOperator()
  const trip = await createTrip()
  await recordEvent("trip_started", operator, trip.id)

  try {
    const turn = await intakeTurn(trip.brief, [])
    await appendMessage(trip.id, {
      role: "assistant",
      channel: "intake",
      content: turn.reply,
      question: turn.question,
    })
    await saveTrip(trip.id, { brief: turn.brief })
  } catch (error) {
    console.error("could not open the conversation", error)
  }

  redirect(`/trips/${trip.id}`)
}

/**
 * One turn of the intake conversation.
 *
 * The user's message is written before the model is called, so a gateway
 * failure loses nothing — the transcript still holds what they said. That is
 * also why an empty `answer` is a legitimate call rather than a no-op: it
 * means "try that again", and re-runs the turn against the transcript as it
 * already stands instead of duplicating the message that failed.
 */
export async function answerIntakeAction(tripId: string, answer: string): Promise<ActionResult> {
  const operator = await requireOperator()
  const trip = await requireTrip(tripId)

  const said = answer.trim()
  if (said) {
    await appendMessage(tripId, { role: "user", channel: "intake", content: said })
  }

  try {
    const history = await listMessages(tripId, "intake")
    const turn = await intakeTurn(trip.brief, toModelMessages(history))

    await appendMessage(tripId, {
      role: "assistant",
      channel: "intake",
      content: turn.reply,
      question: turn.question,
    })

    await saveTrip(tripId, {
      brief: turn.brief,
      title: briefHeadline(turn.brief) || trip.title,
      // "Ready" only moves the trip on; it never plans without being asked,
      // because generating an itinerary is slow and the user should choose
      // when to spend that minute.
      phase: turn.ready ? "shortlist" : "intake",
    })

    revalidatePath(`/trips/${tripId}`)
    return { ok: true }
  } catch (error) {
    await recordEvent("plan_failed", operator, `intake ${tripId}`)
    return failed(error)
  }
}

export async function suggestDestinationsAction(tripId: string): Promise<ActionResult> {
  const operator = await requireOperator()
  const trip = await requireTrip(tripId)

  try {
    const shortlist = await recommendDestinations(trip.brief)
    await saveTrip(tripId, { shortlist, phase: "shortlist" })
    revalidatePath(`/trips/${tripId}`)
    return { ok: true }
  } catch (error) {
    await recordEvent("plan_failed", operator, `shortlist ${tripId}`)
    return failed(error)
  }
}

export async function chooseDestinationAction(
  tripId: string,
  destination: string,
): Promise<ActionResult> {
  await requireOperator()
  const trip = await requireTrip(tripId)

  const brief = { ...trip.brief, destination, destinationCertainty: "exact" as const }
  await saveTrip(tripId, { brief, title: briefHeadline(brief) })
  revalidatePath(`/trips/${tripId}`)
  return { ok: true }
}

export async function generateItineraryAction(tripId: string): Promise<ActionResult> {
  const operator = await requireOperator()
  const trip = await requireTrip(tripId)

  try {
    const itinerary = await generateItinerary(trip.brief)
    await saveTrip(tripId, { itinerary, phase: "planned", title: itinerary.title })
    await recordEvent("trip_planned", operator, `${tripId} — ${itinerary.destination}`)
    revalidatePath(`/trips/${tripId}`)
    return { ok: true }
  } catch (error) {
    await recordEvent("plan_failed", operator, `itinerary ${tripId}`)
    return failed(error)
  }
}

/**
 * "Make day four cheaper", and the rest of section 28.
 *
 * The revision is applied here rather than in the model's own head: it returns
 * the days it changed and `applyRevision` folds them in, so a reply that says
 * it removed a day but forgets to renumber the rest cannot leave the itinerary
 * inconsistent.
 */
export async function askAssistantAction(tripId: string, question: string): Promise<ActionResult> {
  const operator = await requireOperator()
  const trip = await requireTrip(tripId)

  if (!trip.itinerary) return { ok: false, error: "There is no itinerary to change yet." }

  // Empty means "try that again", as in the intake conversation: the request
  // that failed is already the last message in the transcript, and appending
  // it a second time would ask for the change twice.
  const said = question.trim()
  if (said) {
    await appendMessage(tripId, { role: "user", channel: "assistant", content: said })
  }

  try {
    const history = await listMessages(tripId, "assistant")
    if (history.length === 0) return { ok: true }
    const revision = await reviseItinerary(trip.itinerary, trip.brief, toModelMessages(history))
    const updated = applyRevision(trip.itinerary, revision)

    await appendMessage(tripId, {
      role: "assistant",
      channel: "assistant",
      content: revision.reply,
    })
    await saveTrip(tripId, { itinerary: updated, title: updated.title })
    await recordEvent("trip_revised", operator, `${tripId} — ${said.slice(0, 120) || "(retry)"}`)

    revalidatePath(`/trips/${tripId}`)
    return { ok: true }
  } catch (error) {
    await recordEvent("plan_failed", operator, `revision ${tripId}`)
    return failed(error)
  }
}

export async function deleteTripAction(tripId: string): Promise<void> {
  const operator = await requireOperator()
  await deleteTrip(tripId)
  await recordEvent("trip_deleted", operator, tripId)
  redirect("/")
}
