import jsPDF from 'jspdf'
import { formatPDF, lineTotal } from './gst'

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
  const doc   = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const ml = 48, mr = 48
  const contentW = pageW - ml - mr
  const accent  = company.accent_color || '#0F6B5C'
  const rgb     = hexToRgb(accent)
  const curr    = invoice.currency || 'INR'
  const isLUT   = templateType === 'lut' || invoice.template_type === 'lut'
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
  doc.setTextColor(28, 36, 51)
  doc.text('INVOICE', pageW - mr, y + 20, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(91, 100, 114)
  doc.text(invoice.invoice_number, pageW - mr, y + 36, { align: 'right' })
  doc.text(`Date: ${fmtDate(invoice.invoice_date)}`, pageW - mr, y + 50, { align: 'right' })
  if (isLUT) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(...rgb)
    doc.text('Export of Services under LUT — ZERO GST', pageW - mr, y + 64, { align: 'right' })
    if (company.lut_arn) {
      doc.setFont('helvetica', 'normal')
      doc.text(`LUT ARN: ${company.lut_arn}`, pageW - mr, y + 76, { align: 'right' })
      y += 12
    }
  }
  y += 80

  // ── Divider ───────────────────────────────────────────────
  doc.setDrawColor(200, 196, 186)
  doc.setLineWidth(0.5)
  doc.line(ml, y, pageW - mr, y)
  y += 20

  // ── FROM / BILL TO ────────────────────────────────────────
  const halfW = (contentW - 24) / 2

  function addrBlock(label, name, fields, x) {
    let ay = y
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(...rgb)
    doc.text(label, x, ay); ay += 14

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11.5)
    doc.setTextColor(28, 36, 51)
    doc.text(name || '', x, ay); ay += 14

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(91, 100, 114)
    for (const f of fields) {
      if (!f) continue
      doc.splitTextToSize(f, halfW).forEach(line => { doc.text(line, x, ay); ay += 13 })
    }
    return ay
  }

  const fromFields = [
    company.address,
    company.gstin   ? `GSTIN: ${company.gstin}`    : null,
    company.pan     ? `PAN: ${company.pan}`         : null,
    company.tan     ? `TAN: ${company.tan}`         : null,
    company.hsn_sac ? `HSN/SAC: ${company.hsn_sac}` : null,
    company.email,
    company.phone,
    company.website,
  ]

  const toFields = [
    client.address,
    client.gstin        ? `GSTIN: ${client.gstin}`                : null,
    client.vat_number   ? `VAT: ${client.vat_number}`             : null,
    client.tax_id       ? `Tax ID: ${client.tax_id}`              : null,
    client.business_reg ? `Reg No: ${client.business_reg}`        : null,
    client.email,
    client.phone,
  ]

  const col2X    = ml + halfW + 24
  const fromBtm  = addrBlock('FROM', company.company_name || '', fromFields, ml)
  const toBtm    = addrBlock('BILL TO', client.name || '', toFields, col2X)
  y = Math.max(fromBtm, toBtm) + 20

  // ── Line items table ──────────────────────────────────────
  const isPdf = client.client_type === 'pdf'
  const cols  = isPdf
    ? [['File Name', contentW - 240, 'left'], ['Pages', 50, 'right'], ['Rate/Page', 90, 'right'], ['Amount', 100, 'right']]
    : [['Description', contentW - 110, 'left'], ['Amount', 110, 'right']]

  // Header row
  doc.setFillColor(28, 36, 51)
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
    const h = 24
    if (rowIdx % 2 === 1) { doc.setFillColor(248, 246, 241); doc.rect(ml, y, contentW, h, 'F') }
    doc.setTextColor(46, 57, 78)
    let rx = ml
    cells.forEach(([txt, w, align]) => {
      const tx = align === 'right' ? rx + w - 10 : rx + 10
      doc.text(String(txt ?? ''), tx, y + 16, { align })
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

  doc.setDrawColor(200, 196, 186)
  doc.setLineWidth(0.5)
  doc.line(ml, y, pageW - mr, y)
  y += 16

  // ── Totals ────────────────────────────────────────────────
  const totW = 220
  const totX = pageW - mr - totW

  function totRow(lbl, val, bold = false, color = [91, 100, 114]) {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(bold ? 11 : 10)
    doc.setTextColor(...color)
    doc.text(lbl, totX + 10, y)
    doc.text(val, pageW - mr - 10, y, { align: 'right' })
    y += bold ? 20 : 17
  }

  totRow('Subtotal', formatPDF(invoice.subtotal, curr))
  if (isLUT) {
    totRow('GST', 'Nil (LUT)')
  } else {
    if (invoice.is_tamil_nadu) {
      totRow('CGST (9%)',  formatPDF(invoice.cgst, curr))
      totRow('SGST (9%)',  formatPDF(invoice.sgst, curr))
    } else if (invoice.igst > 0) {
      totRow('IGST (18%)', formatPDF(invoice.igst, curr))
    }
  }

  y += 4
  doc.setDrawColor(200, 196, 186)
  doc.line(totX, y - 6, pageW - mr, y - 6)
  totRow('Total Due', formatPDF(invoice.total, curr), true, rgb)
  y += 18

  // ── Footer / bank details ─────────────────────────────────
  const footerFields = [
    company.bank_details,
    company.gstin   ? `GSTIN: ${company.gstin}`    : null,
    company.tan     ? `TAN: ${company.tan}`         : null,
    isLUT && company.lut_arn ? `LUT ARN: ${company.lut_arn}` : null,
    company.hsn_sac ? `HSN/SAC: ${company.hsn_sac}` : null,
    company.website,
    company.email,
  ].filter(Boolean)

  if (footerFields.length) {
    doc.setDrawColor(200, 196, 186)
    doc.line(ml, y, pageW - mr, y)
    y += 14

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(...rgb)
    doc.text('PAYMENT & COMPANY DETAILS', ml, y)
    y += 13

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(91, 100, 114)
    for (const f of footerFields) {
      doc.splitTextToSize(f, contentW).forEach(line => { doc.text(line, ml, y); y += 13 })
    }
  }

  // ── Page footer ───────────────────────────────────────────
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(180, 180, 180)
  doc.text('Thank you for your business.', pageW / 2, pageH - 28, { align: 'center' })

  return doc
}

function fmtDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function hexToRgb(hex) {
  const m = (hex || '').replace('#', '').match(/.{1,2}/g)
  if (!m || m.length < 3) return [15, 107, 92]
  return m.map(h => parseInt(h, 16))
}
