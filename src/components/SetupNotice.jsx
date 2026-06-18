export default function SetupNotice() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--paper)', padding: 24,
    }}>
      <div className="card card-pad" style={{ maxWidth: 540 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 9, background: 'var(--amber-soft)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
        }}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="var(--amber)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3.5L2.5 20h19z" /><path d="M12 9.5v4.5" /><circle cx="12" cy="17" r="0.6" fill="var(--amber)" />
          </svg>
        </div>
        <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>Connect your database</h2>
        <p style={{ color: 'var(--slate)', fontSize: 14, lineHeight: 1.6, margin: '0 0 16px' }}>
          This app needs a Supabase project to store your clients, entries, and invoices.
          Create a free project at <a href="https://supabase.com" target="_blank" rel="noreferrer">supabase.com</a>,
          run the included <code>supabase_schema.sql</code> in its SQL Editor, then add your
          project URL and anon key to a <code>.env</code> file (see <code>.env.example</code>).
        </p>
        <pre style={{
          background: 'var(--ink)', color: 'var(--paper)', padding: '14px 16px', borderRadius: 8,
          fontSize: 12.5, overflowX: 'auto', margin: 0,
        }}>
{`VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...`}
        </pre>
        <p style={{ color: 'var(--slate-light)', fontSize: 12.5, marginTop: 14, marginBottom: 0 }}>
          Full setup steps are in README.md.
        </p>
      </div>
    </div>
  )
}
