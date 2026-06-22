import { useEffect, useState, useMemo, useCallback } from 'react'
import { getDashboardStats, getAvailableFinancialYears, getFinancialYear } from '../lib/api'
import { formatINR, formatCurrency, formatFinancialYearLabel, formatFinancialYearDateRange } from '../lib/gst'
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

function BarChart({ data, valueKey, labelKey, color = 'var(--teal)', topLabelFormatter }) {
  const max = Math.max(...data.map(d => d[valueKey]), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120, padding: '0 4px' }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{ fontSize: 10, color: 'var(--slate-light)', fontFamily: 'var(--font-data)', textAlign: 'center', lineHeight: 1.3 }}>
            {topLabelFormatter ? topLabelFormatter(d) : formatINR(d[valueKey]).replace('₹', '').trim()}
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

// Returns the INR value actually RECEIVED for an invoice so far:
// - INR invoices: amount_received directly (0 if unpaid, partial amount if
//   partially paid, full total if paid)
// - Foreign currency invoices: inr_equivalent if entered (the INR value of
//   whatever has been received so far), else null (not yet converted)
function paidInrValue(inv) {
  const received = Number(inv.amount_received) || 0
  if (inv.currency === 'INR' || !inv.currency) return received
  return inv.inr_equivalent != null ? inv.inr_equivalent : null
}

// Returns the outstanding (still-pending) amount for an invoice in its own
// currency: total minus whatever has been received so far. Never negative.
function pendingValue(inv) {
  const received = Number(inv.amount_received) || 0
  return Math.max(inv.total - received, 0)
}

const FY_MONTH_LABELS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar']

export default function DashboardPage() {
  const [stats, setStats] = useState(null)
  const [availableFYs, setAvailableFYs] = useState(null)
  const [selectedFY, setSelectedFY] = useState(getFinancialYear())
  const toast = useToast()

  const loadStats = useCallback((fy) => {
    setStats(null)
    getDashboardStats(fy).then(setStats).catch(e => toast(e.message, 'error'))
  }, [])

  useEffect(() => {
    getAvailableFinancialYears().then(setAvailableFYs).catch(e => toast(e.message, 'error'))
  }, [])

  useEffect(() => { loadStats(selectedFY) }, [selectedFY, loadStats])

  const derived = useMemo(() => {
    if (!stats) return null
    const { invoices, entries } = stats

    // "Outstanding" now includes both fully unpaid AND partially paid
    // invoices — partially paid still has a real pending balance owed.
    const unpaidInvoices = invoices.filter(i => i.status === 'unpaid' || i.status === 'partially_paid')

    // Paid total — sums whatever has actually been RECEIVED so far across
    // every invoice (full payments count fully, partial payments count their
    // partial amount). Only counts INR value (real or converted);
    // foreign-currency invoices with a partial/full receipt but no INR
    // equivalent entered yet are tracked separately so revenue figures never
    // silently mix currencies.
    let paid = 0
    let unconvertedCount = 0
    invoices.forEach(inv => {
      if (inv.status === 'unpaid') return // nothing received yet
      const v = paidInrValue(inv)
      if (v == null) { unconvertedCount++; return }
      paid += v
    })

    // Outstanding — only INR-denominated invoices count toward the INR
    // "Outstanding" headline figure, using the PENDING balance (total minus
    // whatever's been received), not the full original total; foreign
    // currency outstanding kept separate.
    const unpaidINR = unpaidInvoices.filter(i => !i.currency || i.currency === 'INR')
    const unpaidForeign = unpaidInvoices.filter(i => i.currency && i.currency !== 'INR')
    const unpaid = unpaidINR.reduce((s, i) => s + pendingValue(i), 0)

    const unpaidForeignByCurrency = {}
    unpaidForeign.forEach(i => {
      unpaidForeignByCurrency[i.currency] = (unpaidForeignByCurrency[i.currency] || 0) + pendingValue(i)
    })

    // Outstanding by client — every unpaid/partially-paid invoice grouped
    // under its client, using each invoice's PENDING balance, with INR and
    // any foreign-currency amounts shown side by side per client.
    const outstandingByClient = {}
    unpaidInvoices.forEach(inv => {
      const name = inv.clients?.name || 'Unknown'
      if (!outstandingByClient[name]) outstandingByClient[name] = { inr: 0, foreign: {} }
      const isForeign = inv.currency && inv.currency !== 'INR'
      const pending = pendingValue(inv)
      if (isForeign) {
        outstandingByClient[name].foreign[inv.currency] = (outstandingByClient[name].foreign[inv.currency] || 0) + pending
      } else {
        outstandingByClient[name].inr += pending
      }
    })
    const outstandingClients = Object.entries(outstandingByClient)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.inr - a.inr)

    const totalInv = invoices.length
    const unpaidCount = unpaidInvoices.length

    // Pending (unbilled) entries — grouped by currency (for the headline stat)
    const pendingEntries = entries.filter(e => e.status === 'pending')
    const pendingByCurrency = {}
    pendingEntries.forEach(e => {
      const cur = e.currency || 'INR'
      pendingByCurrency[cur] = (pendingByCurrency[cur] || 0) + (e.line_total || 0)
    })
    const pendingCurrencies = Object.entries(pendingByCurrency).sort((a, b) => b[1] - a[1])

    // Pending by client — every unbilled entry grouped under its client.
    const pendingByClient = {}
    pendingEntries.forEach(e => {
      const name = e.clients?.name || 'Unknown'
      if (!pendingByClient[name]) pendingByClient[name] = { inr: 0, foreign: {} }
      const cur = e.currency || 'INR'
      if (cur === 'INR') {
        pendingByClient[name].inr += (e.line_total || 0)
      } else {
        pendingByClient[name].foreign[cur] = (pendingByClient[name].foreign[cur] || 0) + (e.line_total || 0)
      }
    })
    const pendingClients = Object.entries(pendingByClient)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.inr - a.inr)

    // Monthly revenue across the full financial year (Apr -> Mar) — counts
    // whatever's actually been received (full or partial payments), INR value only
    const months = FY_MONTH_LABELS.map((label, i) => {
      // i=0 -> April of selectedFY, i=9 -> January of selectedFY+1, etc.
      const calYear = i < 9 ? selectedFY : selectedFY + 1
      const calMonth = ((i + 3) % 12) + 1 // 0->4(Apr) ... 11->3(Mar)
      const key = `${calYear}-${String(calMonth).padStart(2, '0')}`
      return { key, label, total: 0 }
    })
    invoices.filter(inv => inv.status !== 'unpaid').forEach(inv => {
      const v = paidInrValue(inv)
      if (v == null) return
      const m = months.find(mo => inv.invoice_date?.startsWith(mo.key))
      if (m) m.total += v
    })

    // By client (top 5, PDF Accessibility only) — INR value drives bar height;
    // foreign-currency totals always shown in brackets alongside.
    const byClientINR = {}
    const byClientForeign = {}
    invoices.filter(inv => inv.clients?.client_type === 'pdf').forEach(inv => {
      const name = inv.clients?.name || 'Unknown'
      const isForeign = inv.currency && inv.currency !== 'INR'

      if (!isForeign) {
        // Paid/partially-paid: count what's actually been received.
        // Unpaid: count the full billed total (this chart reflects revenue
        // billed to each client, not strictly cash received).
        const v = inv.status !== 'unpaid' ? paidInrValue(inv) : inv.total
        if (v != null) byClientINR[name] = (byClientINR[name] || 0) + v
        return
      }

      byClientForeign[name] = byClientForeign[name] || {}
      byClientForeign[name][inv.currency] = (byClientForeign[name][inv.currency] || 0) + inv.total

      if (inv.status !== 'unpaid' && inv.inr_equivalent != null) {
        byClientINR[name] = (byClientINR[name] || 0) + inv.inr_equivalent
      }
    })

    const allClientNames = new Set([...Object.keys(byClientINR), ...Object.keys(byClientForeign)])
    const topClients = Array.from(allClientNames)
      .map(name => ({ name, total: byClientINR[name] || 0, foreign: byClientForeign[name] || {} }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
      .map(c => ({ ...c, name: c.name.length > 16 ? c.name.slice(0, 14) + '…' : c.name, fullName: c.name }))

    // Total INR actually RECEIVED so far (full + partial payments) across
    // all PDF Accessibility clients combined — INR invoices counted
    // directly, foreign-currency invoices counted via their entered INR
    // equivalent (if any).
    const pdfTotalReceivedINR = invoices
      .filter(inv => inv.clients?.client_type === 'pdf' && inv.status !== 'unpaid')
      .reduce((sum, inv) => sum + (paidInrValue(inv) || 0), 0)

    // By service type — grouped by currency
    function groupByCurrency(arr) {
      const byCur = {}
      arr.forEach(e => {
        const cur = e.currency || 'INR'
        byCur[cur] = (byCur[cur] || 0) + (e.line_total || 0)
      })
      return Object.entries(byCur).sort((a, b) => b[1] - a[1])
    }
    const pdfByCurrency = groupByCurrency(entries.filter(e => e.entry_type === 'pdf'))
    const webByCurrency = groupByCurrency(entries.filter(e => e.entry_type === 'website'))

    return {
      paid, unpaid, totalInv, unpaidCount, months, topClients,
      pdfByCurrency, webByCurrency,
      unconvertedCount, unpaidForeignByCurrency, pendingCurrencies,
      outstandingClients, pendingClients, pdfTotalReceivedINR,
    }
  }, [stats, selectedFY])

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Business overview for the selected financial year.</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <select
            value={selectedFY}
            onChange={e => setSelectedFY(Number(e.target.value))}
            style={{ padding: '8px 12px', border: '1px solid var(--line-strong)', borderRadius: 8, fontSize: 13.5, fontWeight: 600, background: 'white' }}
          >
            {(availableFYs || [selectedFY]).map(fy => (
              <option key={fy} value={fy}>{formatFinancialYearLabel(fy)}</option>
            ))}
          </select>
          <div style={{ fontSize: 11.5, color: 'var(--slate-light)', marginTop: 5 }}>{formatFinancialYearDateRange(selectedFY)}</div>
        </div>
      </div>

      {!derived ? (
        <div className="center-screen" style={{ height: 300 }}><div className="loading-spin" /></div>
      ) : (
        <>
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
              sub={`${derived.unpaidCount} invoice${derived.unpaidCount !== 1 ? 's' : ''} unpaid total${Object.keys(derived.unpaidForeignByCurrency).length ? ' · + foreign below' : ''}`}
            />
            <StatTile
              label="Pending (unbilled)"
              value={derived.pendingCurrencies.length > 0 ? formatCurrency(derived.pendingCurrencies[0][1], derived.pendingCurrencies[0][0]) : formatINR(0)}
              color="teal"
              sub={derived.pendingCurrencies.length > 1 ? `+ ${derived.pendingCurrencies.length - 1} other currenc${derived.pendingCurrencies.length - 1 === 1 ? 'y' : 'ies'} below` : null}
            />
            <StatTile label="Total invoices" value={derived.totalInv} />
          </div>

          {(derived.outstandingClients.length > 0 || derived.pendingClients.length > 0) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
              {derived.outstandingClients.length > 0 && (
                <div className="card card-pad">
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>Outstanding by client</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 200, overflowY: 'auto' }}>
                    {derived.outstandingClients.map(c => {
                      const foreignParts = Object.entries(c.foreign || {})
                      return (
                        <div key={c.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 13 }}>
                          <span style={{ color: 'var(--ink-soft)' }}>{c.name}</span>
                          <span style={{ textAlign: 'right' }}>
                            {c.inr > 0 && <span className="mono" style={{ fontWeight: 600, color: 'var(--amber)' }}>{formatINR(c.inr)}</span>}
                            {foreignParts.length > 0 && (
                              <span className="mono" style={{ fontSize: 12, color: 'var(--slate)', marginLeft: 6 }}>
                                {c.inr > 0 ? '(' : ''}{foreignParts.map(([cur, amt]) => formatCurrency(amt, cur)).join(', ')}{c.inr > 0 ? ')' : ''}
                              </span>
                            )}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              {derived.pendingClients.length > 0 && (
                <div className="card card-pad">
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>Pending (unbilled) by client</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 200, overflowY: 'auto' }}>
                    {derived.pendingClients.map(c => {
                      const foreignParts = Object.entries(c.foreign || {})
                      return (
                        <div key={c.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 13 }}>
                          <span style={{ color: 'var(--ink-soft)' }}>{c.name}</span>
                          <span style={{ textAlign: 'right' }}>
                            {c.inr > 0 && <span className="mono" style={{ fontWeight: 600, color: 'var(--teal)' }}>{formatINR(c.inr)}</span>}
                            {foreignParts.length > 0 && (
                              <span className="mono" style={{ fontSize: 12, color: 'var(--slate)', marginLeft: 6 }}>
                                {c.inr > 0 ? '(' : ''}{foreignParts.map(([cur, amt]) => formatCurrency(amt, cur)).join(', ')}{c.inr > 0 ? ')' : ''}
                              </span>
                            )}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="card card-pad" style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Revenue by month — {formatFinancialYearLabel(selectedFY)} (paid, INR)</div>
            <BarChart data={derived.months} valueKey="total" labelKey="label" color="var(--teal)" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="card card-pad">
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Revenue by client (PDF Accessibility)</div>
              <BarChart
                data={derived.topClients}
                valueKey="total"
                labelKey="name"
                color="var(--amber)"
                topLabelFormatter={(d) => {
                  const inrPart = formatINR(d.total).replace('₹', '').trim()
                  const foreignEntries = Object.entries(d.foreign || {})
                  if (foreignEntries.length === 0) return inrPart
                  const foreignPart = foreignEntries.map(([cur, amt]) => formatCurrency(amt, cur)).join(', ')
                  return (
                    <>
                      {inrPart}
                      <div style={{ fontSize: 9, color: 'var(--amber)', marginTop: 1 }}>({foreignPart})</div>
                    </>
                  )
                }}
              />
              {derived.topClients.length === 0 ? (
                <div style={{ fontSize: 12.5, color: 'var(--slate-light)', marginTop: 10 }}>No PDF Accessibility invoices in this financial year yet.</div>
              ) : derived.topClients.some(c => Object.keys(c.foreign || {}).length > 0) && (
                <div style={{ fontSize: 11, color: 'var(--slate-light)', marginTop: 10 }}>
                  Bracketed amounts show the original foreign-currency invoice total for that client, alongside the INR figure (which includes any INR equivalent you've entered for paid invoices).
                </div>
              )}
            </div>

            <div className="card card-pad">
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Revenue by service type</div>
              {[
                ['PDF Accessibility', derived.pdfByCurrency, 'var(--teal)', derived.pdfTotalReceivedINR],
                ['Website & Domain', derived.webByCurrency, 'var(--amber)', null],
              ].map(([label, byCurrency, col, receivedINR]) => (
                <div key={label} style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
                    {receivedINR != null && (
                      <div style={{ fontSize: 12, color: 'var(--slate)' }}>
                        Received: <span className="mono" style={{ fontWeight: 700, color: 'var(--teal)' }}>{formatINR(receivedINR)}</span>
                      </div>
                    )}
                  </div>
                  {byCurrency.length === 0 ? (
                    <div style={{ fontSize: 12.5, color: 'var(--slate-light)' }}>No entries yet</div>
                  ) : byCurrency.map(([cur, amt]) => {
                    const maxInGroup = Math.max(...byCurrency.map(([, a]) => a), 1)
                    return (
                      <div key={cur} style={{ marginBottom: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                          <span style={{ color: 'var(--slate)' }}>{cur}</span>
                          <span className="mono" style={{ fontWeight: 600 }}>{formatCurrency(amt, cur)}</span>
                        </div>
                        <div style={{ background: 'var(--line)', borderRadius: 4, height: 7 }}>
                          <div style={{ background: col, borderRadius: 4, height: 7, width: `${(amt / maxInGroup) * 100}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  )
}
