import { useEffect, useMemo, useState } from 'react'
import { useToast } from '../components/Toast'
import { IconInvoice, IconDownload, IconCheck } from '../components/Icons'
import { getInvoices, updateInvoiceStatus, getCompanyProfile, getEntries, markEntriesPaid } from '../lib/api'
import { generateInvoicePDF } from '../lib/pdfInvoice'
import { formatINR } from '../lib/gst'

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState(null)
  const [allEntries, setAllEntries] = useState([])
  const [statusFilter, setStatusFilter] = useState('all')
  const toast = useToast()

  async function load() {
    try {
      const [inv, entries] = await Promise.all([getInvoices(), getEntries()])
      setInvoices(inv)
      setAllEntries(entries)
    } catch (e) {
      toast(e.message, 'error')
    }
  }
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    if (!invoices) return []
    if (statusFilter === 'all') return invoices
    return invoices.filter((i) => i.status === statusFilter)
  }, [invoices, statusFilter])

  async function togglePaid(invoice) {
    try {
      const newStatus = invoice.status === 'paid' ? 'unpaid' : 'paid'
      await updateInvoiceStatus(invoice.id, newStatus)
      const relatedEntryIds = allEntries.filter((e) => e.invoice_id === invoice.id).map((e) => e.id)
      if (newStatus === 'paid' && relatedEntryIds.length) {
        await markEntriesPaid(relatedEntryIds)
      }
      toast(newStatus === 'paid' ? 'Marked as paid' : 'Marked as unpaid', 'success')
      load()
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  async function redownload(invoice) {
    try {
      const company = await getCompanyProfile()
      const entries = allEntries.filter((e) => e.invoice_id === invoice.id)
      const client = invoice.clients
      const pdf = await generateInvoicePDF({ invoice, client, company, entries })
      pdf.save(`${invoice.invoice_number}.pdf`)
    } catch {
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Invoices</h1>
          <p className="page-subtitle">Track what's been invoiced and mark payments as they come in.</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['all', 'unpaid', 'paid'].map((s) => (
          <button
            key={s}
            className={`btn btn-sm ${statusFilter === s ? 'btn-secondary' : 'btn-ghost'}`}
            style={statusFilter === s ? { borderColor: 'var(--ink)' } : {}}
            onClick={() => setStatusFilter(s)}
          >
            {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {invoices === null ? (
        <div className="center-screen" style={{ height: 200 }}><div className="loading-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="card empty-state">
          <IconInvoice className="empty-state-icon" />
          <h3>No invoices yet</h3>
          <p>Generate one from the Ledger page once you've logged some work.</p>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {['Invoice #', 'Client', 'Date', 'Tax', 'Total', 'Status', ''].map((h) => (
                  <th key={h} style={{ textAlign: h === 'Total' ? 'right' : 'left', padding: '12px 18px', fontSize: 11.5, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv) => (
                <tr key={inv.id} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td className="mono" style={{ padding: '13px 18px', fontWeight: 600 }}>{inv.invoice_number}</td>
                  <td style={{ padding: '13px 18px', fontSize: 13.5 }}>{inv.clients?.name}</td>
                  <td className="mono" style={{ padding: '13px 18px', fontSize: 13, color: 'var(--slate)' }}>{inv.invoice_date}</td>
                  <td style={{ padding: '13px 18px', fontSize: 12.5, color: 'var(--slate)' }}>{inv.is_tamil_nadu ? 'CGST+SGST' : 'IGST'}</td>
                  <td className="mono" style={{ padding: '13px 18px', textAlign: 'right', fontWeight: 700 }}>{formatINR(inv.total)}</td>
                  <td style={{ padding: '13px 18px' }}>
                    <span className={`badge ${inv.status === 'paid' ? 'badge-paid' : 'badge-pending'}`}>
                      {inv.status === 'paid' ? 'Paid' : 'Unpaid'}
                    </span>
                  </td>
                  <td style={{ padding: '13px 18px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => redownload(inv)} title="Download PDF">
                      <IconDownload width={14} height={14} />
                    </button>
                    <button
                      className={`btn btn-sm ${inv.status === 'paid' ? 'btn-secondary' : 'btn-primary'}`}
                      onClick={() => togglePaid(inv)}
                    >
                      <IconCheck width={13} height={13} /> {inv.status === 'paid' ? 'Mark unpaid' : 'Mark paid'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
