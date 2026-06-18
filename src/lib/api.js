import { supabase } from './supabase'

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
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false })

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
    .select('*, clients(name, client_type, gstin, address, email, phone, currency, is_international, vat_number, tax_id)')
    .order('invoice_date', { ascending: false })

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

export async function updateInvoiceStatus(id, status, inrEquivalent) {
  const patch = { status }
  if (inrEquivalent != null) patch.inr_equivalent = inrEquivalent
  return updateInvoice(id, patch)
}

export async function getNextInvoiceNumber() {
  const { data, error } = await supabase
    .from('invoices')
    .select('invoice_number')
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) throw error
  if (!data || data.length === 0) return 'INV-0001'
  const last = data[0].invoice_number
  const match = last.match(/(\d+)$/)
  if (!match) return 'INV-0001'
  const nextNum = String(Number(match[1]) + 1).padStart(match[1].length, '0')
  return last.slice(0, match.index) + nextNum
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
export async function getDashboardStats() {
  const [invRes, entRes] = await Promise.all([
    supabase.from('invoices').select('total, status, currency, inr_equivalent, invoice_date, clients(name, client_type)'),
    supabase.from('entries').select('line_total, status, entry_type, currency, entry_date'),
  ])
  if (invRes.error) throw invRes.error
  if (entRes.error) throw entRes.error
  return { invoices: invRes.data, entries: entRes.data }
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
