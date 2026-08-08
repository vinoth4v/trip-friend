import { describe, expect, it } from "vitest"
import {
  type Brief,
  briefHeadline,
  briefSchema,
  describeBrief,
  emptyBrief,
  intakeProgress,
  missingEssentials,
  readyToPlan,
} from "./brief.ts"

function brief(patch: Partial<Brief> = {}): Brief {
  return { ...emptyBrief, ...patch }
}

describe("briefSchema", () => {
  it("accepts an empty object, because a brief starts out knowing nothing", () => {
    const parsed = briefSchema.parse({ food: {} })
    expect(parsed.destination).toBeNull()
    expect(parsed.interests).toEqual([])
  })

  it("keeps a partial answer rather than rejecting the whole document", () => {
    const parsed = briefSchema.parse({ destination: "Japan", food: {} })
    expect(parsed.destination).toBe("Japan")
    expect(parsed.durationDays).toBeNull()
  })
})

describe("missingEssentials", () => {
  it("lists everything for a brand new trip", () => {
    expect(missingEssentials(emptyBrief)).toContain("destination")
    expect(missingEssentials(emptyBrief)).toContain("travellers")
  })

  it("counts 'surprise me' as an answered destination, not a gap", () => {
    const open = brief({ destinationCertainty: "open" })
    expect(missingEssentials(open)).not.toContain("destination")
  })

  it("counts a shortlist of candidates as an answered destination", () => {
    const ideas = brief({ destinationCandidates: ["Portugal", "Italy"] })
    expect(missingEssentials(ideas)).not.toContain("destination")
  })

  it("counts 'no fixed budget' as answered — it is a real answer", () => {
    expect(missingEssentials(emptyBrief)).not.toContain("budget")
  })
})

describe("readyToPlan", () => {
  it("refuses an empty brief", () => {
    expect(readyToPlan(emptyBrief)).toBe(false)
  })

  it("accepts where, how long and who — even with no budget or pace", () => {
    const enough = brief({
      destination: "Japan",
      durationDays: 10,
      travellers: { kind: "family", adults: 2, children: 1, childAges: [10] },
    })
    expect(readyToPlan(enough)).toBe(true)
  })

  it("plans a 'surprise me' trip, which is the point of the product", () => {
    const surprise = brief({
      destinationCertainty: "open",
      durationDays: 7,
      travellers: { kind: "couple", adults: 2, children: 0, childAges: [] },
    })
    expect(readyToPlan(surprise)).toBe(true)
  })

  it("still refuses when the duration is unknown — a trip needs a length", () => {
    const noLength = brief({
      destination: "Japan",
      travellers: { kind: "solo", adults: 1, children: 0, childAges: [] },
    })
    expect(readyToPlan(noLength)).toBe(false)
  })
})

describe("intakeProgress", () => {
  it("moves as the brief fills in", () => {
    expect(intakeProgress(emptyBrief).answered).toBe(1) // budget defaults to answered
    const half = brief({ destination: "Japan", durationDays: 10 })
    expect(intakeProgress(half).answered).toBe(3)
    expect(intakeProgress(half).total).toBe(6)
  })
})

describe("briefHeadline", () => {
  it("names the trip once it knows where and how long", () => {
    expect(briefHeadline(brief({ destination: "Japan", durationDays: 10 }))).toBe(
      "10 days in Japan",
    )
  })

  it("falls back to something sayable when it knows nothing", () => {
    expect(briefHeadline(emptyBrief)).toBe("Somewhere new")
  })
})

describe("describeBrief", () => {
  it("marks gaps as unknown so the model can see what to ask about", () => {
    expect(describeBrief(emptyBrief)).toContain("Duration: not yet known")
  })

  it("keeps the traveller's own phrasing of vague dates", () => {
    const vague = brief({
      dates: { kind: "flexible", start: null, end: null, description: "anytime this summer" },
    })
    expect(describeBrief(vague)).toContain("anytime this summer")
  })

  it("spells out children's ages, which change the pacing", () => {
    const family = brief({
      travellers: { kind: "family", adults: 2, children: 1, childAges: [4] },
    })
    expect(describeBrief(family)).toContain("aged 4")
  })
})
