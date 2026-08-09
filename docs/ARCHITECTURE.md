# trip-friend — architecture

How this app works, in its current form. Rewritten whenever the design
changes, so it describes the present rather than accumulating history —
that is SESSIONS.md's job.

## Purpose

A travel AI that understands how you like to travel—not just where you want to go—and continuously plans, optimizes and adapts your vacation around you.

In practice: a traveller says something vague, the app asks a handful of
questions, and out comes a day-by-day itinerary with times, costs, reasons,
alternatives, a map, a budget and a pre-departure checklist — which can then be
changed by talking to it.

## Domain model

**Trip** — one planned holiday, and the only aggregate. A trip moves through
three phases: `intake` (still being understood), `shortlist` (understood well
enough to plan, possibly still choosing where), `planned` (has an itinerary).
Nothing skips a phase, and nothing goes backwards; a trip whose itinerary is
being revised stays `planned`.

**Brief** — what the app has understood about the traveller's wishes. Where,
when, how long, who, interests, pace, budget, accommodation, transport, food,
must-do, must-avoid. Every field is optional, because the brief is built a turn
at a time and there is never a moment when it must be complete. It is the input
to every model call, and it survives the itinerary — a revision is checked
against the *original* preferences so that making a trip cheaper does not
quietly make it a different trip.

**Itinerary** — the artefact. Days, each with an ordered list of items; an item
is an activity, meal, transport, rest or lodging with a time, a duration, a
cost, a place (optionally with coordinates), a booking note, a *reason*, and
alternatives. Plus a budget broken into categories with an uncertainty range, a
packing list, a pre-trip checklist, the lodging, and a match score with its
honest compromises.

**Conversation** — two of them per trip, distinguished by channel. `intake` is
the questionnaire; `assistant` is the "make day four cheaper" chat that comes
after. They are the same kind of thing and share a table.

**Revision** — what a change request returns: the days that changed, in full,
plus optionally a new budget and match score. Not a whole itinerary. Applying
one is pure code, not a model's own bookkeeping.

## Data model

Three tables. `audit_log` came with the template; the other two arrived in
`0001_conscious_shotgun.sql`.

**`audit_log`** (`0000_audit_log.sql`) — append-only events. This app adds
`trip_started`, `trip_planned`, `trip_revised`, `trip_deleted`,
`trip_exported` and `plan_failed` to the template's sign-in kinds.
`plan_failed` is the one that earns its keep: gateway failures are otherwise
invisible, because they are handled gracefully in the UI. `trip_exported` is
written only for the operator's own PDF download — never for a share link's,
because a public URL that writes a row per request is a way to fill a table
from outside.

**`trip`** (`0001`) — `id`, `created_at`, `updated_at`, `title`, `phase`,
`share_token` (unique), and three `jsonb` columns: `brief`, `shortlist`,
`itinerary`. Indexed on `updated_at`, which is the only order the trip list
uses.

The `jsonb` is the central decision. These documents are produced whole by a
model, read whole, and rewritten whole; nothing queries their interior.
Normalising an itinerary into `day`, `item` and `alternative` tables would buy
query shapes this app does not have, and cost a migration every time the
itinerary grows a field — which, during a build, is weekly. The shape is
enforced instead by zod at the boundary where model output enters, and again on
read, so a row written against last week's schema degrades into a valid
document with defaults rather than crashing a page.

**`trip_message`** (`0001`) — `trip_id` (cascade delete), `at`, `channel`
(`intake` | `assistant`), `role`, `content`, and `question` as `jsonb`.
Indexed on `(trip_id, at)`. The transcript is not history: it is re-sent to the
model on every turn, and is what lets "actually, make that two weeks" override
an answer given five questions earlier. `question` stores the structured
choices attached to an assistant turn so a reloaded page re-renders the buttons
instead of degrading to a bare text box.

## Surfaces

Everything is behind the operator gate except `/s/[token]`.

| Route | What it is |
|---|---|
| `/` | Hero, "Plan my trip", and the list of saved trips. |
| `/trips/[id]` | The trip. Renders by phase: the intake conversation, then the shortlist and overview, then the itinerary with its tabs and the trip assistant. `?tab=itinerary\|map\|budget\|bookings`. |
| `/trips/[id]/day/[day]` | One day in full — descriptions, reasons, alternatives, and a map of just that day. |
| `/trips/[id]/itinerary.pdf` | The itinerary as a downloadable PDF. Route handler, not a page; re-checks the session itself. |
| `/s/[token]` | **Public.** A read-only itinerary. Exempted in `src/proxy.ts`. |
| `/s/[token]/itinerary.pdf` | **Public.** The same PDF, on the same terms as the page it hangs off. |
| `/login`, `/api/auth/*` | The template's gate, unchanged. |

Server actions, all in `src/trips/actions.ts`, all re-checking the session
rather than trusting the proxy — a server action is its own POST endpoint, and
each of these spends money at a gateway:

`startTripAction`, `answerIntakeAction`, `suggestDestinationsAction`,
`chooseDestinationAction`, `generateItineraryAction`, `askAssistantAction`,
`deleteTripAction`.

The four that call a model return `{ ok: false, error }` instead of throwing,
so a gateway 429 leaves the traveller on the page with their conversation
intact and a retry button, rather than on Next's error page with nothing.

Client components are deliberately few: `Chat` (transcript, choices, pending
state) and `ActionButton` (the slow calls). Everything else — the timeline, the
map, the budget, the checklists — is server-rendered and ships no JavaScript.

## External services

| Service | Configured by | Used for |
|---|---|---|
| Neon Postgres | `DATABASE_URL` | Trips, conversations, audit log. Via Drizzle. |
| Kompass gateway | `KOMPASS_BASE_URL`, `KOMPASS_TOKEN` | Every model call. Required — the app is a model call with a UI around it. |
| Auth.js | `AUTH_SECRET`, `WERFT_USER_EMAIL`, `WERFT_PASSWORD_HASH` | The single-operator gate. |

Lanes, chosen per call in `src/ai/planner.ts`:

- `kompass-fast` — each intake turn. Short exchange, traveller watching a spinner.
- `kompass-agentic` — destination shortlist, and revisions.
- `kompass-hard`, 16k tokens — generating an itinerary. The one request in the
  product genuinely worth waiting for.

There is **no map tile provider, no weather API and no booking integration**.
See known gaps.

## Decisions in force

**Model output is parsed, never trusted.** Every call asks for JSON and every
reply goes through `extractJson` (which forgives fences and preamble) and then
a zod schema. Schemas are generous — optional-with-default nearly everywhere —
because a model that omits `walking` on day seven should cost that day a badge,
not cost the traveller the itinerary. What is *not* forgiven is malformed JSON:
a truncated document cannot be repaired without guessing, and a guessed
itinerary is worse than an honest error.

**The brief is restated whole each turn, not patched.** A patch protocol would
need the model to distinguish "unchanged" from "no longer true", which it does
unreliably. Re-stating a small document is something it does well.

**A revision returns days, not itineraries.** Section 18 of the plan asks for
only the affected parts, and there is a hard reason to obey: a fourteen-day
itinerary is larger than a comfortable reply, so a full regeneration risks a
truncated document that fails to parse — losing the trip the traveller was
adjusting. A day is the smallest unit that stays internally consistent once
times shift. `applyRevision` folds the days in, renumbers, and refuses to empty
the itinerary however enthusiastically it is asked.

**The model's "ready" is advisory.** It is enthusiastic. `readyToPlan` requires
a destination *or* an explicit "surprise me", a duration, and who is coming —
and nothing else. Budget and pace have sane defaults and never block, because
refusing to plan "a week somewhere warm" would be exactly the travel-booking-form
behaviour the plan exists to forbid.

**Generating an itinerary is always a button press.** Never a side effect of
answering the last question. It takes the better part of a minute and real
money; the traveller chooses when to spend it.

**The budget total is summed, never taken from the model.** A stated total that
disagrees with its own lines is the one arithmetic error models make reliably,
and it is the number a traveller checks first.

**The map is a projected SVG, not tiles.** Every tile source worth using needs
an API key, a billing relationship and a client-side script — to draw, for a
walking day in one neighbourhood, a dozen dots and the lines between them. Web
Mercator so a day in Reykjavík is not a vertical smear; aspect ratio preserved
so two stops down the road do not look like two cities. It renders on the
server and cannot leak a key. It cannot show streets.

**Share is a token in the URL.** A trip you cannot send to the people you are
going with is not much of a trip, and they do not have the operator's password.
128 bits from the platform CSPRNG, checked against one row, `noindex`,
read-only, 404 for anything unfinished — and shape-checked before the query, so
junk in the URL costs a regex rather than a database round trip. This is the
only route an unauthenticated stranger can make the app do work on.

**The PDF is written by hand, not by a library.** No PDF library is on
AGENTS.md's blessed list, and adding one is a decision to raise rather than
take quietly. It turns out not to be much of a sacrifice: a printable document
with the standard fonts, no images and no transparency is a couple of hundred
lines of a format that has been stable since 1993. `src/pdf/` is three pieces —
`text.ts` (WinAnsi encoding, Helvetica's own width tables, word wrap),
`document.ts` (pages, a cursor, and the byte serializer), `itinerary.ts` (the
layout). The whole file is assembled as a string of one byte per character so
that a cross-reference offset is a string index; mixing in a `Uint8Array`
partway would mean two ideas of "how long is this so far", and the xref table
is unforgiving about which one is right.

**The printed itinerary is a different document from the screen one.** The web
version has tabs, links into a day and `<details>` a reader can open; none of
that survives printing. The PDF is linear, with everything visible — an "at a
glance" list of days at the front, then every day in full including the
alternatives the screen keeps collapsed, then the budget, lodging, packing list
and checklist. It is written to be carried: a traveller with no signal should
be able to read the day off a folded sheet. The map is the one thing left
behind; dots without streets are a navigational aid only next to a phone, and a
phone can open the app.

**Design tokens only.** No literal colour, spacing or font value in
`globals.css`. The bare lengths that remain are layout measures — column
widths, the timeline gutter — matching the `max-width: 40rem` the template
already sets on `main`.

## Known gaps

**No weather, and therefore no weather adaptation** (plan §19). The itinerary
is planned once against typical conditions for the season. Wiring a forecast in
would mean a new external service and a re-planning trigger; both are real
decisions, not oversights.

**No live travel data** (§20) — no flights, train times, opening hours,
availability or local events. Booking notes are the model's recollection of
what needs reserving, which is useful and is not a reservation system.

**The map has no streets.** Distances shown are as the crow flies, and the
route line is straight. It answers "is this day a lot of criss-crossing?" and
nothing more.

**No calendar view.** The plan's §22 offers LIST | MAP | CALENDAR; the tabs
here are Itinerary | Map | Budget | Bookings. A calendar of a ten-day trip is a
list with more whitespace, so the fourth tab went to the thing with no other
home.

**Alternatives are shown, not one-click swappable.** Each is listed with its
reason and cost, and swapping one in is a sentence to the assistant. A
"Replace" button would need the same model call with a narrower prompt; worth
doing, not yet done.

**No persistent traveller profile** (§29). Preferences live on the trip, so
"plan another trip like our Japan one" means saying so, not loading a profile.

**No collaborative planning, no during-trip companion, no photo album** (§35).
Those are the product's stated destination, not the MVP.

**The PDF cannot draw what Helvetica cannot.** The standard fonts are drawn
through an 8-bit encoding, so the printed copy holds Latin-1 and the typography
the model actually writes (curly quotes, dashes, ellipses), transliterates
accents outside it — Rīga prints as Riga — and drops emoji and non-Latin
scripts entirely rather than substituting a "?" for them. A place name given
only in Japanese is therefore missing from the PDF while present on screen.
Fixing it means embedding a font with a wide repertoire and writing a CID
encoder, which is a much larger piece of work than everything in `src/pdf/`
put together.

**The PDF is uncompressed and has no map.** A three-week itinerary is a few
hundred kilobytes, which is nothing to download and a great deal easier to
debug than a Flate stream. The map is left out on purpose (see above).

**No test covers the Drizzle queries.** Mocking Drizzle would only assert that
the mock was called. The queries are exercised for real against the PR's own
Neon preview branch.
