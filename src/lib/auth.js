import { supabase } from './supabase'

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getSession() {
  const { data } = await supabase.auth.getSession()
  return data.session
}

export async function getUserRole(userId) {
  const { data, error } = await supabase
    .from('user_roles')
    .select('role, email')
    .eq('user_id', userId)
    .single()
  if (error) return null
  return data
}

export async function getUsers() {
  const { data, error } = await supabase
    .from('user_roles')
    .select('*')
    .order('created_at')
  if (error) throw error
  return data
}

export async function inviteUser(email, role) {
  // Create auth user via Supabase admin — in single-user setup the admin
  // adds accountant accounts manually via the Supabase dashboard, then
  // this function seeds their role row.
  const { error } = await supabase.from('user_roles').insert({ email, role })
  if (error) throw error
}

export async function updateUserRole(userId, role) {
  const { error } = await supabase
    .from('user_roles')
    .update({ role })
    .eq('user_id', userId)
  if (error) throw error
}

export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session)
  })
}
