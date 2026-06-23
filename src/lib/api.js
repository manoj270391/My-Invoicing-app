import { supabase } from './supabase'
import { todayIST } from './gst'

// ── Audit logging ─────────────────────────────────────────────
export async function auditLog(action, tableName, recordId, oldData, newData) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    await supabase.from('audit_log').insert({
      user_id: session?.user?.id || null,
      user_email: session?.user?.email || null,
      action,
      table_name: tableName,
      record_id: String(recordId || ''),
      old_data: oldData || null,
      new_data: newData || null,
    })
  } catch { /* never block main operation for audit failure */ }
}

// ── Company profile ───────────────────────────────────────────
export async function getCompanyProfile() {
  const { data, error } = await supabase.from('company_profile').select('*').eq('id', 1).single()
  if (error) throw error
  return data
}

export async function updateCompanyProfile(patch) {
  const { data, error } = await supabase.from('company_profile').update(patch).eq('id', 1).select().single()
  if (error) throw error
  await auditLog('UPDATE', 'company_profile', 1, null, patch)
  return data
}

export async function uploadLogo(file) {
  const ext = file.name.split('.').pop()
  const path = `logo-${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('logos').upload(path, file, { upsert: true })
  if (error) throw error
  const { data } = supabase.storage.from('logos').getPublicUrl(path)
  return data.publicUrl
}

// ── Clients ───────────────────────────────────────────────────
export async function getClients() {
  const { data, error } = await supabase.from('clients').select('*').order('name')
  if (error) throw error
  return data
}

export async function createClient(client) {
  const { data, error } = await supabase.from('clients').insert(client).select().single()
  if (error) throw error
  await auditLog('CREATE', 'clients', data.id, null, data)
  return data
}

export async function updateClient(id, patch) {
  const { data, error } = await supabase.from('clients').update(patch).eq('id', id).select().single()
  if (error) throw error
  await auditLog('UPDATE', 'clients', id, null, patch)
  return data
}

export async function deleteClient(id) {
  const { error } = await supabase.from('clients').delete().eq('id', id)
  if (error) throw error
  await auditLog('DELETE', 'clients', id, null, null)
}

// ── Client documents ──────────────────────────────────────────
export async function getClientDocuments(clientId) {
  const { data, error } = await supabase
    .from('client_documents')
    .select('*')
    .eq('client_id', clientId)
    .order('uploaded_at', { ascending: false })
  if (error) throw error
  return data
}

export async function uploadClientDocument(clientId, file, docType) {
  const ext = file.name.split('.').pop()
  const path = `${clientId}/${Date.now()}-${file.name}`
  const { error: upErr } = await supabase.storage.from('client-docs').upload(path, file)
  if (upErr) throw upErr
  const { data: urlData } = supabase.storage.from('client-docs').getPublicUrl(path)
  const { data, error } = await supabase.from('client_documents').insert({
    client_id: clientId,
    file_name: file.name,
    file_url: urlData.publicUrl,
    doc_type: docType || 'other',
  }).select().single()
  if (error) throw error
  return data
}

export async function deleteClientDocument(id) {
  const { error } = await supabase.from('client_documents').delete().eq('id', id)
  if (error) throw error
}

// ── Entries ───────────────────────────────────────────────────
export async function getEntries(filters = {}) {
  let q = supabase
    .from('entries')
    .select('*, clients(name, client_type, gstin, currency, is_international)')
    .order('entry_date', { ascending: true })
    .order('created_at', { ascending: true })

  if (filters.clientId)    q = q.eq('client_id', filters.clientId)
  if (filters.entryType)   q = q.eq('entry_type', filters.entryType)
  if (filters.status)      q = q.eq('status', filters.status)
  if (filters.currency)    q = q.eq('currency', filters.currency)
  if (filters.dateFrom)    q = q.gte('entry_date', filters.dateFrom)
  if (filters.dateTo)      q = q.lte('entry_date', filters.dateTo)
  if (filters.search) {
    q = q.or(`file_name.ilike.%${filters.search}%,project_name.ilike.%${filters.search}%`)
  }

  const { data, error } = await q
  if (error) throw error
  return data
}

export async function createEntry(entry) {
  const { data, error } = await supabase.from('entries').insert(entry).select().single()
  if (error) throw error
  await auditLog('CREATE', 'entries', data.id, null, data)
  return data
}

export async function updateEntry(id, patch) {
  const { data, error } = await supabase.from('entries').update(patch).eq('id', id).select().single()
  if (error) throw error
  await auditLog('UPDATE', 'entries', id, null, patch)
  return data
}

export async function deleteEntry(id) {
  const { error } = await supabase.from('entries').delete().eq('id', id)
  if (error) throw error
  await auditLog('DELETE', 'entries', id, null, null)
}

export async function markEntriesInvoiced(entryIds, invoiceId) {
  const { error } = await supabase
    .from('entries')
    .update({ status: 'invoiced', invoice_id: invoiceId })
    .in('id', entryIds)
  if (error) throw error
}

export async function markEntriesPaid(entryIds) {
  const { error } = await supabase.from('entries').update({ status: 'paid' }).in('id', entryIds)
  if (error) throw error
}

// ── Invoices ──────────────────────────────────────────────────
export async function getInvoices(filters = {}) {
  let q = supabase
    .from('invoices')
    .select('*, clients(name, client_type, gstin, pan, address, email, phone, currency, is_international, vat_number, tax_id)')
    .order('invoice_date', { ascending: true })

  if (filters.status)   q = q.eq('status', filters.status)
  if (filters.clientId) q = q.eq('client_id', filters.clientId)
  if (filters.month)    q = q.gte('invoice_date', `${filters.month}-01`).lte('invoice_date', `${filters.month}-31`)
  if (filters.year)     q = q.gte('invoice_date', `${filters.year}-01-01`).lte('invoice_date', `${filters.year}-12-31`)

  const { data, error } = await q
  if (error) throw error
  return data
}

export async function createInvoice(invoice) {
  const { data, error } = await supabase.from('invoices').insert(invoice).select().single()
  if (error) throw error
  await auditLog('CREATE', 'invoices', data.id, null, data)
  return data
}

export async function updateInvoice(id, patch) {
  const { data, error } = await supabase.from('invoices').update(patch).eq('id', id).select().single()
  if (error) throw error
  await auditLog('UPDATE', 'invoices', id, null, patch)
  return data
}

// Records a payment against an invoice (full or partial) and recalculates
// status automatically: amount_received >= total -> 'paid',
// 0 < amount_received < total -> 'partially_paid', 0 -> 'unpaid'.
export async function recordPayment(id, amountReceived, paymentDate, inrEquivalent) {
  const { data: invoice, error: fetchErr } = await supabase.from('invoices').select('total').eq('id', id).single()
  if (fetchErr) throw fetchErr

  const received = Number(amountReceived) || 0
  const status = received <= 0 ? 'unpaid' : received >= invoice.total ? 'paid' : 'partially_paid'

  const patch = {
    amount_received: received,
    last_payment_date: paymentDate || todayIST(),
    status,
  }
  if (inrEquivalent != null) patch.inr_equivalent = inrEquivalent
  return updateInvoice(id, patch)
}

// Marks an invoice fully paid in one step (used for the simple "Mark paid"
// action where the full amount is being recorded, not a partial one).
export async function updateInvoiceStatus(id, status, inrEquivalent) {
  const patch = { status }
  if (inrEquivalent != null) patch.inr_equivalent = inrEquivalent
  if (status === 'paid') {
    const { data: invoice, error: fetchErr } = await supabase.from('invoices').select('total').eq('id', id).single()
    if (!fetchErr && invoice) {
      patch.amount_received = invoice.total
      patch.last_payment_date = todayIST()
    }
  } else if (status === 'unpaid') {
    patch.amount_received = 0
    patch.last_payment_date = null
  }
  return updateInvoice(id, patch)
}

// Indian financial year: April 1 to March 31.
// FY label = the calendar year in which the FY *starts* (e.g. Apr 2026-Mar 2027 = "2026")
// Always resolved in IST, regardless of the browser/server's local timezone,
// since this is an Indian business's financial year, not a local-clock one.
export function getFinancialYear(date) {
  const dateStr = date != null
    ? (typeof date === 'string' ? date.slice(0, 10) : new Date(date).toISOString().slice(0, 10))
    : todayIST()
  const [year, month] = dateStr.split('-').map(Number)
  return month >= 4 ? year : year - 1 // April (month 4) onward = current year FY
}

const INVOICE_PREFIX = 'GNS'

export async function getNextInvoiceNumber(forDate = new Date()) {
  const fy = getFinancialYear(forDate)
  const fyStart = `${fy}-04-01`
  const fyEnd   = `${fy + 1}-03-31`

  const { data, error } = await supabase
    .from('invoices')
    .select('invoice_number')
    .gte('invoice_date', fyStart)
    .lte('invoice_date', fyEnd)
    .order('created_at', { ascending: false })
    .limit(200) // safety cap; sequence numbers are reset yearly so this is plenty

  if (error) throw error

  let maxSeq = 0
  for (const row of data || []) {
    const m = row.invoice_number?.match(/^GNS\/(\d{3,})\/\d{4}$/)
    if (m) maxSeq = Math.max(maxSeq, Number(m[1]))
  }

  const nextSeq = String(maxSeq + 1).padStart(3, '0')
  return `${INVOICE_PREFIX}/${nextSeq}/${fy}`
}

// ── Recurring templates ───────────────────────────────────────
export async function getRecurringTemplates() {
  const { data, error } = await supabase
    .from('recurring_templates')
    .select('*, clients(name, currency)')
    .order('next_due_date')
  if (error) throw error
  return data
}

export async function createRecurringTemplate(tmpl) {
  const { data, error } = await supabase.from('recurring_templates').insert(tmpl).select().single()
  if (error) throw error
  return data
}

export async function updateRecurringTemplate(id, patch) {
  const { data, error } = await supabase.from('recurring_templates').update(patch).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteRecurringTemplate(id) {
  const { error } = await supabase.from('recurring_templates').delete().eq('id', id)
  if (error) throw error
}

// ── Dashboard analytics ───────────────────────────────────────
export async function getDashboardStats(fyStartYear) {
  let invQuery = supabase.from('invoices').select('total, status, currency, inr_equivalent, amount_received, last_payment_date, invoice_date, clients(name, client_type)')
  let entQuery = supabase.from('entries').select('line_total, status, entry_type, currency, entry_date, clients(name, client_type)')

  if (fyStartYear != null) {
    const fyStart = `${fyStartYear}-04-01`
    const fyEnd   = `${fyStartYear + 1}-03-31`
    invQuery = invQuery.gte('invoice_date', fyStart).lte('invoice_date', fyEnd)
    entQuery = entQuery.gte('entry_date', fyStart).lte('entry_date', fyEnd)
  }

  const [invRes, entRes] = await Promise.all([invQuery, entQuery])
  if (invRes.error) throw invRes.error
  if (entRes.error) throw entRes.error
  return { invoices: invRes.data, entries: entRes.data }
}

// Returns the list of financial-year start-years that have any data at all
// (based on the earliest invoice/entry date on record), so the dashboard's
// FY selector only shows years that are actually relevant.
export async function getAvailableFinancialYears() {
  const [invRes, entRes] = await Promise.all([
    supabase.from('invoices').select('invoice_date').order('invoice_date', { ascending: true }).limit(1),
    supabase.from('entries').select('entry_date').order('entry_date', { ascending: true }).limit(1),
  ])
  if (invRes.error) throw invRes.error
  if (entRes.error) throw entRes.error

  const dates = [invRes.data?.[0]?.invoice_date, entRes.data?.[0]?.entry_date].filter(Boolean)
  const earliestFY = dates.length > 0 ? getFinancialYear(Math.min(...dates.map(d => new Date(d).getTime()))) : getFinancialYear()
  const currentFY = getFinancialYear()

  const years = []
  for (let fy = currentFY + 1; fy >= earliestFY; fy--) years.push(fy) // include one year ahead for convenience
  return years
}

// ── Audit log ─────────────────────────────────────────────────
export async function getAuditLog(limit = 100) {
  const { data, error } = await supabase
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data
}

// ── User roles ────────────────────────────────────────────────
export async function getUsers() {
  const { data, error } = await supabase.from('user_roles').select('*').order('created_at')
  if (error) throw error
  return data
}

export async function upsertUserRole(userId, email, role) {
  const { error } = await supabase.from('user_roles').upsert({ user_id: userId, email, role })
  if (error) throw error
}

// ── Void invoice (admin only) ─────────────────────────────────
// Deletes the invoice and resets all linked entries back to pending
export async function voidInvoice(invoiceId) {
  // Reset all linked entries to pending first
  const { error: resetErr } = await supabase
    .from('entries')
    .update({ status: 'pending', invoice_id: null })
    .eq('invoice_id', invoiceId)
  if (resetErr) throw resetErr

  // Delete the invoice
  const { error: delErr } = await supabase
    .from('invoices')
    .delete()
    .eq('id', invoiceId)
  if (delErr) throw delErr

  await auditLog('DELETE', 'invoices', invoiceId, { voided: true }, null)
}

// ── Force delete entry regardless of status (admin only) ──────
export async function forceDeleteEntry(id) {
  const { error } = await supabase.from('entries').delete().eq('id', id)
  if (error) throw error
  await auditLog('DELETE', 'entries', id, { force: true }, null)
}
