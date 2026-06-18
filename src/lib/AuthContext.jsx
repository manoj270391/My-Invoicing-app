import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { getUserRole } from './auth'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = loading
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      if (data.session?.user) {
        const r = await getUserRole(data.session.user.id)
        setRole(r?.role || null)
      }
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(async (_e, session) => {
      setSession(session)
      if (session?.user) {
        const r = await getUserRole(session.user.id)
        setRole(r?.role || null)
      } else {
        setRole(null)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider value={{ session, role, loading, isAdmin: role === 'admin' }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
