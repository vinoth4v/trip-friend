import { desc, eq } from "drizzle-orm"
import { type Brief, briefSchema, emptyBrief } from "@/ai/brief"
import { type Itinerary, itinerarySchema } from "@/ai/itinerary"
import type { Question, Shortlist } from "@/ai/planner"
import { db } from "@/db/client"
import { trip, tripMessage } from "@/db/schema"
import type { Message } from "@/kompass"

/**
 * Reading and writing trips.
 *
 * The jsonb columns come back as `unknown`, and every one of them is put
 * through its zod schema on the way out. That is not belt-and-braces: the
 * documents were written by a model, and a schema that gained a field last
 * week means rows written before it are missing that field today. Parsing on
 * read makes an old row degrade into a valid one with defaults instead of
 * crashing a page.
 */

export type Phase = "intake" | "shortlist" | "planned"

export type Trip = {
  id: string
  title: string
  phase: Phase
  shareToken: string
  brief: Brief
  shortlist: Shortlist | null
  itinerary: Itinerary | null
  createdAt: Date
  updatedAt: Date
}

export type Channel = "intake" | "assistant"

export type TripMessage = {
  id: string
  role: "user" | "assistant"
  channel: Channel
  content: string
  question: Question | null
  at: Date
}

/**
 * 32 hex characters from the platform's CSPRNG.
 *
 * The share URL is the only credential protecting a shared itinerary — there
 * is no second user to grant access to — so it has to be unguessable rather
 * than merely unique. `randomUUID` would also do, but reads like an id and
 * invites someone to later "tidy up" by using the trip's actual id.
 */
export function newShareToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
}

function toTrip(row: typeof trip.$inferSelect): Trip {
  return {
    id: row.id,
    title: row.title,
    phase: (["intake", "shortlist", "planned"] as const).includes(row.phase as Phase)
      ? (row.phase as Phase)
      : "intake",
    shareToken: row.shareToken,
    brief: safeParse(briefSchema, row.brief) ?? emptyBrief,
    shortlist: row.shortlist as Shortlist | null,
    itinerary: safeParse(itinerarySchema, row.itinerary),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function safeParse<T>(
  schema: { safeParse: (value: unknown) => { success: boolean; data?: T } },
  value: unknown,
): T | null {
  if (value === null || value === undefined) return null
  const parsed = schema.safeParse(value)
  return parsed.success ? (parsed.data as T) : null
}

export async function createTrip(): Promise<Trip> {
  const [row] = await db()
    .insert(trip)
    .values({ title: "New trip", shareToken: newShareToken(), brief: emptyBrief })
    .returning()

  if (!row) throw new Error("Could not start a trip: the database accepted no row.")
  return toTrip(row)
}

export async function getTrip(id: string): Promise<Trip | null> {
  const [row] = await db().select().from(trip).where(eq(trip.id, id)).limit(1)
  return row ? toTrip(row) : null
}

/** The shape `newShareToken` produces, and the only shape worth a query. */
const SHARE_TOKEN = /^[0-9a-f]{32}$/

export function isShareToken(value: string): boolean {
  return SHARE_TOKEN.test(value)
}

/**
 * The share route is public, so it is the one place an unauthenticated
 * stranger can make this app do work. Checking the shape first means junk in
 * the URL costs a regex rather than a database round trip, and — since it is
 * the only unauthenticated read — that is the difference between a crawler
 * being harmless and a crawler being a load test.
 */
export async function getTripByShareToken(token: string): Promise<Trip | null> {
  if (!isShareToken(token)) return null

  const [row] = await db().select().from(trip).where(eq(trip.shareToken, token)).limit(1)
  return row ? toTrip(row) : null
}

export async function listTrips(): Promise<Trip[]> {
  const rows = await db().select().from(trip).orderBy(desc(trip.updatedAt)).limit(50)
  return rows.map(toTrip)
}

export async function saveTrip(
  id: string,
  patch: Partial<Pick<Trip, "title" | "phase" | "brief" | "shortlist" | "itinerary">>,
): Promise<void> {
  await db()
    .update(trip)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(trip.id, id))
}

export async function deleteTrip(id: string): Promise<void> {
  await db().delete(trip).where(eq(trip.id, id))
}

export async function appendMessage(
  tripId: string,
  message: {
    role: "user" | "assistant"
    channel: Channel
    content: string
    question?: Question | null
  },
): Promise<void> {
  await db()
    .insert(tripMessage)
    .values({
      tripId,
      role: message.role,
      channel: message.channel,
      content: message.content,
      question: message.question ?? null,
    })
}

export async function listMessages(tripId: string, channel: Channel): Promise<TripMessage[]> {
  const rows = await db()
    .select()
    .from(tripMessage)
    .where(eq(tripMessage.tripId, tripId))
    .orderBy(tripMessage.at)

  return rows
    .filter((row) => row.channel === channel)
    .map((row) => ({
      id: row.id,
      role: row.role === "user" ? "user" : "assistant",
      channel: row.channel as Channel,
      content: row.content,
      question: (row.question as Question | null) ?? null,
      at: row.at,
    }))
}

/**
 * The transcript in the shape the gateway wants.
 *
 * Only the text goes back to the model; the structured `question` does not,
 * because the assistant's own text already contains it and sending both
 * teaches the model to repeat itself.
 */
export function toModelMessages(messages: readonly TripMessage[]): Message[] {
  return messages.map((message) => ({ role: message.role, content: message.content }))
}
