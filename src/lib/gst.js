export const GST_RATE = 0.18

export const CURRENCIES = [
  { code: 'INR', symbol: '₹', label: 'Indian Rupee (INR)' },
  { code: 'USD', symbol: '$', label: 'US Dollar (USD)' },
  { code: 'CAD', symbol: 'CA$', label: 'Canadian Dollar (CAD)' },
  { code: 'AUD', symbol: 'A$', label: 'Australian Dollar (AUD)' },
  { code: 'EUR', symbol: '€', label: 'Euro (EUR)' },
  { code: 'GBP', symbol: '£', label: 'British Pound (GBP)' },
]

export function getCurrencySymbol(code) {
  return CURRENCIES.find(c => c.code === code)?.symbol || code
}

export function isTamilNaduGSTIN(gstin) {
  if (!gstin) return null
  const t = gstin.trim()
  if (t.length < 2) return null
  return t.startsWith('33')
}

export function calculateGST(subtotal, isTamilNadu) {
  const r2 = (n) => Math.round(n * 100) / 100
  if (isTamilNadu) {
    const cgst = r2(subtotal * (GST_RATE / 2))
    const sgst = r2(subtotal * (GST_RATE / 2))
    return { cgst, sgst, igst: 0, total: r2(subtotal + cgst + sgst) }
  }
  const igst = r2(subtotal * GST_RATE)
  return { cgst: 0, sgst: 0, igst, total: r2(subtotal + igst) }
}

// UI display — uses native currency symbol (browser supports all glyphs)
export function formatCurrency(amount, currencyCode = 'INR') {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currencyCode,
      maximumFractionDigits: 2,
    }).format(amount || 0)
  } catch {
    return `${getCurrencySymbol(currencyCode)} ${(amount || 0).toFixed(2)}`
  }
}

// Alias for INR display in UI
export function formatINR(amount) { return formatCurrency(amount, 'INR') }

// PDF-safe: jsPDF helvetica can't render ₹ or other currency glyphs
// Use Rs. for INR, and the code prefix for others
export function formatPDF(amount, currencyCode = 'INR') {
  const num = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(amount || 0)
  if (currencyCode === 'INR') return `Rs. ${num}`
  return `${currencyCode} ${num}`
}

export function lineTotal(entry) {
  if (entry.entry_type === 'pdf') {
    return (Number(entry.pages) || 0) * (Number(entry.rate_per_page) || 0)
  }
  // New JSONB service_items takes priority; fall back to legacy columns
  if (entry.service_items && Array.isArray(entry.service_items) && entry.service_items.length > 0) {
    return entry.service_items.reduce((s, i) => s + (Number(i.price) || 0), 0)
  }
  return (
    (Number(entry.website_renewal_price) || 0) +
    (Number(entry.google_subscription_price) || 0) +
    (Number(entry.other_price) || 0)
  )
}
