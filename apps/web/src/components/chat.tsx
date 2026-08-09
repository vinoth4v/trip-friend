"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import type { Question } from "@/ai/planner"
import type { ActionResult } from "@/trips/actions"

export type ChatTurn = {
  id: string
  role: "user" | "assistant"
  content: string
  question: Question | null
}

/**
 * The conversation, for both the intake questionnaire and the trip assistant.
 *
 * One component for both because they are the same interaction: a transcript,
 * an optional set of tappable choices, and a text box that is always there.
 * The text box is always there deliberately — section 31's whole complaint
 * about travel forms is that they refuse answers they did not anticipate, and
 * choices that cannot be talked past are just a form with round corners.
 *
 * A client component, and the only meaningful one in the app: it needs pending
 * state, multi-select and focus management. Everything it calls is a server
 * action, so no model credential is anywhere near this file.
 */
export function Chat({
  turns,
  question,
  placeholder,
  emptyPrompt,
  onSend,
}: {
  turns: ChatTurn[]
  question: Question | null
  placeholder: string
  emptyPrompt?: string
  onSend: (message: string) => Promise<ActionResult>
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [picked, setPicked] = useState<string[]>([])
  const endRef = useRef<HTMLDivElement>(null)

  // Scroll on new turns rather than on every render, so typing in the box
  // does not yank the view.
  const lastTurnId = turns.at(-1)?.id ?? ""
  useEffect(() => {
    if (!lastTurnId) return
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [lastTurnId])

  function run(text: string) {
    if (pending) return

    setError(null)
    startTransition(async () => {
      const result = await onSend(text)
      if (result.ok) {
        setDraft("")
        setPicked([])
      } else {
        setError(result.error)
      }
    })
  }

  function send(message: string) {
    const text = message.trim()
    if (text) run(text)
  }

  /**
   * Retry sends nothing rather than re-sending what the traveller typed: the
   * message that failed is already in the transcript on the server, and both
   * actions read an empty message as "carry on from what you have". Re-sending
   * it would ask the same question twice.
   */
  function retry() {
    run("")
  }

  const multi = question?.kind === "multi"

  function toggle(value: string) {
    if (!multi) {
      send(value)
      return
    }
    setPicked((current) =>
      current.includes(value) ? current.filter((v) => v !== value) : [...current, value],
    )
  }

  return (
    <div className="chat">
      <div className="chat-log">
        {turns.length === 0 && emptyPrompt ? <p className="muted">{emptyPrompt}</p> : null}

        {turns.map((turn) => (
          <p key={turn.id} className={turn.role === "user" ? "bubble bubble-user" : "bubble"}>
            {turn.content}
          </p>
        ))}

        {pending ? (
          <p className="bubble muted" aria-live="polite">
            Thinking…
          </p>
        ) : null}

        <div ref={endRef} />
      </div>

      {error ? (
        <p role="alert">
          {error}{" "}
          <button type="button" onClick={retry} disabled={pending}>
            Retry
          </button>
        </p>
      ) : null}

      {question && question.options.length > 0 ? (
        <div className="choices">
          {question.options.map((option) => {
            const value = option.value || option.label
            const selected = picked.includes(value)
            return (
              <button
                key={`${question.id}-${value}`}
                type="button"
                className={selected ? "choice choice-selected" : "choice"}
                aria-pressed={multi ? selected : undefined}
                disabled={pending}
                onClick={() => toggle(value)}
                title={option.hint}
              >
                {option.emoji ? <span aria-hidden="true">{option.emoji} </span> : null}
                {option.label}
              </button>
            )
          })}

          {multi ? (
            <button
              type="button"
              className="choice choice-confirm"
              disabled={pending || picked.length === 0}
              onClick={() => send(picked.join(", "))}
            >
              Continue
            </button>
          ) : null}
        </div>
      ) : null}

      <form
        className="chat-entry"
        onSubmit={(event) => {
          event.preventDefault()
          send(draft)
        }}
      >
        <label className="visually-hidden" htmlFor="chat-draft">
          Your answer
        </label>
        <input
          id="chat-draft"
          name="draft"
          autoComplete="off"
          placeholder={placeholder}
          value={draft}
          disabled={pending}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" disabled={pending || draft.trim() === ""}>
          Send
        </button>
      </form>

      <p className="muted small">{lastTurnId ? "You can always type instead of tapping." : null}</p>
    </div>
  )
}
