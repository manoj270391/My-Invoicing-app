import { useEffect, useState } from 'react'
import { useToast } from '../components/Toast'
import { IconUsers } from '../components/Icons'
import { getUsers, upsertUserRole as updateUserRole } from '../lib/api'

export default function UsersPage() {
  const [users, setUsers] = useState(null)
  const toast = useToast()

  async function load() {
    try { setUsers(await getUsers()) } catch (e) { toast(e.message, 'error') }
  }
  useEffect(() => { load() }, [])

  async function toggleRole(u) {
    const newRole = u.role === 'admin' ? 'accountant' : 'admin'
    try { await updateUserRole(u.user_id, newRole); toast('Role updated', 'success'); load() }
    catch (e) { toast(e.message, 'error') }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Users</h1>
          <p className="page-subtitle">Manage who has access and what they can see.</p>
        </div>
      </div>

      <div className="card card-pad" style={{ background: 'var(--amber-soft)', border: '1px solid var(--amber)', marginBottom: 20 }}>
        <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', margin: 0, lineHeight: 1.6 }}>
          <strong>How to add a new user:</strong> Go to your <strong>Supabase Dashboard → Authentication → Users → Invite user</strong>, enter their email and a temporary password. Once they log in, their role row will appear here automatically. Then assign them the <em>accountant</em> role below.
        </p>
      </div>

      <div className="card card-pad" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Role permissions</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--line)' }}>
              {['Feature', 'Admin', 'Accountant'].map(h => <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--slate)', fontWeight: 700 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {[
              ['View / add ledger entries', '✅', '✅'],
              ['View / add / edit clients', '✅', '✅'],
              ['Generate invoices', '✅', '✅ (Website only)'],
              ['Mark invoices paid', '✅', '✅ (Website only)'],
              ['Mark PDF client invoices paid + INR received', '✅', '❌'],
              ['Dashboard & revenue figures', '✅', '❌'],
              ['Company settings', '✅', '❌'],
              ['Recurring invoice templates', '✅', '✅'],
              ['Document uploads', '✅', '✅'],
              ['Export data', '✅', '❌'],
              ['User management', '✅', '❌'],
              ['Audit log', '✅', '❌'],
            ].map(([f, a, ac]) => (
              <tr key={f} style={{ borderBottom: '1px solid var(--line)' }}>
                <td style={{ padding: '8px 12px', color: 'var(--ink-soft)' }}>{f}</td>
                <td style={{ padding: '8px 12px', color: 'var(--green)' }}>{a}</td>
                <td style={{ padding: '8px 12px', color: ac.startsWith('✅') ? 'var(--teal)' : 'var(--slate-light)' }}>{ac}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {users === null ? (
        <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="loading-spin" /></div>
      ) : users.length === 0 ? (
        <div className="card empty-state">
          <IconUsers className="empty-state-icon" />
          <h3>No users yet</h3>
          <p>Add users via Supabase Auth dashboard — they'll appear here once they log in.</p>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {['Email', 'Role', 'Added', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '12px 18px', fontSize: 11.5, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={{ padding: '13px 18px', fontWeight: 600 }}>{u.email}</td>
                  <td style={{ padding: '13px 18px' }}>
                    <span className={`badge ${u.role === 'admin' ? 'badge-paid' : 'badge-invoiced'}`}>{u.role}</span>
                  </td>
                  <td className="mono" style={{ padding: '13px 18px', fontSize: 12.5, color: 'var(--slate)' }}>
                    {new Date(u.created_at).toLocaleDateString('en-IN')}
                  </td>
                  <td style={{ padding: '13px 18px', textAlign: 'right' }}>
                    {u.email !== 'manoj@globalnetservices.biz' && (
                      <button className="btn btn-secondary btn-sm" onClick={() => toggleRole(u)}>
                        Switch to {u.role === 'admin' ? 'accountant' : 'admin'}
                      </button>
                    )}
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
