import { useEffect, useMemo, useState } from 'react'
import Modal from '../components/Modal'
import { useToast } from '../components/Toast'
import { IconInvoice, IconDownload, IconCheck, IconEdit, IconTrash, IconAlert } from '../components/Icons'
import { getInvoices, updateInvoice, updateInvoiceStatus, getEntries, markEntriesPaid, getCompanyProfile, voidInvoice, getAvailableFinancialYears, getFinancialYear } from '../lib/api'
import { generateInvoicePDF } from '../lib/pdfInvoice'
import { generateInvoicePDFHebrew } from '../lib/pdfInvoiceHebrew'
import { formatCurrency, formatINR, buildInvoiceFilename, entriesContainRTL, formatFinancialYearLabel, formatFinancialYearDateRange, getFinancialYearRange } from '../lib/gst'

export default function InvoicesPage({ isAdmin }) {
  const [invoices, setInvoices] = useState(null)
  const [allEntries, setAllEntries] = useState([])
  const [statusFilter, setStatusFilter] = useState('all')
  const [monthFilter, setMonthFilter] = useState('')
  const [fyFilter, setFyFilter] = useState(getFinancialYear()) // '' = all financial years
  const [availableFYs, setAvailableFYs] = useState(null)
  const [editingInv, setEditingInv] = useState(null)
  const [markingPaid, setMarkingPaid] = useState(null)
  const [inrAmount, setInrAmount] = useState('')
  const [voidConfirm, setVoidConfirm] = useState(null)
  const toast = useToast()

  async function load() {
    try {
      const [inv, entries] = await Promise.all([getInvoices(), getEntries()])
      setInvoices(inv)
      setAllEntries(entries)
    } catch (e) { toast(e.message, 'error') }
  }
  useEffect(() => { load() }, [])
  useEffect(() => { getAvailableFinancialYears().then(setAvailableFYs).catch(e => toast(e.message, 'error')) }, [])

  const filtered = useMemo(() => {
    if (!invoices) return []
    const fyRange = fyFilter !== '' ? getFinancialYearRange(fyFilter) : null
    return invoices.filter(i => {
      if (statusFilter !== 'all' && i.status !== statusFilter) return false
      if (monthFilter && !i.invoice_date?.startsWith(monthFilter)) return false
      if (fyRange && (i.invoice_date < fyRange.start || i.invoice_date > fyRange.end)) return false
      return true
    })
  }, [invoices, statusFilter, monthFilter, fyFilter])

  async function handleMarkPaid(invoice) {
    const isForeign = invoice.currency !== 'INR'
    if (isForeign && isAdmin) { setMarkingPaid(invoice); setInrAmount(''); return }
    try {
      await updateInvoiceStatus(invoice.id, invoice.status === 'paid' ? 'unpaid' : 'paid')
      const relatedIds = allEntries.filter(e => e.invoice_id === invoice.id).map(e => e.id)
      if (relatedIds.length) await markEntriesPaid(relatedIds)
      toast(invoice.status === 'paid' ? 'Marked as unpaid' : 'Marked as paid', 'success')
      load()
    } catch (e) { toast(e.message, 'error') }
  }

  async function confirmMarkPaid() {
    try {
      await updateInvoiceStatus(markingPaid.id, 'paid', inrAmount ? Number(inrAmount) : null)
      const relatedIds = allEntries.filter(e => e.invoice_id === markingPaid.id).map(e => e.id)
      if (relatedIds.length) await markEntriesPaid(relatedIds)
      toast('Marked as paid', 'success'); setMarkingPaid(null); load()
    } catch (e) { toast(e.message, 'error') }
  }

  async function redownload(invoice) {
    try {
      const company = await getCompanyProfile()
      const entries = allEntries.filter(e => e.invoice_id === invoice.id)
      const client  = invoice.clients
      const needsHebrew = entriesContainRTL(entries, client)
      const pdf = needsHebrew
        ? await generateInvoicePDFHebrew({ invoice, client, company, entries })
        : await generateInvoicePDF({ invoice, client, company, entries })
      pdf.save(buildInvoiceFilename(invoice.invoice_number, invoice.clients?.name))
    } catch { toast('Could not regenerate PDF', 'error') }
  }


  async function handleVoid() {
    try {
      await voidInvoice(voidConfirm.id)
      toast(`Invoice ${voidConfirm.invoice_number} voided — entries reset to pending`, 'success')
      setVoidConfirm(null)
      load()
    } catch (e) { toast(e.message, 'error') }
  }

  async function saveInvoiceNumber() {
    try {
      await updateInvoice(editingInv.id, { invoice_number: editingInv.invoice_number })
      toast('Invoice number updated', 'success'); setEditingInv(null); load()
    } catch (e) { toast(e.message, 'error') }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Invoices</h1>
          <p className="page-subtitle">Track invoiced work, mark payments, and download PDFs.</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {['all','unpaid','paid'].map(s => (
          <button key={s} className={`btn btn-sm ${statusFilter === s ? 'btn-secondary' : 'btn-ghost'}`}
            style={statusFilter === s ? { borderColor: 'var(--ink)' } : {}}
            onClick={() => setStatusFilter(s)}>
            {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
        <select value={fyFilter} onChange={e => setFyFilter(e.target.value === '' ? '' : Number(e.target.value))}
          style={{ padding: '7px 11px', border: '1px solid var(--line-strong)', borderRadius: 6, fontSize: 13, background: 'white', fontWeight: 600 }}>
          <option value="">All financial years</option>
          {(availableFYs || [fyFilter]).map(fy => (
            <option key={fy} value={fy}>{formatFinancialYearLabel(fy)}</option>
          ))}
        </select>
        <input type="month" value={monthFilter} onChange={e => setMonthFilter(e.target.value)}
          style={{ padding: '7px 11px', border: '1px solid var(--line-strong)', borderRadius: 6, fontSize: 13 }} />
        {(statusFilter !== 'all' || monthFilter || fyFilter !== '') && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setStatusFilter('all'); setMonthFilter(''); setFyFilter('') }}>Clear</button>
        )}
      </div>
      {fyFilter !== '' && (
        <div style={{ fontSize: 11.5, color: 'var(--slate-light)', marginBottom: 16 }}>{formatFinancialYearDateRange(fyFilter)}</div>
      )}

      {invoices === null ? (
        <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="loading-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="card empty-state">
          <IconInvoice className="empty-state-icon" />
          <h3>No invoices here</h3>
          <p>Generate invoices from pending ledger entries.</p>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {['Invoice #','Client','Date','Type','Currency','Total','Status',''].map(h => (
                  <th key={h} style={{ textAlign: h==='Total' ? 'right' : 'left', padding: '12px 16px', fontSize: 11.5, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(inv => (
                <tr key={inv.id} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td className="mono" style={{ padding: '13px 16px', fontWeight: 600 }}>
                    {inv.invoice_number}
                    {isAdmin && (
                      <button className="btn btn-ghost btn-sm" style={{ marginLeft: 6 }} onClick={() => setEditingInv({ ...inv })}><IconEdit width={12} /></button>
                    )}
                  </td>
                  <td style={{ padding: '13px 16px', fontSize: 13.5 }}>{inv.clients?.name}</td>
                  <td className="mono" style={{ padding: '13px 16px', fontSize: 12.5, color: 'var(--slate)' }}>
                    {inv.invoice_date}
                    <div style={{ fontSize: 11, color: 'var(--slate-light)' }}>
                      {inv.invoice_date?.slice(0, 7)}
                    </div>
                  </td>
                  <td style={{ padding: '13px 16px', fontSize: 12.5 }}>
                    <span className={`badge ${inv.template_type === 'lut' ? 'badge-invoiced' : 'badge-pending'}`}>
                      {inv.template_type === 'lut' ? 'LUT' : inv.is_tamil_nadu ? 'CGST+SGST' : 'IGST'}
                    </span>
                  </td>
                  <td className="mono" style={{ padding: '13px 16px', fontSize: 12.5 }}>{inv.currency || 'INR'}</td>
                  <td className="mono" style={{ padding: '13px 16px', textAlign: 'right', fontWeight: 700 }}>
                    {formatCurrency(inv.total, inv.currency)}
                    {inv.inr_equivalent && inv.currency !== 'INR' && (
                      <div style={{ fontSize: 11, color: 'var(--slate-light)', fontWeight: 400 }}>≈ {formatINR(inv.inr_equivalent)} received</div>
                    )}
                  </td>
                  <td style={{ padding: '13px 16px' }}>
                    <span className={`badge ${inv.status === 'paid' ? 'badge-paid' : 'badge-pending'}`}>
                      {inv.status === 'paid' ? 'Paid' : 'Unpaid'}
                    </span>
                  </td>
                  <td style={{ padding: '13px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => redownload(inv)} title="Download PDF"><IconDownload width={14} /></button>
                    {isAdmin && <button className="btn btn-ghost btn-sm" onClick={() => setVoidConfirm(inv)} title="Void invoice" style={{ color: 'var(--red)' }}><IconTrash width={14} /></button>}
                    {(isAdmin || inv.clients?.client_type === 'website') && (
                      <button className={`btn btn-sm ${inv.status === 'paid' ? 'btn-secondary' : 'btn-primary'}`} onClick={() => handleMarkPaid(inv)}>
                        <IconCheck width={13} /> {inv.status === 'paid' ? 'Unpaid' : 'Mark paid'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit invoice number */}
      {editingInv && (
        <Modal title="Edit invoice number" onClose={() => setEditingInv(null)} width={400}>
          <div className="field">
            <label>Invoice number</label>
            <input className="mono" value={editingInv.invoice_number} onChange={e => setEditingInv({ ...editingInv, invoice_number: e.target.value })} />
          </div>
          <div className="form-actions">
            <button className="btn btn-secondary" onClick={() => setEditingInv(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveInvoiceNumber}>Save</button>
          </div>
        </Modal>
      )}

      {/* Mark foreign currency invoice as paid */}
      {markingPaid && (
        <Modal title="Mark as paid — foreign currency" onClose={() => setMarkingPaid(null)} width={420}>
          <p style={{ fontSize: 13.5, color: 'var(--slate)', lineHeight: 1.6, margin: '0 0 16px' }}>
            This invoice was issued in <strong>{markingPaid.currency}</strong> for <strong>{formatCurrency(markingPaid.total, markingPaid.currency)}</strong>. Enter the INR amount you actually received (for your records).
          </p>
          <div className="field">
            <label>Amount received in INR <span className="field-hint">(optional — for accounting reference)</span></label>
            <input type="number" min="0" step="0.01" value={inrAmount} onChange={e => setInrAmount(e.target.value)} placeholder="0.00" className="mono" />
          </div>
          <div className="form-actions">
            <button className="btn btn-secondary" onClick={() => setMarkingPaid(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={confirmMarkPaid}>Mark as paid</button>
          </div>
        </Modal>
      )}

      {/* Void invoice confirmation */}
      {voidConfirm && (
        <Modal title="Void invoice?" onClose={() => setVoidConfirm(null)} width={440}>
          <div style={{ background: 'var(--red-soft)', border: '1px solid var(--red)', borderRadius: 8, padding: '12px 16px', marginBottom: 18, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <IconAlert width={18} style={{ color: 'var(--red)', flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 13.5, color: 'var(--red)', lineHeight: 1.6 }}>
              <strong>This will permanently delete invoice {voidConfirm?.invoice_number}.</strong> All ledger entries linked to it will be reset to <em>pending</em> so you can re-invoice them if needed.
            </div>
          </div>
          <p style={{ fontSize: 13.5, color: 'var(--slate)', lineHeight: 1.6, margin: '0 0 4px' }}>
            This action is recorded in the audit log and cannot be undone.
          </p>
          <div className="form-actions">
            <button className="btn btn-secondary" onClick={() => setVoidConfirm(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={handleVoid}>Void invoice</button>
          </div>
        </Modal>
      )}
    </>
  )
}
