import { useEffect, useMemo, useState, useCallback } from 'react'
import Modal from '../components/Modal'
import { useToast } from '../components/Toast'
import {
  IconPlus, IconLedger, IconTrash, IconEdit,
  IconFile, IconGlobe, IconInvoice, IconSearch,
} from '../components/Icons'
import { getClients, getEntries, createEntry, updateEntry, deleteEntry, forceDeleteEntry } from '../lib/api'
import { formatCurrency, formatINR, lineTotal, CURRENCIES } from '../lib/gst'
import GenerateInvoiceModal from '../components/GenerateInvoiceModal'

function today() { return new Date().toISOString().slice(0, 10) }

function emptyEntry(type) {
  return {
    entry_type: type, client_id: '', entry_date: today(),
    currency: 'INR', project_name: '',
    file_name: '', pages: '', rate_per_page: '',
    service_items: [{ description: '', price: '' }],
  }
}

export default function LedgerPage({ isAdmin = true }) {
  const [entries, setEntries] = useState(null)
  const [clients, setClients] = useState([])
  const [activeTab, setActiveTab] = useState(isAdmin ? 'pdf' : 'website')
  const [editing, setEditing] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [invoiceModal, setInvoiceModal] = useState(null)
  const [forceDeleteTarget, setForceDeleteTarget] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({ clientId: '', status: '', month: '', year: '' })
  const toast = useToast()

  const load = useCallback(async () => {
    try {
      const [e, c] = await Promise.all([getEntries(), getClients()])
      setEntries(e)
      setClients(c)
    } catch (err) { toast(err.message, 'error') }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    if (!entries) return []
    return entries.filter(e => {
      if (e.entry_type !== activeTab) return false
      if (filters.clientId && e.client_id !== filters.clientId) return false
      if (filters.status && e.status !== filters.status) return false
      if (filters.month && !e.entry_date?.startsWith(filters.month)) return false
      if (filters.year && !e.entry_date?.startsWith(filters.year)) return false
      if (search) {
        const s = search.toLowerCase()
        if (!(e.file_name?.toLowerCase().includes(s) ||
              e.project_name?.toLowerCase().includes(s) ||
              e.clients?.name?.toLowerCase().includes(s) ||
              (e.service_items || []).some(i => i.description?.toLowerCase().includes(s)))) return false
      }
      return true
    })
  }, [entries, activeTab, filters, search])

  const stats = useMemo(() => {
    if (!entries) return { pendingByCurrency: [], invoicedByCurrency: [], paidByCurrency: [], pendingCount: 0 }
    const byTab = entries.filter(e => e.entry_type === activeTab)

    function groupByCurrency(arr) {
      const byCur = {}
      arr.forEach(e => {
        const cur = e.currency || 'INR'
        byCur[cur] = (byCur[cur] || 0) + (Number(e.line_total) || lineTotal(e))
      })
      return Object.entries(byCur).sort((a, b) => b[1] - a[1])
    }

    const pendingEntries = byTab.filter(e => e.status === 'pending')
    return {
      pendingByCurrency: groupByCurrency(pendingEntries),
      invoicedByCurrency: groupByCurrency(byTab.filter(e => e.status === 'invoiced')),
      paidByCurrency: groupByCurrency(byTab.filter(e => e.status === 'paid')),
      pendingCount: pendingEntries.length,
    }
  }, [entries, activeTab])

  function openNew() { setEditing(emptyEntry(activeTab)) }
  function openEdit(e) {
    const d = { ...e }
    if (d.entry_type === 'website' && (!d.service_items || d.service_items.length === 0)) {
      // migrate legacy columns to service_items
      const items = []
      if (d.website_renewal_desc) items.push({ description: d.website_renewal_desc, price: d.website_renewal_price || '' })
      if (d.google_subscription_desc) items.push({ description: d.google_subscription_desc, price: d.google_subscription_price || '' })
      if (d.other_desc) items.push({ description: d.other_desc, price: d.other_price || '' })
      d.service_items = items.length > 0 ? items : [{ description: '', price: '' }]
    }
    setEditing(d)
  }

  function addServiceRow() {
    if ((editing.service_items || []).length >= 10) return toast('Maximum 10 line items', 'error')
    setEditing({ ...editing, service_items: [...(editing.service_items || []), { description: '', price: '' }] })
  }

  function removeServiceRow(i) {
    const items = [...editing.service_items]
    items.splice(i, 1)
    setEditing({ ...editing, service_items: items })
  }

  function updateServiceRow(i, field, val) {
    const items = editing.service_items.map((row, idx) => idx === i ? { ...row, [field]: val } : row)
    setEditing({ ...editing, service_items: items })
  }

  async function save() {
    try {
      if (!editing.client_id) return toast('Select a client', 'error')
      const payload = { ...editing }
      delete payload.clients

      // Sanitise — convert any empty string to null for numeric columns
      const numericFields = ['pages','rate_per_page','website_renewal_price','google_subscription_price','other_price','line_total']
      numericFields.forEach(k => {
        if (payload[k] === '' || payload[k] === undefined) payload[k] = null
        else if (payload[k] !== null) payload[k] = Number(payload[k]) || 0
      })

      // Sanitise text fields — empty string is fine, undefined should be null
      const textFields = ['file_name','project_name','website_renewal_desc','google_subscription_desc','other_desc']
      textFields.forEach(k => {
        if (payload[k] === undefined) payload[k] = null
      })

      if (payload.entry_type === 'pdf') {
        if (!payload.file_name?.trim()) return toast('File name is required', 'error')
        payload.pages = Number(payload.pages) || 0
        payload.rate_per_page = Number(payload.rate_per_page) || 0
        payload.line_total = payload.pages * payload.rate_per_page
        payload.service_items = []
        // Null out website-specific fields
        payload.website_renewal_desc = null
        payload.website_renewal_price = null
        payload.google_subscription_desc = null
        payload.google_subscription_price = null
        payload.other_desc = null
        payload.other_price = null
      } else {
        payload.service_items = (payload.service_items || []).filter(i => i.description?.trim())
          .map(i => ({ description: i.description, price: Number(i.price) || 0 }))
        payload.line_total = payload.service_items.reduce((s, i) => s + i.price, 0)
        // Null out pdf-specific fields
        payload.file_name = null
        payload.pages = null
        payload.rate_per_page = null
      }

      if (editing.id) { await updateEntry(editing.id, payload); toast('Entry updated', 'success') }
      else { await createEntry(payload); toast('Entry added', 'success') }
      setEditing(null); load()
    } catch (e) { toast(e.message, 'error') }
  }

  async function confirmAndDelete() {
    try { await deleteEntry(confirmDelete.id); toast('Entry removed', 'success'); setConfirmDelete(null); load() }
    catch (e) { toast(e.message, 'error') }
  }


  async function handleForceDelete() {
    try {
      await forceDeleteEntry(forceDeleteTarget.id)
      toast('Entry permanently removed', 'success')
      setForceDeleteTarget(null)
      load()
    } catch (e) { toast(e.message, 'error') }
  }

  function toggleSelect(id) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const selectedEntries = (entries || []).filter(e => selected.has(e.id))
  const selectedClientIds = new Set(selectedEntries.map(e => e.client_id))
  const canGenerate = selectedEntries.length > 0 && selectedClientIds.size === 1 && selectedEntries.every(e => e.status === 'pending')

  function handleGenerate() {
    if (selectedClientIds.size > 1) return toast('Selected entries belong to different clients. Please select entries for a single client only.', 'error')
    const client = clients.find(c => c.id === [...selectedClientIds][0])
    setInvoiceModal(client)
  }

  const tabClients = clients.filter(c => c.client_type === activeTab)
  const years = Array.from(new Set((entries || []).map(e => e.entry_date?.slice(0, 4)))).filter(Boolean).sort().reverse()

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Project Ledger</h1>
          <p className="page-subtitle">Log work entries and generate invoices from pending items.</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}><IconPlus /> Add entry</button>
      </div>

      {/* Tabs — admin sees both, accountant sees website only */}
      {isAdmin ? (
        <div style={{ display: 'flex', gap: 0, marginBottom: 20, background: 'var(--paper-raised)', border: '1px solid var(--line)', borderRadius: 10, padding: 4, width: 'fit-content' }}>
          {[['pdf', 'PDF Accessibility', IconFile], ['website', 'Website & Domain', IconGlobe]].map(([id, label, Icon]) => (
            <button key={id} onClick={() => { setActiveTab(id); setSelected(new Set()) }}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 18px', borderRadius: 7, border: 'none', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', transition: 'all 0.12s',
                background: activeTab === id ? 'var(--teal)' : 'transparent',
                color: activeTab === id ? 'white' : 'var(--slate)',
              }}>
              <Icon width={15} height={15} /> {label}
            </button>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, padding: '8px 18px', background: 'var(--teal)', borderRadius: 10, width: 'fit-content' }}>
          <IconGlobe width={15} height={15} style={{ color: 'white' }} />
          <span style={{ fontWeight: 600, fontSize: 13.5, color: 'white' }}>Website &amp; Domain</span>
        </div>
      )}

      <div className="stat-row" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 20 }}>
        <div className="stat-tile">
          <div className="stat-label">Pending ({stats.pendingCount})</div>
          {stats.pendingByCurrency.length === 0 ? (
            <div className="stat-value amber">{formatCurrency(0, 'INR')}</div>
          ) : stats.pendingByCurrency.map(([cur, amt]) => (
            <div key={cur} className="stat-value amber" style={{ fontSize: stats.pendingByCurrency.length > 1 ? 16 : undefined }}>{formatCurrency(amt, cur)}</div>
          ))}
        </div>
        <div className="stat-tile">
          <div className="stat-label">Invoiced, unpaid</div>
          {stats.invoicedByCurrency.length === 0 ? (
            <div className="stat-value teal">{formatCurrency(0, 'INR')}</div>
          ) : stats.invoicedByCurrency.map(([cur, amt]) => (
            <div key={cur} className="stat-value teal" style={{ fontSize: stats.invoicedByCurrency.length > 1 ? 16 : undefined }}>{formatCurrency(amt, cur)}</div>
          ))}
        </div>
        <div className="stat-tile">
          <div className="stat-label">Paid</div>
          {stats.paidByCurrency.length === 0 ? (
            <div className="stat-value green">{formatCurrency(0, 'INR')}</div>
          ) : stats.paidByCurrency.map(([cur, amt]) => (
            <div key={cur} className="stat-value green" style={{ fontSize: stats.paidByCurrency.length > 1 ? 16 : undefined }}>{formatCurrency(amt, cur)}</div>
          ))}
        </div>
      </div>

      {/* Search & Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1', minWidth: 200 }}>
          <IconSearch width={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--slate-light)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search file name, client, description…"
            style={{ paddingLeft: 32, width: '100%', padding: '8px 12px 8px 32px', border: '1px solid var(--line-strong)', borderRadius: 'var(--radius-sm)', fontSize: 13.5 }} />
        </div>
        <select value={filters.clientId} onChange={e => setFilters(f => ({ ...f, clientId: e.target.value }))}
          style={{ padding: '8px 12px', border: '1px solid var(--line-strong)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'white', minWidth: 140 }}>
          <option value="">All clients</option>
          {tabClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
          style={{ padding: '8px 12px', border: '1px solid var(--line-strong)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'white' }}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="invoiced">Invoiced</option>
          <option value="paid">Paid</option>
        </select>
        <select value={filters.year} onChange={e => setFilters(f => ({ ...f, year: e.target.value, month: '' }))}
          style={{ padding: '8px 12px', border: '1px solid var(--line-strong)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'white' }}>
          <option value="">All years</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        {(search || filters.clientId || filters.status || filters.year) && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilters({ clientId: '', status: '', month: '', year: '' }) }}>Clear filters</button>
        )}
      </div>

      {entries === null ? (
        <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="loading-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="card empty-state">
          <IconLedger className="empty-state-icon" />
          <h3>No entries found</h3>
          <p>{entries.filter(e => e.entry_type === activeTab).length === 0 ? 'Add your first entry to get started.' : 'Try adjusting your search or filters.'}</p>
          <button className="btn btn-primary" onClick={openNew}><IconPlus /> Add entry</button>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                <th style={{ width: 36, padding: '12px 14px' }}></th>
                {['Date', 'Client', 'Details', 'Currency', 'Amount', 'Status', ''].map(h => (
                  <th key={h} style={{ textAlign: h === 'Amount' ? 'right' : 'left', padding: '12px 14px', fontSize: 11.5, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => {
                const total = Number(e.line_total) || lineTotal(e)
                return (
                  <tr key={e.id} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ padding: '13px 14px' }}>
                      {e.status === 'pending' && (
                        <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggleSelect(e.id)} style={{ width: 16, height: 16, accentColor: 'var(--teal)' }} />
                      )}
                    </td>
                    <td className="mono" style={{ padding: '13px 14px', fontSize: 12.5, color: 'var(--slate)', whiteSpace: 'nowrap' }}>{e.entry_date}</td>
                    <td style={{ padding: '13px 14px', fontWeight: 600, fontSize: 13.5 }}>{e.clients?.name || '—'}</td>
                    <td style={{ padding: '13px 14px', fontSize: 13, color: 'var(--ink-soft)', maxWidth: 280, direction: 'ltr', textAlign: 'left' }}>
                      {e.entry_type === 'pdf' ? (
                        <span><bdi>{e.file_name}</bdi> <span className="mono" style={{ color: 'var(--slate)', fontSize: 12 }}>· {e.pages}pg × {formatCurrency(e.rate_per_page, e.currency)}</span></span>
                      ) : (
                        <span><bdi>{(e.service_items?.filter(i => i.description).map(i => i.description).join(', ')) ||
                          ([e.website_renewal_desc, e.google_subscription_desc, e.other_desc].filter(Boolean).join(', ')) ||
                          'Website & domain maintenance'}</bdi></span>
                      )}
                    </td>
                    <td className="mono" style={{ padding: '13px 14px', fontSize: 12.5, color: 'var(--slate)' }}>{e.currency || 'INR'}</td>
                    <td className="mono" style={{ padding: '13px 14px', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(total, e.currency)}</td>
                    <td style={{ padding: '13px 14px' }}>
                      {e.status === 'pending'  && <span className="badge badge-pending">Pending</span>}
                      {e.status === 'invoiced' && <span className="stamp stamp-invoiced">Invoiced</span>}
                      {e.status === 'paid'     && <span className="stamp stamp-paid">Paid</span>}
                    </td>
                    <td style={{ padding: '13px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {e.status === 'pending' && <>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(e)}><IconEdit width={14} /></button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(e)}><IconTrash width={14} /></button>
                      </>}
                      {isAdmin && (e.status === 'invoiced' || e.status === 'paid') && (
                        <button className="btn btn-ghost btn-sm" onClick={() => setForceDeleteTarget(e)} title="Force delete" style={{ color: 'var(--red)', opacity: 0.7 }}><IconTrash width={14} /></button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Floating action bar */}
      {selected.size > 0 && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: 'var(--ink)', color: 'white', borderRadius: 12, padding: '12px 14px 12px 20px', display: 'flex', alignItems: 'center', gap: 16, boxShadow: 'var(--shadow-lg)', zIndex: 150 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>{selected.size} entr{selected.size === 1 ? 'y' : 'ies'} selected</span>
          <button className="btn btn-ghost btn-sm" style={{ color: 'rgba(255,255,255,0.7)' }} onClick={() => setSelected(new Set())}>Clear</button>
          <button className="btn btn-primary btn-sm" onClick={handleGenerate} disabled={!canGenerate}>
            <IconInvoice width={14} /> Generate invoice
          </button>
        </div>
      )}

      {/* Add/Edit Modal */}
      {editing && (
        <Modal title={editing.id ? 'Edit entry' : 'Add ledger entry'} onClose={() => setEditing(null)} width={540}>
          <div className="field-row">
            <div className="field">
              <label>Client</label>
              <select value={editing.client_id} onChange={e => {
                const selectedClient = clients.find(c => c.id === e.target.value)
                setEditing({ ...editing, client_id: e.target.value, currency: selectedClient?.currency || editing.currency })
              }}>
                <option value="">Select client…</option>
                {clients.filter(c => c.client_type === editing.entry_type).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Date</label>
              <input type="date" value={editing.entry_date} onChange={e => setEditing({ ...editing, entry_date: e.target.value })} />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Currency</label>
              <select value={editing.currency} onChange={e => setEditing({ ...editing, currency: e.target.value })}>
                {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code} — {c.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Project name <span className="field-hint">(optional)</span></label>
              <input value={editing.project_name} onChange={e => setEditing({ ...editing, project_name: e.target.value })} placeholder="e.g. Q2 Accessibility Audit" />
            </div>
          </div>

          {editing.entry_type === 'pdf' ? (
            <>
              <div className="field">
                <label>File name</label>
                <input value={editing.file_name} onChange={e => setEditing({ ...editing, file_name: e.target.value })} placeholder="annual-report-2026.pdf" />
              </div>
              <div className="field-row">
                <div className="field">
                  <label>Pages</label>
                  <input type="number" min="0" value={editing.pages} onChange={e => setEditing({ ...editing, pages: e.target.value })} placeholder="0" />
                </div>
                <div className="field">
                  <label>Rate per page</label>
                  <input type="number" min="0" step="0.01" value={editing.rate_per_page} onChange={e => setEditing({ ...editing, rate_per_page: e.target.value })} placeholder="0.00" />
                </div>
              </div>
              <div className="field">
                <label>Line total</label>
                <input className="mono" disabled value={formatCurrency((Number(editing.pages)||0) * (Number(editing.rate_per_page)||0), editing.currency)} style={{ background: 'var(--paper)', color: 'var(--slate)' }} />
              </div>
            </>
          ) : (
            <>
              <div className="section-label">Service items (up to 10)</div>
              {(editing.service_items || []).map((row, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 130px 32px', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                  <input value={row.description} onChange={e => updateServiceRow(i, 'description', e.target.value)} placeholder={`Item ${i+1} description`}
                    style={{ padding: '8px 11px', border: '1px solid var(--line-strong)', borderRadius: 6, fontSize: 13 }} />
                  <input type="number" min="0" step="0.01" value={row.price} onChange={e => updateServiceRow(i, 'price', e.target.value)} placeholder="0.00"
                    style={{ padding: '8px 11px', border: '1px solid var(--line-strong)', borderRadius: 6, fontSize: 13, fontFamily: 'var(--font-data)' }} />
                  <button onClick={() => removeServiceRow(i)} className="btn btn-ghost btn-sm" disabled={(editing.service_items||[]).length <= 1}>
                    <IconTrash width={13} />
                  </button>
                </div>
              ))}
              {(editing.service_items||[]).length < 10 && (
                <button className="btn btn-ghost btn-sm" onClick={addServiceRow} style={{ marginTop: 4 }}><IconPlus width={13} /> Add row</button>
              )}
              <div className="field" style={{ marginTop: 12 }}>
                <label>Line total</label>
                <input className="mono" disabled value={formatCurrency((editing.service_items||[]).reduce((s,i) => s + (Number(i.price)||0), 0), editing.currency)} style={{ background: 'var(--paper)', color: 'var(--slate)' }} />
              </div>
            </>
          )}

          <div className="form-actions">
            <button className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={save}>{editing.id ? 'Save changes' : 'Add entry'}</button>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <Modal title="Remove entry?" onClose={() => setConfirmDelete(null)} width={400}>
          <p style={{ fontSize: 13.5, color: 'var(--slate)', lineHeight: 1.6 }}>Permanently remove this ledger entry? This cannot be undone.</p>
          <div className="form-actions">
            <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={confirmAndDelete}>Remove</button>
          </div>
        </Modal>
      )}


      {/* Force delete invoiced/paid entry */}
      {forceDeleteTarget && (
        <Modal title="Force delete entry?" onClose={() => setForceDeleteTarget(null)} width={440}>
          <div style={{ background: 'var(--red-soft)', border: '1px solid var(--red)', borderRadius: 8, padding: '12px 16px', marginBottom: 18, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <IconTrash width={18} style={{ color: 'var(--red)', flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 13.5, color: 'var(--red)', lineHeight: 1.6 }}>
              <strong>This entry is {forceDeleteTarget?.status}.</strong> Deleting it will not automatically update or void the linked invoice. If you need to remove the invoice too, void it separately from the Invoices page.
            </div>
          </div>
          <p style={{ fontSize: 13.5, color: 'var(--slate)', lineHeight: 1.6, margin: '0 0 4px' }}>
            Entry: <strong>{forceDeleteTarget?.file_name || forceDeleteTarget?.service_items?.[0]?.description || 'this entry'}</strong>. This cannot be undone.
          </p>
          <div className="form-actions">
            <button className="btn btn-secondary" onClick={() => setForceDeleteTarget(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={handleForceDelete}>Force delete</button>
          </div>
        </Modal>
      )}
      {invoiceModal && (
        <GenerateInvoiceModal
          client={invoiceModal}
          entries={selectedEntries}
          onClose={() => setInvoiceModal(null)}
          onGenerated={() => { setSelected(new Set()); setInvoiceModal(null); load() }}
        />
      )}
    </>
  )
}
