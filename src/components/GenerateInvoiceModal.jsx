import { useEffect, useState } from 'react'
import Modal from './Modal'
import { useToast } from './Toast'
import { isTamilNaduGSTIN, calculateGST, formatCurrency, formatINR, lineTotal } from '../lib/gst'
import { getNextInvoiceNumber, createInvoice, markEntriesInvoiced, getCompanyProfile } from '../lib/api'
import { generateInvoicePDF } from '../lib/pdfInvoice'

export default function GenerateInvoiceModal({ client, entries, onClose, onGenerated }) {
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10))
  const [isTN, setIsTN] = useState(true)
  const [templateType, setTemplateType] = useState(client.client_type === 'pdf' ? 'lut' : 'standard')
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const toast = useToast()
  const currency = client.currency || 'INR'
  const isINR = currency === 'INR'

  useEffect(() => {
    async function init() {
      try {
        const num = await getNextInvoiceNumber()
        setInvoiceNumber(num)
        const tn = isTamilNaduGSTIN(client.gstin)
        setIsTN(tn === null ? true : tn)
      } catch (e) { toast(e.message, 'error') }
      finally { setLoading(false) }
    }
    init()
  }, [])

  const subtotal = entries.reduce((a, e) => a + (Number(e.line_total) || lineTotal(e)), 0)
  const applyGST = isINR && !client.is_international
  const gst = applyGST ? calculateGST(subtotal, isTN) : { cgst: 0, sgst: 0, igst: 0, total: subtotal }

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
        currency,
        is_tamil_nadu: isTN,
        template_type: templateType,
        status: 'unpaid',
      })
      await markEntriesInvoiced(entries.map(e => e.id), invoice.id)
      const pdf = await generateInvoicePDF({ invoice, client, company, entries, templateType })
      pdf.save(`${invoiceNumber.trim()}.pdf`)
      toast(`Invoice ${invoiceNumber} generated`, 'success')
      onGenerated()
    } catch (e) { toast(e.message || 'Could not generate invoice', 'error') }
    finally { setGenerating(false) }
  }

  return (
    <Modal title="Generate invoice" onClose={onClose} width={520}>
      {loading ? (
        <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="loading-spin" /></div>
      ) : (
        <>
          <div style={{ background: 'var(--paper)', padding: '10px 14px', borderRadius: 8, marginBottom: 18, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 11.5, color: 'var(--slate)' }}>Client</span>
            <strong style={{ fontSize: 14.5 }}>{client.name}</strong>
            <span className="mono" style={{ fontSize: 12, color: 'var(--slate)' }}>Currency: {currency} {client.is_international && '· International'}</span>
          </div>

          <div className="field-row">
            <div className="field">
              <label>Invoice number</label>
              <input className="mono" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} />
            </div>
            <div className="field">
              <label>Invoice date</label>
              <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} />
            </div>
          </div>

          <div className="field">
            <label>Invoice template</label>
            <div className="radio-tabs" style={{ marginBottom: 0 }}>
              <button className={`radio-tab ${templateType === 'lut' ? 'selected' : ''}`} onClick={() => setTemplateType('lut')}>
                LUT (No GST — export)
              </button>
              <button className={`radio-tab ${templateType === 'standard' ? 'selected' : ''}`} onClick={() => setTemplateType('standard')}>
                Standard (with GST)
              </button>
            </div>
            <span className="field-hint" style={{ marginTop: 6, display: 'block' }}>
              {client.client_type === 'pdf' ? 'LUT is default for PDF Accessibility clients (most are international).' : 'Standard GST is default for Website & Domain clients.'}
            </span>
          </div>

          {templateType === 'standard' && isINR && !client.is_international && (
            <div className="field">
              <label>Tax type</label>
              <div className="radio-tabs" style={{ marginBottom: 0 }}>
                <button className={`radio-tab ${isTN ? 'selected' : ''}`} onClick={() => setIsTN(true)}>CGST + SGST (Tamil Nadu)</button>
                <button className={`radio-tab ${!isTN ? 'selected' : ''}`} onClick={() => setIsTN(false)}>IGST (other states)</button>
              </div>
              <span className="field-hint" style={{ marginTop: 6, display: 'block' }}>
                {client.gstin ? 'Auto-detected from GSTIN.' : 'No GSTIN on file — please confirm.'}
              </span>
            </div>
          )}

          <div className="section-label">{entries.length} entr{entries.length === 1 ? 'y' : 'ies'} included</div>
          <div style={{ maxHeight: 130, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8, marginBottom: 18 }}>
            {entries.map(e => (
              <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', fontSize: 12.5, borderBottom: '1px solid var(--line)' }}>
                <span style={{ color: 'var(--slate)' }}>{e.entry_type === 'pdf' ? e.file_name : (e.service_items?.[0]?.description || e.website_renewal_desc || 'Maintenance')}</span>
                <span className="mono">{formatCurrency(Number(e.line_total) || lineTotal(e), currency)}</span>
              </div>
            ))}
          </div>

          <div style={{ background: 'var(--teal-soft)', borderRadius: 10, padding: '14px 16px' }}>
            {[
              ['Subtotal', subtotal],
              ...(applyGST && templateType === 'standard' ? (isTN ? [['CGST (9%)', gst.cgst], ['SGST (9%)', gst.sgst]] : [['IGST (18%)', gst.igst]]) : []),
            ].map(([label, val]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 13, color: 'var(--ink-soft)' }}>
                <span>{label}</span><span className="mono">{formatCurrency(val, currency)}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 0', fontWeight: 700, fontSize: 14.5, color: 'var(--teal)', borderTop: '1px solid rgba(15,107,92,0.2)', marginTop: 6 }}>
              <span>Total</span><span className="mono">{formatCurrency(gst.total, currency)}</span>
            </div>
            {templateType === 'lut' && (
              <div style={{ fontSize: 11.5, color: 'var(--teal)', marginTop: 8, fontStyle: 'italic' }}>
                LUT — Zero GST under Letter of Undertaking for export of services
              </div>
            )}
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
