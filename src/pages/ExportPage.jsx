import { useState } from 'react'
import { useToast } from '../components/Toast'
import { IconExport, IconCSV, IconDownload } from '../components/Icons'
import { getEntries, getClients, getInvoices } from '../lib/api'
import { lineTotal, todayIST } from '../lib/gst'

function toCSV(rows, headers) {
  const escape = v => typeof v === 'string' && (v.includes(',') || v.includes('"') || v.includes('\n'))
    ? `"${v.replace(/"/g, '""')}"` : String(v ?? '')
  const lines = [headers.join(','), ...rows.map(row => headers.map(h => escape(row[h])).join(','))]
  return lines.join('\n')
}

function downloadCSV(content, filename) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

async function exportLedger() {
  const entries = await getEntries()
  const headers = ['Date', 'Client', 'Type', 'File/Description', 'Pages', 'Rate/Page', 'Currency', 'Total', 'Status', 'Invoice ID']
  const rows = entries.map(e => ({
    Date: e.entry_date,
    Client: e.clients?.name || '',
    Type: e.entry_type,
    'File/Description': e.entry_type === 'pdf' ? e.file_name : (e.service_items?.[0]?.description || ''),
    Pages: e.pages || '',
    'Rate/Page': e.rate_per_page || '',
    Currency: e.currency || 'INR',
    Total: Number(e.line_total) || lineTotal(e),
    Status: e.status,
    'Invoice ID': e.invoice_id || '',
  }))
  downloadCSV(toCSV(rows, headers), `ledger-${todayIST()}.csv`)
}

async function exportClients() {
  const clients = await getClients()
  const headers = ['Name', 'Type', 'Currency', 'International', 'GSTIN', 'VAT Number', 'Tax ID', 'Business Reg', 'Email', 'Phone', 'Address']
  const rows = clients.map(c => ({
    Name: c.name, Type: c.client_type, Currency: c.currency,
    International: c.is_international ? 'Yes' : 'No',
    GSTIN: c.gstin || '', 'VAT Number': c.vat_number || '',
    'Tax ID': c.tax_id || '', 'Business Reg': c.business_reg || '',
    Email: c.email || '', Phone: c.phone || '', Address: c.address || '',
  }))
  downloadCSV(toCSV(rows, headers), `clients-${todayIST()}.csv`)
}

async function exportInvoices() {
  const invoices = await getInvoices()
  const headers = ['Invoice #', 'Client', 'Date', 'Currency', 'Subtotal', 'CGST', 'SGST', 'IGST', 'Total', 'INR Equivalent', 'Template', 'Status']
  const rows = invoices.map(i => ({
    'Invoice #': i.invoice_number,
    Client: i.clients?.name || '',
    Date: i.invoice_date,
    Currency: i.currency || 'INR',
    Subtotal: i.subtotal,
    CGST: i.cgst || 0,
    SGST: i.sgst || 0,
    IGST: i.igst || 0,
    Total: i.total,
    'INR Equivalent': i.inr_equivalent || '',
    Template: i.template_type || 'standard',
    Status: i.status,
  }))
  downloadCSV(toCSV(rows, headers), `invoices-${todayIST()}.csv`)
}

export default function ExportPage() {
  const [loading, setLoading] = useState('')
  const toast = useToast()

  async function run(fn, label) {
    setLoading(label)
    try { await fn(); toast(`${label} downloaded`, 'success') }
    catch (e) { toast(e.message, 'error') }
    finally { setLoading('') }
  }

  const cards = [
    { label: 'Ledger entries', desc: 'All work entries — date, client, file/description, pages, rate, total, status.', fn: exportLedger },
    { label: 'Client list',    desc: 'All clients — name, type, currency, tax details, contact information.',          fn: exportClients },
    { label: 'Invoice list',   desc: 'All invoices — number, client, date, currency, tax breakdown, totals, status.',  fn: exportInvoices },
  ]

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Data Export</h1>
          <p className="page-subtitle">Download your data as CSV files, importable into Excel or any spreadsheet app.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {cards.map(c => (
          <div key={c.label} className="card card-pad">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--teal-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <IconCSV width={18} style={{ color: 'var(--teal)' }} />
              </div>
              <strong style={{ fontSize: 14 }}>{c.label}</strong>
            </div>
            <p style={{ fontSize: 13, color: 'var(--slate)', lineHeight: 1.6, margin: '0 0 16px' }}>{c.desc}</p>
            <button className="btn btn-secondary btn-sm" onClick={() => run(c.fn, c.label)} disabled={loading === c.label}>
              <IconDownload width={13} /> {loading === c.label ? 'Exporting…' : 'Download CSV'}
            </button>
          </div>
        ))}
      </div>

      <div className="card card-pad" style={{ marginTop: 16, background: 'var(--paper)' }}>
        <p style={{ fontSize: 13, color: 'var(--slate)', margin: 0 }}>
          <strong>Tip:</strong> Open the downloaded CSV in Excel or Google Sheets. In Excel, use <em>Data → From Text/CSV</em> for best results with special characters.
        </p>
      </div>
    </>
  )
}
