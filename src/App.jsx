import { useState } from 'react'
import './app-shell.css'
import './forms.css'
import { AuthProvider, useAuth } from './lib/AuthContext'
import { ToastProvider } from './components/Toast'
import { isConfigured } from './lib/supabase'
import { signOut } from './lib/auth'
import {
  IconDashboard, IconLedger, IconClients, IconInvoice,
  IconRepeat, IconExport, IconFolder, IconSettings,
  IconUsers, IconHistory, IconLogout, IconBell, IconLock,
} from './components/Icons'
import SetupNotice from './components/SetupNotice'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import LedgerPage from './pages/LedgerPage'
import ClientsPage from './pages/ClientsPage'
import InvoicesPage from './pages/InvoicesPage'
import RecurringPage from './pages/RecurringPage'
import ExportPage from './pages/ExportPage'
import SettingsPage from './pages/SettingsPage'
import UsersPage from './pages/UsersPage'
import AuditPage from './pages/AuditPage'

function NavItem({ id, label, icon: Icon, active, onClick, badge }) {
  return (
    <button className={`nav-item ${active ? 'active' : ''}`} onClick={() => onClick(id)}>
      <Icon />
      <span>{label}</span>
      {badge ? (
        <span style={{
          marginLeft: 'auto', background: 'var(--amber)', color: 'white',
          borderRadius: 10, fontSize: 10, fontWeight: 700, padding: '1px 6px', minWidth: 18, textAlign: 'center',
        }}>{badge}</span>
      ) : null}
    </button>
  )
}

function AppShell({ dueSoon }) {
  const { session, role, isAdmin } = useAuth()
  const [page, setPage] = useState('dashboard')

  if (!session) return <LoginPage />

  const adminNav = [
    { id: 'dashboard', label: 'Dashboard', icon: IconDashboard },
    { id: 'ledger',    label: 'Ledger',    icon: IconLedger },
    { id: 'clients',   label: 'Clients',   icon: IconClients },
    { id: 'invoices',  label: 'Invoices',  icon: IconInvoice },
    { id: 'recurring', label: 'Recurring', icon: IconRepeat, badge: dueSoon > 0 ? dueSoon : null },
    { id: 'export',    label: 'Export',    icon: IconExport },
    { id: 'settings',  label: 'Settings',  icon: IconSettings },
    { id: 'users',     label: 'Users',     icon: IconUsers },
    { id: 'audit',     label: 'Audit Log', icon: IconHistory },
  ]

  const accountantNav = [
    { id: 'ledger',    label: 'Ledger',    icon: IconLedger },
    { id: 'clients',   label: 'Clients',   icon: IconClients },
    { id: 'invoices',  label: 'Invoices',  icon: IconInvoice },
    { id: 'recurring', label: 'Recurring', icon: IconRepeat, badge: dueSoon > 0 ? dueSoon : null },
  ]

  const nav = isAdmin ? adminNav : accountantNav

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-mark">GN</div>
          <div className="sidebar-brand-name">Global Net Svc</div>
        </div>
        <nav className="sidebar-nav">
          {nav.map(n => (
            <NavItem key={n.id} {...n} active={page === n.id} onClick={setPage} />
          ))}
        </nav>
        <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ padding: '0 12px 8px', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
            {session.user.email}
            <span style={{
              marginLeft: 6, background: role === 'admin' ? 'var(--teal)' : 'rgba(255,255,255,0.15)',
              color: 'white', padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600,
            }}>{role}</span>
          </div>
          <button className="nav-item" onClick={signOut} style={{ width: '100%' }}>
            <IconLogout /><span>Sign out</span>
          </button>
        </div>
      </aside>
      <main className="main">
        {page === 'dashboard' && isAdmin && <DashboardPage />}
        {page === 'ledger'    && <LedgerPage isAdmin={isAdmin} />}
        {page === 'clients'   && <ClientsPage />}
        {page === 'invoices'  && <InvoicesPage isAdmin={isAdmin} />}
        {page === 'recurring' && <RecurringPage />}
        {page === 'export'    && isAdmin && <ExportPage />}
        {page === 'settings'  && isAdmin && <SettingsPage />}
        {page === 'users'     && isAdmin && <UsersPage />}
        {page === 'audit'     && isAdmin && <AuditPage />}
        {!isAdmin && !['ledger','clients','invoices','recurring'].includes(page) && (
          <div className="card empty-state" style={{ marginTop: 40 }}>
            <IconLock className="empty-state-icon" />
            <h3>Access restricted</h3>
            <p>This section is only available to administrators.</p>
          </div>
        )}
      </main>
    </div>
  )
}

export default function App() {
  const [dueSoon, setDueSoon] = useState(0)
  if (!isConfigured) return <SetupNotice />
  return (
    <AuthProvider>
      <ToastProvider>
        <AppShell dueSoon={dueSoon} />
      </ToastProvider>
    </AuthProvider>
  )
}
