import { useEffect, useState } from 'react'
import { useToast } from '../components/Toast'
import { IconHistory } from '../components/Icons'
import { getAuditLog } from '../lib/api'

const ACTION_COLORS = { CREATE: 'var(--green)', UPDATE: 'var(--teal)', DELETE: 'var(--red)' }

export default function AuditPage() {
  const [logs, setLogs] = useState(null)
  const [tableFilter, setTableFilter] = useState('')
  const toast = useToast()

  useEffect(() => {
    getAuditLog(200).then(setLogs).catch(e => toast(e.message, 'error'))
  }, [])

  const tables = Array.from(new Set((logs || []).map(l => l.table_name))).sort()
  const filtered = (logs || []).filter(l => !tableFilter || l.table_name === tableFilter)

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Audit Log</h1>
          <p className="page-subtitle">Every create, update, and delete action — who did what and when.</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <select value={tableFilter} onChange={e => setTableFilter(e.target.value)}
          style={{ padding: '7px 11px', border: '1px solid var(--line-strong)', borderRadius: 6, fontSize: 13, background: 'white' }}>
          <option value="">All tables</option>
          {tables.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {logs === null ? (
        <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="loading-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="card empty-state">
          <IconHistory className="empty-state-icon" />
          <h3>No audit records yet</h3>
          <p>Actions are logged here as you create, update, and delete records.</p>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {['Time', 'User', 'Action', 'Table', 'Record ID'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11.5, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(l => (
                <tr key={l.id} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td className="mono" style={{ padding: '11px 16px', fontSize: 12, color: 'var(--slate)', whiteSpace: 'nowrap' }}>
                    {new Date(l.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td style={{ padding: '11px 16px', fontSize: 13 }}>{l.user_email || '—'}</td>
                  <td style={{ padding: '11px 16px' }}>
                    <span style={{ fontWeight: 700, fontSize: 12, color: ACTION_COLORS[l.action] || 'var(--slate)' }}>{l.action}</span>
                  </td>
                  <td className="mono" style={{ padding: '11px 16px', fontSize: 12.5 }}>{l.table_name}</td>
                  <td className="mono" style={{ padding: '11px 16px', fontSize: 11.5, color: 'var(--slate-light)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {l.record_id || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
