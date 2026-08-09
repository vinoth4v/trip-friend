import { describe, expect, it } from "vitest"
import { encodeWinAnsi, escapePdfString, textWidth, wrapText } from "./text.ts"

describe("encodeWinAnsi", () => {
  it("passes printable ASCII through untouched", () => {
    const text = "Day 3 - Kyoto: temples, 12:30, EUR 40 (approx.)"
    expect(encodeWinAnsi(text)).toBe(text)
  })

  it("keeps accented European text, which is most of what this app plans", () => {
    // Latin-1's upper half is WinAnsi's upper half, so these are one byte each
    // and come out of a viewer as themselves.
    expect(encodeWinAnsi("Málaga café")).toBe("Málaga café")
  })

  it("maps the typography the model actually writes", () => {
    // The prompts are written with curly quotes and em dashes, so the itinerary
    // comes back full of them; dropping them would print "we dont".
    expect(encodeWinAnsi("don’t")).toBe(`don${String.fromCharCode(0x92)}t`)
    expect(encodeWinAnsi("a — b")).toBe(`a ${String.fromCharCode(0x97)} b`)
    expect(encodeWinAnsi("…")).toBe(String.fromCharCode(0x85))
  })

  it("drops what Helvetica cannot draw rather than substituting for it", () => {
    // A reader can tell something is missing; a reader cannot tell that a "?"
    // was not in the original.
    expect(encodeWinAnsi("Ramen 🍜 at Senso-ji 浅草寺")).toBe("Ramen  at Senso-ji ")
  })

  it("falls back to the base letter for accents outside Latin-1", () => {
    // Rīga's macron has no WinAnsi byte, but "Riga" is a place a reader
    // recognises and "Rga" is not.
    expect(encodeWinAnsi("Rīga")).toBe("Riga")
  })

  it("flattens newlines and tabs, which have no meaning inside a drawn line", () => {
    expect(encodeWinAnsi("one\ntwo\tthree")).toBe("one two three")
  })

  it("produces only bytes, so the file can be written one char per byte", () => {
    const encoded = encodeWinAnsi("Málaga — 東京 ’24 🍜")
    for (let index = 0; index < encoded.length; index += 1) {
      expect(encoded.charCodeAt(index)).toBeLessThanOrEqual(0xff)
    }
  })
})

describe("textWidth", () => {
  it("measures from the font's own metrics, not an average", () => {
    // "iii" and "MMM" are the same character count and nothing like the same
    // width; an estimate that misses this is what runs a title off the page.
    expect(textWidth("MMM", "regular", 10)).toBeGreaterThan(textWidth("iii", "regular", 10) * 3)
  })

  it("scales with the point size", () => {
    expect(textWidth("Kyoto", "regular", 20)).toBeCloseTo(textWidth("Kyoto", "regular", 10) * 2)
  })

  it("makes bold wider than regular for the same words", () => {
    expect(textWidth("Budget", "bold", 10)).toBeGreaterThan(textWidth("Budget", "regular", 10))
  })

  it("measures an accented letter as the letter it is built from", () => {
    expect(textWidth("é", "regular", 10)).toBe(textWidth("e", "regular", 10))
  })
})

describe("wrapText", () => {
  const width = 200

  it("keeps every line inside the measure", () => {
    const text = encodeWinAnsi(
      "Walk the Philosopher's Path from Ginkaku-ji to Nanzen-ji, stopping wherever the cherry trees are worth stopping for.",
    )

    for (const line of wrapText(text, "regular", 10, width)) {
      expect(textWidth(line, "regular", 10)).toBeLessThanOrEqual(width)
    }
  })

  it("loses no words", () => {
    const text = encodeWinAnsi("a b c d e f g h i j k l m n o p q r s t u v w x y z")
    expect(wrapText(text, "regular", 10, width).join(" ")).toBe(text)
  })

  it("breaks a word too long for any line, rather than letting it overflow", () => {
    // A URL in a booking note is the case that forces this.
    const long = "https://example.com/a-very-long-reservation-link-that-will-not-fit-anywhere"
    const lines = wrapText(long, "regular", 10, 80)

    expect(lines.length).toBeGreaterThan(1)
    expect(lines.join("")).toBe(long)
    for (const line of lines) expect(textWidth(line, "regular", 10)).toBeLessThanOrEqual(80)
  })

  it("returns nothing for text that encoded away to nothing", () => {
    // An item titled with a bare emoji should cost no blank line.
    expect(wrapText(encodeWinAnsi("🍜"), "regular", 10, width)).toEqual([])
  })
})

describe("escapePdfString", () => {
  it("escapes the three characters that would end the string early", () => {
    expect(escapePdfString("a (b) c")).toBe("a \\(b\\) c")
    expect(escapePdfString("a\\b")).toBe("a\\\\b")
  })

  it("escapes the backslash before the parentheses, not after", () => {
    // The other order produces "\\(", which is a literal backslash followed by
    // an unescaped bracket — and a PDF that will not open.
    expect(escapePdfString("\\(")).toBe("\\\\\\(")
  })
})
