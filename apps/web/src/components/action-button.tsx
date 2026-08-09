"use client"

import { useState, useTransition } from "react"
import type { ActionResult } from "@/trips/actions"

/**
 * A button for the slow, expensive actions.
 *
 * Generating a fourteen-day itinerary takes the better part of a minute. A
 * plain form post would leave the page looking broken for that whole time and
 * invite a second click, which would spend the gateway call twice — so this
 * exists mostly to disable itself and say what it is doing.
 *
 * Errors land next to the button rather than on Next's error page: the
 * traveller's answers are all still on screen, and losing them because a
 * gateway returned 429 would be the worst possible trade.
 */
export function ActionButton({
  action,
  children,
  pendingLabel,
  className,
}: {
  action: () => Promise<ActionResult>
  children: React.ReactNode
  pendingLabel: string
  className?: string
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <>
      <button
        type="button"
        className={className}
        disabled={pending}
        onClick={() => {
          setError(null)
          startTransition(async () => {
            const result = await action()
            if (!result.ok) setError(result.error)
          })
        }}
      >
        {pending ? pendingLabel : children}
      </button>

      {pending ? (
        <p className="muted small" aria-live="polite">
          This one is worth the wait — it is planning the whole trip.
        </p>
      ) : null}

      {error ? <p role="alert">{error}</p> : null}
    </>
  )
}
