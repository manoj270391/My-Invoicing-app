import { useState } from 'react'
import './app-shell.css'
import { IconLedger, IconClients, IconInvoice, IconSettings } from './components/Icons'
import { ToastProvider } from './components/Toast'
import { isConfigured } from './lib/supabase'
import LedgerPage from './pages/LedgerPage'
import ClientsPage from './pages/ClientsPage'
import InvoicesPage from './pages/InvoicesPage'
import SettingsPage from './pages/SettingsPage'
import SetupNotice from './components/SetupNotice'

const NAV = [
  { id: 'ledger', label: 'Ledger', icon: IconLedger },
  { id: 'clients', label: 'Clients', icon: IconClients },
  { id: 'invoices', label: 'Invoices', icon: IconInvoice },
  { id: 'settings', label: 'Settings', icon: IconSettings },
]

function AppInner() {
  const [page, setPage] = useState('ledger')

  if (!isConfigured) {
    return <SetupNotice />
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-mark">PT</div>
          <div className="sidebar-brand-name">Project Tracker</div>
        </div>
        <nav className="sidebar-nav">
          {NAV.map((n) => {
            const Icon = n.icon
            return (
              <button
                key={n.id}
                className={`nav-item ${page === n.id ? 'active' : ''}`}
                onClick={() => setPage(n.id)}
              >
                <Icon />
                <span>{n.label}</span>
              </button>
            )
          })}
        </nav>
        <div className="sidebar-footer">v1.0 · your data, your Supabase</div>
      </aside>
      <main className="main">
        {page === 'ledger' && <LedgerPage />}
        {page === 'clients' && <ClientsPage />}
        {page === 'invoices' && <InvoicesPage />}
        {page === 'settings' && <SettingsPage />}
      </main>
    </div>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  )
}
