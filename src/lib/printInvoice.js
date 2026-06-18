import { formatPDF, lineTotal } from './gst'

/**
 * Opens a new browser tab with a fully styled, print-ready invoice.
 * Uses browser fonts so all Unicode (Hebrew, Arabic, etc.) renders correctly.
 * User does Ctrl+P / Cmd+P → Save as PDF.
 */
export function openPrintInvoice({ invoice, client, company, entries, templateType }) {
  const curr   = invoice.currency || 'INR'
  const isLUT  = templateType === 'lut' || invoice.template_type === 'lut'
  const isPdf  = client.client_type === 'pdf'
  const accent = company.accent_color || '#0F6B5C'

  // Detect if any text contains Hebrew/RTL characters
  function hasRTL(str) {
    if (!str) return false
    return /[\u0590-\u05FF\u0600-\u06FF\uFB1D-\uFDFD\uFE70-\uFEFF]/.test(str)
  }

  // Build line item rows
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

    // Website entries — expand service_items
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

  // GST / tax rows
  function taxRows() {
    if (isLUT) return `<tr><td>GST</td><td class="num">Nil (LUT)</td></tr>`
    if (invoice.is_tamil_nadu) return `
      <tr><td>CGST (9%)</td><td class="num">${formatPDF(invoice.cgst, curr)}</td></tr>
      <tr><td>SGST (9%)</td><td class="num">${formatPDF(invoice.sgst, curr)}</td></tr>`
    if (invoice.igst > 0) return `<tr><td>IGST (18%)</td><td class="num">${formatPDF(invoice.igst, curr)}</td></tr>`
    return ''
  }

  // Footer fields
  const footerParts = [
    company.bank_details,
    company.gstin   ? `GSTIN: ${company.gstin}`     : null,
    company.tan     ? `TAN: ${company.tan}`          : null,
    isLUT && company.lut_arn ? `LUT ARN: ${company.lut_arn}` : null,
    company.hsn_sac ? `HSN/SAC: ${company.hsn_sac}` : null,
    company.website,
    company.email,
  ].filter(Boolean).join('&nbsp;&nbsp;·&nbsp;&nbsp;')

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
      padding: 0;
    }

    .page {
      max-width: 780px;
      margin: 0 auto;
      padding: 40px 48px 60px;
    }

    /* ── Header ── */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 28px;
    }
    .logo img { max-height: 55px; max-width: 130px; object-fit: contain; }
    .logo-placeholder {
      font-size: 18pt; font-weight: 800; color: ${accent};
    }
    .invoice-meta { text-align: right; }
    .invoice-title {
      font-size: 22pt; font-weight: 800;
      color: #1C2433; letter-spacing: -0.02em;
    }
    .invoice-number {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 10pt; color: #5B6472; margin-top: 4px;
    }
    .invoice-date { font-size: 9.5pt; color: #5B6472; margin-top: 2px; }
    .lut-badge {
      display: inline-block; margin-top: 6px;
      background: ${accent}22; color: ${accent};
      font-size: 8pt; font-weight: 700;
      padding: 3px 8px; border-radius: 4px;
      border: 1px solid ${accent}55;
    }

    /* ── Divider ── */
    hr { border: none; border-top: 1px solid #E4E0D6; margin: 0 0 22px; }

    /* ── Address blocks ── */
    .addr-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      margin-bottom: 28px;
    }
    .addr-label {
      font-size: 7.5pt; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.06em;
      color: ${accent}; margin-bottom: 6px;
    }
    .addr-name {
      font-size: 12pt; font-weight: 700;
      color: #1C2433; margin-bottom: 5px;
    }
    .addr-lines { font-size: 9pt; color: #5B6472; line-height: 1.7; }

    /* ── Table ── */
    table {
      width: 100%; border-collapse: collapse;
      margin-bottom: 16px;
    }
    thead tr {
      background: #1C2433;
      color: white;
    }
    thead th {
      padding: 9px 12px;
      font-size: 8.5pt; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.04em;
      text-align: left;
    }
    thead th.num { text-align: right; }

    tbody tr:nth-child(even) { background: #F8F6F1; }
    tbody td {
      padding: 8px 12px;
      font-size: 9.5pt;
      color: #2E394E;
      border-bottom: 1px solid #EEE;
    }
    td.num {
      text-align: right;
      font-family: 'IBM Plex Mono', monospace;
      font-size: 9pt;
      white-space: nowrap;
    }

    /* ── Totals ── */
    .totals {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 28px;
    }
    .totals-inner { width: 240px; }
    .totals-inner table { margin-bottom: 0; }
    .totals-inner td { border-bottom: none; padding: 4px 8px; font-size: 9.5pt; }
    .totals-inner .total-row td {
      font-size: 11pt; font-weight: 700;
      color: ${accent};
      border-top: 1.5px solid #E4E0D6;
      padding-top: 8px;
    }

    /* ── Footer ── */
    .footer {
      border-top: 1px solid #E4E0D6;
      padding-top: 16px;
      margin-top: 8px;
    }
    .footer-label {
      font-size: 7.5pt; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.06em;
      color: ${accent}; margin-bottom: 8px;
    }
    .footer-content {
      font-size: 8.5pt; color: #5B6472;
      line-height: 1.8;
      white-space: pre-line;
    }
    .footer-meta {
      margin-top: 12px; font-size: 8pt;
      color: #AAA; text-align: center;
    }

    /* ── Print styles ── */
    @media print {
      body { padding: 0; }
      .page { padding: 20px 32px 40px; max-width: 100%; }
      .no-print { display: none !important; }
      @page { margin: 10mm; size: A4; }
    }

    /* ── Print button (screen only) ── */
    .print-bar {
      position: fixed; bottom: 0; left: 0; right: 0;
      background: #1C2433; padding: 14px 24px;
      display: flex; align-items: center; justify-content: space-between;
      gap: 16px; z-index: 100;
    }
    .print-bar span { color: rgba(255,255,255,0.7); font-size: 13px; }
    .print-btn {
      background: ${accent}; color: white;
      border: none; border-radius: 8px;
      padding: 10px 24px; font-size: 13px; font-weight: 700;
      cursor: pointer; font-family: inherit;
    }
    .print-btn:hover { opacity: 0.9; }
  </style>
</head>
<body>

<div class="page">

  <!-- Header -->
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
      ${isLUT ? `<div class="lut-badge">Export of Services · LUT · Zero GST${company.lut_arn ? ' · ARN: ' + company.lut_arn : ''}</div>` : ''}
    </div>
  </div>

  <hr />

  <!-- Address blocks -->
  <div class="addr-row">
    ${addrBlock('From', company.company_name, [
      company.address,
      company.gstin ? 'GSTIN: ' + company.gstin : null,
      company.pan   ? 'PAN: '   + company.pan   : null,
      company.tan   ? 'TAN: '   + company.tan   : null,
      company.email,
      company.phone,
      company.website,
    ])}
    ${addrBlock('Bill To', client.name, [
      client.address,
      client.gstin        ? 'GSTIN: '   + client.gstin        : null,
      client.vat_number   ? 'VAT: '     + client.vat_number   : null,
      client.tax_id       ? 'Tax ID: '  + client.tax_id       : null,
      client.business_reg ? 'Reg No: '  + client.business_reg : null,
      client.email,
      client.phone,
    ])}
  </div>

  <!-- Line items -->
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

  <!-- Totals -->
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

  <!-- Footer -->
  ${footerParts ? `
  <div class="footer">
    <div class="footer-label">Payment &amp; Company Details</div>
    <div class="footer-content">${footerParts}</div>
  </div>` : ''}

  <div class="footer-meta">Thank you for your business.</div>

</div>

<!-- Print bar (hidden when printing) -->
<div class="print-bar no-print">
  <span>Review the invoice, then click Print to save as PDF — works perfectly with Hebrew and all languages.</span>
  <button class="print-btn" onclick="window.print()">🖨️ Print / Save as PDF</button>
</div>

</body>
</html>`

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  window.open(url, '_blank')
  // Clean up after a delay
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}
