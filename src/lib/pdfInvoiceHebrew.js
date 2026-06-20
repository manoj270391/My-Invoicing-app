import jsPDF from 'jspdf'
import bidiFactory from 'bidi-js'
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

// Real Unicode Bidirectional Algorithm (UAX #9) implementation — jsPDF's
// own setR2L only reverses entire strings naively and breaks on any mixed
// Hebrew+Latin+digit content (e.g. "דוח שנתי 2026.pdf"). bidi-js correctly
// computes the visual character order so jsPDF's strictly-LTR text drawing
// renders Hebrew, Latin, and digits all in their correct reading positions.
const bidi = bidiFactory()
function toVisualOrder(text) {
  if (!text || !hasHebrew(text)) return text
  const embeddingLevels = bidi.getEmbeddingLevels(text)
  return bidi.getReorderedString(text, embeddingLevels)
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
 * selection and bidi reordering for RTL text segments.
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

  // Always render in standard LTR mode — bidi-js has already computed the
  // correct visual character order, so jsPDF just needs to draw it plainly.
  doc.setR2L(false)

  function setFontAuto(text, weight = 'normal') {
    doc.setFont(hasHebrew(text) ? 'NotoHebrew' : 'helvetica', weight === 'bold' ? 'bold' : 'normal')
  }

  function textAuto(text, x, yPos, opts = {}) {
    setFontAuto(text, opts.bold ? 'bold' : 'normal')
    doc.text(toVisualOrder(text) ?? '', x, yPos, opts)
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
      setFontAuto(f)
      // splitTextToSize must measure the ORIGINAL string (correct glyph
      // widths), then we convert each wrapped line to visual order individually.
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
    const h = 24
    if (rowIdx % 2 === 1) { doc.setFillColor(...ROWBG); doc.rect(ml, y, contentW, h, 'F') }
    doc.setTextColor(46, 57, 78)
    let rx = ml
    cells.forEach(([txt, w, align]) => {
      const tx = align === 'right' ? rx + w - 10 : rx + 10
      textAuto(String(txt ?? ''), tx, y + 16, { align })
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
