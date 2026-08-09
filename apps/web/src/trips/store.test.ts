import { describe, expect, it } from "vitest"
import { isShareToken, newShareToken, type TripMessage, toModelMessages } from "./store.ts"

/**
 * The parts of the store that do not need a database.
 *
 * Everything else here is a Drizzle query, and a test that mocks Drizzle only
 * asserts that the mock was called — so those are covered by actually running
 * the app against a preview branch, not here.
 */

describe("newShareToken", () => {
  it("is 32 hex characters, which is what the share route accepts", () => {
    expect(newShareToken()).toMatch(/^[0-9a-f]{32}$/)
  })

  it("does not repeat itself — it is the only thing protecting a shared trip", () => {
    const tokens = new Set(Array.from({ length: 500 }, newShareToken))
    expect(tokens.size).toBe(500)
  })
})

describe("isShareToken", () => {
  it("accepts what newShareToken produces", () => {
    expect(isShareToken(newShareToken())).toBe(true)
  })

  it("rejects junk before it can reach the database", () => {
    expect(isShareToken("not-a-real-token")).toBe(false)
    expect(isShareToken("")).toBe(false)
    expect(isShareToken("../../etc/passwd")).toBe(false)
  })

  it("rejects a token of the right length but the wrong alphabet", () => {
    expect(isShareToken("Z".repeat(32))).toBe(false)
  })

  it("rejects a truncated token, so a half-copied link fails cleanly", () => {
    expect(isShareToken(newShareToken().slice(0, 31))).toBe(false)
  })
})

describe("toModelMessages", () => {
  it("sends only the text, not the structured question", () => {
    const messages: TripMessage[] = [
      {
        id: "1",
        role: "assistant",
        channel: "intake",
        content: "Where to?",
        question: { id: "where", prompt: "Where to?", kind: "choice", options: [] },
        at: new Date(0),
      },
      {
        id: "2",
        role: "user",
        channel: "intake",
        content: "Japan",
        question: null,
        at: new Date(0),
      },
    ]

    expect(toModelMessages(messages)).toEqual([
      { role: "assistant", content: "Where to?" },
      { role: "user", content: "Japan" },
    ])
  })
})
