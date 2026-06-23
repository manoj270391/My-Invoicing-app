import jsPDF from 'jspdf'
import { formatPDF, lineTotal, buildInvoiceFilename } from './gst'
import { NOTO_SANS_HEBREW_REGULAR, NOTO_SANS_HEBREW_BOLD } from './fonts/notoSansHebrew'

// Brand palette — identical to pdfInvoice.js, kept in sync deliberately
const NAVY = [55, 73, 97]
const INK  = [28, 36, 51]
const SLATE = [91, 100, 114]
const LINE = [220, 216, 206]
const ROWBG = [248, 246, 241]

const HEBREW_RE = /[\u0590-\u05FF\u0600-\u06FF\uFB1D-\uFDFD\uFE70-\uFEFF]/

function hasHebrew(str) {
  return Boolean(str) && HEBREW_RE.test(str)
}

// IMPORTANT CORRECTNESS NOTE (read before changing this file):
// We use jsPDF's NATIVE setR2L(true) for Hebrew text, NOT bidi-js's
// getReorderedString(). An earlier version of this file used getReorderedString()
// to pre-reverse characters before drawing, on the theory that jsPDF's
// strictly-left-to-right text() needed pre-reversed input to display
// correctly. That theory was WRONG: getReorderedString() reverses the
// CHARACTER ORDER WITHIN each word, which only produces a correct-looking
// result for systems that draw glyphs as isolated, non-joining shapes in
// array order — it does NOT account for the fact that Hebrew letters have
// a fixed correct spelling order that must be preserved. Verified with a
// native Hebrew reader: getReorderedString() produced words with their
// letters in fully reversed (i.e. misspelled) order, e.g. "מועצה"
// (correct) rendered as "הצעומ" (wrong) — confirmed both visually
// AND by copy-pasting the PDF text, which also came out reversed.
//
// jsPDF's own setR2L(true), by contrast, keeps each word's internal letter
// order intact and only reverses word-level layout direction — this is the
// correct primitive for Hebrew and was verified against a native Hebrew
// reader's confirmation as producing correctly-spelled words.
const HEBREW_RE_INNER = HEBREW_RE

function isBaseRTL(text) {
  // First-strong-character rule: scan for the first character that is
  // unambiguously Hebrew or unambiguously Latin/digit, and use that to
  // decide whether the whole string reads as an RTL or LTR paragraph.
  for (const ch of text) {
    if (HEBREW_RE_INNER.test(ch)) return true
    if (/[A-Za-z0-9]/.test(ch)) return false
  }
  return false
}

function splitScriptRuns(text) {
  const runs = []
  let current = ''
  let currentIsHebrew = null
  for (const ch of text) {
    const isHebrew = HEBREW_RE_INNER.test(ch)
    const isSpace = ch === ' '
    if (currentIsHebrew === null) {
      currentIsHebrew = isSpace ? false : isHebrew
      current = ch
    } else if (isSpace || isHebrew === currentIsHebrew) {
      current += ch
    } else {
      runs.push({ text: current, hebrew: currentIsHebrew })
      current = ch
      currentIsHebrew = isHebrew
    }
  }
  if (current) runs.push({ text: current, hebrew: currentIsHebrew })
  return runs
}

function loadImage(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload  = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

/**
 * Generates a true PDF (not browser print) for invoices that may contain
 * Hebrew or other RTL text, using an embedded Noto Sans Hebrew font and a
 * real Unicode bidi algorithm for correct mixed-script rendering. Mirrors
 * the exact layout/styling of pdfInvoice.js — the only difference is font
 * selection and bidi-reordering text before drawing.
 */
export async function generateInvoicePDFHebrew({ invoice, client, company, entries, templateType }) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })

  doc.addFileToVFS('NotoSansHebrew-Regular.ttf', NOTO_SANS_HEBREW_REGULAR)
  doc.addFileToVFS('NotoSansHebrew-Bold.ttf', NOTO_SANS_HEBREW_BOLD)
  doc.addFont('NotoSansHebrew-Regular.ttf', 'NotoHebrew', 'normal')
  doc.addFont('NotoSansHebrew-Bold.ttf', 'NotoHebrew', 'bold')

  const titleBase = buildInvoiceFilename(invoice.invoice_number, client.name).replace(/\.pdf$/, '')
  doc.setProperties({ title: titleBase, author: 'GNS', creator: 'GNS' })
  doc.setDisplayMode('100%', 'continuous', 'UseNone')

  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const ml = 48, mr = 48
  const contentW = pageW - ml - mr
  const navy = NAVY
  const curr  = invoice.currency || 'INR'
  const isLUT = templateType === 'lut' || invoice.template_type === 'lut'
  const isPdf = client.client_type === 'pdf'
  let y = ml

  doc.setR2L(false)

  // Draws text correctly regardless of script mix. Strings containing
  // Hebrew are split into single-script runs (Hebrew vs Latin/digit), with
  // each run measured and positioned manually left-to-right (runs reversed
  // first if the overall text is RTL-led, per the first-strong-character
  // rule). Each Hebrew run is drawn with jsPDF's native setR2L(true), which
  // preserves correct letter spelling within the word — unlike a bidi
  // character-reversal transform, which does not. Pure LTR strings skip all
  // of this and draw directly with Helvetica, unchanged from before.
  function textAuto(text, x, yPos, opts = {}) {
    if (!text) return
    const weight = opts.bold ? 'bold' : 'normal'

    if (!hasHebrew(text)) {
      doc.setFont('helvetica', weight)
      doc.setR2L(false)
      doc.text(text, x, yPos, opts)
      return
    }

    const runs = splitScriptRuns(text)
    const ordered = isBaseRTL(text) ? runs.slice().reverse() : runs

    // Measure each run's width (always with R2L off; width is direction-independent)
    doc.setR2L(false)
    const widths = ordered.map(r => {
      doc.setFont(r.hebrew ? 'NotoHebrew' : 'helvetica', weight)
      return doc.getTextWidth(r.text)
    })
    const totalWidth = widths.reduce((a, b) => a + b, 0)

    let startX = x
    if (opts.align === 'right') startX = x - totalWidth
    else if (opts.align === 'center') startX = x - totalWidth / 2

    let cx = startX
    for (let i = 0; i < ordered.length; i++) {
      const r = ordered[i]
      doc.setFont(r.hebrew ? 'NotoHebrew' : 'helvetica', weight)
      doc.setR2L(r.hebrew)
      doc.text(r.text, cx, yPos, { align: 'left' })
      cx += widths[i]
    }
    doc.setR2L(false)
  }

  // ── Logo + Invoice header ─────────────────────────────────
  const logo = await loadImage(company.logo_url)
  if (logo) {
    const maxW = 130, maxH = 55
    const ratio = Math.min(maxW / logo.width, maxH / logo.height)
    doc.addImage(logo, 'PNG', ml, y, logo.width * ratio, logo.height * ratio)
  }

  doc.setFontSize(24)
  doc.setTextColor(...INK)
  textAuto('INVOICE', pageW - mr, y + 20, { align: 'right', bold: true })

  doc.setFontSize(10)
  doc.setTextColor(...SLATE)
  textAuto(invoice.invoice_number, pageW - mr, y + 36, { align: 'right' })
  textAuto(`Date: ${fmtDate(invoice.invoice_date)}`, pageW - mr, y + 50, { align: 'right' })
  y += 80

  // ── Divider ───────────────────────────────────────────────
  doc.setDrawColor(...LINE)
  doc.setLineWidth(0.5)
  doc.line(ml, y, pageW - mr, y)
  y += 20

  // ── FROM / BILL TO ────────────────────────────────────────
  const halfW = (contentW - 24) / 2
  const hsn = isPdf ? company.hsn_pdf : company.hsn_website

  function addrBlock(label, name, fields, x) {
    let ay = y
    doc.setFontSize(8.5)
    doc.setTextColor(...navy)
    textAuto(label, x, ay, { bold: true }); ay += 14

    doc.setFontSize(11.5)
    doc.setTextColor(...INK)
    textAuto(name || '', x, ay, { bold: true }); ay += 14

    doc.setFontSize(9.5)
    doc.setTextColor(...SLATE)
    for (const f of fields) {
      if (!f) continue
      doc.setFont(hasHebrew(f) ? 'NotoHebrew' : 'helvetica', 'normal')
      // splitTextToSize measures the ORIGINAL (logical-order) string for
      // correct wrapping widths; textAuto then bidi-reorders each wrapped
      // line individually before drawing.
      const lines = doc.splitTextToSize(f, halfW)
      lines.forEach(line => { textAuto(line, x, ay); ay += 13 })
    }
    return ay
  }

  const fromFields = [
    company.address,
    company.gstin ? `GSTIN: ${company.gstin}` : null,
    company.pan   ? `PAN: ${company.pan}`     : null,
    (!isPdf && company.tan) ? `TAN: ${company.tan}` : null,
    hsn           ? `HSN/SAC: ${hsn}`          : null,
    isLUT && company.lut_arn ? `LUT ARN NO: ${company.lut_arn}` : null,
    company.email,
    company.phone,
  ]

  const toFields = [
    client.address,
    client.gstin        ? `GSTIN: ${client.gstin}`         : null,
    client.pan           ? `PAN: ${client.pan}`             : null,
    client.vat_number   ? `VAT: ${client.vat_number}`      : null,
    client.tax_id        ? `Tax ID: ${client.tax_id}`       : null,
    client.business_reg  ? `Reg No: ${client.business_reg}` : null,
    client.email,
    client.phone,
  ]

  const col2X   = ml + halfW + 24
  const fromBtm = addrBlock('FROM', company.company_name || '', fromFields, ml)
  const toBtm   = addrBlock('BILL TO', client.name || '', toFields, col2X)
  y = Math.max(fromBtm, toBtm) + 20

  // ── Line items table ──────────────────────────────────────
  const cols = isPdf
    ? [['File Name', contentW - 240, 'left'], ['Pages', 50, 'right'], ['Rate/Page', 90, 'right'], ['Amount', 100, 'right']]
    : [['Description', contentW - 110, 'left'], ['Amount', 110, 'right']]

  doc.setFillColor(...navy)
  doc.rect(ml, y, contentW, 26, 'F')
  doc.setFontSize(9)
  doc.setTextColor(255, 255, 255)
  let cx = ml
  cols.forEach(([lbl, w, align]) => {
    const tx = align === 'right' ? cx + w - 10 : cx + 10
    textAuto(lbl, tx, y + 17, { align, bold: true })
    cx += w
  })
  y += 26

  doc.setFontSize(9.5)
  let rowIdx = 0

  function tableRow(cells) {
    const lineHeight = 13
    const vPad = 8
    const wrapColIdx = 0 // Description / File Name is always the first, variable-length column

    // Same approach as addrBlock(): set the right font for measurement
    // (Hebrew text needs the Hebrew font's metrics), then split, then draw
    // each wrapped line through textAuto (which re-resolves script runs
    // per line, same as every other call in this file).
    const wrappedLines = cells.map(([txt, w], i) => {
      const str = String(txt ?? '')
      if (i !== wrapColIdx) return [str]
      doc.setFont(hasHebrew(str) ? 'NotoHebrew' : 'helvetica', 'normal')
      return doc.splitTextToSize(str, w - 20)
    })
    const lineCount = Math.max(...wrappedLines.map(lines => lines.length), 1)
    const h = lineCount * lineHeight + vPad

    if (rowIdx % 2 === 1) { doc.setFillColor(...ROWBG); doc.rect(ml, y, contentW, h, 'F') }
    doc.setTextColor(46, 57, 78)

    let rx = ml
    cells.forEach(([, w, align], i) => {
      const lines = wrappedLines[i]
      const tx = align === 'right' ? rx + w - 10 : rx + 10
      const startY = lines.length > 1 ? y + vPad / 2 + lineHeight - 3 : y + h / 2 + 3
      lines.forEach((line, li) => {
        textAuto(line, tx, startY + li * lineHeight, { align })
      })
      rx += w
    })

    y += h; rowIdx++
  }

  for (const e of entries) {
    if (isPdf) {
      tableRow([
        [e.file_name || '',                      cols[0][1], 'left'],
        [String(e.pages || 0),                   cols[1][1], 'right'],
        [formatPDF(e.rate_per_page, curr),        cols[2][1], 'right'],
        [formatPDF(Number(e.line_total)||lineTotal(e), curr), cols[3][1], 'right'],
      ])
    } else {
      const items = (e.service_items?.filter(i => i.description?.trim()).length > 0)
        ? e.service_items.filter(i => i.description?.trim())
        : [
            e.website_renewal_desc   && { description: e.website_renewal_desc,     price: e.website_renewal_price },
            e.google_subscription_desc && { description: e.google_subscription_desc, price: e.google_subscription_price },
            e.other_desc             && { description: e.other_desc,               price: e.other_price },
          ].filter(Boolean)

      if (items.length === 0) items.push({ description: 'Website & domain maintenance', price: Number(e.line_total) || lineTotal(e) })
      for (const item of items) {
        tableRow([
          [item.description,             cols[0][1], 'left'],
          [formatPDF(item.price, curr),  cols[1][1], 'right'],
        ])
      }
    }
  }

  doc.setDrawColor(...LINE)
  doc.setLineWidth(0.5)
  doc.line(ml, y, pageW - mr, y)
  y += 16

  // ── Totals ────────────────────────────────────────────────
  const totW = 220
  const totX = pageW - mr - totW

  function totRow(lbl, val, bold = false, color = SLATE) {
    doc.setFontSize(bold ? 11 : 10)
    doc.setTextColor(...color)
    textAuto(lbl, totX + 10, y, { bold })
    textAuto(val, pageW - mr - 10, y, { align: 'right', bold })
    y += bold ? 20 : 17
  }

  totRow('Subtotal', formatPDF(invoice.subtotal, curr))
  if (!isLUT) {
    if (invoice.is_tamil_nadu) {
      totRow('CGST (9%)',  formatPDF(invoice.cgst, curr))
      totRow('SGST (9%)',  formatPDF(invoice.sgst, curr))
    } else if (invoice.igst > 0) {
      totRow('IGST (18%)', formatPDF(invoice.igst, curr))
    }
  }

  y += 4
  doc.setDrawColor(...navy)
  doc.setLineWidth(1)
  doc.line(totX, y, pageW - mr, y)
  y += 14
  totRow('Total Due', formatPDF(invoice.total, curr), true, navy)
  y += 22

  // ── Simplified footer ───────────────────────────────────────
  doc.setDrawColor(...LINE)
  doc.setLineWidth(0.5)
  doc.line(ml, y, pageW - mr, y)
  y += 18

  doc.setFont('helvetica', 'italic')
  doc.setFontSize(9)
  doc.setTextColor(...SLATE)
  doc.text('This is an Invoice Bill in PDF format and does not require signature.', pageW / 2, y, { align: 'center' })
  y += 16

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(...navy)
  doc.text('Thank you for your business.', pageW / 2, y, { align: 'center' })

  return doc
}

function fmtDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
