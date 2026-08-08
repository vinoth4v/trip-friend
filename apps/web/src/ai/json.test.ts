import { describe, expect, it } from "vitest"
import { z } from "zod"
import { extractJson, parseModelJson } from "./json.ts"

describe("extractJson", () => {
  it("returns plain JSON untouched", () => {
    expect(extractJson('{"a":1}')).toBe('{"a":1}')
  })

  it("unwraps a ```json fence, which is the most common way a model disobeys", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toBe('{"a":1}')
  })

  it("unwraps an unlabelled fence too", () => {
    expect(extractJson('```\n{"a":1}\n```')).toBe('{"a":1}')
  })

  it("drops preamble and sign-off around the document", () => {
    const raw = 'Sure! Here you go:\n{"a":1}\nLet me know if you want changes.'
    expect(extractJson(raw)).toBe('{"a":1}')
  })

  it("handles a top-level array", () => {
    expect(extractJson("noise [1,2] noise")).toBe("[1,2]")
  })

  it("keeps nested braces intact rather than stopping at the first close", () => {
    expect(extractJson('{"a":{"b":1}}')).toBe('{"a":{"b":1}}')
  })

  it("prefers the fence when prose around it also contains braces", () => {
    const raw = 'You could write { like this }, but here it is:\n```json\n{"a":1}\n```'
    expect(extractJson(raw)).toBe('{"a":1}')
  })

  it("returns the text unchanged when there is no JSON at all, so the caller can quote it", () => {
    expect(extractJson("I cannot help with that.")).toBe("I cannot help with that.")
  })
})

describe("parseModelJson", () => {
  const schema = z.object({ name: z.string(), size: z.number() })

  it("parses and returns typed data", () => {
    expect(parseModelJson('{"name":"Kyoto","size":3}', schema, "test")).toEqual({
      name: "Kyoto",
      size: 3,
    })
  })

  it("quotes what the model actually said when it returns prose", () => {
    expect(() => parseModelJson("I'd rather not.", schema, "Planning")).toThrow(
      /Planning: the model did not return JSON.*I'd rather not/,
    )
  })

  it("names the offending field when the shape is wrong", () => {
    expect(() => parseModelJson('{"name":"Kyoto","size":"three"}', schema, "Planning")).toThrow(
      /size/,
    )
  })

  it("truncates a very long reply rather than pasting it into the error", () => {
    const long = "x".repeat(5000)
    expect(() => parseModelJson(long, schema, "Planning")).toThrow(/…/)
  })
})
