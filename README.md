# trip-friend

A travel AI that understands how you like to travel — not just where you want
to go — and continuously plans, optimizes and adapts your vacation around you.

Tell it how you want your vacation to feel; it works out the trip. A few
conversational questions, then a day-by-day itinerary with times, costs,
reasons, alternatives, a map, a budget and a pre-departure checklist — which
you can then change by talking to it.

Single-operator app: one person signs in with one email and password, plans
their own trips, and can share a read-only link to each one. Not a multi-user
product.

## What works today

- **Conversational intake** — a short back-and-forth to understand where,
  when, how long, who, interests, pace, budget, accommodation, transport,
  food, and any must-do or must-avoid.
- **Destination shortlisting** — when the traveller hasn't picked a place yet,
  the app suggests some, each with a reason.
- **Generated itinerary** — a day-by-day plan: activities, meals, transport,
  rest and lodging, each with a time, cost, place, and *why it's there*, plus
  alternatives.
- **Budget** — totals summed from the itinerary's own line items, broken into
  categories, with an uncertainty range.
- **Map** — a server-rendered SVG per day, showing the shape of the day (no
  tiles, no streets, no API key).
- **Pre-trip checklist and packing list.**
- **Conversational revision** — "make day four cheaper", "swap the museum for
  something outdoors" — the assistant changes only the affected days and
  keeps the rest of the trip intact.
- **Share a trip** — an unguessable link (`/s/<token>`) gives a read-only view
  to people who don't have the operator's password.
- **Everything else behind a sign-in gate** — one operator, one password hash,
  set through `pnpm hash-password`.

Full detail on how each of these is built — the domain model, the data model,
routes, and the reasoning behind the non-obvious calls — lives in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## What doesn't (yet)

- No weather awareness — an itinerary is planned once against typical
  conditions for the season, not re-planned against a forecast.
- No live travel data — no flights, train times, opening hours, or real
  availability. Booking notes are the model's recollection of what needs
  reserving, not a reservation system.
- The map has no streets — distances are as the crow flies.
- No calendar view.
- Alternatives are listed but not one-click swappable — swapping one in today
  is a sentence to the assistant, not a button.
- No persistent traveller profile — "plan another trip like our Japan one"
  means saying so, not loading a profile.
- No collaborative planning, no during-trip companion, no photo album.

See "Known gaps" in `docs/ARCHITECTURE.md` for the reasoning behind each.

## Running it locally

```bash
pnpm install
pnpm dev
```

Environment lives in `apps/web/.env.local`; `apps/web/.env.example` lists
what's needed:

- `DATABASE_URL` — a Neon Postgres connection string.
- `AUTH_SECRET` — session signing key (`openssl rand -base64 32`).
- `WERFT_USER_EMAIL` / `WERFT_PASSWORD_HASH` — the one operator's login.
  Generate the hash with `pnpm hash-password '<your password>'`.
- `KOMPASS_BASE_URL` / `KOMPASS_TOKEN` — the model gateway. Required, not
  optional: planning a trip *is* the app, and every screen past the first
  question needs a model call. Without these the app signs you in and can do
  nothing else.

## Checks

```bash
pnpm build      # must exit 0 — this is the gate that matters
pnpm typecheck
pnpm test       # Vitest, unit only
pnpm test:e2e   # Playwright smoke — needs `pnpm build` first
pnpm lint
```

## More

- [`AGENTS.md`](AGENTS.md) — conventions and hard rules for working in this
  repo (this app was scaffolded from werft-template).
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how the app is put
  together, and why, as of right now.
- [`docs/SESSIONS.md`](docs/SESSIONS.md) — append-only history of what was
  built, decided, and rejected, session by session.
