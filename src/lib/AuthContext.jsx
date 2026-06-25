import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase'
import { getUserRole } from './auth'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = not yet checked
  const [role, setRole] = useState(null)
  const [roleError, setRoleError] = useState(false)
  const [loading, setLoading] = useState(true)

  // Resolves the role for a given user, with basic error visibility instead
  // of silently leaving role as null forever on failure.
  const resolveRole = useCallback(async (userId) => {
    setRoleError(false)
    try {
      const r = await getUserRole(userId)
      setRole(r?.role || null)
      if (!r?.role) setRoleError(true) // query succeeded but no role row found
    } catch {
      setRole(null)
      setRoleError(true)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    // Single source of truth for the initial auth state: only
    // onAuthStateChange drives session/role updates from here on. Supabase
    // fires this listener immediately on mount with the current session
    // (INITIAL_SESSION event), so we don't need a separate getSession()
    // call racing against it -- that race is what previously caused the
    // app to occasionally get stuck showing a spinner forever (role could
    // be set by one resolution path while loading=false was set by the
    // other, before the role had actually finished resolving).
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (cancelled) return
      setSession(newSession)
      if (newSession?.user) {
        await resolveRole(newSession.user.id)
      } else {
        setRole(null)
        setRoleError(false)
      }
      setLoading(false)
    })

    return () => {
      cancelled = true
      listener.subscription.unsubscribe()
    }
  }, [resolveRole])

  // Lets the UI offer a manual retry if role resolution failed or hung,
  // instead of the only recovery path being a hard refresh.
  const retryRole = useCallback(() => {
    if (session?.user) resolveRole(session.user.id)
  }, [session, resolveRole])

  return (
    <AuthContext.Provider value={{ session, role, roleError, loading, isAdmin: role === 'admin', retryRole }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
