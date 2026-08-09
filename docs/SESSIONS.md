# trip-friend — session log

One entry per build session, newest last. Append; never edit an existing
entry, for the same reason migrations are append-only — a corrected record of
what was decided is no longer a record.

Each entry answers: what was asked, what changed, what was decided and why,
what was rejected, and what is still open.

---

## Scaffolded

**Asked:** create the app.

**Changed:** scaffolded from werft-template — App Router, single-operator
auth, Neon via Drizzle, design tokens, the PR gates, and `@claude` wired to
the operator's Claude subscription.

**Decided:** nothing yet beyond the template's own choices, which are in
AGENTS.md.

**Open:** everything the app is actually for. See ARCHITECTURE.md, which is
still a set of empty headings until the first feature lands.

---

## The MVP — conversational planner end to end

**Asked:** issue #1, "Build this app according to the plan below" — the
AI Vacation Itinerary Planner user story, thirty-five sections of it, with an
explicit MVP list in §34.

**Changed:** the whole app. Two new tables (`0001`), an AI layer, seven
screens, a public share route, 89 unit tests and four smoke tests.

- `src/ai/` — `brief.ts` (what we understand, and when it is enough),
  `itinerary.ts` (the artefact, plus `applyRevision`), `json.ts` (getting JSON
  out of a model that fenced it), `prompts.ts` (the product, really),
  `planner.ts` (the four gateway calls).
- `src/trips/` — `store.ts` and the server actions.
- `src/components/` — chat, timeline, SVG map, budget, bookings, shortlist.
- Routes: `/`, `/trips/[id]`, `/trips/[id]/day/[day]`, `/s/[token]`.

Against §34's MVP list: all thirteen are in. Conversational questionnaire,
destination recommendation, duration, traveller profile, budget, travel style,
activity preferences, generated itinerary, day-by-day timeline, map, budget
estimation, conversational modification, save and share. Packing list, pre-trip
checklist, per-item reasons, alternatives and the match score came along
because the itinerary schema was being written anyway and they are three fields
each.

**Decided** (the reasoning is in ARCHITECTURE.md; the short version):

- *`jsonb` for brief, shortlist and itinerary.* They are written whole, read
  whole, and never queried by their interior. Normalising them would cost a
  migration per schema change during exactly the phase where the schema changes
  weekly, and buy query shapes this app does not have.
- *Revisions return days, not itineraries.* Both because §18 asks for it and
  because a full fourteen-day regeneration risks truncation — which would lose
  the trip the traveller was trying to adjust.
- *`readyToPlan` is deliberately lenient.* Destination-or-"surprise me",
  duration, who. Budget and pace never block. Requiring more would have
  rebuilt the travel form §31 forbids.
- *Lanes per call*: fast for intake, hard with a 16k ceiling for the itinerary.
  The ceiling matters more than it looks — too small and the reply truncates,
  the JSON fails to parse, and a minute of waiting produces an error.
- *The map is a server-rendered SVG.* No tile provider, no key, no client
  script. It shows the shape of a day, which is the question a planning map has
  to answer.
- *Share by unguessable token, `/s/` exempt in the proxy.* The one hole in the
  gate, and the reason is that the people you travel with do not have the
  operator's password.

**Rejected:**

- *A tile map (Leaflet, Mapbox, Google).* A new dependency, an API key, a
  billing relationship and a client bundle, to draw a dozen dots. Revisit if
  the app ever needs street-level routing — that is the point where the SVG
  stops being enough, and the trade flips.
- *Normalised itinerary tables.* Rejected as above. If a future feature wants
  "every restaurant I have ever been recommended", that is the feature that
  should pay for the migration.
- *Streaming the itinerary as it generates.* Tempting for the minute-long wait,
  but a partial JSON document cannot be validated, and rendering an
  unvalidated half-itinerary is how you show someone a trip that then changes
  under them. A pending button that says what it is doing was the honest
  version.
- *Auto-planning as soon as the brief was complete.* Would have removed a
  click and taken the decision to spend a minute of the traveller's time away
  from the traveller.
- *A `server-only` import to fence the gateway token.* It is a new dependency,
  and AGENTS.md says those are a human decision. The fence is structural
  instead: nothing in `src/ai/` is reachable from a client component.
- *Regenerating the whole itinerary on every change.* See above — slower,
  costlier, and it loses preferences the traveller already expressed.
- *Reformatting the template's `!important` in the reduced-motion rule.* Biome
  warns; the rule is correct as written. Left alone. `werft.json` was
  reformatted, though — it was the only thing making `pnpm lint` exit non-zero.

**Verified:** `pnpm typecheck`, `pnpm test` (89 in `apps/web`, 205 across the
workspace), `pnpm build` and `pnpm test:e2e` (4) all exit 0; `pnpm lint` is
clean apart from the two pre-existing reduced-motion warnings. The smoke suite
gained two cases: a trip route is withheld from a signed-out visitor, and
`/s/<junk>` 404s without redirecting to login — the failure that matters there
is not "sharing is broken" but "the exemption is wider than intended".

**Open:**

- No weather, no live travel data, no bookings — §§19–20 in full.
- Alternatives are listed but not one-click swappable; today it is a sentence
  to the assistant.
- No calendar view; the fourth tab went to Bookings instead.
- No persistent traveller profile (§29), so "plan another trip like our Japan
  one" means saying so.
- The Drizzle queries have no unit test and are exercised for real against the
  PR's Neon preview branch. If that ever stops being true, they need one.
- Unmeasured: how good the itineraries actually are. Every judgement in
  `prompts.ts` — group by geography, day one is arrival, build in rest — is
  asserted, not tested. The first real trip planned with this is the test.

---

## The README front door

**Asked:** issue #6, "improve the Readme file in Github for this project" —
plus the marketplace's standing instructions to put the app at `/` (already
true, not a placeholder — see below) and to keep this document and
ARCHITECTURE.md current.

**Changed:** rewrote `README.md`. It was six lines beside a 200-line
architecture doc — accurate but not a front door: no list of what actually
works, nothing to tell a reader whether this is a scaffold or a finished MVP.
The new version leads with what the app does, gives an explicit "what works
today" / "what doesn't yet" split (lifted from ARCHITECTURE.md's own surfaces
and known-gaps sections, so the two documents can't quietly disagree), keeps
the local setup and env var walkthrough, adds the check commands from
AGENTS.md, and links out to AGENTS.md, ARCHITECTURE.md and this file rather
than duplicating their content.

**Decided:**

- *Checked `/` before touching the README.* The issue's marketplace boilerplate
  says to replace the placeholder home page. It was already replaced — issue
  #1's MVP session put the real hero, "Plan my trip" button and trip list
  there. Re-confirmed by reading `apps/web/src/app/page.tsx` rather than
  trusting ARCHITECTURE.md's description of it. No home page change was made.
- *No ARCHITECTURE.md change.* Its surfaces table and known-gaps section were
  checked against the current route tree (`find apps/web/src/app -type d`)
  and still match exactly — nothing about the app's shape moved since the MVP
  session, so rewriting it would be motion without content.
- *README summarises rather than re-explains.* The "what works" list is a
  compressed version of ARCHITECTURE.md's surfaces and decisions, not a new
  description — a reader who wants the why is one link away, and there is
  only one place that owns the reasoning.

**Rejected:**

- *Screenshots or a GIF in the README.* Would need a running instance with
  seeded data to capture, and nothing in this session touched the UI to
  justify producing one.

**Verified:** no application code changed — only Markdown. Could not run
`pnpm typecheck` / `pnpm build` / `pnpm lint` locally in this session (no
network access to install dependencies); the PR's own `typecheck` and `build`
gates cover it before merge.

**Open:** everything already open in the prior entry — this session touched
documentation only.
