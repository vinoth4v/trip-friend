import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

/**
 * Append-only record of things worth knowing after the fact: sign-ins,
 * failed sign-ins, and whatever the app built on this template adds.
 *
 * A single-operator app has no admin console, so this table is the only
 * place a past event is recoverable from.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    kind: text("kind").notNull(),
    actor: text("actor"),
    detail: text("detail"),
  },
  (table) => [index("audit_log_at_idx").on(table.at)],
)

export type AuditLogRow = typeof auditLog.$inferSelect
export type NewAuditLogRow = typeof auditLog.$inferInsert

/**
 * One planned trip.
 *
 * `brief`, `shortlist` and `itinerary` are jsonb rather than a spread of
 * columns, and that is the central data decision here. The model produces
 * these documents whole; they are read whole, rewritten whole, and never
 * queried by their interior. Normalising a day's ninth activity into rows
 * would buy query shapes this app does not have and cost a migration every
 * time the itinerary grows a field. The shape is enforced instead by the zod
 * schemas in `src/ai/` — at the boundary where untrusted model output enters,
 * which is the only place enforcement actually helps.
 *
 * `phase` says which screen the trip is on: intake -> shortlist -> planned.
 * `share_token` is the unguessable half of a public read-only URL; it is
 * generated for every trip so sharing never needs a schema change, and the
 * row is only reachable by someone holding the token.
 */
export const trip = pgTable(
  "trip",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    title: text("title").notNull(),
    phase: text("phase").notNull().default("intake"),
    shareToken: text("share_token").notNull().unique(),
    brief: jsonb("brief"),
    shortlist: jsonb("shortlist"),
    itinerary: jsonb("itinerary"),
  },
  (table) => [index("trip_updated_at_idx").on(table.updatedAt)],
)

export type TripRow = typeof trip.$inferSelect
export type NewTripRow = typeof trip.$inferInsert

/**
 * The conversation, kept in full.
 *
 * Both conversations live here — the intake questionnaire and the later
 * "make day four cheaper" assistant — separated by `channel`, because they
 * are the same kind of thing and a second table would only duplicate the
 * columns. The transcript is what the model is re-shown on every turn, so
 * losing it would mean losing the trip's context, not merely its history.
 *
 * `question` carries the structured choices attached to an assistant turn, so
 * a reloaded page can re-render the buttons instead of degrading to a text box.
 */
export const tripMessage = pgTable(
  "trip_message",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trip.id, { onDelete: "cascade" }),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    channel: text("channel").notNull(),
    role: text("role").notNull(),
    content: text("content").notNull(),
    question: jsonb("question"),
  },
  (table) => [index("trip_message_trip_idx").on(table.tripId, table.at)],
)

export type TripMessageRow = typeof tripMessage.$inferSelect
export type NewTripMessageRow = typeof tripMessage.$inferInsert
