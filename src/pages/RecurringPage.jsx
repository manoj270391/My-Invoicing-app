import { useEffect, useState } from 'react'
import Modal from '../components/Modal'
import { useToast } from '../components/Toast'
import { IconRepeat, IconPlus, IconEdit, IconTrash, IconBell } from '../components/Icons'
import { getRecurringTemplates, createRecurringTemplate, updateRecurringTemplate, deleteRecurringTemplate, getClients, createEntry } from '../lib/api'
import { CURRENCIES, formatCurrency, todayIST } from '../lib/gst'

const FREQS = ['monthly', 'quarterly', 'annual']

function nextDueDate(freq) {
  // Start from today's IST date (not the browser's raw local time, which
  // could be in a different timezone), then add the interval and format
  // without any further UTC conversion.
  const [y, m, d] = todayIST().split('-').map(Number)
  const date = new Date(y, m - 1, d) // local-safe construction, no TZ shift
  if (freq === 'monthly')   date.setMonth(date.getMonth() + 1)
  if (freq === 'quarterly') date.setMonth(date.getMonth() + 3)
  if (freq === 'annual')    date.setFullYear(date.getFullYear() + 1)
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function isDueSoon(dateStr) {
  if (!dateStr) return false
  const due  = new Date(dateStr)
  const now  = new Date()
  const diff = (due - now) / (1000 * 60 * 60 * 24)
  return diff <= 14
}

function emptyTemplate() {
  return { client_id: '', name: '', frequency: 'monthly', next_due_date: nextDueDate('monthly'), currency: 'INR', service_items: [{ description: '', price: '' }], is_active: true }
}

export default function RecurringPage() {
  const [templates, setTemplates] = useState(null)
  const [clients, setClients] = useState([])
  const [editing, setEditing] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const toast = useToast()

  async function load() {
    try {
      const [t, c] = await Promise.all([getRecurringTemplates(), getClients()])
      setTemplates(t); setClients(c.filter(c => c.client_type === 'website'))
    } catch (e) { toast(e.message, 'error') }
  }
  useEffect(() => { load() }, [])

  async function save() {
    try {
      if (!editing.client_id) return toast('Select a client', 'error')
      if (!editing.name.trim()) return toast('Template name is required', 'error')
      const payload = {
        ...editing,
        service_items: editing.service_items.filter(i => i.description?.trim())
          .map(i => ({ description: i.description, price: Number(i.price) || 0 })),
      }
      if (editing.id) { await updateRecurringTemplate(editing.id, payload); toast('Template updated', 'success') }
      else { await createRecurringTemplate(payload); toast('Template created', 'success') }
      setEditing(null); load()
    } catch (e) { toast(e.message, 'error') }
  }

  async function generateEntry(tmpl) {
    try {
      const total = (tmpl.service_items || []).reduce((s, i) => s + (Number(i.price) || 0), 0)
      await createEntry({
        client_id: tmpl.client_id,
        entry_type: 'website',
        entry_date: todayIST(),
        currency: tmpl.currency,
        service_items: tmpl.service_items,
        line_total: total,
        status: 'pending',
      })
      // Advance next due date
      await updateRecurringTemplate(tmpl.id, {
        last_generated: todayIST(),
        next_due_date: nextDueDate(tmpl.frequency),
      })
      toast('Ledger entry created from recurring template', 'success')
      load()
    } catch (e) { toast(e.message, 'error') }
  }

  const dueSoon = (templates || []).filter(t => t.is_active && isDueSoon(t.next_due_date))

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Recurring Invoices</h1>
          <p className="page-subtitle">Website client maintenance templates that generate ledger entries on demand.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing(emptyTemplate())}><IconPlus /> New template</button>
      </div>

      {dueSoon.length > 0 && (
        <div style={{ background: 'var(--amber-soft)', border: '1px solid var(--amber)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
          <IconBell width={18} style={{ color: 'var(--amber)', flexShrink: 0 }} />
          <div>
            <strong style={{ fontSize: 13.5, color: 'var(--amber)' }}>{dueSoon.length} template{dueSoon.length > 1 ? 's' : ''} due within 14 days</strong>
            <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 2 }}>
              {dueSoon.map(t => t.name).join(', ')}
            </div>
          </div>
        </div>
      )}

      {templates === null ? (
        <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="loading-spin" /></div>
      ) : templates.length === 0 ? (
        <div className="card empty-state">
          <IconRepeat className="empty-state-icon" />
          <h3>No recurring templates</h3>
          <p>Create a template for website clients who renew regularly.</p>
          <button className="btn btn-primary" onClick={() => setEditing(emptyTemplate())}><IconPlus /> New template</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {templates.map(t => {
            const total = (t.service_items || []).reduce((s, i) => s + (Number(i.price) || 0), 0)
            const due = isDueSoon(t.next_due_date)
            return (
              <div key={t.id} className="card card-pad" style={{ display: 'flex', alignItems: 'flex-start', gap: 20, opacity: t.is_active ? 1 : 0.5, borderLeft: due ? '3px solid var(--amber)' : undefined }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <strong style={{ fontSize: 14.5 }}>{t.name}</strong>
                    <span className="badge badge-pending">{t.frequency}</span>
                    {due && <span className="badge badge-pending">Due soon</span>}
                    {!t.is_active && <span className="badge" style={{ background: 'var(--line)', color: 'var(--slate)' }}>Inactive</span>}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--slate)', marginBottom: 6 }}>
                    {t.clients?.name} · Next due: <strong style={{ color: due ? 'var(--amber)' : 'var(--ink)' }}>{t.next_due_date}</strong>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--slate-light)' }}>
                    {(t.service_items || []).map(i => i.description).filter(Boolean).join(' · ')}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div className="mono" style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>{formatCurrency(total, t.currency)}</div>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button className="btn btn-primary btn-sm" onClick={() => generateEntry(t)} title="Generate ledger entry now"><IconRepeat width={13} /> Generate entry</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditing({ ...t, service_items: t.service_items?.length ? t.service_items : [{ description: '', price: '' }] })}><IconEdit width={13} /></button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(t)}><IconTrash width={13} /></button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editing && (
        <Modal title={editing.id ? 'Edit template' : 'New recurring template'} onClose={() => setEditing(null)} width={520}>
          <div className="field-row">
            <div className="field">
              <label>Client</label>
              <select value={editing.client_id} onChange={e => setEditing({ ...editing, client_id: e.target.value })}>
                <option value="">Select client…</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Template name</label>
              <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="Annual hosting renewal" />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Frequency</label>
              <select value={editing.frequency} onChange={e => setEditing({ ...editing, frequency: e.target.value, next_due_date: nextDueDate(e.target.value) })}>
                {FREQS.map(f => <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Next due date</label>
              <input type="date" value={editing.next_due_date} onChange={e => setEditing({ ...editing, next_due_date: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label>Currency</label>
            <select value={editing.currency} onChange={e => setEditing({ ...editing, currency: e.target.value })}>
              {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
          </div>

          <div className="section-label">Service items</div>
          {(editing.service_items || []).map((row, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 130px 32px', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <input value={row.description} onChange={e => { const s = [...editing.service_items]; s[i] = { ...s[i], description: e.target.value }; setEditing({ ...editing, service_items: s }) }}
                placeholder={`Item ${i+1}`} style={{ padding: '8px 11px', border: '1px solid var(--line-strong)', borderRadius: 6, fontSize: 13 }} />
              <input type="number" min="0" step="0.01" value={row.price} onChange={e => { const s = [...editing.service_items]; s[i] = { ...s[i], price: e.target.value }; setEditing({ ...editing, service_items: s }) }}
                placeholder="0.00" style={{ padding: '8px 11px', border: '1px solid var(--line-strong)', borderRadius: 6, fontSize: 13, fontFamily: 'var(--font-data)' }} />
              <button onClick={() => { const s = editing.service_items.filter((_, idx) => idx !== i); setEditing({ ...editing, service_items: s.length ? s : [{ description: '', price: '' }] }) }}
                className="btn btn-ghost btn-sm" disabled={editing.service_items.length <= 1}><IconTrash width={13} /></button>
            </div>
          ))}
          {(editing.service_items||[]).length < 10 && (
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing({ ...editing, service_items: [...(editing.service_items||[]), { description: '', price: '' }] })}><IconPlus width={13} /> Add row</button>
          )}

          <div className="field" style={{ marginTop: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={editing.is_active} onChange={e => setEditing({ ...editing, is_active: e.target.checked })} style={{ width: 16, height: 16, accentColor: 'var(--teal)' }} />
              Template is active
            </label>
          </div>

          <div className="form-actions">
            <button className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={save}>{editing.id ? 'Save changes' : 'Create template'}</button>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <Modal title="Delete template?" onClose={() => setConfirmDelete(null)} width={400}>
          <p style={{ fontSize: 13.5, color: 'var(--slate)', lineHeight: 1.6 }}>Delete the recurring template <strong><bdi>{confirmDelete.name}</bdi></strong>? This won't affect existing ledger entries.</p>
          <div className="form-actions">
            <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={async () => { await deleteRecurringTemplate(confirmDelete.id); setConfirmDelete(null); load() }}>Delete</button>
          </div>
        </Modal>
      )}
    </>
  )
}
