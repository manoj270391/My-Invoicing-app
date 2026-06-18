import { supabase } from './supabase'

// ---------- Clients ----------
export async function getClients() {
  const { data, error } = await supabase.from('clients').select('*').order('name')
  if (error) throw error
  return data
}

export async function createClient(client) {
  const { data, error } = await supabase.from('clients').insert(client).select().single()
  if (error) throw error
  return data
}

export async function updateClient(id, patch) {
  const { data, error } = await supabase.from('clients').update(patch).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteClient(id) {
  const { error } = await supabase.from('clients').delete().eq('id', id)
  if (error) throw error
}

// ---------- Entries ----------
export async function getEntries() {
  const { data, error } = await supabase
    .from('entries')
    .select('*, clients(name, client_type, gstin)')
    .order('entry_date', { ascending: false })
  if (error) throw error
  return data
}

export async function createEntry(entry) {
  const { data, error } = await supabase.from('entries').insert(entry).select().single()
  if (error) throw error
  return data
}

export async function updateEntry(id, patch) {
  const { data, error } = await supabase.from('entries').update(patch).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteEntry(id) {
  const { error } = await supabase.from('entries').delete().eq('id', id)
  if (error) throw error
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

// ---------- Invoices ----------
export async function getInvoices() {
  const { data, error } = await supabase
    .from('invoices')
    .select('*, clients(name, client_type, gstin, address, email, phone)')
    .order('invoice_date', { ascending: false })
  if (error) throw error
  return data
}

export async function createInvoice(invoice) {
  const { data, error } = await supabase.from('invoices').insert(invoice).select().single()
  if (error) throw error
  return data
}

export async function updateInvoiceStatus(id, status) {
  const { data, error } = await supabase.from('invoices').update({ status }).eq('id', id).select().single()
  if (error) throw error
  return data
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

// ---------- Company profile ----------
export async function getCompanyProfile() {
  const { data, error } = await supabase.from('company_profile').select('*').eq('id', 1).single()
  if (error) throw error
  return data
}

export async function updateCompanyProfile(patch) {
  const { data, error } = await supabase.from('company_profile').update(patch).eq('id', 1).select().single()
  if (error) throw error
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
