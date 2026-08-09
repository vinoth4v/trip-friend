import type { Itinerary, ItineraryDay, ItineraryItem } from "@/ai/itinerary"
import { budgetTotal, dayCost, dayEffortMinutes } from "@/ai/itinerary"
// The screen's own formatters, not a second set. Two functions that both turn
// 90 into a duration will disagree eventually, and the printed copy is the one
// nobody notices is wrong until they are standing at a station.
import { minutes, money } from "@/lib/format"
import { INK, MARGIN, PdfWriter } from "@/pdf/document"

/**
 * The itinerary, laid out for paper.
 *
 * A deliberately different document from the screen. The web version has tabs,
 * links into a day, and `<details>` a reader can open; none of that survives
 * printing, so this is one linear document with everything visible: the days
 * in full, then the budget, the lodging, the packing list and the checklist.
 * The map is the one thing left behind — an SVG of dots without streets is a
 * navigational aid only next to a phone, and a phone can open the app.
 *
 * It is written to be *carried*: a traveller with no signal in a foreign city
 * should be able to read the day off a folded sheet, which is why every item
 * keeps its time, its place and its booking note even when that costs a page.
 */

const TIME_COLUMN = 46

export function itineraryPdf(itinerary: Itinerary): Uint8Array<ArrayBuffer> {
  const writer = new PdfWriter(itinerary.title)
  const currency = itinerary.budget.currency

  header(writer, itinerary)
  contents(writer, itinerary)

  for (const day of itinerary.days) {
    dayPages(writer, day, currency)
  }

  budget(writer, itinerary)
  lodging(writer, itinerary)
  lists(writer, itinerary)

  return writer.build()
}

/**
 * A filename a download folder can live with: the trip's own title, lower
 * case, punctuation gone. Latin-1 only — a `Content-Disposition` filename with
 * a raw non-ASCII byte in it is where header encoding gets interesting, and an
 * itinerary is not worth finding out how each browser guesses.
 */
export function itineraryFilename(itinerary: Itinerary): string {
  const slug = itinerary.title
    .normalize("NFD")
    // Combining marks go rather than becoming hyphens, so "Málaga" is
    // `malaga.pdf` and not `ma-laga.pdf`.
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)

  return `${slug || "itinerary"}.pdf`
}

function header(writer: PdfWriter, itinerary: Itinerary): void {
  writer.paragraph(itinerary.title, { font: "bold", size: 22, color: INK.accent, leading: 1.2 })

  if (itinerary.headline) {
    writer.gap(4)
    writer.paragraph(itinerary.headline, { size: 11, color: INK.muted })
  }

  writer.gap(6)

  const facts = [
    itinerary.destination,
    `${itinerary.days.length} ${itinerary.days.length === 1 ? "day" : "days"}`,
    itinerary.period,
    itinerary.travellersSummary,
    itinerary.style,
  ].filter((fact) => fact.length > 0)

  writer.paragraph(facts.join("  ·  "), { size: 10, color: INK.muted })
  writer.gap(4)
  writer.row("Estimated total", money(budgetTotal(itinerary.budget), itinerary.budget.currency), {
    font: "bold",
    size: 11,
  })

  if (itinerary.match.score > 0) {
    writer.gap(6)
    writer.paragraph(`Trip match: ${itinerary.match.score}%`, { font: "bold", size: 10 })
    for (const compromise of itinerary.match.compromises) {
      writer.paragraph(`·  ${compromise}`, { size: 9, color: INK.muted, indent: 8 })
    }
  }

  writer.gap(8)
  writer.rule({ after: 14 })
}

/** A one-page overview before the detail. On screen the tabs do this job; on
 * paper the only way to answer "which day were we in Kyoto?" without turning
 * every page is a list at the front. */
function contents(writer: PdfWriter, itinerary: Itinerary): void {
  writer.paragraph("At a glance", { font: "bold", size: 13, after: 4 })

  for (const day of itinerary.days) {
    const where = day.base ? `${day.title} · ${day.base}` : day.title
    writer.row(`Day ${day.day} — ${where}`, money(dayCost(day), itinerary.budget.currency), {
      size: 10,
      color: INK.muted,
    })
  }

  writer.gap(10)
}

function dayPages(writer: PdfWriter, day: ItineraryDay, currency: string): void {
  // A day heading with no room for the first entry underneath it is a heading
  // on the wrong page, so the two are kept together explicitly.
  writer.ensure(96)
  writer.gap(6)

  const bandHeight = 26
  writer.band(bandHeight, INK.border)
  writer.gap(7)
  writer.paragraph(`Day ${day.day} — ${day.title}`, { font: "bold", size: 13, leading: 1.2 })
  writer.gap(8)

  const meta = [day.date, day.base, `${day.pace} pace`, `${day.walking} walking`].filter(
    (part): part is string => Boolean(part),
  )
  writer.paragraph(meta.join("  ·  "), { size: 9, color: INK.muted })

  const effort = dayEffortMinutes(day)
  writer.paragraph(
    [
      money(dayCost(day), currency),
      effort > 0 ? `${minutes(effort)} occupied` : "",
      `${day.items.length} ${day.items.length === 1 ? "entry" : "entries"}`,
    ]
      .filter((part) => part.length > 0)
      .join("  ·  "),
    { size: 9, color: INK.muted },
  )

  if (day.summary) {
    writer.gap(4)
    writer.paragraph(day.summary, { size: 10 })
  }

  writer.gap(8)

  for (const item of day.items) {
    timelineEntry(writer, item, currency)
  }

  writer.gap(6)
}

function timelineEntry(writer: PdfWriter, item: ItineraryItem, currency: string): void {
  // Enough room for the time and the first two lines of its entry. Anything
  // longer may break across pages; a time stranded above nothing may not.
  writer.ensure(42)

  const baseline = writer.y - 11
  writer.at(item.time || "—", MARGIN.left, baseline, {
    font: "bold",
    size: 9,
    color: INK.accent,
  })

  writer.paragraph(item.title, { font: "bold", size: 11, indent: TIME_COLUMN })

  if (item.description) {
    writer.paragraph(item.description, { size: 10, indent: TIME_COLUMN, color: INK.muted })
  }

  const facts = [
    item.kind !== "activity" ? item.kind : "",
    item.place.name ? `at ${item.place.name}` : "",
    item.durationMinutes ? minutes(item.durationMinutes) : "",
    item.cost === null ? "" : item.cost === 0 ? "free" : money(item.cost, currency),
    item.travelMinutes
      ? `${item.travelMode ? `${item.travelMode} ` : ""}${minutes(item.travelMinutes)}`
      : "",
  ].filter((fact) => fact.length > 0)

  if (facts.length > 0) {
    writer.paragraph(facts.join("  ·  "), { size: 9, indent: TIME_COLUMN, color: INK.muted })
  }

  if (item.booking) {
    writer.paragraph(`Book ahead: ${item.booking}`, {
      size: 9,
      indent: TIME_COLUMN,
      color: INK.accent,
    })
  }

  if (item.why) {
    writer.paragraph(`Why this: ${item.why}`, { size: 9, indent: TIME_COLUMN })
  }

  // Alternatives are what makes a printed itinerary usable when something is
  // shut, rained off, or simply not wanted — the one part of the screen's
  // collapsed detail that has to survive onto paper.
  for (const alternative of item.alternatives) {
    const cost = alternative.cost === null ? "" : ` (${money(alternative.cost, currency)})`
    const why = alternative.why ? ` — ${alternative.why}` : ""
    writer.paragraph(`Instead: ${alternative.title}${cost}${why}`, {
      size: 9,
      indent: TIME_COLUMN + 8,
      color: INK.muted,
    })
  }

  writer.gap(8)
}

function budget(writer: PdfWriter, itinerary: Itinerary): void {
  writer.ensure(120)
  writer.rule({ after: 12 })
  writer.paragraph("Budget", { font: "bold", size: 15, after: 6 })

  const currency = itinerary.budget.currency

  for (const line of itinerary.budget.lines) {
    writer.row(line.category, money(line.amount, currency), { size: 10 })
  }

  writer.gap(4)
  writer.rule({ after: 8 })
  writer.row("Total", money(budgetTotal(itinerary.budget), currency), { font: "bold", size: 11 })

  if (itinerary.budget.low !== null || itinerary.budget.high !== null) {
    const low = itinerary.budget.low === null ? "" : money(itinerary.budget.low, currency)
    const high = itinerary.budget.high === null ? "" : money(itinerary.budget.high, currency)
    writer.gap(2)
    writer.paragraph(`Likely range: ${[low, high].filter(Boolean).join(" – ")}`, {
      size: 9,
      color: INK.muted,
    })
  }

  writer.gap(12)
}

function lodging(writer: PdfWriter, itinerary: Itinerary): void {
  if (itinerary.lodging.length === 0) return

  writer.ensure(90)
  writer.paragraph("Where you are staying", { font: "bold", size: 15, after: 6 })

  for (const stay of itinerary.lodging) {
    const nights =
      stay.nights === null ? "" : `${stay.nights} ${stay.nights === 1 ? "night" : "nights"}`
    writer.paragraph(stay.name, { font: "bold", size: 11 })
    const detail = [stay.area, nights].filter((part) => part.length > 0).join("  ·  ")
    if (detail) writer.paragraph(detail, { size: 9, color: INK.muted })
    if (stay.why) writer.paragraph(stay.why, { size: 9, color: INK.muted })
    writer.gap(6)
  }

  writer.gap(6)
}

const URGENCY: Record<Itinerary["preTripChecklist"][number]["urgency"], string> = {
  now: "Do this now",
  soon: "Soon",
  before_departure: "Before departure",
}

/** Packing and the pre-departure checklist: the two parts of the document a
 * traveller wants *before* leaving, which is exactly when a printed copy beats
 * a page they would have to find again. */
function lists(writer: PdfWriter, itinerary: Itinerary): void {
  if (itinerary.packingList.length > 0) {
    writer.ensure(90)
    writer.paragraph("Packing list", { font: "bold", size: 15, after: 6 })
    for (const entry of itinerary.packingList) {
      writer.paragraph(`[ ]  ${entry.item}${entry.why ? ` — ${entry.why}` : ""}`, { size: 10 })
    }
    writer.gap(12)
  }

  if (itinerary.preTripChecklist.length > 0) {
    writer.ensure(90)
    writer.paragraph("Before you go", { font: "bold", size: 15, after: 6 })
    for (const task of itinerary.preTripChecklist) {
      writer.paragraph(`[ ]  ${task.task}`, { size: 10 })
      const detail = [URGENCY[task.urgency], task.why].filter((part) => part.length > 0).join(" — ")
      if (detail) writer.paragraph(detail, { size: 9, color: INK.muted, indent: 14 })
    }
    writer.gap(12)
  }

  writer.gap(4)
  writer.rule({ after: 8 })
  writer.paragraph(
    "Planned by Trip Friend. Times, prices and opening hours are estimates — " +
      "check anything you are relying on before you travel.",
    { size: 8, color: INK.muted },
  )
}
