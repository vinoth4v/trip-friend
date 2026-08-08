import type { z } from "zod"

/**
 * Pulling a JSON document out of a model's reply.
 *
 * Every AI call in this app asks for JSON and nothing else, and models mostly
 * comply — but "mostly" is the problem. The three failures seen in practice
 * are a ```json fence, a sentence of preamble before the brace, and a trailing
 * "Let me know if you'd like changes!". All three are recoverable without
 * asking again, and asking again costs a user several seconds of staring at a
 * spinner, so they are recovered here rather than retried.
 *
 * What is deliberately *not* recovered: malformed JSON. A truncated document
 * cannot be repaired without guessing what was cut, and a guessed itinerary is
 * worse than an honest error.
 */
export function extractJson(raw: string): string {
  const text = raw.trim()

  // A fenced block wins outright when present: its contents are unambiguous,
  // whereas brace-scanning a reply that also discusses JSON can pick up prose.
  const fenced = /```(?:json)?\s*\n?([\s\S]*?)```/i.exec(text)
  const candidate = fenced?.[1]?.trim() ?? text

  const first = firstStructuralIndex(candidate)
  if (first === -1) return candidate

  const opener = candidate[first]
  const closer = opener === "{" ? "}" : "]"
  const last = candidate.lastIndexOf(closer)
  if (last <= first) return candidate

  return candidate.slice(first, last + 1)
}

function firstStructuralIndex(text: string): number {
  const brace = text.indexOf("{")
  const bracket = text.indexOf("[")
  if (brace === -1) return bracket
  if (bracket === -1) return brace
  return Math.min(brace, bracket)
}

/**
 * Parse a model reply against a schema, or throw an error that says what the
 * model actually sent.
 *
 * The truncated raw text in the message is the whole point: without it, a
 * schema mismatch is an unfalsifiable "the AI failed", and the only way to
 * find out which field it got wrong is to reproduce the call by hand.
 */
export function parseModelJson<T>(raw: string, schema: z.ZodType<T>, label: string): T {
  const extracted = extractJson(raw)

  let value: unknown
  try {
    value = JSON.parse(extracted)
  } catch {
    throw new Error(`${label}: the model did not return JSON. It said: ${preview(raw)}`)
  }

  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    const problems = parsed.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join(".") || "(root)"} ${issue.message}`)
      .join("; ")
    throw new Error(`${label}: the model's JSON did not fit the schema — ${problems}`)
  }

  return parsed.data
}

function preview(raw: string): string {
  const flat = raw.replace(/\s+/g, " ").trim()
  return flat.length > 200 ? `${flat.slice(0, 200)}…` : flat || "(nothing)"
}
