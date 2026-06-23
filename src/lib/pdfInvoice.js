import jsPDF from 'jspdf'
import { formatPDF, lineTotal, buildInvoiceFilename } from './gst'

// Brand palette (fallback if company hasn't set custom colors)
const NAVY = [55, 73, 97]      // #374961
const GOLD = [196, 154, 61]    // darker gold for print legibility (#C49A3D)
const INK  = [28, 36, 51]
const SLATE = [91, 100, 114]
const LINE = [220, 216, 206]
const ROWBG = [248, 246, 241]

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

export async function generateInvoicePDF({ invoice, client, company, entries, templateType }) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })

  // Document properties — Title matches the filename, Author is fixed to GNS
  const titleBase = buildInvoiceFilename(invoice.invoice_number, client.name).replace(/\.pdf$/, '')
  doc.setProperties({ title: titleBase, author: 'GNS', creator: 'GNS' })

  // Force PDF viewers to open at 100% zoom (not "fit width"/"fit page")
  doc.setDisplayMode('100%', 'continuous', 'UseNone')

  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const ml = 48, mr = 48
  const contentW = pageW - ml - mr
  const navy = NAVY // fixed brand palette — not user-configurable
  const curr  = invoice.currency || 'INR'
  const isLUT = templateType === 'lut' || invoice.template_type === 'lut'
  const isPdf = client.client_type === 'pdf'
  let y = ml

  // ── Logo + Invoice header ─────────────────────────────────
  const logo = await loadImage(company.logo_url)
  if (logo) {
    const maxW = 130, maxH = 55
    const ratio = Math.min(maxW / logo.width, maxH / logo.height)
    doc.addImage(logo, 'PNG', ml, y, logo.width * ratio, logo.height * ratio)
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(24)
  doc.setTextColor(...INK)
  doc.text('INVOICE', pageW - mr, y + 20, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...SLATE)
  doc.text(invoice.invoice_number, pageW - mr, y + 36, { align: 'right' })
  doc.text(`Date: ${fmtDate(invoice.invoice_date)}`, pageW - mr, y + 50, { align: 'right' })
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
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(...navy)
    doc.text(label, x, ay); ay += 14

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11.5)
    doc.setTextColor(...INK)
    doc.text(name || '', x, ay); ay += 14

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(...SLATE)
    for (const f of fields) {
      if (!f) continue
      doc.splitTextToSize(f, halfW).forEach(line => { doc.text(line, x, ay); ay += 13 })
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
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(255, 255, 255)
  let cx = ml
  cols.forEach(([lbl, w, align]) => {
    const tx = align === 'right' ? cx + w - 10 : cx + 10
    doc.text(lbl, tx, y + 17, { align })
    cx += w
  })
  y += 26

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  let rowIdx = 0

  function tableRow(cells) {
    const lineHeight = 13
    const vPad = 8 // top/bottom padding inside the row
    const wrapColIdx = 0 // Description / File Name is always the first, variable-length column

    // Pre-wrap only the first (text) column to its own width; other columns
    // (Pages, Rate/Page, Amount) are always short and never need wrapping.
    const wrappedLines = cells.map(([txt, w], i) => {
      if (i !== wrapColIdx) return [String(txt ?? '')]
      return doc.splitTextToSize(String(txt ?? ''), w - 20) // 20 = left+right padding
    })
    const lineCount = Math.max(...wrappedLines.map(lines => lines.length), 1)
    const h = lineCount * lineHeight + vPad

    if (rowIdx % 2 === 1) { doc.setFillColor(...ROWBG); doc.rect(ml, y, contentW, h, 'F') }
    doc.setTextColor(46, 57, 78)

    let rx = ml
    cells.forEach(([, w, align], i) => {
      const lines = wrappedLines[i]
      const tx = align === 'right' ? rx + w - 10 : rx + 10
      // Single-line columns (Pages/Rate/Amount) vertically center within the
      // row; the wrapped text column draws top-aligned, one line at a time.
      const startY = lines.length > 1 ? y + vPad / 2 + lineHeight - 3 : y + h / 2 + 3
      lines.forEach((line, li) => {
        doc.text(line, tx, startY + li * lineHeight, { align })
      })
      rx += w
    })

    y += h; rowIdx++
  }

  for (const e of entries) {
    if (isPdf) {
      const files = (e.service_items?.filter(i => i.file_name?.trim()).length > 0)
        ? e.service_items.filter(i => i.file_name?.trim())
        : [{ file_name: e.file_name || '', pages: e.pages || 0, rate_per_page: e.rate_per_page || 0 }]

      for (const f of files) {
        tableRow([
          [f.file_name || '',                        cols[0][1], 'left'],
          [String(f.pages || 0),                     cols[1][1], 'right'],
          [formatPDF(f.rate_per_page, curr),          cols[2][1], 'right'],
          [formatPDF((Number(f.pages) || 0) * (Number(f.rate_per_page) || 0), curr), cols[3][1], 'right'],
        ])
      }
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
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(bold ? 11 : 10)
    doc.setTextColor(...color)
    doc.text(lbl, totX + 10, y)
    doc.text(val, pageW - mr - 10, y, { align: 'right' })
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

  // Divider line ABOVE total due (fix #1)
  y += 4
  doc.setDrawColor(...navy)
  doc.setLineWidth(1)
  doc.line(totX, y, pageW - mr, y)
  y += 14
  totRow('Total Due', formatPDF(invoice.total, curr), true, navy)
  y += 22

  // ── Simplified footer (fix #2) ─────────────────────────────
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

function hexToRgb(hex) {
  const m = (hex || '').replace('#', '').match(/.{1,2}/g)
  if (!m || m.length < 3) return NAVY
  return m.map(h => parseInt(h, 16))
}
