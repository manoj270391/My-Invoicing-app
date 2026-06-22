import { useRef, useState } from 'react'
import { useToast } from '../components/Toast'
import { IconUpload, IconDownload, IconCheck, IconFile, IconTrash } from '../components/Icons'
import { downloadClientTemplate, parseClientExcel } from '../lib/clientExcelTemplate'
import { createClient } from '../lib/api'
import { CURRENCIES } from '../lib/gst'

export default function ImportClientsPage() {
  const [rows, setRows] = useState(null)
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef(null)
  const toast = useToast()

  async function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setParsing(true)
    try {
      const parsed = await parseClientExcel(file)
      if (parsed.length === 0) {
        toast('No client rows found — check the Client Name column is filled in', 'error')
        setRows(null)
        return
      }
      setRows(parsed.map(r => ({ ...r, id: Math.random().toString(36).slice(2), selected: true })))
      toast(`${parsed.length} client${parsed.length !== 1 ? 's' : ''} found — review below before saving`, 'success')
    } catch (err) {
      toast(`Could not read file: ${err.message}`, 'error')
    } finally {
      setParsing(false)
    }
  }

  function updateRow(id, patch) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
  }

  function removeRow(id) {
    setRows(prev => prev.filter(r => r.id !== id))
  }

  async function saveSelected() {
    const toSave = (rows || []).filter(r => r.selected && r.name.trim())
    if (toSave.length === 0) return toast('Nothing selected to save', 'error')
    setSaving(true)
    let savedCount = 0
    for (const row of toSave) {
      try {
        await createClient({
          name: row.name.trim(),
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
        toast(`Could not save ${row.name}: ${err.message}`, 'error')
      }
    }
    setSaving(false)
    if (savedCount > 0) {
      toast(`${savedCount} client${savedCount !== 1 ? 's' : ''} created`, 'success')
      setRows(prev => prev.filter(r => !(r.selected && r.name.trim())))
    }
  }

  const selectedCount = (rows || []).filter(r => r.selected).length

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Import Clients from Excel</h1>
          <p className="page-subtitle">Download the template, fill it in, then upload it here to create clients in bulk.</p>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={downloadClientTemplate}>
            <IconDownload width={14} /> Download Excel template
          </button>
          <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={handleFile} />
          <button className="btn btn-primary" onClick={() => fileRef.current.click()} disabled={parsing}>
            <IconUpload width={14} /> {parsing ? 'Reading file…' : 'Upload completed Excel'}
          </button>
        </div>
        <p className="field-hint" style={{ marginTop: 10 }}>
          The template has columns for Client Name, Address, GSTIN, Phone, Email, Client Type, Currency, and
          International (Yes/No). Client Type and Currency have dropdowns in the template to keep entries
          consistent. Only Client Name is required — leave others blank if not applicable.
        </p>
      </div>

      {rows === null ? (
        <div className="card empty-state">
          <IconFile className="empty-state-icon" />
          <h3>No file uploaded yet</h3>
          <p>Download the template, fill in your clients, then upload it here.</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 13.5, color: 'var(--slate)' }}>{rows.length} row{rows.length !== 1 ? 's' : ''} found — review before saving</span>
            <button className="btn btn-primary" onClick={saveSelected} disabled={saving || selectedCount === 0}>
              <IconCheck width={14} /> {saving ? 'Saving…' : `Save ${selectedCount} selected client${selectedCount !== 1 ? 's' : ''}`}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {rows.map(row => (
              <div key={row.id} className="card card-pad">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input type="checkbox" checked={row.selected} onChange={e => updateRow(row.id, { selected: e.target.checked })} style={{ width: 16, height: 16, accentColor: 'var(--teal)' }} />
                    <span style={{ fontWeight: 600, fontSize: 13.5 }}>{row.name || '(no name)'}</span>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => removeRow(row.id)}><IconTrash width={13} /></button>
                </div>

                <div className="radio-tabs" style={{ marginBottom: 14 }}>
                  <button className={`radio-tab ${row.client_type === 'pdf' ? 'selected' : ''}`} onClick={() => updateRow(row.id, { client_type: 'pdf' })}>PDF Accessibility</button>
                  <button className={`radio-tab ${row.client_type === 'website' ? 'selected' : ''}`} onClick={() => updateRow(row.id, { client_type: 'website' })}>Website & Domain</button>
                </div>
                <div className="field-row">
                  <div className="field">
                    <label>Client name</label>
                    <input value={row.name} onChange={e => updateRow(row.id, { name: e.target.value })} />
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
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}
