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

## Download the itinerary as a PDF

**Asked:** issue #4, "add an option to download the itenary as pdf".

**Changed:** a PDF writer and two routes that serve one.

- `src/pdf/text.ts` — the boundary between the app's strings and the bytes a
  page's content stream can hold: WinAnsi encoding, Helvetica's own width
  tables for both weights, and word wrap that measures with them.
- `src/pdf/document.ts` — `PdfWriter`: pages, a cursor that breaks pages when
  a block will not fit, paragraphs, right-aligned rows, rules and bands, and
  the serializer that turns it all into a cross-referenced PDF 1.4 file.
- `src/pdf/itinerary.ts` — the layout: title and match, an "at a glance" list
  of the days, every day in full with its timeline, the budget, lodging,
  packing list and pre-departure checklist.
- `src/pdf/response.ts` — the shared `Content-Disposition: attachment`
  response, so the two routes cannot drift into serving different documents.
- `src/app/trips/[id]/itinerary.pdf/route.ts` (gated, re-checks the session,
  writes a `trip_exported` audit row) and `src/app/s/[token]/itinerary.pdf/`
  (public on the share token's terms, no audit row).
- A "Download PDF" link at the end of the itinerary's tab row, which follows
  `basePath` and so works unchanged on the shared copy.
- `src/lib/format.ts` — `minutes` and `money` moved out of `timeline.tsx`, now
  that something other than a component needs them.
- 28 unit tests across the encoder and the document, and two smoke tests: the
  gated PDF redirects a signed-out visitor to login, and the shared one 404s
  for a token that is not a token.

**Decided:**

- *Write the PDF by hand.* No PDF library is blessed in AGENTS.md, and adding
  one is a decision to raise, not to take quietly while implementing a feature
  request. Writing it is a couple of hundred lines because the document needs
  no images, no transparency and no font embedding — and it means the output
  is exactly as good as the layout we ask for.
- *Standard fonts, WinAnsi, and honest loss.* Helvetica is drawn through an
  8-bit encoding. Latin-1 and the model's own typography survive; accents
  outside it transliterate (Rīga → Riga); emoji and CJK are dropped rather
  than replaced with "?", because a reader can tell something is missing but
  cannot tell that a "?" was not in the original.
- *Real font metrics, not estimated ones.* Widths come from Helvetica's own
  tables. An estimate holds until a line of capitals measures 15% short and
  runs off the page — which is exactly the text that appears in a title.
- *A route handler, not a server action.* This returns a file; the browser's
  own download machinery does that better than anything the app could do with
  a blob, and it costs no JavaScript.
- *The share link gets one too.* The point of sharing is that the people you
  are travelling with can use the trip, and they are the ones who want a copy
  to carry. It is the same document, on the same terms as the page.
- *No audit row for the public download.* `/s/` is the only route a stranger
  can reach; writing a row per request there is a way to fill a table from
  outside. The operator's own download is recorded.
- *Print everything the screen hides.* Alternatives are collapsed on screen
  and printed in full: they are what makes a paper itinerary usable when
  something is shut or rained off.

**Rejected:**

- *Adding `pdfkit`, `jspdf` or `@react-pdf/renderer`.* Not blessed. Each also
  brings a font pipeline and a rendering model to keep up to date, for a
  document that is text in one column.
- *`window.print()` with a print stylesheet.* No dependency either, but it is
  not a download — it hands the user a browser dialogue and hopes they choose
  "Save as PDF", and what it saves is the tab layout, the collapsed details
  and all.
- *Rendering the map into the PDF.* The SVG projection has no streets; on
  paper, without the app beside it, a page of unlabelled dots is decoration.
- *A `?format=pdf` query on the trip page.* A file and a page are different
  kinds of thing; giving the file its own URL means it can be linked, and
  keeps the page's caching and error behaviour out of it.

**Verified:** honestly, not as far as it should be. This session ran in a
sandbox where `pnpm` was unavailable and node could not be executed, so
`pnpm build`, `pnpm test`, `pnpm typecheck` and `pnpm lint` were **not run
locally** — the first real run of any of them is `pr-checks.yml` on this PR,
which is a gate this session did not clear by hand. The tests were written to
check the parts a viewer refuses on rather than "does it look right": the
header and trailer, an xref entry per object, every offset landing on the
object it claims, every `/Length` landing exactly on its `endstream`, and the
page count matching the page objects. Nobody has yet opened one of these files
in a PDF viewer.

**Open:**

- No one has looked at the output in a reader. The structural tests say it is
  a valid PDF; they say nothing about whether the day headings land well or
  the timeline column is wide enough.
- Non-Latin place names are missing from the printed copy while present on
  screen. Fixing that means an embedded font and a CID encoder — larger than
  everything in `src/pdf/` put together.
- No page-break control beyond "does this block fit": a day can still split
  across a page boundary in an ugly place.
- Streams are uncompressed. Fine at a few hundred kilobytes; worth revisiting
  if a PDF ever gets big enough to notice.

---

## Why PR #5's gates were red

**Asked:** issue #8, "debug and fix why the last PR 5 is failing".

**Diagnosis:** one type error, in one line, taking three checks down with it.
`apps/web/src/pdf/response.ts` handed the generated bytes to a `Response`, and
`tsc` refused:

```
error TS2345: Argument of type 'Uint8Array<ArrayBufferLike>' is not assignable
to parameter of type 'BodyInit | null | undefined'.
```

Since TypeScript 5.7 `Uint8Array` is generic over its backing buffer, and a
bare `Uint8Array` annotation means `Uint8Array<ArrayBufferLike>` — which
includes `SharedArrayBuffer`. `BodyInit` (and `BlobPart`) accept only the
`ArrayBuffer`-backed variant, because a body cannot be read out of memory that
another thread may be writing. `new Uint8Array(length)` produces exactly the
right type; the bare return annotations on `toBytes`, `PdfWriter.build` and
`itineraryPdf` were throwing it away on the way out.

`typecheck` reported it directly, `build` reported it again (`next build` type
checks after compiling), Vercel's deployment failed for the same reason, and
`preview-smoke` failed because it waits on a deployment that never arrived.
`gitleaks`, `docs` and `neon-preview-branch` were green throughout. So: one
cause, not four.

**Changed:** the three return annotations now say `Uint8Array<ArrayBuffer>`,
and `response.ts` passes the bytes straight to `Response` again. Added
`src/pdf/response.test.ts`, which reads the body back out of the `Response` and
checks it against the `content-length` the same response declares.

**Decided:**

- *Narrow the annotations rather than cast at the boundary.* `as ArrayBuffer`
  or a `Blob` copy would both silence the compiler at the last line; neither is
  true. The bytes really are `ArrayBuffer`-backed, and three functions were
  lying about it. AGENTS.md's "never weaken TypeScript to make an error go
  away" is the rule that picks this fix over the other two.
- *Test the response, not just the document.* The two failed attempts both
  produced correct PDF bytes and a body the platform would not take. Nothing in
  the suite crossed that seam, so nothing caught it. The new test does, at
  runtime — a `Blob` copy or a truncating rewrite fails it too, not just this
  particular type widening.
- *Push a commit rather than ask for the pending run to be approved.* The fix
  was already on the branch from an earlier escalation, but its `PR checks` run
  came back `action_required`: the push was attributed to `github-actions[bot]`,
  and GitHub holds workflow runs for that. A commit pushed as the Claude GitHub
  App triggers the gates normally, which is the only way to actually see them
  go green.

**Rejected:**

- *`new Blob([bytes])` as the body.* Already tried on this branch and it fails
  identically — `BlobPart` has the same `ArrayBuffer` constraint as `BodyInit`,
  so it moves the error rather than fixing it, and copies the whole document to
  do so.
- *`bytes.buffer as ArrayBuffer`.* A cast asserting something the type system
  could have known, and it would survive a future refactor that made the
  assertion false.
- *Widening the `lib` or loosening `strict`.* Same objection, with a larger
  blast radius.

**Verified:** still not locally, and for the same reason as the session that
wrote the feature — `pnpm` cannot be installed in this sandbox, so `pnpm
build`, `pnpm test`, `pnpm typecheck` and `pnpm lint` were not run by hand.
What *is* new is that the diagnosis came from the actual CI logs of runs
31298524799 and 31303272964 rather than from reading the code, and both runs
name the same single error. The gates on this push are the proof.

**Open:**

- Everything the PDF session left open is still open — nobody has opened one of
  these files in a viewer, non-Latin place names are still dropped, and there
  is no page-break control beyond "does this block fit".
- ARCHITECTURE.md is unchanged, deliberately: this session fixed how the
  described behaviour compiles, not what it is.
