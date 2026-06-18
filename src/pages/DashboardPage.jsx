import { useEffect, useState, useMemo } from 'react'
import { getDashboardStats } from '../lib/api'
import { formatINR, formatCurrency } from '../lib/gst'
import { useToast } from '../components/Toast'
import { IconInvoice, IconCurrency, IconClients, IconLedger } from '../components/Icons'

function StatTile({ label, value, sub, color }) {
  return (
    <div className="stat-tile">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${color || ''}`}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--slate-light)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

function BarChart({ data, valueKey, labelKey, color = 'var(--teal)' }) {
  const max = Math.max(...data.map(d => d[valueKey]), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120, padding: '0 4px' }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{ fontSize: 10, color: 'var(--slate-light)', fontFamily: 'var(--font-data)' }}>
            {formatINR(d[valueKey]).replace('₹', '').trim()}
          </div>
          <div style={{
            width: '100%', background: color, borderRadius: '4px 4px 0 0',
            height: `${Math.max((d[valueKey] / max) * 90, 2)}px`, minHeight: 2,
            opacity: 0.85, transition: 'height 0.3s',
          }} />
          <div style={{ fontSize: 10, color: 'var(--slate)', textAlign: 'center', whiteSpace: 'nowrap' }}>{d[labelKey]}</div>
        </div>
      ))}
    </div>
  )
}

export default function DashboardPage() {
  const [stats, setStats] = useState(null)
  const toast = useToast()

  useEffect(() => {
    getDashboardStats().then(setStats).catch(e => toast(e.message, 'error'))
  }, [])

  const derived = useMemo(() => {
    if (!stats) return null
    const { invoices, entries } = stats
    const paid       = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0)
    const unpaid     = invoices.filter(i => i.status === 'unpaid').reduce((s, i) => s + i.total, 0)
    const totalInv   = invoices.length
    const unpaidCount = invoices.filter(i => i.status === 'unpaid').length
    const pending    = entries.filter(e => e.status === 'pending').reduce((s, e) => s + (e.line_total || 0), 0)

    // Monthly revenue (last 6 months)
    const now = new Date()
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
      return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleString('default', { month: 'short' }), total: 0 }
    })
    invoices.filter(i => i.status === 'paid').forEach(inv => {
      const m = months.find(mo => inv.invoice_date?.startsWith(mo.key))
      if (m) m.total += inv.total
    })

    // By client (top 5)
    const byClient = {}
    invoices.forEach(inv => {
      const name = inv.clients?.name || 'Unknown'
      byClient[name] = (byClient[name] || 0) + inv.total
    })
    const topClients = Object.entries(byClient).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([name, total]) => ({ name: name.length > 16 ? name.slice(0, 14) + '…' : name, total }))

    // By service type
    const pdfTotal = entries.filter(e => e.entry_type === 'pdf').reduce((s, e) => s + (e.line_total || 0), 0)
    const webTotal = entries.filter(e => e.entry_type === 'website').reduce((s, e) => s + (e.line_total || 0), 0)

    return { paid, unpaid, totalInv, unpaidCount, pending, months, topClients, pdfTotal, webTotal }
  }, [stats])

  if (!derived) return <div className="center-screen" style={{ height: 300 }}><div className="loading-spin" /></div>

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Business overview at a glance.</p>
        </div>
      </div>

      <div className="stat-row" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <StatTile label="Paid (invoiced)"   value={formatINR(derived.paid)}    color="green" />
        <StatTile label="Outstanding"       value={formatINR(derived.unpaid)}  color="amber" sub={`${derived.unpaidCount} invoice${derived.unpaidCount !== 1 ? 's' : ''} unpaid`} />
        <StatTile label="Pending (unbilled)" value={formatINR(derived.pending)} color="teal" />
        <StatTile label="Total invoices"    value={derived.totalInv} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="card card-pad">
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Revenue — last 6 months (paid)</div>
          <BarChart data={derived.months} valueKey="total" labelKey="label" color="var(--teal)" />
        </div>
        <div className="card card-pad">
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Revenue by client (all time)</div>
          <BarChart data={derived.topClients} valueKey="total" labelKey="name" color="var(--amber)" />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card card-pad">
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Revenue by service type</div>
          {[['PDF Accessibility', derived.pdfTotal, 'var(--teal)'], ['Website & Domain', derived.webTotal, 'var(--amber)']].map(([label, val, col]) => (
            <div key={label} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                <span>{label}</span>
                <span className="mono" style={{ fontWeight: 600 }}>{formatINR(val)}</span>
              </div>
              <div style={{ background: 'var(--line)', borderRadius: 4, height: 8 }}>
                <div style={{
                  background: col, borderRadius: 4, height: 8,
                  width: `${derived.pdfTotal + derived.webTotal > 0 ? (val / (derived.pdfTotal + derived.webTotal)) * 100 : 0}%`,
                }} />
              </div>
            </div>
          ))}
        </div>

        <div className="card card-pad">
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Invoice status breakdown</div>
          {[
            ['Paid', derived.paid, 'var(--green)'],
            ['Unpaid / Outstanding', derived.unpaid, 'var(--amber)'],
          ].map(([label, val, col]) => (
            <div key={label} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                <span>{label}</span>
                <span className="mono" style={{ fontWeight: 600 }}>{formatINR(val)}</span>
              </div>
              <div style={{ background: 'var(--line)', borderRadius: 4, height: 8 }}>
                <div style={{
                  background: col, borderRadius: 4, height: 8,
                  width: `${derived.paid + derived.unpaid > 0 ? (val / (derived.paid + derived.unpaid)) * 100 : 0}%`,
                }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
