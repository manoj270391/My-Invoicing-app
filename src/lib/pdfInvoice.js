import jsPDF from 'jspdf'
import { formatINR, lineTotal } from './gst'

function loadImage(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null) // don't block invoice generation on a broken logo
    img.src = url
  })
}

/**
 * @param {object} opts
 * @param {object} opts.invoice - invoice row { invoice_number, invoice_date, subtotal, cgst, sgst, igst, total, is_tamil_nadu }
 * @param {object} opts.client - client row
 * @param {object} opts.company - company_profile row
 * @param {Array} opts.entries - ledger entries included on this invoice
 */
export async function generateInvoicePDF({ invoice, client, company, entries }) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 48
  const accent = company.accent_color || '#0F6B5C'
  const rgbAccent = hexToRgb(accent)
  let y = margin

  // ---------- Header ----------
  const logo = await loadImage(company.logo_url)
  if (logo) {
    const maxW = 120, maxH = 50
    const ratio = Math.min(maxW / logo.width, maxH / logo.height)
    doc.addImage(logo, 'PNG', margin, y, logo.width * ratio, logo.height * ratio)
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(28, 36, 51)
  doc.text('INVOICE', pageW - margin, y + 18, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(91, 100, 114)
  doc.text(`${invoice.invoice_number}`, pageW - margin, y + 34, { align: 'right' })
  doc.text(`Date: ${formatDate(invoice.invoice_date)}`, pageW - margin, y + 48, { align: 'right' })

  y += 70

  // ---------- Company + client blocks ----------
  doc.setDrawColor(228, 224, 214)
  doc.line(margin, y, pageW - margin, y)
  y += 22

  const colW = (pageW - margin * 2 - 30) / 2

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...rgbAccent)
  doc.text('FROM', margin, y)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(28, 36, 51)
  doc.text(company.company_name || 'Your Company', margin, y + 16)
  let fromY = y + 30
  fromY = wrapText(doc, company.address, margin, fromY, colW, 10, [91, 100, 114])
  if (company.gstin) { doc.setFontSize(9.5); doc.setTextColor(91, 100, 114); doc.text(`GSTIN: ${company.gstin}`, margin, fromY); fromY += 13 }
  if (company.email) { doc.text(company.email, margin, fromY); fromY += 13 }
  if (company.phone) { doc.text(company.phone, margin, fromY); fromY += 13 }

  const col2X = margin + colW + 30
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...rgbAccent)
  doc.text('BILL TO', col2X, y)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(28, 36, 51)
  doc.text(client.name || '', col2X, y + 16)
  let toY = y + 30
  toY = wrapText(doc, client.address, col2X, toY, colW, 10, [91, 100, 114])
  if (client.gstin) { doc.setFontSize(9.5); doc.setTextColor(91, 100, 114); doc.text(`GSTIN: ${client.gstin}`, col2X, toY); toY += 13 }
  if (client.email) { doc.text(client.email, col2X, toY); toY += 13 }
  if (client.phone) { doc.text(client.phone, col2X, toY); toY += 13 }

  y = Math.max(fromY, toY) + 18

  // ---------- Line items table ----------
  const isPdfClient = client.client_type === 'pdf'
  const headers = isPdfClient
    ? ['File name', 'Pages', 'Rate/page', 'Amount']
    : ['Description', 'Amount']
  const colWidths = isPdfClient
    ? [pageW - margin * 2 - 260, 60, 90, 110]
    : [pageW - margin * 2 - 110, 110]

  doc.setFillColor(28, 36, 51)
  doc.rect(margin, y, pageW - margin * 2, 26, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  doc.setTextColor(251, 249, 245)
  let hx = margin + 10
  headers.forEach((h, i) => {
    const align = h === 'Amount' || h === 'Rate/page' || h === 'Pages' ? 'right' : 'left'
    doc.text(h, align === 'right' ? hx + colWidths[i] - 10 : hx, y + 17, { align })
    hx += colWidths[i]
  })
  y += 26

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  let rowIdx = 0

  function row(cells, aligns) {
    const rowH = 24
    if (rowIdx % 2 === 1) {
      doc.setFillColor(251, 249, 245)
      doc.rect(margin, y, pageW - margin * 2, rowH, 'F')
    }
    doc.setTextColor(46, 57, 78)
    let cx = margin + 10
    cells.forEach((c, i) => {
      const align = aligns[i]
      doc.text(String(c), align === 'right' ? cx + colWidths[i] - 10 : cx, y + 16, { align })
      cx += colWidths[i]
    })
    y += rowH
    rowIdx++
  }

  for (const e of entries) {
    if (isPdfClient) {
      row([e.file_name || '', String(e.pages || 0), formatINR(e.rate_per_page), formatINR(lineTotal(e))], ['left', 'right', 'right', 'right'])
    } else {
      const parts = []
      if (e.website_renewal_desc) parts.push([e.website_renewal_desc, e.website_renewal_price])
      if (e.google_subscription_desc) parts.push([e.google_subscription_desc, e.google_subscription_price])
      if (e.other_desc) parts.push([e.other_desc, e.other_price])
      if (parts.length === 0) parts.push(['Website & domain maintenance', lineTotal(e)])
      for (const [desc, price] of parts) {
        row([desc, formatINR(price)], ['left', 'right'])
      }
    }
  }

  doc.setDrawColor(228, 224, 214)
  doc.line(margin, y, pageW - margin, y)
  y += 18

  // ---------- Totals ----------
  const totalsX = pageW - margin - 220
  function totalLine(label, value, opts = {}) {
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal')
    doc.setFontSize(opts.bold ? 12 : 10.5)
    doc.setTextColor(...(opts.color || [91, 100, 114]))
    doc.text(label, totalsX, y)
    doc.text(value, pageW - margin, y, { align: 'right' })
    y += opts.bold ? 22 : 18
  }

  totalLine('Subtotal', formatINR(invoice.subtotal))
  if (invoice.is_tamil_nadu) {
    totalLine('CGST (9%)', formatINR(invoice.cgst))
    totalLine('SGST (9%)', formatINR(invoice.sgst))
  } else {
    totalLine('IGST (18%)', formatINR(invoice.igst))
  }
  doc.setDrawColor(228, 224, 214)
  doc.line(totalsX, y - 6, pageW - margin, y - 6)
  y += 4
  totalLine('Total due', formatINR(invoice.total), { bold: true, color: rgbAccent })

  y += 20

  // ---------- Bank details / footer ----------
  if (company.bank_details) {
    doc.setDrawColor(228, 224, 214)
    doc.line(margin, y, pageW - margin, y)
    y += 18
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.setTextColor(...rgbAccent)
    doc.text('PAYMENT DETAILS', margin, y)
    y += 14
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    y = wrapText(doc, company.bank_details, margin, y, pageW - margin * 2, 9.5, [91, 100, 114])
  }

  const pageH = doc.internal.pageSize.getHeight()
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(154, 162, 175)
  doc.text('Thank you for your business.', pageW / 2, pageH - 30, { align: 'center' })

  return doc
}

function wrapText(doc, text, x, y, maxWidth, fontSize, color) {
  if (!text) return y
  doc.setFontSize(fontSize)
  doc.setTextColor(...color)
  const lines = doc.splitTextToSize(text, maxWidth)
  lines.forEach((line) => { doc.text(line, x, y); y += fontSize + 3.5 })
  return y + 4
}

function formatDate(d) {
  if (!d) return ''
  const dt = new Date(d)
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function hexToRgb(hex) {
  const m = hex.replace('#', '').match(/.{1,2}/g)
  if (!m) return [15, 107, 92]
  return m.map((h) => parseInt(h, 16))
}
