import { useEffect, useState } from 'react'
import Modal from './Modal'
import { useToast } from './Toast'
import { isTamilNaduGSTIN, calculateGST, formatINR, lineTotal } from '../lib/gst'
import { getNextInvoiceNumber, createInvoice, markEntriesInvoiced, getCompanyProfile } from '../lib/api'
import { generateInvoicePDF } from '../lib/pdfInvoice'
import '../forms.css'

export default function GenerateInvoiceModal({ client, entries, onClose, onGenerated }) {
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10))
  const [isTN, setIsTN] = useState(true)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const toast = useToast()

  useEffect(() => {
    async function init() {
      try {
        const num = await getNextInvoiceNumber()
        setInvoiceNumber(num)
        const tn = isTamilNaduGSTIN(client.gstin)
        setIsTN(tn === null ? true : tn)
      } catch (e) {
        toast(e.message, 'error')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [client])

  const subtotal = entries.reduce((a, e) => a + lineTotal(e), 0)
  const gst = calculateGST(subtotal, isTN)

  async function handleGenerate() {
    if (!invoiceNumber.trim()) return toast('Invoice number is required', 'error')
    setGenerating(true)
    try {
      const company = await getCompanyProfile()

      const invoice = await createInvoice({
        invoice_number: invoiceNumber.trim(),
        client_id: client.id,
        invoice_date: invoiceDate,
        subtotal,
        cgst: gst.cgst,
        sgst: gst.sgst,
        igst: gst.igst,
        total: gst.total,
        is_tamil_nadu: isTN,
        status: 'unpaid',
      })

      await markEntriesInvoiced(entries.map((e) => e.id), invoice.id)

      const pdf = await generateInvoicePDF({ invoice, client, company, entries })
      pdf.save(`${invoiceNumber.trim()}.pdf`)

      toast(`Invoice ${invoiceNumber} generated`, 'success')
      onGenerated()
    } catch (e) {
      toast(e.message || 'Could not generate invoice', 'error')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Modal title="Generate invoice" onClose={onClose} width={520}>
      {loading ? (
        <div className="center-screen" style={{ height: 120 }}><div className="loading-spin" /></div>
      ) : (
        <>
          <div className="field" style={{ background: 'var(--paper)', padding: '10px 14px', borderRadius: 8, marginBottom: 18 }}>
            <span style={{ fontSize: 12, color: 'var(--slate)' }}>Client</span>
            <strong style={{ fontSize: 14.5 }}>{client.name}</strong>
            {client.gstin && <span className="mono" style={{ fontSize: 12, color: 'var(--slate)' }}>GSTIN: {client.gstin}</span>}
          </div>

          <div className="field-row">
            <div className="field">
              <label>Invoice number</label>
              <input className="mono" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
            </div>
            <div className="field">
              <label>Invoice date</label>
              <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
            </div>
          </div>

          <div className="field">
            <label>Tax type</label>
            <div className="radio-tabs" style={{ marginBottom: 0 }}>
              <button className={`radio-tab ${isTN ? 'selected' : ''}`} onClick={() => setIsTN(true)}>CGST + SGST (Tamil Nadu)</button>
              <button className={`radio-tab ${!isTN ? 'selected' : ''}`} onClick={() => setIsTN(false)}>IGST (other states)</button>
            </div>
            {client.gstin ? (
              <span className="field-hint">Auto-detected from GSTIN — change if needed.</span>
            ) : (
              <span className="field-hint">No GSTIN on file; defaulting to Tamil Nadu. Please confirm.</span>
            )}
          </div>

          <div className="section-label">{entries.length} entr{entries.length === 1 ? 'y' : 'ies'} included</div>
          <div style={{ maxHeight: 130, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8, marginBottom: 18 }}>
            {entries.map((e) => (
              <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', fontSize: 12.5, borderBottom: '1px solid var(--line)' }}>
                <span style={{ color: 'var(--slate)' }}>{e.entry_type === 'pdf' ? e.file_name : (e.website_renewal_desc || e.google_subscription_desc || 'Maintenance')}</span>
                <span className="mono">{formatINR(lineTotal(e))}</span>
              </div>
            ))}
          </div>

          <div style={{ background: 'var(--teal-soft)', borderRadius: 10, padding: '14px 16px' }}>
            <Row label="Subtotal" value={formatINR(subtotal)} />
            {isTN ? (
              <>
                <Row label="CGST (9%)" value={formatINR(gst.cgst)} />
                <Row label="SGST (9%)" value={formatINR(gst.sgst)} />
              </>
            ) : (
              <Row label="IGST (18%)" value={formatINR(gst.igst)} />
            )}
            <Row label="Total" value={formatINR(gst.total)} bold />
          </div>

          <div className="form-actions">
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={handleGenerate} disabled={generating}>
              {generating ? 'Generating…' : 'Generate & download PDF'}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}

function Row({ label, value, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: bold ? '8px 0 0' : '3px 0', fontWeight: bold ? 700 : 500, fontSize: bold ? 14.5 : 13, color: bold ? 'var(--teal)' : 'var(--ink-soft)', borderTop: bold ? '1px solid rgba(15,107,92,0.2)' : 'none', marginTop: bold ? 6 : 0 }}>
      <span>{label}</span>
      <span className="mono">{value}</span>
    </div>
  )
}
