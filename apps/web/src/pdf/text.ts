/**
 * Text, as a PDF understands it.
 *
 * A PDF using the standard fonts does not speak Unicode: Helvetica is drawn
 * through an 8-bit encoding, and the viewer needs to be told which one. This
 * module is the boundary between the app's strings — written by a model, so
 * full of emoji, curly quotes and occasionally Japanese — and the bytes that a
 * page's content stream can actually hold.
 *
 * Everything here is pure and byte-exact, which is the point: layout decisions
 * downstream (where a line breaks, whether a day fits on the page) are only as
 * good as the width measurement underneath them, and a width measurement is
 * something a test can pin down without rendering anything.
 */

export type PdfFont = "regular" | "bold"

/**
 * Helvetica's own widths, in 1/1000 em, for the printable ASCII range.
 *
 * Taken from the font's metrics rather than estimated. An estimate is fine
 * until a line of capitals ("MOUNT WHITNEY TRAILHEAD") measures 15% short and
 * runs off the page, which is exactly the text that appears in a title.
 */
const ASCII_START = 32

// biome-ignore format: a width table reads as a table, not as reflowed prose.
const HELVETICA: readonly number[] = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
]

// biome-ignore format: as above.
const HELVETICA_BOLD: readonly number[] = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
]

/**
 * The typography a model actually produces, mapped to the WinAnsi bytes that
 * hold it. Curly quotes and em dashes are not decoration here — the app's own
 * prompts are written with them, so the itinerary comes back full of them, and
 * dropping them would leave "we dont" in a printed document.
 */
const PUNCTUATION: Record<string, number> = {
  "‘": 0x91,
  "’": 0x92,
  "‚": 0x82,
  "“": 0x93,
  "”": 0x94,
  "–": 0x96,
  "—": 0x97,
  "…": 0x85,
  "•": 0x95,
  "†": 0x86,
  "€": 0x80,
  "™": 0x99,
  "Š": 0x8a,
  "š": 0x9a,
  "Ž": 0x8e,
  "ž": 0x9e,
  "Œ": 0x8c,
  "œ": 0x9c,
  "ƒ": 0x83,
  "ˆ": 0x88,
  "˜": 0x98,
}

/** Widths for the WinAnsi punctuation above, which is not in the ASCII table
 * and is wide enough that guessing costs a line break in the wrong place. */
const EXTRA_WIDTHS: Record<number, number> = {
  0x80: 556, // euro
  0x82: 222, // single low quote
  0x83: 556, // florin
  0x85: 1000, // ellipsis
  0x86: 556, // dagger
  0x88: 333, // circumflex
  0x91: 222, // opening single quote
  0x92: 222, // closing single quote
  0x93: 333, // opening double quote
  0x94: 333, // closing double quote
  0x95: 350, // bullet
  0x96: 556, // en dash
  0x97: 1000, // em dash
  0x98: 333, // small tilde
  0x99: 1000, // trademark
}

/** A byte with no better answer. Helvetica's lower case clusters around this,
 * so an unknown accented letter measures close rather than absurdly. */
const DEFAULT_WIDTH = 556

/**
 * A string reduced to bytes Helvetica can draw, one JavaScript char per byte.
 *
 * Keeping the result as a string rather than a `Uint8Array` is deliberate: the
 * whole PDF is assembled as a byte-per-char string so that the cross-reference
 * table's offsets are plain string indices, and one representation the whole
 * way through is one fewer place to get an offset wrong.
 *
 * What cannot be represented is dropped, not substituted. An itinerary that
 * says "Senso-ji" where the screen says "Senso-ji (浅草寺)" is a smaller loss
 * than one peppered with "?" — and unlike a substitution, a reader can tell
 * nothing was invented.
 */
export function encodeWinAnsi(text: string): string {
  let out = ""

  for (const character of text) {
    const code = character.codePointAt(0) ?? 0

    if (code === 0x09 || code === 0x0a || code === 0x0d) {
      out += " "
      continue
    }

    if (code >= 0x20 && code <= 0x7e) {
      out += character
      continue
    }

    const mapped = PUNCTUATION[character]
    if (mapped !== undefined) {
      out += String.fromCharCode(mapped)
      continue
    }

    // Latin-1's upper half is WinAnsi's upper half, so accented European text —
    // which is most of the destinations this app plans for — survives intact.
    if (code >= 0xa0 && code <= 0xff) {
      out += character
      continue
    }

    // Anything else: an accented letter outside Latin-1 keeps its base letter
    // (Rīga becomes Riga), and everything with no base letter — emoji, CJK,
    // Cyrillic — goes.
    const base = character.normalize("NFD").charCodeAt(0)
    if (base >= 0x20 && base <= 0x7e) out += String.fromCharCode(base)
  }

  return out
}

/** The width of one encoded byte, in 1/1000 em. */
function byteWidth(byte: number, font: PdfFont): number {
  const table = font === "bold" ? HELVETICA_BOLD : HELVETICA
  const ascii = table[byte - ASCII_START]
  if (byte >= ASCII_START && ascii !== undefined) return ascii

  const extra = EXTRA_WIDTHS[byte]
  if (extra !== undefined) return extra

  // An accented Latin-1 letter is as wide as the letter it is built from —
  // true for Helvetica, and the reason "Málaga" wraps where "Malaga" does.
  const decomposed = String.fromCharCode(byte).normalize("NFD").charCodeAt(0)
  const decomposedWidth = table[decomposed - ASCII_START]
  if (decomposed >= ASCII_START && decomposedWidth !== undefined) return decomposedWidth

  return DEFAULT_WIDTH
}

/** How wide an already-encoded string draws, in points. */
export function textWidth(encoded: string, font: PdfFont, size: number): number {
  let total = 0
  for (let index = 0; index < encoded.length; index += 1) {
    total += byteWidth(encoded.charCodeAt(index), font)
  }
  return (total * size) / 1000
}

/**
 * Break encoded text into lines that fit `maxWidth`.
 *
 * Words first, characters only when a single word cannot fit — a URL in a
 * booking note is the case that forces it, and a word that overflows silently
 * would run off the page edge where nobody sees the rest of it.
 */
export function wrapText(
  encoded: string,
  font: PdfFont,
  size: number,
  maxWidth: number,
): string[] {
  const lines: string[] = []
  let line = ""

  const flush = () => {
    if (line.length > 0) lines.push(line)
    line = ""
  }

  for (const word of encoded.split(" ").filter((part) => part.length > 0)) {
    const candidate = line.length === 0 ? word : `${line} ${word}`
    if (textWidth(candidate, font, size) <= maxWidth) {
      line = candidate
      continue
    }

    flush()

    if (textWidth(word, font, size) <= maxWidth) {
      line = word
      continue
    }

    for (const character of word) {
      if (textWidth(line + character, font, size) > maxWidth && line.length > 0) flush()
      line += character
    }
  }

  flush()
  return lines
}

/**
 * Escape an encoded string for a PDF literal string.
 *
 * Only three characters matter, and one of them — the backslash — has to go
 * first or the escapes escape each other.
 */
export function escapePdfString(encoded: string): string {
  return encoded.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")
}
