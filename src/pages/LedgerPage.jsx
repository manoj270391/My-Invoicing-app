import { useEffect, useMemo, useState } from 'react'
import Modal from '../components/Modal'
import { useToast } from '../components/Toast'
import { IconPlus, IconLedger, IconTrash, IconEdit, IconFile, IconGlobe, IconInvoice } from '../components/Icons'
import { getClients, getEntries, createEntry, updateEntry, deleteEntry } from '../lib/api'
import { formatINR, lineTotal } from '../lib/gst'
import GenerateInvoiceModal from '../components/GenerateInvoiceModal'
import '../forms.css'

const EMPTY_PDF = { client_id: '', entry_type: 'pdf', entry_date: today(), file_name: '', pages: '', rate_per_page: '' }
const EMPTY_WEB = {
  client_id: '', entry_type: 'website', entry_date: today(),
  website_renewal_desc: '', website_renewal_price: '',
  google_subscription_desc: '', google_subscription_price: '',
  other_desc: '', other_price: '',
}

function today() { return new Date().toISOString().slice(0, 10) }

export default function LedgerPage() {
  const [entries, setEntries] = useState(null)
  const [clients, setClients] = useState([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [selected, setSelected] = useState(new Set())
  const [invoiceModalClient, setInvoiceModalClient] = useState(null)
  const toast = useToast()

  async function load() {
    try {
      const [e, c] = await Promise.all([getEntries(), getClients()])
      setEntries(e)
      setClients(c)
    } catch (err) {
      toast(err.message, 'error')
    }
  }
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    if (!entries) return []
    if (statusFilter === 'all') return entries
    return entries.filter((e) => e.status === statusFilter)
  }, [entries, statusFilter])

  const stats = useMemo(() => {
    if (!entries) return { pending: 0, invoiced: 0, paid: 0, pendingCount: 0 }
    const sum = (arr) => arr.reduce((a, e) => a + lineTotal(e), 0)
    const pendingArr = entries.filter((e) => e.status === 'pending')
    return {
      pending: sum(pendingArr),
      pendingCount: pendingArr.length,
      invoiced: sum(entries.filter((e) => e.status === 'invoiced')),
      paid: sum(entries.filter((e) => e.status === 'paid')),
    }
  }, [entries])

  function openNew() {
    setEditing({ ...EMPTY_PDF })
    setModalOpen(true)
  }
  function openEdit(e) {
    setEditing({ ...e })
    setModalOpen(true)
  }

  function switchType(type) {
    const base = type === 'pdf' ? EMPTY_PDF : EMPTY_WEB
    setEditing({ ...base, id: editing.id, client_id: editing.client_id, entry_date: editing.entry_date })
  }

  async function save() {
    try {
      if (!editing.client_id) return toast('Select a client', 'error')
      if (editing.entry_type === 'pdf' && !editing.file_name.trim()) return toast('File name is required', 'error')

      const payload = { ...editing }
      delete payload.clients
      // Coerce numeric fields
      ;['pages', 'rate_per_page', 'website_renewal_price', 'google_subscription_price', 'other_price'].forEach((k) => {
        if (payload[k] === '') payload[k] = null
        else if (payload[k] != null) payload[k] = Number(payload[k])
      })

      if (editing.id) {
        await updateEntry(editing.id, payload)
        toast('Entry updated', 'success')
      } else {
        await createEntry(payload)
        toast('Entry added', 'success')
      }
      setModalOpen(false)
      load()
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  async function confirmAndDelete() {
    try {
      await deleteEntry(confirmDelete.id)
      toast('Entry removed', 'success')
      setConfirmDelete(null)
      load()
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  function toggleSelect(id) {
    setSelected((s) => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectedEntries = entries ? entries.filter((e) => selected.has(e.id)) : []
  const selectedClientIds = new Set(selectedEntries.map((e) => e.client_id))
  const canGenerate = selectedEntries.length > 0 && selectedClientIds.size === 1 && selectedEntries.every((e) => e.status === 'pending')

  function handleGenerateClick() {
    if (selectedClientIds.size > 1) {
      return toast('Select entries from one client at a time to generate an invoice', 'error')
    }
    const client = clients.find((c) => c.id === [...selectedClientIds][0])
    setInvoiceModalClient(client)
  }

  function afterInvoiceGenerated() {
    setSelected(new Set())
    setInvoiceModalClient(null)
    load()
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Project Ledger</h1>
          <p className="page-subtitle">Log work as you complete it. Select pending entries to generate an invoice.</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}><IconPlus /> Add entry</button>
      </div>

      <div className="stat-row">
        <div className="stat-tile">
          <div className="stat-label">Pending ({stats.pendingCount})</div>
          <div className="stat-value amber">{formatINR(stats.pending)}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-label">Invoiced, unpaid</div>
          <div className="stat-value teal">{formatINR(stats.invoiced)}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-label">Paid</div>
          <div className="stat-value green">{formatINR(stats.paid)}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-label">Total clients</div>
          <div className="stat-value">{clients.length}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['all', 'pending', 'invoiced', 'paid'].map((s) => (
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

      {entries === null ? (
        <div className="center-screen" style={{ height: 200 }}><div className="loading-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="card empty-state">
          <IconLedger className="empty-state-icon" />
          <h3>No entries here</h3>
          <p>Log your first piece of work to start tracking.</p>
          <button className="btn btn-primary" onClick={openNew}><IconPlus /> Add entry</button>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                <th style={{ width: 36, padding: '12px 14px' }}></th>
                {['Date', 'Client', 'Details', 'Amount', 'Status', ''].map((h) => (
                  <th key={h} style={{ textAlign: h === 'Amount' ? 'right' : 'left', padding: '12px 14px', fontSize: 11.5, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={{ padding: '13px 14px' }}>
                    {e.status === 'pending' && (
                      <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggleSelect(e.id)} style={{ width: 16, height: 16, accentColor: 'var(--teal)' }} />
                    )}
                  </td>
                  <td className="mono" style={{ padding: '13px 14px', fontSize: 13, color: 'var(--slate)' }}>{e.entry_date}</td>
                  <td style={{ padding: '13px 14px', fontWeight: 600, fontSize: 13.5 }}>{e.clients?.name || '—'}</td>
                  <td style={{ padding: '13px 14px', fontSize: 13 }}>
                    {e.entry_type === 'pdf' ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ink-soft)' }}>
                        <IconFile width={13} height={13} style={{ color: 'var(--slate-light)' }} />
                        {e.file_name} <span className="mono" style={{ color: 'var(--slate)' }}>· {e.pages}pg × {formatINR(e.rate_per_page)}</span>
                      </span>
                    ) : (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ink-soft)' }}>
                        <IconGlobe width={13} height={13} style={{ color: 'var(--slate-light)' }} />
                        {[e.website_renewal_desc, e.google_subscription_desc, e.other_desc].filter(Boolean).join(' + ') || 'Website & domain maintenance'}
                      </span>
                    )}
                  </td>
                  <td className="mono" style={{ padding: '13px 14px', textAlign: 'right', fontWeight: 600 }}>{formatINR(lineTotal(e))}</td>
                  <td style={{ padding: '13px 14px' }}>
                    {e.status === 'pending' && <span className="badge badge-pending">Pending</span>}
                    {e.status === 'invoiced' && <span className="stamp stamp-invoiced">Invoiced</span>}
                    {e.status === 'paid' && <span className="stamp stamp-paid">Paid</span>}
                  </td>
                  <td style={{ padding: '13px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {e.status === 'pending' && (
                      <>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(e)}><IconEdit width={14} height={14} /></button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(e)}><IconTrash width={14} height={14} /></button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected.size > 0 && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--ink)', color: 'white', borderRadius: 12, padding: '12px 14px 12px 20px',
          display: 'flex', alignItems: 'center', gap: 16, boxShadow: 'var(--shadow-lg)', zIndex: 150,
        }}>
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>{selected.size} entr{selected.size === 1 ? 'y' : 'ies'} selected</span>
          <button className="btn btn-ghost btn-sm" style={{ color: 'rgba(255,255,255,0.7)' }} onClick={() => setSelected(new Set())}>Clear</button>
          <button className="btn btn-primary btn-sm" onClick={handleGenerateClick} disabled={!canGenerate}>
            <IconInvoice width={14} height={14} /> Generate invoice
          </button>
        </div>
      )}

      {modalOpen && (
        <Modal title={editing.id ? 'Edit entry' : 'Add ledger entry'} onClose={() => setModalOpen(false)} width={520}>
          <div className="radio-tabs">
            <button className={`radio-tab ${editing.entry_type === 'pdf' ? 'selected' : ''}`} onClick={() => switchType('pdf')}>
              <IconFile /> PDF Accessibility
            </button>
            <button className={`radio-tab ${editing.entry_type === 'website' ? 'selected' : ''}`} onClick={() => switchType('website')}>
              <IconGlobe /> Website & Domain
            </button>
          </div>

          <div className="field-row">
            <div className="field">
              <label>Client</label>
              <select value={editing.client_id} onChange={(e) => setEditing({ ...editing, client_id: e.target.value })}>
                <option value="">Select client…</option>
                {clients.filter((c) => c.client_type === editing.entry_type).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Date</label>
              <input type="date" value={editing.entry_date} onChange={(e) => setEditing({ ...editing, entry_date: e.target.value })} />
            </div>
          </div>

          {editing.entry_type === 'pdf' ? (
            <>
              <div className="field">
                <label>File name</label>
                <input value={editing.file_name} onChange={(e) => setEditing({ ...editing, file_name: e.target.value })} placeholder="annual-report-2026.pdf" />
              </div>
              <div className="field-row">
                <div className="field">
                  <label>Pages</label>
                  <input type="number" min="0" step="1" value={editing.pages} onChange={(e) => setEditing({ ...editing, pages: e.target.value })} placeholder="0" />
                </div>
                <div className="field">
                  <label>Rate per page (₹)</label>
                  <input type="number" min="0" step="0.01" value={editing.rate_per_page} onChange={(e) => setEditing({ ...editing, rate_per_page: e.target.value })} placeholder="0.00" />
                </div>
              </div>
              <div className="field">
                <label>Line total</label>
                <input className="mono" disabled value={formatINR((Number(editing.pages) || 0) * (Number(editing.rate_per_page) || 0))} style={{ background: 'var(--paper)', color: 'var(--slate)' }} />
              </div>
            </>
          ) : (
            <>
              <div className="section-label">Website renewal</div>
              <div className="field-row">
                <div className="field">
                  <label>Description</label>
                  <input value={editing.website_renewal_desc} onChange={(e) => setEditing({ ...editing, website_renewal_desc: e.target.value })} placeholder="Domain + hosting renewal" />
                </div>
                <div className="field">
                  <label>Price (₹)</label>
                  <input type="number" min="0" step="0.01" value={editing.website_renewal_price} onChange={(e) => setEditing({ ...editing, website_renewal_price: e.target.value })} placeholder="0.00" />
                </div>
              </div>
              <div className="section-label">Google subscription</div>
              <div className="field-row">
                <div className="field">
                  <label>Description</label>
                  <input value={editing.google_subscription_desc} onChange={(e) => setEditing({ ...editing, google_subscription_desc: e.target.value })} placeholder="Google Workspace renewal" />
                </div>
                <div className="field">
                  <label>Price (₹)</label>
                  <input type="number" min="0" step="0.01" value={editing.google_subscription_price} onChange={(e) => setEditing({ ...editing, google_subscription_price: e.target.value })} placeholder="0.00" />
                </div>
              </div>
              <div className="section-label">Other (optional)</div>
              <div className="field-row">
                <div className="field">
                  <label>Description</label>
                  <input value={editing.other_desc} onChange={(e) => setEditing({ ...editing, other_desc: e.target.value })} placeholder="e.g. SSL certificate" />
                </div>
                <div className="field">
                  <label>Price (₹)</label>
                  <input type="number" min="0" step="0.01" value={editing.other_price} onChange={(e) => setEditing({ ...editing, other_price: e.target.value })} placeholder="0.00" />
                </div>
              </div>
              <div className="field">
                <label>Line total</label>
                <input
                  className="mono" disabled
                  value={formatINR((Number(editing.website_renewal_price) || 0) + (Number(editing.google_subscription_price) || 0) + (Number(editing.other_price) || 0))}
                  style={{ background: 'var(--paper)', color: 'var(--slate)' }}
                />
              </div>
            </>
          )}

          <div className="form-actions">
            <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={save}>{editing.id ? 'Save changes' : 'Add entry'}</button>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <Modal title="Remove entry?" onClose={() => setConfirmDelete(null)} width={400}>
          <p style={{ fontSize: 13.5, color: 'var(--slate)', lineHeight: 1.6, margin: '0 0 4px' }}>
            This will permanently remove this ledger entry. This can't be undone.
          </p>
          <div className="form-actions">
            <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={confirmAndDelete}>Remove entry</button>
          </div>
        </Modal>
      )}

      {invoiceModalClient && (
        <GenerateInvoiceModal
          client={invoiceModalClient}
          entries={selectedEntries}
          onClose={() => setInvoiceModalClient(null)}
          onGenerated={afterInvoiceGenerated}
        />
      )}
    </>
  )
}
