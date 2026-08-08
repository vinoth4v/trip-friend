# trip-friend

A travel AI that understands how you like to travel—not just where you want to go—and continuously plans, optimizes and adapts your vacation around you.

Tell it how you want your vacation to feel; it works out the trip. A few
conversational questions, then a day-by-day itinerary with times, costs,
reasons, alternatives, a map, a budget and a pre-departure checklist — which
you can then change by talking to it.

Scaffolded from werft-template. Conventions and hard rules live in AGENTS.md;
how this app is put together, and why, lives in `docs/ARCHITECTURE.md`.

```bash
pnpm install
pnpm dev
```

Environment lives in `apps/web/.env.local`; `apps/web/.env.example` lists what
is needed. Run `pnpm hash-password` to set the operator password. Planning
needs `KOMPASS_BASE_URL` and `KOMPASS_TOKEN` — without them the app signs you
in and can do nothing else.
