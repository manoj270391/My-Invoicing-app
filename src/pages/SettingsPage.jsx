import { useEffect, useRef, useState } from 'react'
import { useToast } from '../components/Toast'
import { IconUpload, IconBuilding } from '../components/Icons'
import { getCompanyProfile, updateCompanyProfile, uploadLogo } from '../lib/api'
import { CURRENCIES } from '../lib/gst'

const TABS = [
  { id: 'company', label: 'Company' },
  { id: 'tax',     label: 'Tax & Compliance' },
  { id: 'bank',    label: 'Bank & Payment' },
  { id: 'brand',   label: 'Branding' },
]

export default function SettingsPage() {
  const [profile, setProfile] = useState(null)
  const [activeTab, setActiveTab] = useState('company')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)
  const toast   = useToast()

  async function load() {
    try { setProfile(await getCompanyProfile()) } catch (e) { toast(e.message, 'error') }
  }
  useEffect(() => { load() }, [])

  const set = patch => setProfile(p => ({ ...p, ...patch }))

  async function save() {
    setSaving(true)
    try { await updateCompanyProfile(profile); toast('Settings saved', 'success') }
    catch (e) { toast(e.message, 'error') }
    finally { setSaving(false) }
  }

  async function handleLogo(e) {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true)
    try {
      const url = await uploadLogo(file)
      set({ logo_url: url })
      toast('Logo uploaded — click Save to apply', 'success')
    } catch (err) { toast(err.message, 'error') }
    finally { setUploading(false) }
  }

  if (!profile) return <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="loading-spin" /></div>

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Company details appear on every invoice you generate.</p>
        </div>
        <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
      </div>

      <div style={{ display: 'flex', gap: 0, marginBottom: 24, background: 'var(--paper-raised)', border: '1px solid var(--line)', borderRadius: 10, padding: 4, width: 'fit-content' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            style={{ padding: '8px 18px', borderRadius: 7, border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', transition: 'all 0.12s',
              background: activeTab === t.id ? 'var(--teal)' : 'transparent',
              color: activeTab === t.id ? 'white' : 'var(--slate)',
            }}>{t.label}
          </button>
        ))}
      </div>

      <div className="card card-pad" style={{ maxWidth: 620 }}>
        {activeTab === 'company' && (
          <>
            <div className="field"><label>Company name</label><input value={profile.company_name} onChange={e => set({ company_name: e.target.value })} placeholder="Global Net Services Pvt. Ltd." /></div>
            <div className="field"><label>Address</label><textarea rows={2} value={profile.address} onChange={e => set({ address: e.target.value })} placeholder="Street, city, state, PIN" /></div>
            <div className="field-row">
              <div className="field"><label>Email</label><input type="email" value={profile.email} onChange={e => set({ email: e.target.value })} /></div>
              <div className="field"><label>Phone</label><input value={profile.phone} onChange={e => set({ phone: e.target.value })} /></div>
            </div>
            <div className="field"><label>Website</label><input value={profile.website} onChange={e => set({ website: e.target.value })} placeholder="https://globalnetservices.biz" /></div>
          </>
        )}

        {activeTab === 'tax' && (
          <>
            <div className="section-label" style={{ marginTop: 0 }}>GST & Indian compliance</div>
            <div className="field-row">
              <div className="field"><label>GSTIN</label><input className="mono" value={profile.gstin} onChange={e => set({ gstin: e.target.value.toUpperCase() })} placeholder="33ABCDE1234F1Z5" maxLength={15} /></div>
              <div className="field"><label>PAN</label><input className="mono" value={profile.pan} onChange={e => set({ pan: e.target.value.toUpperCase() })} placeholder="ABCDE1234F" maxLength={10} /></div>
            </div>
            <div className="field-row">
              <div className="field"><label>TAN</label><input className="mono" value={profile.tan} onChange={e => set({ tan: e.target.value.toUpperCase() })} placeholder="ABCD12345E" maxLength={10} /></div>
            </div>
            <div className="field-row">
              <div className="field"><label>HSN/SAC — PDF Accessibility</label><input className="mono" value={profile.hsn_pdf} onChange={e => set({ hsn_pdf: e.target.value })} placeholder="998431" /></div>
              <div className="field"><label>HSN/SAC — Website &amp; Domain</label><input className="mono" value={profile.hsn_website} onChange={e => set({ hsn_website: e.target.value })} placeholder="998313" /></div>
            </div>
            <div className="section-label">Export / international</div>
            <div className="field-row">
              <div className="field"><label>LUT ARN Number <span className="field-hint">(shown on export invoices)</span></label><input className="mono" value={profile.lut_arn} onChange={e => set({ lut_arn: e.target.value.toUpperCase() })} placeholder="AD330624012345S" /></div>
              <div className="field"><label>IEC Code</label><input className="mono" value={profile.iec} onChange={e => set({ iec: e.target.value.toUpperCase() })} placeholder="ABCDE1234F" /></div>
            </div>
            <div className="field"><label>VAT Number <span className="field-hint">(optional)</span></label><input className="mono" value={profile.vat} onChange={e => set({ vat: e.target.value })} /></div>
          </>
        )}

        {activeTab === 'bank' && (
          <>
            <div className="field">
              <label>Bank & payment details <span className="field-hint">— shown in invoice footer</span></label>
              <textarea rows={5} value={profile.bank_details} onChange={e => set({ bank_details: e.target.value })}
                placeholder={`Bank: HDFC Bank\nBeneficiary: Global Net Services\nAccount: 50100123456789\nIFSC: HDFC0001234\nSWIFT: HDFCINBB (for international)\nUPI: globalnet@hdfcbank`} />
            </div>
          </>
        )}

        {activeTab === 'brand' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <div style={{ width: 80, height: 60, borderRadius: 10, border: '1px dashed var(--line-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: 'var(--paper)', flexShrink: 0 }}>
                {profile.logo_url ? <img src={profile.logo_url} alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /> : <IconBuilding width={28} style={{ color: 'var(--slate-light)' }} />}
              </div>
              <div>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml" hidden onChange={handleLogo} />
                <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current.click()} disabled={uploading}>
                  <IconUpload width={13} /> {uploading ? 'Uploading…' : 'Upload logo'}
                </button>
                <p style={{ fontSize: 11.5, color: 'var(--slate-light)', margin: '8px 0 0' }}>PNG/JPG recommended. Transparent background works best.</p>
              </div>
            </div>
            <div className="field">
              <label>Invoice brand color</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--paper)', borderRadius: 8, border: '1px solid var(--line)' }}>
                <div style={{ width: 28, height: 28, borderRadius: 6, background: '#374961', flexShrink: 0 }} />
                <span style={{ fontSize: 12.5, color: 'var(--slate)' }}>
                  Fixed to your brand navy (<span className="mono">#374961</span>) on every invoice — matches your logo. Not user-configurable.
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}
