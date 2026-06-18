import { useEffect, useState } from 'react'
import Modal from '../components/Modal'
import { useToast } from '../components/Toast'
import {
  IconPlus, IconEdit, IconTrash, IconClients, IconFile,
  IconGlobe, IconFolder, IconUpload, IconDownload,
} from '../components/Icons'
import {
  getClients, createClient, updateClient, deleteClient,
  getClientDocuments, uploadClientDocument, deleteClientDocument,
} from '../lib/api'
import { CURRENCIES } from '../lib/gst'

const EMPTY = {
  name: '', client_type: 'pdf', is_international: false,
  address: '', email: '', phone: '',
  gstin: '', vat_number: '', tax_id: '', business_reg: '',
  currency: 'INR',
}

const DOC_TYPES = ['Contract', 'Purchase Order', 'NDA', 'SOW', 'Remittance', 'Other']

export default function ClientsPage() {
  const [clients, setClients] = useState(null)
  const [editing, setEditing] = useState(null)
  const [docsClient, setDocsClient] = useState(null)
  const [docs, setDocs] = useState([])
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [tab, setTab] = useState('details')
  const toast = useToast()

  async function load() {
    try { setClients(await getClients()) } catch (e) { toast(e.message, 'error') }
  }
  useEffect(() => { load() }, [])

  async function loadDocs(clientId) {
    try { setDocs(await getClientDocuments(clientId)) } catch (e) { toast(e.message, 'error') }
  }

  function openNew() { setEditing({ ...EMPTY }); setTab('details') }
  function openEdit(c) { setEditing({ ...c }); setTab('details') }
  function openDocs(c) { setDocsClient(c); loadDocs(c.id) }

  async function save() {
    try {
      if (!editing.name.trim()) return toast('Client name is required', 'error')
      if (editing.id) { await updateClient(editing.id, editing); toast('Client updated', 'success') }
      else { await createClient(editing); toast('Client added', 'success') }
      setEditing(null); load()
    } catch (e) { toast(e.message, 'error') }
  }

  async function handleDocUpload(e) {
    const file = e.target.files?.[0]
    if (!file || !docsClient) return
    setUploading(true)
    try {
      await uploadClientDocument(docsClient.id, file, 'Other')
      toast('Document uploaded', 'success')
      loadDocs(docsClient.id)
    } catch (err) { toast(err.message, 'error') }
    finally { setUploading(false) }
  }

  async function handleDeleteDoc(id) {
    try { await deleteClientDocument(id); loadDocs(docsClient.id); toast('Removed', 'success') }
    catch (e) { toast(e.message, 'error') }
  }

  async function handleDelete() {
    try {
      await deleteClient(confirmDelete.id)
      toast('Client removed', 'success')
      setConfirmDelete(null); load()
    } catch { toast('Cannot remove — client has existing entries or invoices', 'error'); setConfirmDelete(null) }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Clients</h1>
          <p className="page-subtitle">Manage PDF accessibility and website maintenance clients.</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}><IconPlus /> Add client</button>
      </div>

      {clients === null ? (
        <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="loading-spin" /></div>
      ) : clients.length === 0 ? (
        <div className="card empty-state">
          <IconClients className="empty-state-icon" />
          <h3>No clients yet</h3>
          <p>Add your first client to start logging work.</p>
          <button className="btn btn-primary" onClick={openNew}><IconPlus /> Add client</button>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {['Name', 'Type', 'Currency', 'GSTIN / Tax ID', 'Contact', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11.5, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clients.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={{ padding: '13px 16px', fontWeight: 600, fontSize: 13.5 }}>
                    {c.name}
                    {c.is_international && <span style={{ marginLeft: 8, fontSize: 10.5, background: 'var(--teal-soft)', color: 'var(--teal)', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>Intl.</span>}
                  </td>
                  <td style={{ padding: '13px 16px' }}>
                    <span className={`badge ${c.client_type === 'pdf' ? 'badge-invoiced' : 'badge-pending'}`}>
                      {c.client_type === 'pdf' ? <IconFile width={11} height={11} /> : <IconGlobe width={11} height={11} />}
                      {c.client_type === 'pdf' ? 'PDF Accessibility' : 'Website & Domain'}
                    </span>
                  </td>
                  <td style={{ padding: '13px 16px', fontSize: 13 }}>
                    <span className="mono">{c.currency || 'INR'}</span>
                  </td>
                  <td className="mono" style={{ padding: '13px 16px', fontSize: 12.5, color: 'var(--slate)' }}>
                    {c.gstin || c.vat_number || c.tax_id || '—'}
                    {c.gstin && (
                      <span style={{ marginLeft: 8, fontSize: 11, color: c.gstin.startsWith('33') ? 'var(--teal)' : 'var(--amber)' }}>
                        {c.gstin.startsWith('33') ? '(TN)' : '(Other state)'}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '13px 16px', fontSize: 13, color: 'var(--slate)' }}>{c.email || c.phone || '—'}</td>
                  <td style={{ padding: '13px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => openDocs(c)} title="Documents"><IconFolder width={14} /></button>
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(c)}><IconEdit width={14} /></button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(c)}><IconTrash width={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Modal */}
      {editing && (
        <Modal title={editing.id ? 'Edit client' : 'Add client'} onClose={() => setEditing(null)} width={560}>
          <div className="radio-tabs">
            <button className={`radio-tab ${editing.client_type === 'pdf' ? 'selected' : ''}`} onClick={() => setEditing({ ...editing, client_type: 'pdf' })}>
              <IconFile /> PDF Accessibility
            </button>
            <button className={`radio-tab ${editing.client_type === 'website' ? 'selected' : ''}`} onClick={() => setEditing({ ...editing, client_type: 'website' })}>
              <IconGlobe /> Website & Domain
            </button>
          </div>

          <div className="field-row">
            <div className="field" style={{ gridColumn: '1/-1' }}>
              <label>Client name</label>
              <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="Acme Corp" autoFocus />
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label>Currency</label>
              <select value={editing.currency} onChange={e => setEditing({ ...editing, currency: e.target.value })}>
                {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
            </div>
            <div className="field" style={{ display: 'flex', alignItems: 'center', paddingTop: 24 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 500 }}>
                <input type="checkbox" checked={editing.is_international} onChange={e => setEditing({ ...editing, is_international: e.target.checked })} style={{ width: 16, height: 16, accentColor: 'var(--teal)' }} />
                International client
              </label>
            </div>
          </div>

          <div className="section-label">Tax details</div>
          <div className="field-row">
            <div className="field">
              <label>GSTIN <span className="field-hint">(leave blank if international)</span></label>
              <input className="mono" value={editing.gstin} onChange={e => setEditing({ ...editing, gstin: e.target.value.toUpperCase() })} placeholder="33ABCDE1234F1Z5" maxLength={15} />
            </div>
            <div className="field">
              <label>VAT Number</label>
              <input value={editing.vat_number} onChange={e => setEditing({ ...editing, vat_number: e.target.value })} placeholder="GB123456789" />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Tax ID</label>
              <input value={editing.tax_id} onChange={e => setEditing({ ...editing, tax_id: e.target.value })} placeholder="US EIN / CA BN etc." />
            </div>
            <div className="field">
              <label>Business Reg. No.</label>
              <input value={editing.business_reg} onChange={e => setEditing({ ...editing, business_reg: e.target.value })} />
            </div>
          </div>

          <div className="section-label">Contact details</div>
          <div className="field-row">
            <div className="field">
              <label>Email</label>
              <input type="email" value={editing.email} onChange={e => setEditing({ ...editing, email: e.target.value })} placeholder="billing@client.com" />
            </div>
            <div className="field">
              <label>Phone</label>
              <input value={editing.phone} onChange={e => setEditing({ ...editing, phone: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label>Billing address</label>
            <textarea rows={2} value={editing.address} onChange={e => setEditing({ ...editing, address: e.target.value })} placeholder="Street, city, state, postal code, country" />
          </div>

          <div className="form-actions">
            <button className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={save}>{editing.id ? 'Save changes' : 'Add client'}</button>
          </div>
        </Modal>
      )}

      {/* Documents Modal */}
      {docsClient && (
        <Modal title={`Documents — ${docsClient.name}`} onClose={() => setDocsClient(null)} width={520}>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="doc-upload" className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
              <IconUpload width={14} /> {uploading ? 'Uploading…' : 'Upload document'}
            </label>
            <input id="doc-upload" type="file" hidden onChange={handleDocUpload} />
            <span className="field-hint" style={{ marginLeft: 12 }}>PDF, Word, Excel, images accepted</span>
          </div>
          {docs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--slate)' }}>
              <IconFolder width={32} height={32} style={{ color: 'var(--slate-light)', marginBottom: 8 }} />
              <p style={{ margin: 0 }}>No documents uploaded yet</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {docs.map(d => (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--paper)', borderRadius: 8, border: '1px solid var(--line)' }}>
                  <IconFile width={16} style={{ color: 'var(--slate-light)', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.file_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--slate-light)' }}>{new Date(d.uploaded_at).toLocaleDateString('en-IN')}</div>
                  </div>
                  <a href={d.file_url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm"><IconDownload width={13} /></a>
                  <button className="btn btn-ghost btn-sm" onClick={() => handleDeleteDoc(d.id)}><IconTrash width={13} /></button>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {confirmDelete && (
        <Modal title="Remove client?" onClose={() => setConfirmDelete(null)} width={400}>
          <p style={{ fontSize: 13.5, color: 'var(--slate)', lineHeight: 1.6 }}>
            Permanently remove <strong>{confirmDelete.name}</strong>? Clients with existing entries or invoices cannot be removed.
          </p>
          <div className="form-actions">
            <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={handleDelete}>Remove</button>
          </div>
        </Modal>
      )}
    </>
  )
}
