import Link from "next/link"
import { notFound } from "next/navigation"
import { intakeProgress, readyToPlan } from "@/ai/brief"
import { ActionButton } from "@/components/action-button"
import { Chat } from "@/components/chat"
import { ItineraryView, isTab } from "@/components/itinerary-view"
import { BriefSummary, DestinationShortlist } from "@/components/trip-overview"
import {
  answerIntakeAction,
  askAssistantAction,
  deleteTripAction,
  generateItineraryAction,
  suggestDestinationsAction,
} from "@/trips/actions"
import { getTrip, listMessages } from "@/trips/store"

export const dynamic = "force-dynamic"

/**
 * Screens 2, 4, 5 and 7, on one URL.
 *
 * The trip has a phase and the page renders the phase; there is no wizard with
 * back and next, because the conversation *is* the navigation. Splitting these
 * across routes would mean a traveller who reloads mid-answer can land on a
 * step that no longer applies.
 */
export default async function TripPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { id } = await params
  const { tab } = await searchParams

  const trip = await getTrip(id)
  if (!trip) notFound()

  const basePath = `/trips/${trip.id}`

  if (trip.phase === "planned" && trip.itinerary) {
    const conversation = await listMessages(trip.id, "assistant")

    return (
      <main className="wide">
        <TripNav id={trip.id} shareToken={trip.shareToken} />

        <ItineraryView
          itinerary={trip.itinerary}
          tab={isTab(tab) ? tab : "itinerary"}
          basePath={basePath}
        />

        <section className="assistant">
          <h2>Trip assistant</h2>
          <p className="muted">
            Ask for changes in plain words — &ldquo;make day four cheaper&rdquo;, &ldquo;we
            don&rsquo;t want to wake up before 9&rdquo;, &ldquo;which day is the most
            tiring?&rdquo;. Your original preferences are kept.
          </p>
          <Chat
            turns={conversation.map((message) => ({
              id: message.id,
              role: message.role,
              content: message.content,
              question: null,
            }))}
            question={null}
            placeholder="What would you like to change?"
            emptyPrompt="Nothing changed yet."
            onSend={askAssistantAction.bind(null, trip.id)}
          />
        </section>
      </main>
    )
  }

  const conversation = await listMessages(trip.id, "intake")
  const question = conversation.at(-1)?.question ?? null
  const progress = intakeProgress(trip.brief)
  const ready = readyToPlan(trip.brief)

  return (
    <main className="wide">
      <TripNav id={trip.id} shareToken={trip.shareToken} />

      <h1>Let&rsquo;s plan your next escape</h1>
      <p className="progress" aria-live="polite">
        Understanding your trip · {progress.answered}/{progress.total}
      </p>

      <Chat
        turns={conversation.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          question: message.question,
        }))}
        question={question}
        placeholder="Tell me about your dream vacation…"
        emptyPrompt="Say anything — “a relaxing 10-day family trip to Japan” is plenty to start with."
        onSend={answerIntakeAction.bind(null, trip.id)}
      />

      {conversation.length === 0 ? (
        <p className="muted small">
          Not sure where to start? Send anything at all and I&rsquo;ll take it from there.
        </p>
      ) : null}

      {ready ? (
        <section className="ready">
          <h2>Here&rsquo;s what I understood</h2>
          <BriefSummary brief={trip.brief} />

          {trip.brief.destination ? (
            <ActionButton
              action={generateItineraryAction.bind(null, trip.id)}
              pendingLabel="Planning your trip…"
              className="cta"
            >
              Generate my itinerary
            </ActionButton>
          ) : (
            <ActionButton
              action={suggestDestinationsAction.bind(null, trip.id)}
              pendingLabel="Thinking of places…"
              className="cta"
            >
              Suggest destinations
            </ActionButton>
          )}
        </section>
      ) : null}

      {trip.shortlist ? (
        <>
          <DestinationShortlist shortlist={trip.shortlist} tripId={trip.id} />
          {trip.brief.destination ? null : (
            <p className="muted">
              Pick one above, or keep talking and I&rsquo;ll suggest a different set.
            </p>
          )}
        </>
      ) : null}
    </main>
  )
}

function TripNav({ id, shareToken }: { id: string; shareToken: string }) {
  return (
    <nav className="site-header">
      <Link href="/">← All trips</Link>
      <span className="nav-actions">
        <Link href={`/s/${shareToken}`}>Share link</Link>
        <form action={deleteTripAction.bind(null, id)}>
          <button type="submit" className="ghost">
            Delete
          </button>
        </form>
      </span>
    </nav>
  )
}
