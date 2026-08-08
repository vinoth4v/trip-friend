import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { emptyBrief } from "./brief.ts"

/**
 * The planner, with the gateway stubbed.
 *
 * What is worth testing here is not that fetch was called — kompass.test.ts
 * covers the transport — but the judgement the planner adds on top of the
 * model's answer: which lane a call takes, and the refusal to believe the
 * model when it declares itself ready to plan a trip it knows nothing about.
 */

const BASE = "https://kompass.example.workers.dev"

async function load() {
  vi.resetModules()
  return import("./planner.ts")
}

function reply(payload: unknown) {
  return new Response(
    JSON.stringify({ content: [{ type: "text", text: JSON.stringify(payload) }] }),
    { status: 200 },
  )
}

let sent: Record<string, unknown> = {}

function stubGateway(payload: unknown) {
  vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
    sent = JSON.parse(String(init?.body))
    return reply(payload)
  })
}

const A_TURN = {
  reply: "Where are you thinking?",
  brief: { food: {} },
  question: { id: "where", prompt: "Where to?", kind: "choice", options: [] },
  ready: false,
}

beforeEach(() => {
  sent = {}
  vi.stubEnv("KOMPASS_BASE_URL", BASE)
  vi.stubEnv("KOMPASS_TOKEN", "tok")
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("intakeTurn", () => {
  it("takes the fast lane — the traveller is watching a spinner", async () => {
    stubGateway(A_TURN)
    const { intakeTurn } = await load()
    await intakeTurn(emptyBrief, [])

    expect(sent.model).toBe("kompass-fast")
  })

  it("shows the model the gaps it has not filled yet", async () => {
    stubGateway(A_TURN)
    const { intakeTurn } = await load()
    await intakeTurn(emptyBrief, [])

    const messages = sent.messages as { content: string }[]
    expect(messages[0]?.content).toContain("Duration: not yet known")
  })

  it("replays the transcript, so a late correction can override an early answer", async () => {
    stubGateway(A_TURN)
    const { intakeTurn } = await load()
    await intakeTurn(emptyBrief, [
      { role: "user", content: "ten days" },
      { role: "assistant", content: "Got it." },
      { role: "user", content: "actually two weeks" },
    ])

    const messages = sent.messages as { content: string }[]
    expect(messages).toHaveLength(4)
    expect(messages.at(-1)?.content).toBe("actually two weeks")
  })

  it("overrules the model when it declares itself ready with nothing to plan", async () => {
    stubGateway({ ...A_TURN, ready: true })
    const { intakeTurn } = await load()
    const turn = await intakeTurn(emptyBrief, [])

    expect(turn.ready).toBe(false)
    expect(turn.question).not.toBeNull()
  })

  it("agrees it is ready once the brief can actually be planned against", async () => {
    stubGateway({
      reply: "Great — ready when you are.",
      brief: {
        destination: "Japan",
        durationDays: 10,
        travellers: { kind: "family", adults: 2, children: 1, childAges: [10] },
        food: {},
      },
      question: null,
      ready: true,
    })

    const { intakeTurn } = await load()
    const turn = await intakeTurn(emptyBrief, [])

    expect(turn.ready).toBe(true)
    expect(turn.progress.answered).toBeGreaterThan(2)
  })

  it("drops a trailing question once it is ready, so the chat does not ask on regardless", async () => {
    stubGateway({
      reply: "Ready.",
      brief: {
        destination: "Japan",
        durationDays: 10,
        travellers: { kind: "solo", adults: 1, children: 0, childAges: [] },
        food: {},
      },
      question: { id: "extra", prompt: "One more thing?", kind: "text", options: [] },
      ready: true,
    })

    const { intakeTurn } = await load()
    expect((await intakeTurn(emptyBrief, [])).question).toBeNull()
  })

  it("survives a fenced reply, because models fence JSON", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          JSON.stringify({
            content: [{ type: "text", text: `\`\`\`json\n${JSON.stringify(A_TURN)}\n\`\`\`` }],
          }),
          { status: 200 },
        ),
    )

    const { intakeTurn } = await load()
    expect((await intakeTurn(emptyBrief, [])).reply).toBe("Where are you thinking?")
  })
})

describe("generateItinerary", () => {
  it("takes the hard lane with room for a long document", async () => {
    stubGateway({
      title: "10-Day Japan",
      destination: "Japan",
      days: [{ day: 1, title: "Arrive" }],
      budget: {},
    })

    const { generateItinerary } = await load()
    await generateItinerary(emptyBrief)

    expect(sent.model).toBe("kompass-hard")
    expect(sent.max_tokens).toBe(16000)
  })

  it("fails loudly rather than returning half a trip", async () => {
    stubGateway({ title: "Trip", destination: "Japan", days: [], budget: {} })
    const { generateItinerary } = await load()
    await expect(generateItinerary(emptyBrief)).rejects.toThrow(/Building your itinerary/)
  })
})

describe("reviseItinerary", () => {
  it("sends a digest of the itinerary, not the whole document", async () => {
    stubGateway({ reply: "Slowed it down.", replaceDays: [] })

    const { generateItinerary, reviseItinerary } = await load()
    stubGateway({
      title: "3-Day Kyoto",
      destination: "Kyoto",
      days: [
        {
          day: 1,
          title: "Arrive",
          items: [{ title: "Dinner", why: "a very long explanation that need not be resent" }],
        },
      ],
      budget: { currency: "EUR", lines: [{ category: "Food", amount: 100 }] },
    })
    const itinerary = await generateItinerary(emptyBrief)

    stubGateway({ reply: "Done.", replaceDays: [] })
    await reviseItinerary(itinerary, emptyBrief, [{ role: "user", content: "cheaper please" }])

    const messages = sent.messages as { content: string }[]
    const primer = messages[0]?.content ?? ""
    expect(primer).toContain("Day 1 — Arrive")
    expect(primer).toContain("Dinner")
    expect(primer).not.toContain("need not be resent")
  })
})
