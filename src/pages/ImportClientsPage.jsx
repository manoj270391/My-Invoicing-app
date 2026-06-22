import { useRef, useState } from 'react'
import { useToast } from '../components/Toast'
import { IconUpload, IconFile, IconTrash, IconCheck } from '../components/Icons'
import { extractClientFromInvoice } from '../lib/invoiceExtraction'
import { createClient } from '../lib/api'
import { CURRENCIES } from '../lib/gst'

// One row per uploaded invoice, holding extraction state + editable fields
function makeRow(file) {
  return {
    id: Math.random().toString(36).slice(2),
    file,
    fileName: file.name,
    status: 'pending', // pending | extracting | done | error
    error: null,
    client_name: '', gstin: '', email: '', phone: '', address: '',
    client_type: 'pdf', currency: 'INR', is_international: false,
    selected: true,
  }
}

export default function ImportClientsPage() {
  const [rows, setRows] = useState([])
  const [extracting, setExtracting] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef(null)
  const toast = useToast()

  function handleFilesSelected(e) {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    setRows(prev => [...prev, ...files.map(makeRow)])
    e.target.value = '' // allow re-selecting the same files later
  }

  function updateRow(id, patch) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
  }

  function removeRow(id) {
    setRows(prev => prev.filter(r => r.id !== id))
  }

  async function runExtraction() {
    setExtracting(true)
    const pending = rows.filter(r => r.status === 'pending')
    for (const row of pending) {
      updateRow(row.id, { status: 'extracting' })
      try {
        const result = await extractClientFromInvoice(row.file)
        updateRow(row.id, { ...result, status: 'done' })
      } catch (err) {
        updateRow(row.id, { status: 'error', error: err.message })
      }
    }
    setExtracting(false)
  }

  async function saveSelected() {
    const toSave = rows.filter(r => r.selected && r.status === 'done' && r.client_name.trim())
    if (toSave.length === 0) return toast('Nothing selected to save', 'error')
    setSaving(true)
    let savedCount = 0
    for (const row of toSave) {
      try {
        await createClient({
          name: row.client_name.trim(),
          client_type: row.client_type,
          gstin: row.gstin,
          email: row.email,
          phone: row.phone,
          address: row.address,
          currency: row.currency,
          is_international: row.is_international,
        })
        savedCount++
      } catch (err) {
        toast(`Could not save ${row.client_name}: ${err.message}`, 'error')
      }
    }
    setSaving(false)
    if (savedCount > 0) {
      toast(`${savedCount} client${savedCount !== 1 ? 's' : ''} created`, 'success')
      setRows(prev => prev.filter(r => !(r.selected && r.status === 'done')))
    }
  }

  const pendingCount = rows.filter(r => r.status === 'pending').length
  const doneCount = rows.filter(r => r.status === 'done').length
  const selectedDoneCount = rows.filter(r => r.selected && r.status === 'done').length

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Import Clients from Invoices</h1>
          <p className="page-subtitle">Upload old invoice PDFs — extracted client details appear below for you to review before saving.</p>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 20 }}>
        <input ref={fileRef} type="file" accept="application/pdf" multiple hidden onChange={handleFilesSelected} />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={() => fileRef.current.click()}>
            <IconUpload width={14} /> Select invoice PDFs
          </button>
          {pendingCount > 0 && (
            <button className="btn btn-primary" onClick={runExtraction} disabled={extracting}>
              {extracting ? 'Extracting…' : `Extract details from ${pendingCount} file${pendingCount !== 1 ? 's' : ''}`}
            </button>
          )}
          {doneCount > 0 && (
            <button className="btn btn-primary" onClick={saveSelected} disabled={saving}>
              <IconCheck width={14} /> {saving ? 'Saving…' : `Save ${selectedDoneCount} selected client${selectedDoneCount !== 1 ? 's' : ''}`}
            </button>
          )}
        </div>
        <p className="field-hint" style={{ marginTop: 10 }}>
          Each PDF is read by AI to extract the client's name, GSTIN, email, phone, and address.
          Always review and correct the fields below before saving — extraction can occasionally
          misread a field, especially on lower-quality scans.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="card empty-state">
          <IconFile className="empty-state-icon" />
          <h3>No files uploaded yet</h3>
          <p>Select one or more invoice PDFs to get started.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rows.map(row => (
            <div key={row.id} className="card card-pad">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: row.status === 'done' ? 16 : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {row.status === 'done' && (
                    <input type="checkbox" checked={row.selected} onChange={e => updateRow(row.id, { selected: e.target.checked })} style={{ width: 16, height: 16, accentColor: 'var(--teal)' }} />
                  )}
                  <IconFile width={16} style={{ color: 'var(--slate-light)' }} />
                  <span style={{ fontWeight: 600, fontSize: 13.5 }}>{row.fileName}</span>
                  {row.status === 'pending' && <span className="badge badge-pending">Not yet extracted</span>}
                  {row.status === 'extracting' && <span className="badge badge-invoiced">Extracting…</span>}
                  {row.status === 'done' && <span className="badge badge-paid">Extracted</span>}
                  {row.status === 'error' && <span className="badge" style={{ background: 'var(--red-soft)', color: 'var(--red)' }}>Failed</span>}
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => removeRow(row.id)}><IconTrash width={13} /></button>
              </div>

              {row.status === 'error' && (
                <p style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 8 }}>{row.error}</p>
              )}

              {row.status === 'done' && (
                <>
                  <div className="radio-tabs" style={{ marginBottom: 14 }}>
                    <button className={`radio-tab ${row.client_type === 'pdf' ? 'selected' : ''}`} onClick={() => updateRow(row.id, { client_type: 'pdf' })}>PDF Accessibility</button>
                    <button className={`radio-tab ${row.client_type === 'website' ? 'selected' : ''}`} onClick={() => updateRow(row.id, { client_type: 'website' })}>Website & Domain</button>
                  </div>
                  <div className="field-row">
                    <div className="field">
                      <label>Client name</label>
                      <input value={row.client_name} onChange={e => updateRow(row.id, { client_name: e.target.value })} />
                    </div>
                    <div className="field">
                      <label>GSTIN</label>
                      <input className="mono" value={row.gstin} onChange={e => updateRow(row.id, { gstin: e.target.value.toUpperCase() })} maxLength={15} />
                    </div>
                  </div>
                  <div className="field-row">
                    <div className="field">
                      <label>Email</label>
                      <input type="email" value={row.email} onChange={e => updateRow(row.id, { email: e.target.value })} />
                    </div>
                    <div className="field">
                      <label>Phone</label>
                      <input value={row.phone} onChange={e => updateRow(row.id, { phone: e.target.value })} />
                    </div>
                  </div>
                  <div className="field">
                    <label>Billing address</label>
                    <textarea rows={2} value={row.address} onChange={e => updateRow(row.id, { address: e.target.value })} />
                  </div>
                  <div className="field-row">
                    <div className="field">
                      <label>Currency</label>
                      <select value={row.currency} onChange={e => updateRow(row.id, { currency: e.target.value })}>
                        {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                      </select>
                    </div>
                    <div className="field" style={{ display: 'flex', alignItems: 'center', paddingTop: 24 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 500 }}>
                        <input type="checkbox" checked={row.is_international} onChange={e => updateRow(row.id, { is_international: e.target.checked })} style={{ width: 16, height: 16, accentColor: 'var(--teal)' }} />
                        International client
                      </label>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
