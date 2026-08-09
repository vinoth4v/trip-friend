import { color } from "@werft/tokens"
import { encodeWinAnsi, escapePdfString, type PdfFont, textWidth, wrapText } from "@/pdf/text"

/**
 * A very small PDF writer.
 *
 * There is no PDF library on this repo's blessed-dependency list, and adding
 * one is a decision to raise rather than take quietly. That turns out to be
 * fine: a printable document with the standard fonts, no images and no
 * transparency is a couple of hundred lines of a format that has been stable
 * since 1993, and writing it here means the output is exactly as good as the
 * layout we ask for, with nothing to keep up to date.
 *
 * What this deliberately does not do: embed fonts (so text is Helvetica and
 * WinAnsi — see `text.ts`), compress streams (a twenty-page itinerary is well
 * under 100 kB uncompressed, and an uncompressed PDF is one a human can debug
 * by reading it), or draw anything but text and filled rectangles.
 *
 * The whole file is assembled as a string of one byte per character, so a
 * cross-reference offset is a string index. Mixing in a `Uint8Array` partway
 * would mean two ideas of "how long is this so far", and the xref table is
 * unforgiving about which one is right.
 */

export const PAGE = { width: 595.28, height: 841.89 } as const

/** Margins in points. 56 ≈ 20 mm: wide enough that a home printer does not
 * clip the footer, narrow enough that a day still fits on one page. */
export const MARGIN = { top: 56, bottom: 56, left: 56, right: 56 } as const

export const CONTENT_WIDTH = PAGE.width - MARGIN.left - MARGIN.right

export type Rgb = readonly [number, number, number]

function fromToken(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16)
  return [((value >> 16) & 0xff) / 255, ((value >> 8) & 0xff) / 255, (value & 0xff) / 255]
}

/**
 * The PDF's palette is the app's palette, read from the token package rather
 * than written out again here — a printed itinerary that is a different blue
 * from the screen it came from looks like it came from somewhere else. Light
 * scheme always: paper has no dark mode.
 */
export const INK = {
  fg: fromToken(color.fg.light),
  muted: fromToken(color.muted.light),
  accent: fromToken(color.accent.light),
  border: fromToken(color.border.light),
} as const

export type TextOptions = {
  font?: PdfFont
  size?: number
  color?: Rgb
  /** Points to indent from the left margin. */
  indent?: number
  /** Extra space left below the block. */
  after?: number
  /** Line spacing, as a multiple of the font size. */
  leading?: number
}

/** Rounded to three decimals: PDF coordinates are points, and more precision
 * than a thousandth of a point is bytes spent on nothing. */
function num(value: number): string {
  return (Math.round(value * 1000) / 1000).toString()
}

function fontResource(font: PdfFont): string {
  return font === "bold" ? "/F2" : "/F1"
}

export class PdfWriter {
  private readonly pages: string[] = []
  private stream = ""
  private cursor = 0

  constructor(private readonly title: string) {
    this.cursor = PAGE.height - MARGIN.top
  }

  /** The write position, measured from the page bottom the way PDF measures
   * everything. */
  get y(): number {
    return this.cursor
  }

  newPage(): void {
    this.pages.push(this.stream)
    this.stream = ""
    this.cursor = PAGE.height - MARGIN.top
  }

  /**
   * Start a new page unless `height` still fits on this one. Called before
   * anything that reads wrong when split — a heading with no lines under it,
   * a timeline entry separated from its time.
   */
  ensure(height: number): void {
    if (this.cursor - height < MARGIN.bottom) this.newPage()
  }

  gap(amount: number): void {
    this.cursor -= amount
  }

  private draw(encoded: string, x: number, y: number, font: PdfFont, size: number, ink: Rgb): void {
    this.stream +=
      `BT ${fontResource(font)} ${num(size)} Tf ` +
      `${num(ink[0])} ${num(ink[1])} ${num(ink[2])} rg ` +
      `1 0 0 1 ${num(x)} ${num(y)} Tm (${escapePdfString(encoded)}) Tj ET\n`
  }

  /**
   * One line at an absolute position, drawn without touching the cursor.
   *
   * For the few places where two things share a baseline — the time against
   * its timeline entry — where the second thing is a wrapped block that moves
   * the cursor itself.
   */
  at(text: string, x: number, y: number, options: TextOptions = {}): void {
    this.draw(
      encodeWinAnsi(text),
      x,
      y,
      options.font ?? "regular",
      options.size ?? 10,
      options.color ?? INK.fg,
    )
  }

  /**
   * A wrapped block of text, advancing the cursor and breaking pages as it
   * goes. The workhorse: every heading, paragraph and list item is this.
   */
  paragraph(text: string, options: TextOptions = {}): void {
    const size = options.size ?? 10
    const font = options.font ?? "regular"
    const ink = options.color ?? INK.fg
    const indent = options.indent ?? 0
    const leading = (options.leading ?? 1.35) * size

    const lines = wrapText(encodeWinAnsi(text), font, size, CONTENT_WIDTH - indent)
    if (lines.length === 0) return

    for (const encoded of lines) {
      this.ensure(leading)
      this.cursor -= size
      this.draw(encoded, MARGIN.left + indent, this.cursor, font, size, ink)
      this.cursor -= leading - size
    }

    this.cursor -= options.after ?? 0
  }

  /**
   * Label on the left, value hard against the right margin — the shape every
   * budget line wants, and one no amount of wrapping produces by accident.
   * The value is never wrapped; a label long enough to collide with it is
   * truncated, because a budget whose numbers overlap its categories is worse
   * than one missing three words of a category name.
   */
  row(label: string, value: string, options: TextOptions = {}): void {
    const size = options.size ?? 10
    const font = options.font ?? "regular"
    const ink = options.color ?? INK.fg
    const indent = options.indent ?? 0
    const leading = (options.leading ?? 1.35) * size

    this.ensure(leading)
    this.cursor -= size

    const encodedValue = encodeWinAnsi(value)
    const valueWidth = textWidth(encodedValue, font, size)
    const room = CONTENT_WIDTH - indent - valueWidth - 12
    const labelLine = wrapText(encodeWinAnsi(label), font, size, room)[0] ?? ""

    this.draw(labelLine, MARGIN.left + indent, this.cursor, font, size, ink)
    this.draw(encodedValue, PAGE.width - MARGIN.right - valueWidth, this.cursor, font, size, ink)

    this.cursor -= leading - size
    this.cursor -= options.after ?? 0
  }

  /** A hairline across the content column. */
  rule(options: { color?: Rgb; after?: number } = {}): void {
    this.ensure(6)
    const ink = options.color ?? INK.border
    this.stream +=
      `${num(ink[0])} ${num(ink[1])} ${num(ink[2])} rg ` +
      `${num(MARGIN.left)} ${num(this.cursor)} ${num(CONTENT_WIDTH)} 0.6 re f\n`
    this.cursor -= options.after ?? 10
  }

  /**
   * A filled band starting at the current cursor and running `height` points
   * down, drawn slightly wider than the column. Emitted before the text that
   * sits on it — PDF has no z-index, so order is the only layering there is.
   */
  band(height: number, ink: Rgb): void {
    this.stream +=
      `${num(ink[0])} ${num(ink[1])} ${num(ink[2])} rg ` +
      `${num(MARGIN.left - 8)} ${num(this.cursor - height)} ` +
      `${num(CONTENT_WIDTH + 16)} ${num(height)} re f\n`
  }

  /**
   * Serialize.
   *
   * Footers are stamped here rather than at each page break, because "page 3
   * of 11" is not knowable until the last page is written — and a printed
   * itinerary that has lost a page should be able to say so.
   */
  build(): Uint8Array {
    // An empty page is dropped rather than printed: `ensure` breaks the page
    // before drawing, so a trailing blank one means the document ended exactly
    // at a break, not that a page is missing. A document with nothing in it at
    // all still gets one page, because a PDF with no pages will not open.
    const written = [...this.pages, this.stream].filter((content) => content.length > 0)
    const pages = written.length > 0 ? written : [""]
    const streams = pages.map((content, index) => content + footer(index + 1, pages.length))

    // 1 catalog, 2 page tree, 3 and 4 the fonts, 5 the info dictionary, then a
    // page object and a content object for each page.
    const FIRST_PAGE_OBJECT = 6
    const objects: string[] = []
    const kids = streams.map((_, index) => `${FIRST_PAGE_OBJECT + index * 2} 0 R`).join(" ")

    objects.push("<< /Type /Catalog /Pages 2 0 R >>")
    objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${streams.length} >>`)
    objects.push(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    )
    objects.push(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    )
    objects.push(
      `<< /Title (${escapePdfString(encodeWinAnsi(this.title))}) /Producer (Trip Friend) >>`,
    )

    for (const [index, content] of streams.entries()) {
      objects.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(PAGE.width)} ${num(PAGE.height)}] ` +
          "/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> " +
          `/Contents ${FIRST_PAGE_OBJECT + index * 2 + 1} 0 R >>`,
      )
      objects.push(`<< /Length ${content.length} >>\nstream\n${content}endstream`)
    }

    let file = "%PDF-1.4\n"
    const offsets: number[] = []

    for (const [index, body] of objects.entries()) {
      offsets.push(file.length)
      file += `${index + 1} 0 obj\n${body}\nendobj\n`
    }

    const startxref = file.length
    file += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
    for (const offset of offsets) file += `${offset.toString().padStart(10, "0")} 00000 n \n`
    file += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 5 0 R >>\n`
    file += `startxref\n${startxref}\n%%EOF\n`

    return toBytes(file)
  }
}

function footer(page: number, total: number): string {
  const label = encodeWinAnsi(`Trip Friend  ·  page ${page} of ${total}`)
  const width = textWidth(label, "regular", 8)
  return (
    `BT /F1 8 Tf ${num(INK.muted[0])} ${num(INK.muted[1])} ${num(INK.muted[2])} rg ` +
    `1 0 0 1 ${num((PAGE.width - width) / 2)} ${num(MARGIN.bottom - 28)} Tm ` +
    `(${escapePdfString(label)}) Tj ET\n`
  )
}

/** One character, one byte — which holds because every string written into the
 * file either went through `encodeWinAnsi` or is ASCII structure. */
function toBytes(file: string): Uint8Array {
  const bytes = new Uint8Array(file.length)
  for (let index = 0; index < file.length; index += 1) bytes[index] = file.charCodeAt(index) & 0xff
  return bytes
}
