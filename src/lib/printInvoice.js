import { formatPDF, lineTotal } from './gst'

const NAVY = '#374961'
const GOLD = '#C49A3D'

/**
 * Opens a new browser tab with a fully styled, print-ready invoice.
 * Uses browser fonts so all Unicode (Hebrew, Arabic, etc.) renders correctly.
 * User does Ctrl+P / Cmd+P → Save as PDF.
 */
export function openPrintInvoice({ invoice, client, company, entries, templateType }) {
  const curr   = invoice.currency || 'INR'
  const isLUT  = templateType === 'lut' || invoice.template_type === 'lut'
  const isPdf  = client.client_type === 'pdf'
  const navy   = NAVY // fixed brand palette — not user-configurable
  const hsn    = isPdf ? company.hsn_pdf : company.hsn_website

  function hasRTL(str) {
    if (!str) return false
    return /[\u0590-\u05FF\u0600-\u06FF\uFB1D-\uFDFD\uFE70-\uFEFF]/.test(str)
  }

  function buildRows() {
    if (isPdf) {
      return entries.map(e => {
        const rtl = hasRTL(e.file_name)
        return `
          <tr>
            <td style="text-align:${rtl ? 'right' : 'left'}; direction:${rtl ? 'rtl' : 'ltr'}">${e.file_name || ''}</td>
            <td class="num">${e.pages || 0}</td>
            <td class="num">${formatPDF(e.rate_per_page, curr)}</td>
            <td class="num">${formatPDF(Number(e.line_total) || lineTotal(e), curr)}</td>
          </tr>`
      }).join('')
    }

    return entries.flatMap(e => {
      const items = (e.service_items?.filter(i => i.description?.trim()).length > 0)
        ? e.service_items.filter(i => i.description?.trim())
        : [
            e.website_renewal_desc   && { description: e.website_renewal_desc,     price: e.website_renewal_price },
            e.google_subscription_desc && { description: e.google_subscription_desc, price: e.google_subscription_price },
            e.other_desc             && { description: e.other_desc,               price: e.other_price },
          ].filter(Boolean)

      if (!items.length) items.push({ description: 'Website & domain maintenance', price: Number(e.line_total) || lineTotal(e) })

      return items.map(item => {
        const rtl = hasRTL(item.description)
        return `
          <tr>
            <td style="text-align:${rtl ? 'right' : 'left'}; direction:${rtl ? 'rtl' : 'ltr'}">${item.description}</td>
            <td class="num">${formatPDF(item.price, curr)}</td>
          </tr>`
      })
    }).join('')
  }

  function fmtDate(d) {
    if (!d) return ''
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  function addrBlock(label, name, fields) {
    const nameRTL = hasRTL(name)
    const lines = fields.filter(Boolean).map(f => {
      const rtl = hasRTL(f)
      return `<div style="direction:${rtl ? 'rtl' : 'ltr'}; text-align:${rtl ? 'right' : 'left'}">${f}</div>`
    }).join('')
    return `
      <div class="addr-block">
        <div class="addr-label">${label}</div>
        <div class="addr-name" style="direction:${nameRTL ? 'rtl' : 'ltr'}; text-align:${nameRTL ? 'right' : 'left'}">${name || ''}</div>
        <div class="addr-lines">${lines}</div>
      </div>`
  }

  function taxRows() {
    if (isLUT) return ''
    if (invoice.is_tamil_nadu) return `
      <tr><td>CGST (9%)</td><td class="num">${formatPDF(invoice.cgst, curr)}</td></tr>
      <tr><td>SGST (9%)</td><td class="num">${formatPDF(invoice.sgst, curr)}</td></tr>`
    if (invoice.igst > 0) return `<tr><td>IGST (18%)</td><td class="num">${formatPDF(invoice.igst, curr)}</td></tr>`
    return ''
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Invoice ${invoice.invoice_number}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;600&display=swap');

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
      font-size: 10pt;
      color: #1C2433;
      background: white;
    }

    .page {
      max-width: 780px;
      margin: 0 auto;
      padding: 40px 48px 60px;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 28px;
    }
    .logo img { max-height: 55px; max-width: 130px; object-fit: contain; }
    .logo-placeholder { font-size: 18pt; font-weight: 800; color: ${navy}; }
    .invoice-meta { text-align: right; }
    .invoice-title { font-size: 22pt; font-weight: 800; color: #1C2433; letter-spacing: -0.02em; }
    .invoice-number { font-family: 'IBM Plex Mono', monospace; font-size: 10pt; color: #5B6472; margin-top: 4px; }
    .invoice-date { font-size: 9.5pt; color: #5B6472; margin-top: 2px; }

    hr { border: none; border-top: 1px solid #DCD8CE; margin: 0 0 22px; }

    .addr-row { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 28px; }
    .addr-label { font-size: 7.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: ${navy}; margin-bottom: 6px; }
    .addr-name { font-size: 12pt; font-weight: 700; color: #1C2433; margin-bottom: 5px; }
    .addr-lines { font-size: 9pt; color: #5B6472; line-height: 1.7; }

    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    thead tr { background: ${navy}; color: white; }
    thead th { padding: 9px 12px; font-size: 8.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; text-align: left; }
    thead th.num { text-align: right; }

    tbody tr:nth-child(even) { background: #F8F6F1; }
    tbody td { padding: 8px 12px; font-size: 9.5pt; color: #2E394E; border-bottom: 1px solid #EEE; }
    td.num { text-align: right; font-family: 'IBM Plex Mono', monospace; font-size: 9pt; white-space: nowrap; }

    .totals { display: flex; justify-content: flex-end; margin-bottom: 28px; }
    .totals-inner { width: 240px; }
    .totals-inner table { margin-bottom: 0; }
    .totals-inner td { border-bottom: none; padding: 4px 8px; font-size: 9.5pt; color: #5B6472; }
    .totals-inner .total-row td {
      font-size: 11pt; font-weight: 700; color: ${navy};
      border-top: 1.5px solid ${navy}; padding-top: 8px;
    }

    .footer-note {
      border-top: 1px solid #DCD8CE;
      padding-top: 16px;
      margin-top: 8px;
      text-align: center;
    }
    .footer-note .line1 { font-size: 8.5pt; color: #5B6472; font-style: italic; margin-bottom: 8px; }
    .footer-note .line2 { font-size: 9.5pt; color: ${navy}; font-weight: 600; }

    @media print {
      body { padding: 0; }
      .page { padding: 20px 32px 40px; max-width: 100%; }
      .no-print { display: none !important; }
      @page { margin: 10mm; size: A4; }
    }

    .print-bar {
      position: fixed; bottom: 0; left: 0; right: 0;
      background: #1C2433; padding: 14px 24px;
      display: flex; align-items: center; justify-content: space-between;
      gap: 16px; z-index: 100;
    }
    .print-bar span { color: rgba(255,255,255,0.7); font-size: 13px; }
    .print-btn {
      background: ${navy}; color: white;
      border: none; border-radius: 8px;
      padding: 10px 24px; font-size: 13px; font-weight: 700;
      cursor: pointer; font-family: inherit;
    }
    .print-btn:hover { opacity: 0.9; }
  </style>
</head>
<body>

<div class="page">

  <div class="header">
    <div class="logo">
      ${company.logo_url
        ? `<img src="${company.logo_url}" alt="${company.company_name || ''}" />`
        : `<div class="logo-placeholder">${company.company_name || 'Your Company'}</div>`}
    </div>
    <div class="invoice-meta">
      <div class="invoice-title">INVOICE</div>
      <div class="invoice-number">${invoice.invoice_number}</div>
      <div class="invoice-date">Date: ${fmtDate(invoice.invoice_date)}</div>
    </div>
  </div>

  <hr />

  <div class="addr-row">
    ${addrBlock('From', company.company_name, [
      company.address,
      company.gstin ? 'GSTIN: ' + company.gstin : null,
      company.pan   ? 'PAN: '   + company.pan   : null,
      (!isPdf && company.tan) ? 'TAN: ' + company.tan : null,
      hsn           ? 'HSN/SAC: ' + hsn           : null,
      isLUT && company.lut_arn ? 'LUT ARN NO: ' + company.lut_arn : null,
      company.email,
      company.phone,
    ])}
    ${addrBlock('Bill To', client.name, [
      client.address,
      client.gstin        ? 'GSTIN: '   + client.gstin        : null,
      client.vat_number   ? 'VAT: '     + client.vat_number   : null,
      client.tax_id        ? 'Tax ID: '  + client.tax_id        : null,
      client.business_reg  ? 'Reg No: '  + client.business_reg  : null,
      client.email,
      client.phone,
    ])}
  </div>

  <table>
    <thead>
      <tr>
        ${isPdf
          ? `<th>File Name</th><th class="num">Pages</th><th class="num">Rate/Page</th><th class="num">Amount</th>`
          : `<th>Description</th><th class="num">Amount</th>`}
      </tr>
    </thead>
    <tbody>
      ${buildRows()}
    </tbody>
  </table>

  <div class="totals">
    <div class="totals-inner">
      <table>
        <tr><td>Subtotal</td><td class="num">${formatPDF(invoice.subtotal, curr)}</td></tr>
        ${taxRows()}
        <tr class="total-row">
          <td>Total Due</td>
          <td class="num">${formatPDF(invoice.total, curr)}</td>
        </tr>
      </table>
    </div>
  </div>

  <div class="footer-note">
    <div class="line1">This is an Invoice Bill in PDF format and does not require signature.</div>
    <div class="line2">Thank you for your business.</div>
  </div>

</div>

<div class="print-bar no-print">
  <span>Review the invoice, then click Print to save as PDF — works perfectly with Hebrew and all languages.</span>
  <button class="print-btn" onclick="window.print()">🖨️ Print / Save as PDF</button>
</div>

</body>
</html>`

  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    // Popup blocked by browser — fall back to blob URL approach
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60000)
    return
  }
  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()
}
