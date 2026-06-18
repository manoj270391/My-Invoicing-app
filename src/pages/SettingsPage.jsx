import { useEffect, useRef, useState } from 'react'
import { useToast } from '../components/Toast'
import { IconUpload, IconBuilding } from '../components/Icons'
import { getCompanyProfile, updateCompanyProfile, uploadLogo } from '../lib/api'
import '../forms.css'

export default function SettingsPage() {
  const [profile, setProfile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)
  const toast = useToast()

  async function load() {
    try {
      setProfile(await getCompanyProfile())
    } catch (e) {
      toast(e.message, 'error')
    }
  }
  useEffect(() => { load() }, [])

  async function save() {
    setSaving(true)
    try {
      await updateCompanyProfile(profile)
      toast('Company details saved', 'success')
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleLogoUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadLogo(file)
      setProfile({ ...profile, logo_url: url })
      toast('Logo uploaded — click Save to apply', 'success')
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setUploading(false)
    }
  }

  if (!profile) {
    return <div className="center-screen" style={{ height: 200 }}><div className="loading-spin" /></div>
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Your company details appear on every invoice you generate.</p>
        </div>
      </div>

      <div className="card card-pad" style={{ maxWidth: 600 }}>
        <div className="section-label" style={{ marginTop: 0 }}>Branding</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <div style={{
            width: 72, height: 72, borderRadius: 10, border: '1px dashed var(--line-strong)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: 'var(--paper)',
          }}>
            {profile.logo_url ? (
              <img src={profile.logo_url} alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            ) : (
              <IconBuilding width={26} height={26} style={{ color: 'var(--slate-light)' }} />
            )}
          </div>
          <div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml" hidden onChange={handleLogoUpload} />
            <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current.click()} disabled={uploading}>
              <IconUpload width={14} height={14} /> {uploading ? 'Uploading…' : 'Upload logo'}
            </button>
            <p style={{ fontSize: 11.5, color: 'var(--slate-light)', margin: '8px 0 0' }}>PNG or JPG, transparent background works best.</p>
          </div>
        </div>

        <div className="field">
          <label>Accent color (used on invoice headers/totals)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="color" value={profile.accent_color} onChange={(e) => setProfile({ ...profile, accent_color: e.target.value })} style={{ width: 44, height: 36, padding: 2 }} />
            <input className="mono" value={profile.accent_color} onChange={(e) => setProfile({ ...profile, accent_color: e.target.value })} style={{ width: 110 }} />
          </div>
        </div>

        <div className="section-label">Company details</div>
        <div className="field">
          <label>Company name</label>
          <input value={profile.company_name} onChange={(e) => setProfile({ ...profile, company_name: e.target.value })} placeholder="Your Company Pvt. Ltd." />
        </div>
        <div className="field">
          <label>Address</label>
          <textarea rows={2} value={profile.address} onChange={(e) => setProfile({ ...profile, address: e.target.value })} placeholder="Street, city, state, PIN" />
        </div>
        <div className="field-row">
          <div className="field">
            <label>Email</label>
            <input type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} placeholder="hello@company.com" />
          </div>
          <div className="field">
            <label>Phone</label>
            <input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} placeholder="+91 98765 43210" />
          </div>
        </div>
        <div className="field">
          <label>GSTIN</label>
          <input className="mono" value={profile.gstin} onChange={(e) => setProfile({ ...profile, gstin: e.target.value.toUpperCase() })} placeholder="33ABCDE1234F1Z5" maxLength={15} />
        </div>

        <div className="section-label">Payment details</div>
        <div className="field">
          <label>Bank details <span className="field-hint">— shown at the bottom of every invoice</span></label>
          <textarea rows={3} value={profile.bank_details} onChange={(e) => setProfile({ ...profile, bank_details: e.target.value })} placeholder="Bank name, account number, IFSC, UPI ID, etc." />
        </div>

        <div className="form-actions" style={{ justifyContent: 'flex-start' }}>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      </div>
    </>
  )
}
