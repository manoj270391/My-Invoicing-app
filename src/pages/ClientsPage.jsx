import { useEffect, useState } from 'react'
import Modal from '../components/Modal'
import { useToast } from '../components/Toast'
import { IconPlus, IconEdit, IconTrash, IconClients, IconFile, IconGlobe } from '../components/Icons'
import { getClients, createClient, updateClient, deleteClient } from '../lib/api'
import '../forms.css'

const EMPTY = { name: '', client_type: 'pdf', address: '', email: '', phone: '', gstin: '' }

export default function ClientsPage() {
  const [clients, setClients] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const toast = useToast()

  async function load() {
    try {
      setClients(await getClients())
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  useEffect(() => { load() }, [])

  function openNew() {
    setEditing({ ...EMPTY })
    setModalOpen(true)
  }
  function openEdit(c) {
    setEditing({ ...c })
    setModalOpen(true)
  }

  async function save() {
    try {
      if (!editing.name.trim()) return toast('Client name is required', 'error')
      if (editing.id) {
        await updateClient(editing.id, editing)
        toast('Client updated', 'success')
      } else {
        await createClient(editing)
        toast('Client added', 'success')
      }
      setModalOpen(false)
      load()
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  async function confirmAndDelete() {
    try {
      await deleteClient(confirmDelete.id)
      toast('Client removed', 'success')
      setConfirmDelete(null)
      load()
    } catch {
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Clients</h1>
          <p className="page-subtitle">PDF accessibility and website maintenance clients in one place.</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>
          <IconPlus /> Add client
        </button>
      </div>

      {clients === null ? (
        <div className="center-screen" style={{ height: 200 }}><div className="loading-spin" /></div>
      ) : clients.length === 0 ? (
        <div className="card empty-state">
          <IconClients className="empty-state-icon" />
          <h3>No clients yet</h3>
          <p>Add your first client to start logging work for them.</p>
          <button className="btn btn-primary" onClick={openNew}><IconPlus /> Add client</button>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {['Name', 'Type', 'GSTIN', 'Contact', ''].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '12px 18px', fontSize: 11.5, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={{ padding: '13px 18px', fontWeight: 600, fontSize: 13.5 }}>{c.name}</td>
                  <td style={{ padding: '13px 18px' }}>
                    <span className={`badge ${c.client_type === 'pdf' ? 'badge-invoiced' : 'badge-pending'}`}>
                      {c.client_type === 'pdf' ? <IconFile width={11} height={11} /> : <IconGlobe width={11} height={11} />}
                      {c.client_type === 'pdf' ? 'PDF Accessibility' : 'Website & Domain'}
                    </span>
                  </td>
                  <td className="mono" style={{ padding: '13px 18px', fontSize: 13, color: 'var(--slate)' }}>
                    {c.gstin || '—'}
                    {c.gstin && (
                      <span style={{ marginLeft: 8, fontSize: 11, color: c.gstin.trim().startsWith('33') ? 'var(--teal)' : 'var(--amber)' }}>
                        {c.gstin.trim().startsWith('33') ? '(TN · CGST+SGST)' : '(Other state · IGST)'}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '13px 18px', fontSize: 13, color: 'var(--slate)' }}>{c.email || c.phone || '—'}</td>
                  <td style={{ padding: '13px 18px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(c)}><IconEdit width={14} height={14} /></button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(c)}><IconTrash width={14} height={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <Modal title={editing.id ? 'Edit client' : 'Add client'} onClose={() => setModalOpen(false)}>
          <div className="radio-tabs">
            <button
              className={`radio-tab ${editing.client_type === 'pdf' ? 'selected' : ''}`}
              onClick={() => setEditing({ ...editing, client_type: 'pdf' })}
            >
              <IconFile /> PDF Accessibility
            </button>
            <button
              className={`radio-tab ${editing.client_type === 'website' ? 'selected' : ''}`}
              onClick={() => setEditing({ ...editing, client_type: 'website' })}
            >
              <IconGlobe /> Website & Domain
            </button>
          </div>

          <div className="field">
            <label>Client name</label>
            <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Acme Corp" autoFocus />
          </div>
          <div className="field">
            <label>GSTIN <span className="field-hint">— starts with 33 for Tamil Nadu (CGST+SGST); other states get IGST</span></label>
            <input
              className="mono"
              value={editing.gstin}
              onChange={(e) => setEditing({ ...editing, gstin: e.target.value.toUpperCase() })}
              placeholder="33ABCDE1234F1Z5"
              maxLength={15}
            />
          </div>
          <div className="field-row">
            <div className="field">
              <label>Email</label>
              <input type="email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} placeholder="billing@acme.com" />
            </div>
            <div className="field">
              <label>Phone</label>
              <input value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} placeholder="+91 98765 43210" />
            </div>
          </div>
          <div className="field">
            <label>Billing address</label>
            <textarea rows={2} value={editing.address} onChange={(e) => setEditing({ ...editing, address: e.target.value })} placeholder="Street, city, state, PIN" />
          </div>

          <div className="form-actions">
            <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={save}>{editing.id ? 'Save changes' : 'Add client'}</button>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <Modal title="Remove client?" onClose={() => setConfirmDelete(null)} width={400}>
          <p style={{ fontSize: 13.5, color: 'var(--slate)', lineHeight: 1.6, margin: '0 0 4px' }}>
            This will permanently remove <strong>{confirmDelete.name}</strong>. Clients with existing
            ledger entries or invoices can't be removed — archive instead by leaving them unused.
          </p>
          <div className="form-actions">
            <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={confirmAndDelete}>Remove client</button>
          </div>
        </Modal>
      )}
    </>
  )
}
