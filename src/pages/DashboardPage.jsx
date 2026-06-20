import { useEffect, useState, useMemo } from 'react'
import { getDashboardStats } from '../lib/api'
import { formatINR, formatCurrency } from '../lib/gst'
import { useToast } from '../components/Toast'

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

// Returns the INR value of a paid invoice:
// - INR invoices: use total directly
// - Foreign currency invoices: use inr_equivalent if entered, else null (unconverted)
function paidInrValue(inv) {
  if (inv.currency === 'INR' || !inv.currency) return inv.total
  return inv.inr_equivalent != null ? inv.inr_equivalent : null
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

    const paidInvoices = invoices.filter(i => i.status === 'paid')
    const unpaidInvoices = invoices.filter(i => i.status === 'unpaid')

    // Paid total — only counts INR value (real or converted). Foreign-currency
    // invoices marked paid but without an INR equivalent entered are tracked
    // separately so revenue figures never silently mix currencies.
    let paid = 0
    let unconvertedCount = 0
    paidInvoices.forEach(inv => {
      const v = paidInrValue(inv)
      if (v == null) { unconvertedCount++; return }
      paid += v
    })

    // Outstanding — only INR-denominated unpaid invoices count toward the
    // INR "Outstanding" figure; foreign currency unpaid shown separately.
    const unpaidINR = unpaidInvoices.filter(i => !i.currency || i.currency === 'INR')
    const unpaidForeign = unpaidInvoices.filter(i => i.currency && i.currency !== 'INR')
    const unpaid = unpaidINR.reduce((s, i) => s + i.total, 0)

    // Foreign currency unpaid grouped by currency (can't sum different currencies)
    const unpaidForeignByCurrency = {}
    unpaidForeign.forEach(i => {
      unpaidForeignByCurrency[i.currency] = (unpaidForeignByCurrency[i.currency] || 0) + i.total
    })

    const totalInv = invoices.length
    const unpaidCount = unpaidInvoices.length

    // Pending (unbilled) entries — grouped by currency, since summing
    // different currencies into one number is meaningless.
    const pendingEntries = entries.filter(e => e.status === 'pending')
    const pendingByCurrency = {}
    pendingEntries.forEach(e => {
      const cur = e.currency || 'INR'
      pendingByCurrency[cur] = (pendingByCurrency[cur] || 0) + (e.line_total || 0)
    })
    const pendingCurrencies = Object.entries(pendingByCurrency).sort((a, b) => b[1] - a[1])

    // Monthly revenue (last 6 months, paid INR value only)
    const now = new Date()
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
      return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleString('default', { month: 'short' }), total: 0 }
    })
    paidInvoices.forEach(inv => {
      const v = paidInrValue(inv)
      if (v == null) return
      const m = months.find(mo => inv.invoice_date?.startsWith(mo.key))
      if (m) m.total += v
    })

    // By client (top 5) — INR value only (paid + unpaid-INR combined for a revenue view)
    const byClient = {}
    invoices.forEach(inv => {
      const name = inv.clients?.name || 'Unknown'
      const v = inv.status === 'paid' ? paidInrValue(inv) : (!inv.currency || inv.currency === 'INR' ? inv.total : null)
      if (v == null) return
      byClient[name] = (byClient[name] || 0) + v
    })
    const topClients = Object.entries(byClient).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([name, total]) => ({ name: name.length > 16 ? name.slice(0, 14) + '…' : name, total }))

    // By service type (INR-denominated entries only, for consistency)
    const pdfTotal = entries.filter(e => e.entry_type === 'pdf' && (!e.currency || e.currency === 'INR')).reduce((s, e) => s + (e.line_total || 0), 0)
    const webTotal = entries.filter(e => e.entry_type === 'website' && (!e.currency || e.currency === 'INR')).reduce((s, e) => s + (e.line_total || 0), 0)

    return {
      paid, unpaid, totalInv, unpaidCount, months, topClients, pdfTotal, webTotal,
      unconvertedCount, unpaidForeignByCurrency, pendingCurrencies,
    }
  }, [stats])

  if (!derived) return <div className="center-screen" style={{ height: 300 }}><div className="loading-spin" /></div>

  const foreignUnpaidEntries = Object.entries(derived.unpaidForeignByCurrency)

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Business overview at a glance.</p>
        </div>
      </div>

      <div className="stat-row" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <StatTile
          label="Paid (INR received)"
          value={formatINR(derived.paid)}
          color="green"
          sub={derived.unconvertedCount > 0 ? `+ ${derived.unconvertedCount} foreign invoice${derived.unconvertedCount !== 1 ? 's' : ''} awaiting INR entry` : null}
        />
        <StatTile
          label="Outstanding (INR)"
          value={formatINR(derived.unpaid)}
          color="amber"
          sub={`${derived.unpaidCount} invoice${derived.unpaidCount !== 1 ? 's' : ''} unpaid total${foreignUnpaidEntries.length ? ' · + foreign below' : ''}`}
        />
        <StatTile
          label="Pending (unbilled)"
          value={derived.pendingCurrencies.length > 0 ? formatCurrency(derived.pendingCurrencies[0][1], derived.pendingCurrencies[0][0]) : formatINR(0)}
          color="teal"
          sub={derived.pendingCurrencies.length > 1 ? `+ ${derived.pendingCurrencies.length - 1} other currenc${derived.pendingCurrencies.length - 1 === 1 ? 'y' : 'ies'} below` : null}
        />
        <StatTile label="Total invoices" value={derived.totalInv} />
      </div>

      {(foreignUnpaidEntries.length > 0 || derived.pendingCurrencies.length > 1) && (
        <div className="card card-pad" style={{ marginBottom: 20, background: 'var(--paper)' }}>
          <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
            {foreignUnpaidEntries.length > 0 && (
              <div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Outstanding — foreign currency</div>
                {foreignUnpaidEntries.map(([cur, amt]) => (
                  <div key={cur} className="mono" style={{ fontSize: 13.5, fontWeight: 600 }}>{formatCurrency(amt, cur)}</div>
                ))}
              </div>
            )}
            {derived.pendingCurrencies.length > 1 && (
              <div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Pending — by currency</div>
                {derived.pendingCurrencies.map(([cur, amt]) => (
                  <div key={cur} className="mono" style={{ fontSize: 13.5, fontWeight: 600 }}>{formatCurrency(amt, cur)}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="card card-pad">
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Revenue — last 6 months (paid, INR)</div>
          <BarChart data={derived.months} valueKey="total" labelKey="label" color="var(--teal)" />
        </div>
        <div className="card card-pad">
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Revenue by client (INR, all time)</div>
          <BarChart data={derived.topClients} valueKey="total" labelKey="name" color="var(--amber)" />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card card-pad">
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Revenue by service type (INR)</div>
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
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Invoice status breakdown (INR)</div>
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
