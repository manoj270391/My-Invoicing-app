import { useState } from 'react'
import { signIn } from '../lib/auth'
import { IconLock } from '../components/Icons'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
    } catch (err) {
      setError(err.message || 'Invalid email or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: 'var(--paper)', padding: 24,
    }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12, background: 'var(--teal)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            <IconLock width={22} height={22} style={{ color: 'white' }} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 6px' }}>Project Tracker</h1>
          <p style={{ color: 'var(--slate)', fontSize: 13.5, margin: 0 }}>Sign in to your account</p>
        </div>

        <div className="card card-pad">
          <form onSubmit={handleSubmit}>
            <div className="field" style={{ marginBottom: 16 }}>
              <label>Email</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com" required autoFocus
              />
            </div>
            <div className="field" style={{ marginBottom: 20 }}>
              <label>Password</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required
              />
            </div>

            {error && (
              <div style={{
                background: 'var(--red-soft)', color: 'var(--red)',
                padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 16,
              }}>
                {error}
              </div>
            )}

            <button
              type="submit" className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '11px' }}
              disabled={loading}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--slate-light)', marginTop: 20 }}>
          Global Net Services · Invoice Management
        </p>
      </div>
    </div>
  )
}
